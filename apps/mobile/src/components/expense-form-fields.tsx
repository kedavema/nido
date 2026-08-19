import type { TransactionCurrency } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
 * Typography for the centred amount, shared by the input and the off-screen `Text` that measures
 * it. One constant on purpose: if the two ever disagreed about font or size, the measurement would
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
  /*
   * Measuring is a web-only workaround, and applying it on native regressed Android.
   *
   * The problem it solves does not exist here: react-native-web renders a real `<input>`, whose
   * intrinsic width is a UA default measured in characters, so the field never fits and flex has
   * nothing left to centre. On native the field already takes its content's width from
   * `flexBasis: 'auto'`, which is what this variant did before the measurement was introduced.
   *
   * On Android the measured width did not track the text as it grew, so a longer amount kept the
   * width of a short one and `textAlign: 'center'` clipped it at both ends — digits vanished off
   * either side of the field.
   */
  const measures = centered && Platform.OS === 'web';
  const displayValue = formatAmountDisplay(value, currency);
  // What the field actually shows: an empty value renders the "0" placeholder, so that is what
  // gets measured. Otherwise an untouched field would size itself to nothing.
  const shownText = displayValue === '' ? '0' : displayValue;
  const [measuredWidth, setMeasuredWidth] = useState<number>();

  return (
    <>
      {label === undefined ? null : (
        <Text style={[styles.amountLabel, centered && styles.centeredText]}>{label}</Text>
      )}
      <View style={[styles.amountRow, centered && styles.amountRowCentered]}>
        <Text style={[styles.amountPrefix, centered && styles.amountPrefixCentered]}>
          {currency === 'PYG' ? 'Gs.' : 'USD'}
        </Text>
        {measures ? (
          /*
           * The measuring twin. It carries `AMOUNT_TYPOGRAPHY` — the same constant the input
           * uses — so the two cannot drift into disagreeing about how wide the text is, which
           * would be a silently wrong measurement rather than a visible break.
           *
           * Absolutely positioned so it takes part in no layout, and hidden from the screen
           * reader: it duplicates text that is already announced by the input itself.
           */
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={(event) => {
              setMeasuredWidth(event.nativeEvent.layout.width);
            }}
            style={styles.amountMeasure}
          >
            {shownText}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoFocus={autoFocus}
          keyboardType={currency === 'PYG' ? 'number-pad' : 'decimal-pad'}
          onChangeText={(text) => {
            onChangeText(sanitizeAmountInput(text, currency));
          }}
          placeholder="0"
          placeholderTextColor={themeTokens.colors.inkSecondary}
          style={[
            styles.amountInput,
            centered && styles.amountInputCentered,
            // Before the first measurement lands there is nothing to apply, so the field keeps
            // today's behaviour for one frame rather than flashing at zero width.
            measures && measuredWidth !== undefined
              ? { width: measuredWidth + CARET_ALLOWANCE }
              : null,
          ]}
          value={displayValue}
        />
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
  // Sized from `measuredWidth`, not by flex.
  //
  // `flexBasis: 'auto'` used to carry this, on the theory that the field would take its content's
  // width. That holds on native but not in a browser: react-native-web renders a real <input>,
  // whose intrinsic width is a UA default measured in characters (~470px at this font size, per
  // the note on `amountInput`). It therefore never fit, `flexShrink` reduced it to exactly the
  // space left after the prefix, the row filled edge to edge, and `justifyContent: 'center'` had
  // nothing left to centre — stranding "Gs." on the left while the digits centred inside the
  // input's own box.
  //
  // The longhands stay for the same reason they were written: `flex: 0` would also set
  // flex-basis to 0%, and react-native-web forwards `flex` verbatim.
  amountInputCentered: {
    ...AMOUNT_TYPOGRAPHY,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    // A field measuring a lone "0" would otherwise be a couple of dozen pixels wide — legible,
    // but below the floor for something meant to be tapped.
    minWidth: themeTokens.touchTarget.minimum,
    // Nothing an amount can grow to may push the row wider than the screen.
    maxWidth: '100%',
    textAlign: 'center',
  },
  // Takes part in no layout; exists only to be measured. Left unconstrained rather than given
  // `numberOfLines`, since a clamped line would report a clamped width.
  amountMeasure: {
    ...AMOUNT_TYPOGRAPHY,
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
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
