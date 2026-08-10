import type { Category, TransactionType } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBottomSheet } from '@/components/app-bottom-sheet';
import { categoryIcon } from '@/components/category-appearance';
import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { categoryTint } from '@/utils/category-appearance';
import {
  activeFilterCount,
  movementCategoryTree,
  TYPE_LABELS,
  type MovementFilterChip,
  type MovementFilters,
} from '@/utils/movement-filters';

const TYPE_SEGMENTS: readonly {
  readonly value: TransactionType | undefined;
  readonly label: string;
}[] = [
  { value: undefined, label: 'Todos' },
  { value: 'EXPENSE', label: TYPE_LABELS.EXPENSE },
  { value: 'INCOME', label: TYPE_LABELS.INCOME },
];

/**
 * Three segments rather than two chips, so "no filter" is something you choose rather than the
 * absence of a choice. With two chips the unfiltered state is "neither is on", which reads as
 * nothing having happened yet instead of as a state of its own.
 */
function TypeSegments({
  onSelect,
  selected,
}: {
  readonly onSelect: (type: TransactionType | undefined) => void;
  readonly selected: TransactionType | undefined;
}) {
  return (
    <View style={styles.segments}>
      {TYPE_SEGMENTS.map((segment) => {
        const isSelected = selected === segment.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={segment.label}
            onPress={() => {
              onSelect(segment.value);
            }}
            style={[styles.segment, isSelected && styles.segmentSelected]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, isSelected && styles.segmentTextSelected]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CategoryRow({
  category,
  indented,
  onPress,
  selected,
}: {
  readonly category: Category | undefined;
  readonly indented: boolean;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        indented && styles.rowIndented,
        pressed && styles.rowPressed,
      ]}
    >
      {category === undefined ? (
        <View style={styles.allAvatar}>
          <Ionicons color={themeTokens.colors.inkSecondary} name="apps-outline" size={16} />
        </View>
      ) : indented ? (
        <View style={[styles.dot, { backgroundColor: category.color }]} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: categoryTint(category.color) }]}>
          <Ionicons color={category.color} name={categoryIcon(category.icon)} size={16} />
        </View>
      )}
      <Text
        numberOfLines={1}
        style={[m1TextStyles.body, styles.rowText, selected && styles.rowTextSelected]}
      >
        {category?.name ?? 'Todas'}
      </Text>
      {selected ? <Ionicons color={themeTokens.colors.primary} name="checkmark" size={20} /> : null}
    </Pressable>
  );
}

/**
 * Filters live in a sheet rather than in the header. The dropdowns this replaces were absolutely
 * positioned `View`s that lost a z-index fight with their own siblings and with the list; a modal
 * is its own stacking context, so that failure cannot happen here.
 *
 * The sheet edits a draft and applies it on close. That is not cosmetic: the list is a `Modal`
 * sibling, not a route, so the screen underneath never loses focus and its fetch effect would
 * re-run on every single tap — emptying the list behind the backdrop once per option touched.
 *
 * Each filter is rendered in the shape it actually has (#228). The generic "flat list of options"
 * this replaces forced a two-level category tree into a wrapping pill row, where every child had
 * to carry its parent's name and no column existed to scan down. Type is a segmented control;
 * categories are a grouped list, parent once, children beneath it.
 */
export function MovementFiltersSheet({
  categories,
  filters,
  onApply,
  onClose,
  visible,
}: {
  readonly categories: readonly Category[];
  readonly filters: MovementFilters;
  readonly onApply: (filters: MovementFilters) => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const [draft, setDraft] = useState<MovementFilters>(filters);
  const [wasVisible, setWasVisible] = useState(visible);

  // Re-seed on open, so a draft abandoned by a previous close does not reappear and an outside
  // change (a chip removed, Limpiar) shows up next time. Adjusted during render rather than in an
  // effect: an effect would render the stale draft once before correcting it.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(filters);
  }

  const tree = movementCategoryTree(categories, draft.categoryId);
  const count = activeFilterCount(draft);

  function apply(): void {
    onApply(draft);
    onClose();
  }

  // Tapping the selected category clears it, so one filter can be undone without reaching for
  // Limpiar and losing the other.
  function selectCategory(categoryId: string): void {
    setDraft((current) => ({
      ...current,
      categoryId: current.categoryId === categoryId ? undefined : categoryId,
    }));
  }

  return (
    <AppBottomSheet onClose={apply} title="Filtros" visible={visible}>
      <View style={styles.group}>
        <Text style={styles.groupLabel}>TIPO</Text>
        <TypeSegments
          onSelect={(type) => {
            setDraft((current) => ({ ...current, type }));
          }}
          selected={draft.type}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>CATEGORÍA</Text>
        <View>
          {/* Rendered even with no tree: when the catalogue is loading or failed this is the only
              control inside the sheet that clears the category alone, and losing it would leave
              Limpiar — which drops Tipo too — as the only way out. */}
          <CategoryRow
            category={undefined}
            indented={false}
            onPress={() => {
              setDraft((current) => ({ ...current, categoryId: undefined }));
            }}
            selected={draft.categoryId === undefined}
          />
          {tree.length === 0 ? (
            <Text style={styles.empty}>No hay categorías disponibles.</Text>
          ) : (
            tree.map((group) => (
              <View key={group.root.id}>
                <CategoryRow
                  category={group.root}
                  indented={false}
                  onPress={() => {
                    selectCategory(group.root.id);
                  }}
                  selected={draft.categoryId === group.root.id}
                />
                {group.children.map((child) => (
                  <CategoryRow
                    category={child}
                    indented
                    key={child.id}
                    onPress={() => {
                      selectCategory(child.id);
                    }}
                    selected={draft.categoryId === child.id}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {count === 0 ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraft({});
            }}
            style={styles.clear}
          >
            <Text style={styles.clearText}>Limpiar</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={apply} style={styles.apply}>
          <Text style={styles.applyText}>
            {count === 0 ? 'Listo' : `Ver movimientos · ${count.toString()}`}
          </Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}

/**
 * The one virtue of the chips this app's filters used to be: they were always visible. A filter
 * you cannot see is a filter you forget, and then the list looks like missing data rather than a
 * narrowed view — so the applied filters stay on screen, outside the sheet, each one removable.
 */
export function ActiveFilterChips({
  chips,
  onRemove,
}: {
  readonly chips: readonly MovementFilterChip[];
  readonly onRemove: (key: MovementFilterChip['key']) => void;
}) {
  if (chips.length === 0) return null;

  return (
    <View style={styles.chipWrap}>
      {chips.map((chip) => (
        <Pressable
          accessibilityLabel={`Quitar filtro ${chip.label}`}
          accessibilityRole="button"
          key={chip.key}
          onPress={() => {
            onRemove(chip.key);
          }}
          style={styles.activeChip}
        >
          <Text numberOfLines={1} style={styles.activeChipText}>
            {chip.label}
          </Text>
          <Ionicons color={themeTokens.colors.surface} name="close" size={14} />
        </Pressable>
      ))}
    </View>
  );
}

export function FiltersButton({
  count,
  onPress,
}: {
  readonly count: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={count === 0 ? 'Filtros' : `Filtros, ${count.toString()} activos`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, count > 0 && styles.buttonActive]}
    >
      <Ionicons
        color={count > 0 ? themeTokens.colors.primary : themeTokens.colors.inkSecondary}
        name="options-outline"
        size={16}
      />
      <Text style={[styles.buttonText, count > 0 && styles.buttonTextActive]}>
        {count === 0 ? 'Filtros' : `Filtros · ${count.toString()}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.6,
  },
  empty: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  segments: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
  },
  segmentSelected: { backgroundColor: themeTokens.colors.surface },
  segmentText: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.body,
  },
  segmentTextSelected: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    paddingRight: 4,
  },
  // Children sit under their parent rather than repeating its name. The indent is the only thing
  // carrying that relationship, so it has to survive a long name — hence the shrinking text.
  rowIndented: { paddingLeft: 18 },
  rowPressed: { opacity: 0.6 },
  rowText: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  rowTextSelected: { fontFamily: themeTokens.typography.families.bodySemibold },
  avatar: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  allAvatar: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  dot: { width: 8, height: 8, marginHorizontal: 12, borderRadius: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: themeTokens.spacing.cardGap,
  },
  clear: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  clearText: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  apply: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
  },
  applyText: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activeChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
  },
  activeChipText: {
    flexShrink: 1,
    minWidth: 0,
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  button: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: themeTokens.touchTarget.minimum,
    paddingHorizontal: 14,
    borderRadius: themeTokens.radii.chip,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
  },
  buttonActive: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primaryTint,
  },
  buttonText: {
    flexShrink: 1,
    minWidth: 0,
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  buttonTextActive: { color: themeTokens.colors.primary },
});
