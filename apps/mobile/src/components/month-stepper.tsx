import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { themeTokens } from '@/theme/tokens';

/**
 * The month back/forward control that sits beside a screen title. Four screens each grew their
 * own copy — three agreed on gap 8 / padding 12 / icon 16 and one drifted to 12 / 14 / 17, with
 * nothing recorded to say why. The majority shape wins here; the difference was drift, not intent.
 *
 * It exists as a component rather than a style because it is what forced the header fork:
 * `ScreenHeader` had nowhere to put a trailing control, so every screen with a stepper hand-rolled
 * a header to hold one.
 */
export function MonthStepper({
  label,
  onNext,
  onPrevious,
}: {
  /** Omitted on Inicio, where the month is already the screen title and repeating it says nothing. */
  readonly label?: string;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}) {
  return (
    <View style={styles.pill}>
      <Pressable
        accessibilityLabel="Mes anterior"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPrevious}
      >
        <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={16} />
      </Pressable>
      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityLabel="Mes siguiente"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onNext}
      >
        <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
});
