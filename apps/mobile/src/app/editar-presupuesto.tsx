import { MonthSchema, type BudgetMonth, type Category } from '@nido/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { AppBottomSheet } from '@/components/app-bottom-sheet';
import {
  ActionButton,
  AppFormScreen,
  AppScreen,
  Card,
  FormHeader,
  InlineNotice,
  LoadingContent,
  PressableScale,
} from '@/components/m1-ui';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { themeTokens } from '@/theme/tokens';
import {
  budgetAllocationDrafts,
  buildBudgetUpsertInput,
  editableBudgetRootCategoryIds,
  summarizeBudgetDraft,
  type BudgetAllocationDraft,
} from '@/utils/budget';
import { formatAmountDisplay, sanitizePygAmountInput } from '@/utils/expense-form';
import {
  formatMonthLabel,
  formatMonthQueryParam,
  formatPygMagnitude,
  monthFromLocalDate,
  shiftMonth,
  todayLocalDate,
} from '@/utils/movement-format';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly categories: readonly Category[] };

export default function EditarPresupuestoScreen() {
  const params = useLocalSearchParams<{ month?: string }>();
  const fallbackMonth = formatMonthQueryParam(monthFromLocalDate(todayLocalDate()));
  const parsedMonth = MonthSchema.safeParse(params.month);
  const monthParam = parsedMonth.success ? parsedMonth.data : fallbackMonth;
  const month = monthFromLocalDate(`${monthParam}-01`);
  const { catalog, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;

  const [screen, setScreen] = useState<ScreenState>({ kind: 'loading' });
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null);
  const [totalLimit, setTotalLimit] = useState('');
  const [allocations, setAllocations] = useState<readonly BudgetAllocationDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [copySheetVisible, setCopySheetVisible] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const hydrate = useCallback((categories: readonly Category[], next: BudgetMonth | null) => {
    const rootIds = editableBudgetRootCategoryIds(categories, next);
    setBudgetMonth(next);
    setTotalLimit(next?.totalLimitPyg ?? '');
    setAllocations(budgetAllocationDrafts(rootIds, next));
  }, []);

  const load = useCallback(async () => {
    if (household === null) return;
    setScreen({ kind: 'loading' });
    try {
      const [{ categories }, { budgetMonth: next }] = await Promise.all([
        catalog.listCategories(household.id),
        catalog.getBudgetMonth(household.id, monthParam),
      ]);
      setScreen({ kind: 'ready', categories });
      hydrate(categories, next);
    } catch (error) {
      setScreen({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household, hydrate, monthParam]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const summary = summarizeBudgetDraft(totalLimit, allocations);
  const request = buildBudgetUpsertInput(totalLimit, allocations);
  const sourceMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(month, -(index + 1)));

  async function save(): Promise<void> {
    if (household === null || request === undefined) return;
    setSaving(true);
    setActionError(undefined);
    try {
      await catalog.upsertBudgetMonth(household.id, monthParam, request);
      successFeedback();
      router.back();
    } catch (error) {
      errorFeedback();
      setActionError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  async function copyFrom(sourceMonth: string): Promise<void> {
    if (household === null || screen.kind !== 'ready') return;
    setActionError(undefined);
    setCopySheetVisible(false);
    try {
      const response = await catalog.copyBudgetMonth(household.id, monthParam, { sourceMonth });
      hydrate(screen.categories, response.budgetMonth);
      successFeedback();
    } catch (error) {
      errorFeedback();
      setActionError(messageForActionError(error));
    }
  }

  const header = (
    <FormHeader
      dismissIcon="back"
      onDismiss={() => {
        router.back();
      }}
      subtitle="Total y límites por categoría"
      title={`Presupuesto de ${formatMonthLabel(month)
        .replace(/\s\d{4}$/u, '')
        .toLowerCase()}`}
      trailing={
        budgetMonth === null && screen.kind === 'ready' ? (
          <PressableScale
            accessibilityLabel="Copiar presupuesto de otro mes"
            haptic
            onPress={() => {
              setCopySheetVisible(true);
            }}
            style={styles.copyButton}
          >
            <Text style={styles.copyButtonText}>Copiar de…</Text>
          </PressableScale>
        ) : undefined
      }
    />
  );

  if (household === null || screen.kind === 'loading') {
    return (
      <AppScreen centered header={header}>
        <LoadingContent label="Cargando presupuesto…" />
      </AppScreen>
    );
  }

  if (screen.kind === 'error') {
    return (
      <AppScreen header={header}>
        <InlineNotice tone="error">{screen.message}</InlineNotice>
        <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
      </AppScreen>
    );
  }

  const rootIds = editableBudgetRootCategoryIds(screen.categories, budgetMonth);
  const roots = rootIds.flatMap(
    (id) => screen.categories.find((category) => category.id === id) ?? [],
  );
  const invalidMessage = summary.hasInvalidAmount
    ? 'Ingresá importes válidos de hasta 18 dígitos.'
    : summary.exceedsTotal
      ? 'Los límites por categoría superan el total del mes.'
      : undefined;

  return (
    <>
      <AppFormScreen
        footer={
          <>
            <View style={styles.totalsRow}>
              <Text style={styles.totalCaption}>
                Asignado Gs. {formatPygMagnitude(summary.allocatedPyg.toString())}
              </Text>
              <Text style={[styles.totalCaption, invalidMessage && styles.totalError]}>
                {summary.remainingPyg === null
                  ? 'Sin distribuir · —'
                  : `${summary.remainingPyg < 0n ? 'Excedido' : 'Sin distribuir'} · Gs. ${formatPygMagnitude(summary.remainingPyg.toString().replace('-', ''))}`}
              </Text>
            </View>
            <ActionButton
              disabled={request === undefined}
              label="Guardar presupuesto"
              loading={saving}
              onPress={() => void save()}
            />
          </>
        }
        header={header}
      >
        <Card>
          <Text style={styles.sectionLabel}>TOTAL DEL MES</Text>
          <View style={[styles.totalInputShell, invalidMessage && styles.inputError]}>
            <Text style={styles.currencyPrefix}>Gs.</Text>
            <TextInput
              accessibilityLabel="Total del mes"
              keyboardType="number-pad"
              onChangeText={(value) => {
                setTotalLimit(sanitizePygAmountInput(value));
              }}
              placeholder="0"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={styles.totalInput}
              value={formatAmountDisplay(totalLimit, 'PYG')}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionLabel}>LÍMITES POR CATEGORÍA RAÍZ</Text>
          {roots.map((category, index) => {
            const allocation = allocations[index];
            return (
              <View key={category.id} style={styles.categoryRow}>
                <View style={styles.categoryCopy}>
                  <Text numberOfLines={1} style={styles.categoryName}>
                    {category.name}
                  </Text>
                  {category.isActive ? null : (
                    <Text numberOfLines={1} style={styles.archivedLabel}>
                      Archivada
                    </Text>
                  )}
                </View>
                <View style={styles.categoryInputShell}>
                  <Text style={styles.categoryPrefix}>Gs.</Text>
                  <TextInput
                    accessibilityLabel={`Límite de ${category.name}`}
                    keyboardType="number-pad"
                    onChangeText={(value) => {
                      const amountPyg = sanitizePygAmountInput(value);
                      setAllocations((current) =>
                        current.map((item) =>
                          item.categoryId === category.id ? { ...item, amountPyg } : item,
                        ),
                      );
                    }}
                    placeholder="Sin límite"
                    placeholderTextColor={themeTokens.colors.inkSecondary}
                    style={styles.categoryInput}
                    value={formatAmountDisplay(allocation?.amountPyg ?? '', 'PYG')}
                  />
                </View>
              </View>
            );
          })}
        </Card>

        {invalidMessage === undefined ? null : (
          <InlineNotice tone="error">{invalidMessage}</InlineNotice>
        )}
        {actionError === undefined ? null : <InlineNotice tone="error">{actionError}</InlineNotice>}
      </AppFormScreen>

      <AppBottomSheet
        onClose={() => {
          setCopySheetVisible(false);
        }}
        subtitle="Copia solo el total y los límites; no arrastra movimientos ni sobrantes."
        title="Copiar presupuesto"
        visible={copySheetVisible}
      >
        {sourceMonths.map((source) => {
          const sourceMonth = formatMonthQueryParam(source);
          return (
            <PressableScale
              accessibilityLabel={`Copiar ${formatMonthLabel(source)}`}
              key={sourceMonth}
              onPress={() => void copyFrom(sourceMonth)}
              style={styles.monthOption}
            >
              <Text style={styles.monthOptionText}>{formatMonthLabel(source)}</Text>
            </PressableScale>
          );
        })}
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  copyButton: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 14,
  },
  copyButtonText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  sectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  totalInputShell: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 14,
  },
  inputError: { borderColor: themeTokens.semanticColors.danger.foreground },
  currencyPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
  },
  totalInput: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
    paddingVertical: 10,
  },
  categoryRow: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // `minWidth: 0` is what lets the label actually shrink. On react-native-web a flex item keeps
  // CSS's `min-width: auto`, so it refuses to go below its text and pushes the field beyond the
  // card instead — the same web-only divergence as the `flex: 0` collapse in the findings log.
  // 48/52 against the field, preserving the proportion the old `width: '52%'` asked for, but as
  // flex so the row's gap is divided rather than ignored. `minWidth: 0` is the part that matters
  // on web: a flex child keeps CSS's `min-width: auto` and otherwise refuses to shrink below its
  // text — the same divergence as the `flex: 0` collapse in the findings log.
  categoryCopy: { flexGrow: 48, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  categoryName: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  archivedLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.label,
  },
  categoryInputShell: {
    // No `maxWidth` on purpose: capping one side while the sibling grows freely hands every
    // spare pixel to the label on a wide viewport and strands the field across an empty gap.
    flexGrow: 52,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 10,
  },
  categoryPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyMedium,
  },
  categoryInput: {
    // The shell is itself a row, so the field needs the same escape from `min-width: auto` its
    // parent got. Without it a long formatted amount refuses to shrink and pushes out past the
    // shell's right border — which is what the border stops being able to contain.
    flex: 1,
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textAlign: 'right',
    paddingVertical: 8,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  totalCaption: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
  },
  totalError: { color: themeTokens.semanticColors.danger.foreground },
  monthOption: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 16,
  },
  monthOptionText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
