import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBottomSheet } from '@/components/app-bottom-sheet';
import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

export interface MovementFilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** One filter, its options, and what is currently applied for it. */
export interface MovementFilterGroup {
  readonly key: string;
  readonly label: string;
  readonly options: readonly MovementFilterOption<string>[];
  readonly selected: string | undefined;
}

/** What the sheet hands back on apply: each group's selection, keyed by `MovementFilterGroup.key`. */
export type MovementFilterSelection = Readonly<Record<string, string | undefined>>;

export function activeFilterCount(groups: readonly MovementFilterGroup[]): number {
  return groups.filter((group) => group.selected !== undefined).length;
}

function selectionOf(groups: readonly MovementFilterGroup[]): MovementFilterSelection {
  return Object.fromEntries(groups.map((group) => [group.key, group.selected]));
}

/** A selection whose record no longer exists in the group at all, rather than merely archived. */
function orphanSelection(
  group: MovementFilterGroup,
  selected: string | undefined,
): string | undefined {
  if (selected === undefined) return undefined;
  return group.options.some((option) => option.value === selected) ? undefined : selected;
}

/**
 * Filters live in a sheet rather than in the header. The dropdowns this replaces were absolutely
 * positioned `View`s that lost a z-index fight with their own siblings and with the list; a modal
 * is its own stacking context, so that failure cannot happen here. It also matches the vocabulary
 * the app already teaches — a chevron opens a sheet.
 *
 * The sheet edits a draft and applies it on close. That is not cosmetic: the list is a `Modal`
 * sibling, not a route, so the screen underneath never loses focus and its fetch effect would
 * re-run on every single tap — emptying the list behind the backdrop once per option touched.
 * Applying once on close is both the decided behaviour and the only one that fetches once.
 */
export function MovementFiltersSheet({
  groups,
  onApply,
  onClose,
  visible,
}: {
  readonly groups: readonly MovementFilterGroup[];
  readonly onApply: (selection: MovementFilterSelection) => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const [draft, setDraft] = useState<MovementFilterSelection>(() => selectionOf(groups));
  const [wasVisible, setWasVisible] = useState(visible);

  // Re-seed on open, so a draft abandoned by a previous close does not reappear and an outside
  // change (a chip removed, Limpiar filtros) shows up next time. Adjusted during render rather
  // than in an effect: an effect would render the stale draft once before correcting it.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(selectionOf(groups));
  }

  const count = Object.values(draft).filter((selected) => selected !== undefined).length;

  function apply(): void {
    onApply(draft);
    onClose();
  }

  return (
    <AppBottomSheet onClose={apply} title="Filtros" visible={visible}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={m1TextStyles.secondary}>{group.label}</Text>
          {group.options.length === 0 && orphanSelection(group, draft[group.key]) === undefined ? (
            <Text style={styles.empty}>No hay opciones disponibles.</Text>
          ) : (
            <View style={styles.optionWrap}>
              {/* A hard-deleted record leaves the catalogue entirely, so no option carries its id
                  and the group would show nothing selected while still narrowing the list. Render
                  the orphan so it can be seen and cleared here, not only from the chip outside. */}
              {orphanSelection(group, draft[group.key]) === undefined ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  onPress={() => {
                    setDraft((current) => ({ ...current, [group.key]: undefined }));
                  }}
                  style={[styles.option, styles.optionSelected]}
                >
                  <Text numberOfLines={1} style={[styles.optionText, styles.optionTextSelected]}>
                    Filtro anterior · quitar
                  </Text>
                </Pressable>
              )}
              {group.options.map((option) => {
                const isSelected = draft[group.key] === option.value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={option.value}
                    // Tapping the selected option clears it, so one filter can be undone without
                    // reaching for Limpiar and losing the other three.
                    onPress={() => {
                      setDraft((current) => ({
                        ...current,
                        [group.key]: isSelected ? undefined : option.value,
                      }));
                    }}
                    style={[styles.option, isSelected && styles.optionSelected]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.optionText, isSelected && styles.optionTextSelected]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ))}
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
 * The one virtue of the chips this replaces: they were always visible. A filter you cannot see is
 * a filter you forget, and then the list looks like missing data rather than a narrowed view — so
 * the applied filters stay on the screen, outside the sheet, and each one can be removed there.
 *
 * A selection with no matching option therefore still renders, labelled by its raw value. Dropping
 * it would recreate the very failure this component exists to prevent: the filter would keep
 * narrowing the list with nothing on screen to say so. Callers are expected to supply a label for
 * a selected-but-inactive record; this is the backstop for when they cannot.
 */
export function ActiveFilterChips({
  groups,
  onRemove,
}: {
  readonly groups: readonly MovementFilterGroup[];
  readonly onRemove: (key: string) => void;
}) {
  const active = groups.flatMap((group) => {
    const selected = group.selected;
    if (selected === undefined) return [];
    const option = group.options.find((candidate) => candidate.value === selected);
    return [{ group, label: option?.label ?? selected }];
  });

  if (active.length === 0) return null;

  return (
    <View style={styles.chipWrap}>
      {active.map(({ group, label }) => (
        <Pressable
          accessibilityLabel={`Quitar filtro ${group.label}: ${label}`}
          accessibilityRole="button"
          key={group.key}
          onPress={() => {
            onRemove(group.key);
          }}
          style={styles.activeChip}
        >
          <Text numberOfLines={1} style={styles.activeChipText}>
            {label}
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
  empty: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    maxWidth: '100%',
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: themeTokens.radii.chip,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
  },
  optionSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primaryTint,
  },
  optionText: {
    flexShrink: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
  },
  optionTextSelected: { fontFamily: themeTokens.typography.families.bodySemibold },
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
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  buttonTextActive: { color: themeTokens.colors.primary },
});
