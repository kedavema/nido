import type { Category, CategoryKind } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppScreen,
  Card,
  FormField,
  InlineNotice,
  LoadingContent,
  PageHeader,
  m1TextStyles,
} from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

// MAS-03 caption, binding product rule: root categories keep budget/report comparability across
// households, so they can never be renamed, archived, or created from this screen — only their
// subcategories can.
const ROOT_RULE_NOTICE =
  'Las 7 categorías raíz no se pueden renombrar ni borrar: mantienen comparables presupuesto e informes.';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'loaded'; readonly categories: readonly Category[] };

/** Editing an existing subcategory: reuses the full form, but `parentId` is never `null` — only
 * root categories may have a null parent, and roots aren't editable from here. */
interface EditDraft {
  readonly id: string;
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly parentId: string;
  readonly isActive: boolean;
}

/** Creating a subcategory via a root's "+ Nueva" chip: per initial-categories.ts, subcategories
 * don't carry their own icon/color — they inherit the parent root's at creation time — so this is
 * just a name field, not the full draft form. */
interface NewSubcategoryDraft {
  readonly rootId: string;
  readonly kind: CategoryKind;
  readonly name: string;
}

export default function CategoriesScreen() {
  const { catalog, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [newSubcategory, setNewSubcategory] = useState<NewSubcategoryDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setLoadState({ kind: 'loading' });
    try {
      const { categories } = await catalog.listCategories(household.id);
      setLoadState({ kind: 'loaded', categories });
    } catch (error) {
      setLoadState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }
  const householdId = household.id;
  const categories = loadState.kind === 'loaded' ? loadState.categories : [];
  const roots = categories.filter((category) => category.parentId === null);

  function toggleRoot(rootId: string): void {
    setExpandedRoots((current) => ({ ...current, [rootId]: current[rootId] !== true }));
  }

  function openEdit(category: Category): void {
    setNewSubcategory(null);
    setFormError(undefined);
    setEditDraft({
      id: category.id,
      kind: category.kind,
      name: category.name,
      icon: category.icon,
      color: category.color,
      parentId: category.parentId ?? category.id,
      isActive: category.isActive,
    });
  }

  function openCreate(rootId: string, kind: CategoryKind): void {
    setEditDraft(null);
    setFormError(undefined);
    setNewSubcategory({ rootId, kind, name: '' });
  }

  async function saveEdit(): Promise<void> {
    if (editDraft === null) return;
    setSaving(true);
    setFormError(undefined);
    try {
      await catalog.updateCategory(householdId, editDraft.id, {
        name: editDraft.name,
        icon: editDraft.icon,
        color: editDraft.color,
        parentId: editDraft.parentId,
        isActive: editDraft.isActive,
      });
      setEditDraft(null);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  async function archiveEditing(): Promise<void> {
    if (editDraft === null) return;
    setSaving(true);
    setFormError(undefined);
    try {
      await catalog.deleteCategory(householdId, editDraft.id);
      setEditDraft(null);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  async function createSubcategory(): Promise<void> {
    if (newSubcategory === null) return;
    const parentRoot = roots.find((root) => root.id === newSubcategory.rootId);
    if (parentRoot === undefined) return;
    setSaving(true);
    setFormError(undefined);
    try {
      await catalog.createCategory(householdId, {
        kind: newSubcategory.kind,
        name: newSubcategory.name,
        icon: parentRoot.icon,
        color: parentRoot.color,
        parentId: newSubcategory.rootId,
      });
      setNewSubcategory(null);
      await load();
      setExpandedRoots((current) => ({ ...current, [newSubcategory.rootId]: true }));
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <ActionButton
        label="Volver"
        onPress={() => {
          router.back();
        }}
        variant="secondary"
      />
      <PageHeader description="7 raíces fijas · subcategorías del hogar" title="Categorías" />

      {loadState.kind === 'loading' ? <LoadingContent label="Cargando categorías…" /> : null}
      {loadState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{loadState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </>
      ) : null}

      {editDraft === null ? null : (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>Editar subcategoría</Text>
          <FormField
            label="Nombre"
            maxLength={100}
            onChangeText={(name) => {
              setEditDraft({ ...editDraft, name });
            }}
            value={editDraft.name}
          />
          <FormField
            label="Ícono"
            maxLength={50}
            onChangeText={(icon) => {
              setEditDraft({ ...editDraft, icon });
            }}
            value={editDraft.icon}
          />
          <FormField
            autoCapitalize="characters"
            label="Color hexadecimal"
            maxLength={7}
            onChangeText={(color) => {
              setEditDraft({ ...editDraft, color });
            }}
            value={editDraft.color}
          />
          <ChoiceRow
            label="Raíz"
            onSelect={(parentId) => {
              setEditDraft({ ...editDraft, parentId });
            }}
            options={roots
              .filter((root) => root.kind === editDraft.kind)
              .map((root) => [root.id, root.name] as const)}
            selected={editDraft.parentId}
          />
          <ChoiceRow
            label="Estado"
            onSelect={(isActive) => {
              setEditDraft({ ...editDraft, isActive });
            }}
            options={[
              [true, 'Activa'],
              [false, 'Archivada'],
            ]}
            selected={editDraft.isActive}
          />
          {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
          <ActionButton
            disabled={
              editDraft.name.trim() === '' ||
              editDraft.icon.trim() === '' ||
              !/^#[0-9A-Fa-f]{6}$/u.test(editDraft.color)
            }
            label="Guardar"
            loading={saving}
            onPress={() => void saveEdit()}
          />
          {editDraft.isActive ? (
            <ActionButton
              label="Archivar"
              loading={saving}
              onPress={() => void archiveEditing()}
              variant="danger"
            />
          ) : null}
          <ActionButton
            label="Cancelar"
            onPress={() => {
              setEditDraft(null);
            }}
            variant="secondary"
          />
        </Card>
      )}

      {newSubcategory === null ? null : (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>Nueva subcategoría</Text>
          <FormField
            autoFocus
            label="Nombre"
            maxLength={100}
            onChangeText={(name) => {
              setNewSubcategory({ ...newSubcategory, name });
            }}
            value={newSubcategory.name}
          />
          {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
          <ActionButton
            disabled={newSubcategory.name.trim() === ''}
            label="Guardar"
            loading={saving}
            onPress={() => void createSubcategory()}
          />
          <ActionButton
            label="Cancelar"
            onPress={() => {
              setNewSubcategory(null);
            }}
            variant="secondary"
          />
        </Card>
      )}

      {(['EXPENSE', 'INCOME'] as const).map((kind) => {
        const kindRoots = roots.filter((root) => root.kind === kind);
        if (loadState.kind !== 'loaded' || kindRoots.length === 0) return null;

        return (
          <View key={kind} style={styles.section}>
            <Text style={m1TextStyles.sectionTitle}>
              {kind === 'EXPENSE' ? 'Egresos' : 'Ingresos'}
            </Text>
            <Card>
              {kindRoots.map((root, index) => (
                <RootAccordion
                  isExpanded={expandedRoots[root.id] === true}
                  isFirst={index === 0}
                  key={root.id}
                  onAddChild={() => {
                    openCreate(root.id, root.kind);
                  }}
                  onEditChild={openEdit}
                  onToggle={() => {
                    toggleRoot(root.id);
                  }}
                  root={root}
                  subcategories={categories.filter((child) => child.parentId === root.id)}
                />
              ))}
            </Card>
          </View>
        );
      })}

      <InlineNotice tone="success">{ROOT_RULE_NOTICE}</InlineNotice>
    </AppScreen>
  );
}

function RootAccordion({
  root,
  subcategories,
  isExpanded,
  isFirst,
  onToggle,
  onEditChild,
  onAddChild,
}: {
  readonly root: Category;
  readonly subcategories: readonly Category[];
  readonly isExpanded: boolean;
  readonly isFirst: boolean;
  readonly onToggle: () => void;
  readonly onEditChild: (category: Category) => void;
  readonly onAddChild: () => void;
}) {
  return (
    <View style={!isFirst && styles.rootDivider}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.rootRow}>
        <View style={[styles.avatar, { backgroundColor: `${root.color}26` }]}>
          <Text style={[styles.avatarText, { color: root.color }]}>
            {root.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.rootCopy}>
          <Text style={m1TextStyles.body}>{root.name}</Text>
          <Text style={m1TextStyles.secondary}>
            {subcategories.length === 1
              ? '1 subcategoría'
              : `${subcategories.length.toString()} subcategorías`}
          </Text>
        </View>
        <Ionicons
          color={themeTokens.colors.inkSecondary}
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={20}
        />
      </Pressable>
      {isExpanded ? (
        <View style={styles.chipWrap}>
          {subcategories.map((child) => (
            <Pressable
              accessibilityRole="button"
              key={child.id}
              onPress={() => {
                onEditChild(child);
              }}
              style={styles.chip}
            >
              <Text style={[styles.chipLabel, !child.isActive && styles.chipLabelArchived]}>
                {child.isActive ? child.name : `${child.name} · Archivada`}
              </Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onAddChild} style={styles.chipDashed}>
            <Text style={styles.chipDashedLabel}>+ Nueva</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ChoiceRow<T extends string | boolean>({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly (readonly [T, string])[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <View style={styles.wrap}>
        {options.map(([value, text]) => (
          <Pressable
            accessibilityRole="button"
            key={String(value)}
            onPress={() => {
              onSelect(value);
            }}
            style={[styles.choice, selected === value && styles.selected]}
          >
            <Text style={m1TextStyles.secondary}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: themeTokens.spacing.cardGap },
  rootDivider: {
    marginTop: themeTokens.spacing.cardGap,
    paddingTop: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  rootRow: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  rootCopy: { flex: 1 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: themeTokens.spacing.base,
    paddingLeft: 52,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 14,
  },
  chipLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.body,
  },
  chipLabelArchived: {
    color: themeTokens.colors.inkSecondary,
  },
  chipDashed: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 14,
  },
  chipDashedLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  choices: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
  },
  selected: {
    backgroundColor: themeTokens.colors.primaryTint,
    borderColor: themeTokens.colors.primary,
  },
});
