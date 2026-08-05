import type { Category, CategoryKind } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  CategoryColorPicker,
  CategoryIconPicker,
  categoryIcon,
} from '@/components/category-appearance';
import {
  ActionButton,
  AppFormScreen,
  AppScreen,
  Card,
  FormField,
  FormHeader,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
} from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { categoryTint } from '@/utils/category-appearance';

// MAS-03 caption. The 12 seeded roots exist so budget and report comparisons hold across
// households; roots are now creatable and editable, so the caption explains the tradeoff rather
// than asserting a restriction the screen no longer enforces.
const ROOT_RULE_NOTICE =
  'Las categorías raíz que vienen por defecto mantienen comparables presupuesto e informes. Podés agregar las tuyas, pero solo vos las vas a ver en tus reportes.';

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
  /** `null` when the draft is a root — roots have no parent to reassign. */
  readonly parentId: string | null;
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

/** Creating a root is the opposite case: a root has no parent to inherit from, so it must carry
 * its own icon and color and the form asks for all three. */
interface NewRootDraft {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
}

// Both defaults must be offerable by the pickers, or every new category would open with an
// off-palette value sitting in front of the curated set as if it were one of them.
const NEW_ROOT_DEFAULT_ICON = 'pricetag';
const NEW_ROOT_DEFAULT_COLOR = '#6559C3';

export default function CategoriesScreen() {
  const { catalog, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [newSubcategory, setNewSubcategory] = useState<NewSubcategoryDraft | null>(null);
  const [newRoot, setNewRoot] = useState<NewRootDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState<string>();

  const load = useCallback(
    async (silent = false) => {
      if (household === null) return;
      if (!silent) setLoadState({ kind: 'loading' });
      try {
        const { categories } = await catalog.listCategories(household.id);
        setLoadState({ kind: 'loaded', categories });
      } catch (error) {
        setLoadState({ kind: 'error', message: messageForActionError(error) });
      }
    },
    [catalog, household],
  );

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  // Pull-to-refresh refetches silently so the visible accordion isn't swapped for
  // the full-screen spinner mid-pull — the RefreshControl is the only progress cue.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true).finally(() => {
      setRefreshing(false);
    });
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
    setNewRoot(null);
    setFormError(undefined);
    setEditDraft({
      id: category.id,
      kind: category.kind,
      name: category.name,
      // Normalised on the way in: a legacy icon Ionicons cannot render would otherwise stay
      // in the draft and be written straight back out by an unrelated save.
      icon: categoryIcon(category.icon),
      color: category.color,
      // A root keeps `null` here. Coercing it to `category.id` — as this did while only
      // subcategories were editable, to give the parent picker a non-null selection — makes the
      // category its own parent: the API rejects the save outright, and worse, the picker stays
      // visible and can demote a childless root into a subcategory of another root.
      parentId: category.parentId,
      isActive: category.isActive,
    });
  }

  function openCreate(rootId: string, kind: CategoryKind): void {
    setEditDraft(null);
    setNewRoot(null);
    setFormError(undefined);
    setNewSubcategory({ rootId, kind, name: '' });
  }

  function openCreateRoot(kind: CategoryKind): void {
    setEditDraft(null);
    setNewSubcategory(null);
    setFormError(undefined);
    setNewRoot({
      kind,
      name: '',
      icon: NEW_ROOT_DEFAULT_ICON,
      color: NEW_ROOT_DEFAULT_COLOR,
    });
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

  async function createRoot(): Promise<void> {
    if (newRoot === null) return;
    setSaving(true);
    setFormError(undefined);
    try {
      // No parentId: omitting it is what makes the API create a root rather than a child.
      //
      // sortOrder is explicit and deliberately last. The seed assigns it per root
      // (prisma-households.repository.ts: `sortOrder: rootIndex`), and `listCategories` orders by
      // sortOrder then name. `firstIncomeRootCategory` in nuevo-ingreso.tsx takes the first active
      // INCOME root as the auto-assigned category for every expected income — so a new root left
      // at the schema default of 0 would sort ahead of every seeded root and silently hijack that
      // default. Appending past the current maximum keeps new roots out of that position.
      const kindRoots = roots.filter((root) => root.kind === newRoot.kind);
      const sortOrder = kindRoots.reduce((max, root) => Math.max(max, root.sortOrder), 0) + 1;
      await catalog.createCategory(householdId, {
        kind: newRoot.kind,
        name: newRoot.name,
        icon: newRoot.icon,
        color: newRoot.color,
        sortOrder,
      });
      setNewRoot(null);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  // Both editors take over the whole screen instead of appearing as a card above
  // the accordion: it is the only way their "Guardar" CTA can ride the keyboard
  // rather than sit buried under it, and it is the shape this content will keep
  // when it becomes a bottom sheet.
  if (editDraft !== null) {
    return (
      <AppFormScreen
        footer={
          <ActionButton
            // Icon and colour come from pickers now, so they are valid by construction and only
            // the name can be empty.
            disabled={editDraft.name.trim() === ''}
            label="Guardar"
            loading={saving}
            onPress={() => void saveEdit()}
          />
        }
        header={
          <FormHeader
            onDismiss={() => {
              setEditDraft(null);
              setFormError(undefined);
            }}
            title={editDraft.parentId === null ? 'Editar categoría' : 'Editar subcategoría'}
          />
        }
      >
        <FormField
          label="Nombre"
          maxLength={100}
          onChangeText={(name) => {
            setEditDraft({ ...editDraft, name });
          }}
          value={editDraft.name}
        />
        {/* Icon and colour are root-level: a subcategory renders neither — its chip is name-only —
            and inherits both from its root at creation. Offering them here would let the two
            representations drift apart with nothing to show for it. */}
        {editDraft.parentId !== null ? null : (
          <>
            <CategoryIconPicker
              color={editDraft.color}
              label="Ícono"
              onSelect={(icon) => {
                setEditDraft({ ...editDraft, icon });
              }}
              selected={editDraft.icon}
            />
            <CategoryColorPicker
              icon={editDraft.icon}
              label="Color"
              onSelect={(color) => {
                setEditDraft({ ...editDraft, color });
              }}
              selected={editDraft.color}
            />
          </>
        )}
        {/* A root has no parent to reassign, and offering itself as an option would let the
            user create a cycle. Only subcategories get the picker. */}
        {editDraft.parentId === null ? null : (
          <ChoiceRow
            label="Raíz"
            onSelect={(parentId) => {
              // Reassigning adopts the new root's appearance, keeping the inheritance that
              // createSubcategory establishes true after the move rather than leaving the old
              // root's icon and colour on a child that no longer belongs to it.
              const nextRoot = roots.find((root) => root.id === parentId);
              setEditDraft({
                ...editDraft,
                parentId,
                icon: nextRoot?.icon ?? editDraft.icon,
                color: nextRoot?.color ?? editDraft.color,
              });
            }}
            options={roots
              .filter((root) => root.kind === editDraft.kind)
              .map((root) => [root.id, root.name] as const)}
            selected={editDraft.parentId}
          />
        )}
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
        {editDraft.isActive ? (
          <ActionButton
            label="Archivar"
            loading={saving}
            onPress={() => void archiveEditing()}
            variant="danger"
          />
        ) : null}
      </AppFormScreen>
    );
  }

  if (newRoot !== null) {
    return (
      <AppFormScreen
        footer={
          <ActionButton
            disabled={newRoot.name.trim() === ''}
            label="Guardar"
            loading={saving}
            onPress={() => void createRoot()}
          />
        }
        header={
          <FormHeader
            onDismiss={() => {
              setNewRoot(null);
              setFormError(undefined);
            }}
            subtitle={newRoot.kind === 'EXPENSE' ? 'Egresos' : 'Ingresos'}
            title="Nueva categoría"
          />
        }
      >
        <FormField
          autoFocus
          label="Nombre"
          maxLength={100}
          onChangeText={(name) => {
            setNewRoot({ ...newRoot, name });
          }}
          value={newRoot.name}
        />
        <CategoryIconPicker
          color={newRoot.color}
          label="Ícono"
          onSelect={(icon) => {
            setNewRoot({ ...newRoot, icon });
          }}
          selected={newRoot.icon}
        />
        <CategoryColorPicker
          icon={newRoot.icon}
          label="Color"
          onSelect={(color) => {
            setNewRoot({ ...newRoot, color });
          }}
          selected={newRoot.color}
        />
        {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
      </AppFormScreen>
    );
  }

  if (newSubcategory !== null) {
    const parentRoot = roots.find((root) => root.id === newSubcategory.rootId);

    return (
      <AppFormScreen
        footer={
          <ActionButton
            disabled={newSubcategory.name.trim() === ''}
            label="Guardar"
            loading={saving}
            onPress={() => void createSubcategory()}
          />
        }
        header={
          // The accordion that showed which root this belongs to is off-screen
          // now, so the header carries that context instead.
          <FormHeader
            onDismiss={() => {
              setNewSubcategory(null);
              setFormError(undefined);
            }}
            title="Nueva subcategoría"
            {...(parentRoot === undefined ? {} : { subtitle: `Dentro de ${parentRoot.name}` })}
          />
        }
      >
        <FormField
          autoFocus
          label="Nombre"
          maxLength={100}
          onChangeText={(name) => {
            setNewSubcategory({ ...newSubcategory, name });
          }}
          onSubmitEditing={() => void createSubcategory()}
          returnKeyType="done"
          value={newSubcategory.name}
        />
        {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
      </AppFormScreen>
    );
  }

  return (
    <AppScreen
      header={
        <FormHeader
          dismissIcon="back"
          onDismiss={() => {
            router.back();
          }}
          subtitle="Categorías y subcategorías del hogar"
          title="Categorías"
        />
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {loadState.kind === 'loading' ? <LoadingContent label="Cargando categorías…" /> : null}
      {loadState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{loadState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </>
      ) : null}

      {(['EXPENSE', 'INCOME'] as const).map((kind) => {
        const kindRoots = roots.filter((root) => root.kind === kind);
        // Render the section even with zero roots of this kind: it carries the only
        // "+ Nueva categoría" affordance, so hiding it would make the first root of an
        // emptied kind impossible to create — the exact state nuevo-ingreso tells the user
        // to fix ("Creá una y volvé a intentar").
        if (loadState.kind !== 'loaded') return null;

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
                  onEditRoot={() => {
                    openEdit(root);
                  }}
                  onToggle={() => {
                    toggleRoot(root.id);
                  }}
                  root={root}
                  subcategories={categories.filter((child) => child.parentId === root.id)}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  openCreateRoot(kind);
                }}
                style={styles.newRootRow}
              >
                <Text style={styles.newRootLabel}>+ Nueva categoría</Text>
              </Pressable>
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
  onEditRoot,
  onAddChild,
}: {
  readonly root: Category;
  readonly subcategories: readonly Category[];
  readonly isExpanded: boolean;
  readonly isFirst: boolean;
  readonly onToggle: () => void;
  readonly onEditChild: (category: Category) => void;
  readonly onEditRoot: () => void;
  readonly onAddChild: () => void;
}) {
  return (
    <View style={!isFirst && styles.rootDivider}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.rootRow}>
        <View style={[styles.avatar, { backgroundColor: categoryTint(root.color) }]}>
          <Ionicons color={root.color} name={categoryIcon(root.icon)} size={20} />
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
      {/* Editing the root lives inside the expanded body rather than on the row itself: the row
          is one big Pressable that toggles, so a nested button there would fight it for taps. */}
      {isExpanded ? (
        <Pressable
          accessibilityLabel={`Editar ${root.name}`}
          accessibilityRole="button"
          onPress={onEditRoot}
          style={styles.editRootRow}
        >
          <Ionicons color={themeTokens.colors.primary} name="pencil" size={14} />
          <Text style={styles.editRootLabel}>Editar categoría</Text>
        </Pressable>
      ) : null}
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
  newRootRow: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingHorizontal: 16,
  },
  newRootLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  editRootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: themeTokens.touchTarget.minimum,
    paddingHorizontal: 16,
  },
  editRootLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
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
