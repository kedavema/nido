import type { Category } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { messageForActionError } from '@/auth/session-provider';
import { AppBottomSheet } from '@/components/app-bottom-sheet';
import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { categoryIcon } from '@/components/category-appearance';
import { categoryTint } from '@/utils/category-appearance';
import { filterCategoryGroups, selectedRootCategoryId } from '@/utils/category-selection';

interface CategoryPickerSheetProps {
  readonly categories: readonly Category[];
  readonly selectedCategoryId: string | undefined;
  readonly subtitle?: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (category: Category) => void;
  /**
   * Creates a subcategory under `rootId` and resolves with it. Omit to render the sheet read-only.
   *
   * Subcategories are the only thing creatable here on purpose: they inherit icon and colour from
   * their root, so a name is enough. A root needs kind, icon and colour — a form, not a chip, and
   * not something anyone does in the middle of entering an expense.
   */
  readonly onCreateSubcategory?: (rootId: string, name: string) => Promise<Category>;
}

/** Shared root/subcategory picker for one-time and recurring expenses. */
export function CategoryPickerSheet({
  categories,
  selectedCategoryId,
  subtitle,
  visible,
  onClose,
  onSelect,
  onCreateSubcategory,
}: CategoryPickerSheetProps) {
  const [search, setSearch] = useState('');
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [creatingUnderRoot, setCreatingUnderRoot] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const createAttempt = useRef(0);
  const groups = useMemo(() => filterCategoryGroups(categories, search), [categories, search]);
  const selectedRootId = selectedRootCategoryId(selectedCategoryId, categories);
  const showingAll = search.trim() === '';

  function close(): void {
    setSearch('');
    setExpandedRoots({});
    cancelCreate();
    onClose();
  }

  function cancelCreate(): void {
    // Abandons any in-flight attempt as well as the visible state.
    createAttempt.current += 1;
    setCreating(false);
    setCreatingUnderRoot(null);
    setNewName('');
    setCreateError(undefined);
  }

  // The whole point: the new category is selected and the sheet closes in one step, so the draft
  // behind it never moves. On failure the typed name stays put — retyping it is the one thing the
  // user would resent.
  async function createAndSelect(rootId: string): Promise<void> {
    // Guarded rather than merely disabled: the confirm chip and the keyboard submit both land
    // here, and two taps would create two identical subcategories before either request returns.
    if (creating || onCreateSubcategory === undefined || newName.trim() === '') return;
    // The sheet keeps its children mounted, so a request outlives a dismiss. This marks which
    // attempt is still wanted; anything older resolves into a closed sheet and must not select.
    const attempt = ++createAttempt.current;
    setCreating(true);
    setCreateError(undefined);
    try {
      const created = await onCreateSubcategory(rootId, newName.trim());
      if (attempt !== createAttempt.current) return;
      cancelCreate();
      select(created);
    } catch (error) {
      if (attempt !== createAttempt.current) return;
      setCreateError(messageForActionError(error));
    } finally {
      if (attempt === createAttempt.current) setCreating(false);
    }
  }

  function select(category: Category): void {
    setSearch('');
    setExpandedRoots({});
    onSelect(category);
  }

  return (
    <AppBottomSheet
      onClose={close}
      {...(subtitle === undefined ? {} : { subtitle })}
      title="Elegir categoría"
      visible={visible}
    >
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: showingAll }}
          onPress={() => {
            setSearch('');
          }}
          style={({ pressed }) => [
            styles.allChip,
            showingAll && styles.chipSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.chipText, showingAll && styles.chipTextSelected]}>Todas</Text>
        </Pressable>
        <View style={styles.searchRow}>
          <Ionicons color={themeTokens.colors.inkSecondary} name="search" size={18} />
          <TextInput
            accessibilityLabel="Buscar categoría o subcategoría"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder="Buscar…"
            placeholderTextColor={themeTokens.colors.inkSecondary}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
        </View>
      </View>

      {groups.length === 0 ? (
        <Text style={m1TextStyles.secondary}>
          {showingAll
            ? 'No hay categorías disponibles.'
            : 'No encontramos categorías con ese nombre.'}
        </Text>
      ) : (
        groups.map(({ root, children }) => {
          const rootSelected = selectedRootId === root.id;
          const containsExactSelection =
            selectedCategoryId === root.id ||
            children.some((child) => child.id === selectedCategoryId);
          const expanded =
            !showingAll ||
            expandedRoots[root.id] === true ||
            (expandedRoots[root.id] !== false && containsExactSelection);

          return (
            <View key={root.id} style={styles.rootGroup}>
              <Pressable
                accessibilityHint={
                  children.length > 0 ? 'Muestra u oculta sus subcategorías' : undefined
                }
                accessibilityRole="button"
                accessibilityState={{
                  expanded: children.length > 0 ? expanded : undefined,
                  selected: rootSelected,
                }}
                onPress={() => {
                  if (children.length === 0) {
                    select(root);
                    return;
                  }
                  setExpandedRoots((current) => ({ ...current, [root.id]: !expanded }));
                }}
                style={({ pressed }) => [
                  styles.rootRow,
                  rootSelected && styles.rootRowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: categoryTint(root.color) }]}>
                  <Ionicons color={root.color} name={categoryIcon(root.icon)} size={18} />
                </View>
                <View style={styles.rootCopy}>
                  <Text
                    numberOfLines={1}
                    style={[m1TextStyles.body, rootSelected && styles.rootNameSelected]}
                  >
                    {root.name}
                  </Text>
                  <Text numberOfLines={1} style={m1TextStyles.secondary}>
                    {children.map((child) => child.name).join(' · ') || 'Sin subcategorías'}
                  </Text>
                </View>
                {children.length > 0 ? (
                  <Ionicons
                    color={
                      rootSelected ? themeTokens.colors.primary : themeTokens.colors.inkSecondary
                    }
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                  />
                ) : rootSelected ? (
                  <Ionicons color={themeTokens.colors.primary} name="checkmark" size={20} />
                ) : null}
              </Pressable>

              {expanded && children.length > 0 ? (
                <View style={styles.chipRow}>
                  {children.map((child) => (
                    <CategoryChip
                      key={child.id}
                      label={child.name}
                      onPress={() => {
                        select(child);
                      }}
                      selected={selectedCategoryId === child.id}
                    />
                  ))}
                  <CategoryChip
                    label="Sin subcategoría"
                    onPress={() => {
                      select(root);
                    }}
                    selected={selectedCategoryId === root.id}
                  />
                  {onCreateSubcategory === undefined ? null : (
                    <CategoryChip
                      label="+ Nueva"
                      onPress={() => {
                        setCreatingUnderRoot(root.id);
                        // Whatever they searched for is almost certainly the name they want.
                        setNewName(search.trim());
                        setCreateError(undefined);
                      }}
                      selected={false}
                    />
                  )}
                </View>
              ) : null}
              {creatingUnderRoot === root.id ? (
                <View style={styles.createRow}>
                  <TextInput
                    accessibilityLabel={`Nombre de la nueva subcategoría en ${root.name}`}
                    autoFocus
                    editable={!creating}
                    onChangeText={setNewName}
                    onSubmitEditing={() => void createAndSelect(root.id)}
                    placeholder="Nombre"
                    placeholderTextColor={themeTokens.colors.inkSecondary}
                    returnKeyType="done"
                    style={styles.createInput}
                    value={newName}
                  />
                  <CategoryChip
                    label={creating ? 'Creando…' : 'Crear'}
                    onPress={() => void createAndSelect(root.id)}
                    selected
                  />
                  <CategoryChip label="Cancelar" onPress={cancelCreate} selected={false} />
                </View>
              ) : null}
              {creatingUnderRoot === root.id && createError !== undefined ? (
                <Text style={styles.createError}>{createError}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </AppBottomSheet>
  );
}

function CategoryChip({
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
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allChip: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 16,
  },
  searchRow: {
    flex: 1,
    minWidth: 0,
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    paddingVertical: 10,
  },
  rootGroup: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  rootRow: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rootRowSelected: {
    backgroundColor: themeTokens.colors.primaryTint,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rootNameSelected: {
    color: themeTokens.colors.primary,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  createInput: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 14,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
  },
  createError: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
  },
  chip: {
    minHeight: themeTokens.touchTarget.minimum,
    maxWidth: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 14,
  },
  chipSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  chipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    flexShrink: 1,
  },
  chipTextSelected: {
    color: themeTokens.colors.surface,
  },
  pressed: {
    opacity: 0.72,
  },
});
