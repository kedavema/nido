import type {
  Category,
  CreateRecurringItemRequest,
  FrequencyKind,
  HouseholdMember,
  RecurringItem,
  UpdateRecurringItemRequest,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import {
  amountToWireDecimal,
  formatAmountDisplay,
  isValidLocalDateString,
  sanitizeAmountInput,
} from '@/utils/expense-form';
import { dayOfMonth, NOTIFICATION_OFFSET_OPTIONS } from '@/utils/fijos-format';
import { categoryLabel, todayLocalDate } from '@/utils/movement-format';

const FREQUENCY_OPTIONS: readonly (readonly [FrequencyKind, string])[] = [
  ['ONE_TIME', 'Una vez'],
  ['MONTHLY', 'Mensual'],
  ['YEARLY', 'Anual'],
  ['EVERY_N_MONTHS', 'Cada X meses'],
];

const DEFAULT_OFFSETS = [0, 1];

interface Draft {
  readonly id?: string;
  readonly name: string;
  readonly categoryId?: string;
  readonly amount: string;
  readonly frequency: FrequencyKind;
  readonly intervalMonths: number;
  readonly dayOfMonth: number;
  readonly firstDueDate: string;
  readonly responsibleUserId: string | null;
  readonly notificationOffsets: readonly number[];
}

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly categories: readonly Category[];
      readonly members: readonly HouseholdMember[];
    };

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** First due date for a day-of-month recurrence: this month if the day hasn't passed, else next. */
function monthlyFirstDueDate(day: number, todayLocal: string): string {
  const [year = 1970, month = 1, today = 1] = todayLocal.split('-').map(Number);
  const clampedDay = Math.min(Math.max(day, 1), 28);
  let targetYear = year;
  let targetMonth = month;
  if (clampedDay < today) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }
  return `${targetYear.toString()}-${pad2(targetMonth)}-${pad2(clampedDay)}`;
}

function buildDraft(item: RecurringItem | null, todayLocal: string): Draft {
  if (item === null) {
    const [, , today = 1] = todayLocal.split('-').map(Number);
    return {
      name: '',
      amount: '',
      frequency: 'MONTHLY',
      intervalMonths: 2,
      dayOfMonth: Math.min(today, 28),
      firstDueDate: todayLocal,
      responsibleUserId: null,
      notificationOffsets: DEFAULT_OFFSETS,
    };
  }
  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    amount: item.currency === 'PYG' ? item.estimatedAmount : item.estimatedAmount.replace('.', ','),
    frequency: item.frequency,
    intervalMonths: item.intervalMonths ?? 2,
    dayOfMonth: dayOfMonth(item.firstDueDate),
    firstDueDate: item.firstDueDate,
    responsibleUserId: item.responsibleUserId,
    notificationOffsets: item.notificationOffsets,
  };
}

export default function NuevoFijoScreen() {
  const { recurringItemId } = useLocalSearchParams<{ recurringItemId?: string }>();
  const mode: 'create' | 'edit' = recurringItemId === undefined ? 'create' : 'edit';
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const currentUserId = state.kind === 'authenticated' ? state.profile.user.id : undefined;

  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showValidation, setShowValidation] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const todayLocal = todayLocalDate();

  const load = useCallback(async () => {
    if (household === null) return;
    setScreenState({ kind: 'loading' });
    try {
      const [{ categories }, { members }, item] = await Promise.all([
        catalog.listCategories(household.id),
        getMembers(household.id),
        recurringItemId === undefined
          ? Promise.resolve(null)
          : catalog
              .listRecurringItems(household.id)
              .then(
                ({ recurringItems }) =>
                  recurringItems.find((candidate) => candidate.id === recurringItemId) ?? null,
              ),
      ]);
      setScreenState({
        kind: 'ready',
        categories,
        members: members.filter((member) => member.status === 'ACTIVE'),
      });
      const initial = buildDraft(item, todayLocal);
      setDraft(
        item === null && currentUserId !== undefined
          ? { ...initial, responsibleUserId: currentUserId }
          : initial,
      );
    } catch (error) {
      setScreenState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, getMembers, household, recurringItemId, todayLocal, currentUserId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null || screenState.kind === 'loading' || draft === null) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LoadingContent label="Cargando…" />
      </SafeAreaView>
    );
  }

  if (screenState.kind === 'error') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.content}>
          <InlineNotice tone="error">{screenState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
          <ActionButton
            label="Volver"
            onPress={() => {
              router.back();
            }}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  const { categories, members } = screenState;
  const expenseRoots = categories.filter(
    (category) => category.kind === 'EXPENSE' && category.isActive && category.parentId === null,
  );
  const rootChips = expenseRoots.slice(0, 3);
  const selectedCategoryLabel =
    draft.categoryId === undefined ? undefined : categoryLabel(draft.categoryId, categories);

  const usesDayOfMonth = draft.frequency === 'MONTHLY' || draft.frequency === 'EVERY_N_MONTHS';
  const nameValid = draft.name.trim() !== '';
  const amountValid = draft.amount !== '' && draft.amount !== '0';
  const dateValid = usesDayOfMonth || isValidLocalDateString(draft.firstDueDate);
  const canSave = nameValid && amountValid && draft.categoryId !== undefined && dateValid;

  function update(patch: Partial<Draft>): void {
    setDraft((current) => (current === null ? current : { ...current, ...patch }));
  }

  function toggleOffset(value: number): void {
    setDraft((current) => {
      if (current === null) return current;
      const has = current.notificationOffsets.includes(value);
      return {
        ...current,
        notificationOffsets: has
          ? current.notificationOffsets.filter((offset) => offset !== value)
          : [...current.notificationOffsets, value],
      };
    });
  }

  async function save(): Promise<void> {
    if (draft === null || household === null) return;
    if (!canSave) {
      setShowValidation(true);
      return;
    }
    setSaving(true);
    setSubmitError(undefined);
    const firstDueDate = usesDayOfMonth
      ? monthlyFirstDueDate(draft.dayOfMonth, todayLocal)
      : draft.firstDueDate;
    const estimatedAmount = amountToWireDecimal(draft.amount, 'PYG');
    try {
      if (draft.id === undefined) {
        const request: CreateRecurringItemRequest = {
          kind: 'EXPENSE',
          name: draft.name.trim(),
          categoryId: draft.categoryId ?? '',
          estimatedAmount,
          currency: 'PYG',
          frequency: draft.frequency,
          ...(draft.frequency === 'EVERY_N_MONTHS' ? { intervalMonths: draft.intervalMonths } : {}),
          firstDueDate,
          ...(draft.responsibleUserId === null
            ? {}
            : { responsibleUserId: draft.responsibleUserId }),
          notificationOffsets: [...draft.notificationOffsets].sort((a, b) => a - b),
        };
        await catalog.createRecurringItem(household.id, request);
      } else {
        const request: UpdateRecurringItemRequest = {
          name: draft.name.trim(),
          categoryId: draft.categoryId,
          estimatedAmount,
          currency: 'PYG',
          frequency: draft.frequency,
          intervalMonths: draft.frequency === 'EVERY_N_MONTHS' ? draft.intervalMonths : null,
          firstDueDate,
          responsibleUserId: draft.responsibleUserId,
          notificationOffsets: [...draft.notificationOffsets].sort((a, b) => a - b),
        };
        await catalog.updateRecurringItem(household.id, draft.id, request);
      }
      router.back();
    } catch (error) {
      setSubmitError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              router.back();
            }}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              {mode === 'create' ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}
            </Text>
            <Text style={m1TextStyles.secondary}>Se repite según su recurrencia</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label="Nombre"
            error={showValidation && !nameValid ? 'Completá este campo' : undefined}
          >
            <TextInput
              accessibilityLabel="Nombre"
              maxLength={100}
              onChangeText={(name) => {
                update({ name });
              }}
              placeholder="ANDE · luz"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={[styles.input, showValidation && !nameValid && styles.inputError]}
              value={draft.name}
            />
          </Field>

          <Field
            label="Categoría"
            error={
              showValidation && draft.categoryId === undefined ? 'Completá este campo' : undefined
            }
          >
            <View style={styles.chipRow}>
              {rootChips.map((root) => (
                <Chip
                  key={root.id}
                  label={root.name}
                  onPress={() => {
                    update({ categoryId: root.id });
                  }}
                  selected={draft.categoryId === root.id}
                />
              ))}
              <Chip
                label={
                  selectedCategoryLabel !== undefined &&
                  !rootChips.some((root) => root.id === draft.categoryId)
                    ? selectedCategoryLabel
                    : 'Todas ›'
                }
                onPress={() => {
                  setShowCategoryPicker(true);
                }}
                selected={
                  draft.categoryId !== undefined &&
                  !rootChips.some((root) => root.id === draft.categoryId)
                }
              />
            </View>
          </Field>

          <Field
            label="Importe estimado"
            error={showValidation && !amountValid ? 'Completá este campo' : undefined}
          >
            <View style={[styles.amountField, showValidation && !amountValid && styles.inputError]}>
              <Text style={styles.amountPrefix}>Gs.</Text>
              <TextInput
                accessibilityLabel="Importe estimado"
                keyboardType="number-pad"
                onChangeText={(text) => {
                  update({ amount: sanitizeAmountInput(text, 'PYG') });
                }}
                placeholder="0"
                placeholderTextColor={themeTokens.colors.inkSecondary}
                style={styles.amountInput}
                value={formatAmountDisplay(draft.amount, 'PYG')}
              />
            </View>
            <Text style={m1TextStyles.secondary}>
              Al marcarlo pagado confirmás el importe real de ese mes.
            </Text>
          </Field>

          <Field label="Recurrencia">
            <View style={styles.chipRow}>
              {FREQUENCY_OPTIONS.map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  onPress={() => {
                    update({ frequency: value });
                  }}
                  selected={draft.frequency === value}
                />
              ))}
            </View>
            {draft.frequency === 'EVERY_N_MONTHS' ? (
              <Stepper
                label="cada"
                onDecrement={() => {
                  update({ intervalMonths: Math.max(1, draft.intervalMonths - 1) });
                }}
                onIncrement={() => {
                  update({ intervalMonths: draft.intervalMonths + 1 });
                }}
                unit="meses"
                value={draft.intervalMonths}
              />
            ) : null}
          </Field>

          <Field label="Vencimiento">
            {usesDayOfMonth ? (
              <Stepper
                label="El día"
                onDecrement={() => {
                  update({ dayOfMonth: Math.max(1, draft.dayOfMonth - 1) });
                }}
                onIncrement={() => {
                  update({ dayOfMonth: Math.min(28, draft.dayOfMonth + 1) });
                }}
                unit="de cada mes"
                value={draft.dayOfMonth}
              />
            ) : (
              <TextInput
                accessibilityLabel="Primer vencimiento (aaaa-mm-dd)"
                onChangeText={(firstDueDate) => {
                  update({ firstDueDate });
                }}
                placeholder="2026-07-15"
                placeholderTextColor={themeTokens.colors.inkSecondary}
                style={[styles.input, showValidation && !dateValid && styles.inputError]}
                value={draft.firstDueDate}
              />
            )}
          </Field>

          <Field label="Responsable">
            <View style={styles.chipRow}>
              {members.map((member) => (
                <Chip
                  key={member.userId}
                  label={member.displayName}
                  onPress={() => {
                    update({
                      responsibleUserId:
                        draft.responsibleUserId === member.userId ? null : member.userId,
                    });
                  }}
                  selected={draft.responsibleUserId === member.userId}
                />
              ))}
            </View>
          </Field>

          <Field label="Avisos · podés elegir varios">
            <View style={styles.chipRow}>
              {NOTIFICATION_OFFSET_OPTIONS.map((option) => (
                <SoftChip
                  key={option.value}
                  label={option.label}
                  onPress={() => {
                    toggleOffset(option.value);
                  }}
                  selected={draft.notificationOffsets.includes(option.value)}
                />
              ))}
            </View>
          </Field>

          {submitError === undefined ? null : (
            <InlineNotice tone="error">{submitError}</InlineNotice>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <ActionButton label="Guardar gasto fijo" loading={saving} onPress={() => void save()} />
          <Text style={styles.footerHint}>Aparece en Fijos y en la proyección del mes</Text>
        </View>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        categories={categories.filter(
          (category) => category.kind === 'EXPENSE' && category.isActive,
        )}
        onClose={() => {
          setShowCategoryPicker(false);
        }}
        onSelect={(categoryId) => {
          update({ categoryId });
          setShowCategoryPicker(false);
        }}
        selectedCategoryId={draft.categoryId}
        visible={showCategoryPicker}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  readonly label: string;
  readonly error?: string | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The lighter, outlined "toggle" chip style FIJ-02 uses for the multi-select "Avisos" options. */
function SoftChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.softChip, selected && styles.softChipSelected]}
    >
      <Text style={[styles.softChipText, selected && styles.softChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  unit,
  onDecrement,
  onIncrement,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={m1TextStyles.body}>{label}</Text>
      <Pressable
        accessibilityLabel="Restar"
        accessibilityRole="button"
        onPress={onDecrement}
        style={styles.stepperButton}
      >
        <Ionicons color={themeTokens.colors.primary} name="remove" size={18} />
      </Pressable>
      <Text style={styles.stepperValue}>{value.toString()}</Text>
      <Pressable
        accessibilityLabel="Sumar"
        accessibilityRole="button"
        onPress={onIncrement}
        style={styles.stepperButton}
      >
        <Ionicons color={themeTokens.colors.primary} name="add" size={18} />
      </Pressable>
      <Text style={m1TextStyles.body}>{unit}</Text>
    </View>
  );
}

function CategoryPickerModal({
  visible,
  categories,
  selectedCategoryId,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly categories: readonly Category[];
  readonly selectedCategoryId: string | undefined;
  readonly onSelect: (categoryId: string) => void;
  readonly onClose: () => void;
}) {
  const roots = categories.filter((category) => category.parentId === null);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Elegir categoría
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.pickerList}>
          {roots.map((root) => {
            const children = categories.filter((category) => category.parentId === root.id);
            return (
              <View key={root.id} style={styles.pickerGroup}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(root.id);
                  }}
                  style={styles.pickerRootRow}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: `${root.color}26` }]}>
                    <Text style={[styles.pickerAvatarText, { color: root.color }]}>
                      {root.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[m1TextStyles.body, styles.pickerRootName]}>{root.name}</Text>
                  {selectedCategoryId === root.id ? (
                    <Ionicons color={themeTokens.colors.primary} name="checkmark" size={18} />
                  ) : null}
                </Pressable>
                {children.length > 0 ? (
                  <View style={styles.chipRow}>
                    {children.map((child) => (
                      <Chip
                        key={child.id}
                        label={child.name}
                        onPress={() => {
                          onSelect(child.id);
                        }}
                        selected={selectedCategoryId === child.id}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: themeTokens.colors.surface,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  content: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.screen,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  input: {
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: themeTokens.semanticColors.danger.foreground,
  },
  errorText: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  amountPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    paddingVertical: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 16,
  },
  chipSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  chipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    maxWidth: 200,
  },
  chipTextSelected: {
    color: themeTokens.colors.surface,
  },
  softChip: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 16,
  },
  softChipSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primaryTint,
  },
  softChipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  softChipTextSelected: {
    color: themeTokens.colors.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  footer: {
    gap: 4,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.cardGap,
    paddingBottom: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.background,
  },
  footerHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    textAlign: 'center',
  },
  pickerList: {
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
  },
  pickerGroup: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  pickerRootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  pickerRootName: {
    flex: 1,
  },
});
