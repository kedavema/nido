import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import type { CategoryIconName } from '@/utils/category-appearance';
import {
  CATEGORY_ICONS,
  categoryTint,
  optionsWithCurrent,
  resolveCategoryIcon,
} from '@/utils/category-appearance';

/** `resolveCategoryIcon` bound to the real glyph map, for the surfaces that render a stored icon. */
export function categoryIcon(icon: string): CategoryIconName {
  return resolveCategoryIcon(icon, Ionicons.glyphMap);
}

export function CategoryIconPicker({
  color,
  label,
  onSelect,
  selected,
}: {
  readonly color: string;
  readonly label: string;
  readonly onSelect: (icon: string) => void;
  readonly selected: string;
}) {
  // Compare against the resolved value, not the raw one: an unrenderable stored icon resolves to
  // the fallback, and matching on the raw string would leave the grid with nothing selected.
  const current = categoryIcon(selected);
  const options = optionsWithCurrent(CATEGORY_ICONS, current);

  return (
    <View style={styles.field}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <View style={styles.grid}>
        {options.map((icon) => {
          const isSelected = icon === current;
          return (
            <Pressable
              accessibilityLabel={icon}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={icon}
              onPress={() => {
                onSelect(icon);
              }}
              style={[styles.iconCell, isSelected && styles.iconCellSelected]}
            >
              <Ionicons
                color={isSelected ? color : themeTokens.colors.inkSecondary}
                name={icon}
                size={20}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CategoryColorPicker({
  icon,
  label,
  onSelect,
  selected,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onSelect: (color: string) => void;
  readonly selected: string;
}) {
  const options = optionsWithCurrent(themeTokens.categorySwatches, selected);

  return (
    <View style={styles.field}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <View style={styles.grid}>
        {options.map((color) => {
          const isSelected = color === selected;
          return (
            <Pressable
              accessibilityLabel={color}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={color}
              onPress={() => {
                onSelect(color);
              }}
              // The swatch previews the real thing — the chosen glyph on the tint it will wear —
              // rather than a bare colour dot, so the choice is made against what it produces.
              style={[
                styles.swatch,
                { backgroundColor: categoryTint(color) },
                isSelected && { borderColor: color },
              ]}
            >
              <Ionicons color={color} name={categoryIcon(icon)} size={18} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
  },
  iconCellSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primaryTint,
  },
  swatch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
