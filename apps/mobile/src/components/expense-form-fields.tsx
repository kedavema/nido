import type { TransactionCurrency } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { inputFontSize } from '@/theme/input-font-size';
import { themeTokens } from '@/theme/tokens';
import { formatAmountDisplay, sanitizeAmountInput } from '@/utils/expense-form';

import { m1TextStyles } from './m1-ui';

/**
 * The field vocabulary every amount form speaks: Nuevo gasto, Nuevo gasto fijo
 * and Nuevo ingreso render the same labels, chips and amount treatment, so the
 * primitives live here instead of being reimplemented per screen.
 */

/**
 * Typography for the centred amount, shared by the input and the hidden `Text` that sizes its
 * box. One constant on purpose: if the two ever disagreed about font or size, the measurement would
 * be quietly wrong by a few pixels rather than visibly broken, which is the kind of defect that
 * survives a review.
 */
const AMOUNT_TYPOGRAPHY = {
  fontFamily: themeTokens.typography.families.displayBold,
  fontSize: 44,
} as const;

/** Room for the caret past the last glyph, so it is not clipped at the field's edge. */
const CARET_ALLOWANCE = 3;

/** Label + control + optional inline error. Use for a single control such as an input or picker. */
export function FormField({
  label,
  error,
  children,
}: {
  readonly label: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      <FieldError error={error} />
    </View>
  );
}

/**
 * A labelled group of chips. `onSeeAll` renders the "Ver todas ›" affordance in
 * the header rather than as another chip, so the row only ever holds choices.
 */
export function FormSection({
  label,
  sublabel,
  onSeeAll,
  seeAllLabel = 'Ver todas ›',
  error,
  children,
}: {
  readonly label: string;
  readonly sublabel?: string | undefined;
  readonly onSeeAll?: () => void;
  readonly seeAllLabel?: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.sectionHeader}>
        <Text style={styles.fieldLabel}>
          {label}
          {sublabel === undefined ? '' : ` · ${sublabel}`}
        </Text>
        {onSeeAll === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            hitSlop={4}
            onPress={onSeeAll}
            style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}
          >
            <Text style={styles.seeAll}>{seeAllLabel}</Text>
          </Pressable>
        )}
      </View>
      {children}
      <FieldError error={error} />
    </View>
  );
}

function FieldError({ error }: { readonly error: string | undefined }) {
  if (error === undefined) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={styles.errorText}>
      {error}
    </Text>
  );
}

export function ChipRow({ children }: { readonly children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** The solid single-select chip used for categories, recurrence and people. */
export function Chip({
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

/** The lighter outlined chip for multi-select groups, where several can be on at once. */
export function SoftChip({
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
        styles.softChip,
        selected && styles.softChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.softChipText, selected && styles.softChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The oversized amount entry that anchors every amount form.
 *
 * `centered` puts the prefix and the number together on the screen's axis, for
 * screens where the amount is the subject rather than one field among several:
 * the settle screens, where confirming it is the whole job, and GAS-01, where it
 * takes focus on open with the keypad under it and only chip rows below.
 *
 * `hero` is the left-aligned entry, still used by the income and fijo capture
 * forms. Those have their own reference screens (ING-02, FIJ-02) which have not
 * been read against this — the split is "not checked yet", not "decided
 * differently", so do not treat it as a rule about capture forms.
 */
export function AmountField({
  accessibilityLabel,
  autoFocus = false,
  currency,
  hint,
  label,
  value,
  variant = 'hero',
  onChangeText,
}: {
  readonly accessibilityLabel: string;
  readonly autoFocus?: boolean;
  readonly currency: TransactionCurrency;
  readonly hint?: ReactNode;
  readonly label?: string;
  readonly value: string;
  readonly variant?: 'hero' | 'centered';
  readonly onChangeText: (value: string) => void;
}) {
  const centered = variant === 'centered';
  const displayValue = formatAmountDisplay(value, currency);
  // What the field actually shows: an empty value renders the "0" placeholder, so that is what
  // sizes the box. Otherwise an untouched field would collapse to nothing.
  const shownText = displayValue === '' ? '0' : displayValue;

  const amountInput = (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      autoFocus={autoFocus}
      keyboardType={currency === 'PYG' ? 'number-pad' : 'decimal-pad'}
      onChangeText={(text) => {
        onChangeText(sanitizeAmountInput(text, currency));
      }}
      placeholder="0"
      placeholderTextColor={themeTokens.colors.inkSecondary}
      style={[styles.amountInput, centered && styles.amountInputCentered]}
      value={displayValue}
    />
  );

  return (
    <>
      {label === undefined ? null : (
        <Text style={[styles.amountLabel, centered && styles.centeredText]}>{label}</Text>
      )}
      <View style={[styles.amountRow, centered && styles.amountRowCentered]}>
        <Text style={[styles.amountPrefix, centered && styles.amountPrefixCentered]}>
          {currency === 'PYG' ? 'Gs.' : 'USD'}
        </Text>
        {/*
         * A `Text` sizes itself to its content on every platform; a `TextInput` does not. So the
         * box takes its width from a hidden `Text` carrying the same string and typography, and
         * the input fills the box absolutely.
         *
         * The previous shape asked the input itself to be content-sized, which only ever worked in
         * a browser -- react-native-web renders a real `<input>`, and its UA intrinsic width is
         * large enough to look content-sized. On Android the input fell to its `minWidth` and
         * showed about two digits of the amount, scrolled to the caret.
         */}
        {centered ? (
          <View style={styles.amountBox}>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.amountGhost}
            >
              {shownText}
            </Text>
            {amountInput}
          </View>
        ) : (
          amountInput
        )}
      </View>
      {hint === undefined ? null : (
        <Text style={[styles.amountHint, centered && styles.centeredText]}>{hint}</Text>
      )}
    </>
  );
}

/** Numeric stepper for small bounded counts, such as "cada N meses". */
export function Stepper({
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
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <Ionicons color={themeTokens.colors.primary} name="remove" size={18} />
      </Pressable>
      <Text style={styles.stepperValue}>{value.toString()}</Text>
      <Pressable
        accessibilityLabel="Sumar"
        accessibilityRole="button"
        onPress={onIncrement}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <Ionicons color={themeTokens.colors.primary} name="add" size={18} />
      </Pressable>
      <Text style={m1TextStyles.body}>{unit}</Text>
    </View>
  );
}

/**
 * Shared surfaces the screens still compose themselves: text inputs, the date
 * row and the pressed feedback that goes with them.
 */
export const formFieldStyles = StyleSheet.create({
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  textField: {
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: inputFontSize(themeTokens.typography.scale.body),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textFieldError: {
    borderColor: themeTokens.semanticColors.danger.foreground,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  dateFieldText: {
    flex: 1,
    minWidth: 0,
  },
  fieldPressed: {
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});

const styles = StyleSheet.create({
  field: formFieldStyles.field,
  fieldLabel: formFieldStyles.fieldLabel,
  pressed: formFieldStyles.pressed,
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  seeAllButton: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    paddingLeft: 12,
  },
  errorText: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
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
    maxWidth: 160,
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
    paddingHorizontal: 14,
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
  amountLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  amountHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  centeredText: {
    textAlign: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: themeTokens.spacing.cardGap,
  },
  amountRowCentered: {
    justifyContent: 'center',
    paddingVertical: 0,
  },
  amountPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
    paddingBottom: 6,
  },
  amountPrefixCentered: {
    paddingBottom: 8,
  },
  /*
   * The centred field's width comes from `amountGhost` below, a `Text` carrying the same string.
   * A `TextInput` has no content-derived width on native, so anything that asked the input to size
   * itself left it at `minWidth` -- about two digits -- with the text scrolled to the caret.
   */
  amountBox: {
    // A field showing a lone "0" would otherwise be a couple of dozen pixels wide: legible, but
    // below the floor for something meant to be tapped.
    minWidth: themeTokens.touchTarget.minimum,
    // Nothing an amount can grow to may push the row wider than the screen.
    maxWidth: '100%',
    flexShrink: 1,
    // Room for the caret past the last glyph, so it is not clipped at the box's edge.
    paddingRight: CARET_ALLOWANCE,
  },
  /*
   * Invisible but in flow: it exists only to give `amountBox` a width, so it must occupy space.
   * Hidden from the screen reader, since it duplicates text the input already announces.
   */
  amountGhost: {
    ...AMOUNT_TYPOGRAPHY,
    opacity: 0,
  },
  amountInputCentered: {
    ...AMOUNT_TYPOGRAPHY,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
  },
  amountInput: {
    flex: 1,
    // On web, react-native-web renders this as a plain <input>, and the browser's UA default
    // min-content width for a text input scales with fontSize (here 40px) — without an explicit
    // minWidth override, Chrome refuses to shrink the flex item below that intrinsic width
    // (~470px+ at this font size), overflowing the row and the whole form's ScrollView
    // horizontally. minWidth: 0 lets the flex-basis:0/flex-grow:1 sizing actually apply.
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displayBold,
    fontSize: 40,
    padding: 0,
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
});
