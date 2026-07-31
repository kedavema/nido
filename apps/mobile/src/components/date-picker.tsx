import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBottomSheet } from '@/components/app-bottom-sheet';
import { PressableScale } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import {
  CALENDAR_WEEKDAY_LABELS,
  DAY_OF_MONTH_OPTIONS,
  daysInMonth,
  firstDayOffset,
  formatCalendarMonthLabel,
  formatLocalDatePickerLabel,
  localDateFromParts,
  monthFromLocalDate,
  shiftCalendarMonth,
  type CalendarMonth,
} from '@/utils/date-picker';

const CALENDAR_COLUMN_WIDTH = '14.285714285714285%' as const;
const MONTH_OPTIONS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

interface PickerTriggerProps {
  readonly accessibilityLabel: string;
  readonly error?: boolean;
  readonly expanded: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}

function PickerTrigger({
  accessibilityLabel,
  error = false,
  expanded,
  label,
  onPress,
  testID,
}: PickerTriggerProps) {
  return (
    <PressableScale
      accessibilityHint="Abre el selector"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      haptic
      onPress={onPress}
      style={[styles.trigger, error && styles.triggerError]}
      testID={testID}
    >
      <Text numberOfLines={1} style={styles.triggerText}>
        {label}
      </Text>
      <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-down" size={18} />
    </PressableScale>
  );
}

interface DayOfMonthPickerProps {
  readonly accessibilityLabel?: string;
  readonly error?: boolean;
  readonly onChange: (dayOfMonth: number) => void;
  readonly testID?: string;
  readonly value: number;
}

/** Controlled picker for recurring values such as "el día 31 de cada mes". */
export function DayOfMonthPicker({
  accessibilityLabel = 'Día del mes',
  error = false,
  onChange,
  testID,
  value,
}: DayOfMonthPickerProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <PickerTrigger
        accessibilityLabel={`${accessibilityLabel}: El día ${value.toString()} de cada mes`}
        error={error}
        expanded={visible}
        label={`El día ${value.toString()} de cada mes`}
        onPress={() => {
          setVisible(true);
        }}
        testID={testID}
      />
      <AppBottomSheet
        onClose={() => {
          setVisible(false);
        }}
        subtitle="Los días 29, 30 y 31 se ajustan al último día de los meses más cortos."
        title="Elegir día del mes"
        visible={visible}
      >
        <View style={styles.dayGrid}>
          {DAY_OF_MONTH_OPTIONS.map((day) => {
            const selected = day === value;
            return (
              <View key={day} style={styles.dayCell}>
                <PressableScale
                  accessibilityLabel={`Día ${day.toString()}`}
                  accessibilityState={{ selected }}
                  haptic
                  onPress={() => {
                    onChange(day);
                    setVisible(false);
                  }}
                  style={[styles.dayButton, selected && styles.dayButtonSelected]}
                  testID={testID === undefined ? undefined : `${testID}-option-${day.toString()}`}
                >
                  <Text style={[styles.dayButtonText, selected && styles.dayButtonTextSelected]}>
                    {day.toString()}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </AppBottomSheet>
    </>
  );
}

interface MonthPickerProps {
  readonly accessibilityLabel?: string;
  readonly onChange: (month: CalendarMonth) => void;
  readonly testID?: string;
  readonly value: CalendarMonth;
}

/** Controlled month picker for reports and other month-scoped views. */
export function MonthPicker({
  accessibilityLabel = 'Mes',
  onChange,
  testID,
  value,
}: MonthPickerProps) {
  const [visible, setVisible] = useState(false);
  const [displayYear, setDisplayYear] = useState(value.year);

  function open(): void {
    setDisplayYear(value.year);
    setVisible(true);
  }

  return (
    <>
      <PickerTrigger
        accessibilityLabel={`${accessibilityLabel}: ${formatCalendarMonthLabel(value)}`}
        expanded={visible}
        label={formatCalendarMonthLabel(value)}
        onPress={open}
        testID={testID}
      />
      <AppBottomSheet
        onClose={() => {
          setVisible(false);
        }}
        title="Elegir mes"
        visible={visible}
      >
        <View style={styles.monthNavigation}>
          <PressableScale
            accessibilityLabel="Año anterior"
            haptic
            onPress={() => {
              setDisplayYear((year) => year - 1);
            }}
            style={styles.monthNavigationButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={20} />
          </PressableScale>
          <Text accessibilityRole="header" style={styles.monthLabel}>
            {displayYear.toString()}
          </Text>
          <PressableScale
            accessibilityLabel="Año siguiente"
            haptic
            onPress={() => {
              setDisplayYear((year) => year + 1);
            }}
            style={styles.monthNavigationButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={20} />
          </PressableScale>
        </View>
        <View style={styles.monthGrid}>
          {MONTH_OPTIONS.map((label, index) => {
            const month = index + 1;
            const selected = value.year === displayYear && value.month === month;
            return (
              <View key={label} style={styles.monthCell}>
                <PressableScale
                  accessibilityLabel={`${label} ${displayYear.toString()}`}
                  accessibilityState={{ selected }}
                  haptic
                  onPress={() => {
                    onChange({ year: displayYear, month });
                    setVisible(false);
                  }}
                  style={[styles.monthButton, selected && styles.dayButtonSelected]}
                  testID={testID === undefined ? undefined : `${testID}-option-${month.toString()}`}
                >
                  <Text style={[styles.monthButtonText, selected && styles.dayButtonTextSelected]}>
                    {label}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </AppBottomSheet>
    </>
  );
}

interface LocalDatePickerProps {
  readonly accessibilityLabel?: string;
  readonly error?: boolean;
  readonly onChange: (localDate: string) => void;
  readonly testID?: string;
  readonly value: string;
}

/** Controlled picker for one-off and yearly values stored as YYYY-MM-DD. */
export function LocalDatePicker({
  accessibilityLabel = 'Fecha',
  error = false,
  onChange,
  testID,
  value,
}: LocalDatePickerProps) {
  const [visible, setVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<CalendarMonth>(() => monthFromLocalDate(value));
  const calendarDays = useMemo(() => {
    const emptyDays = Array.from({ length: firstDayOffset(displayMonth) }, () => null);
    const monthDays = Array.from(
      { length: daysInMonth(displayMonth.year, displayMonth.month) },
      (_, index) => index + 1,
    );
    return [...emptyDays, ...monthDays];
  }, [displayMonth]);

  function open(): void {
    setDisplayMonth(monthFromLocalDate(value));
    setVisible(true);
  }

  return (
    <>
      <PickerTrigger
        accessibilityLabel={`${accessibilityLabel}: ${formatLocalDatePickerLabel(value)}`}
        error={error}
        expanded={visible}
        label={formatLocalDatePickerLabel(value)}
        onPress={open}
        testID={testID}
      />
      <AppBottomSheet
        onClose={() => {
          setVisible(false);
        }}
        title="Elegir fecha"
        visible={visible}
      >
        <View style={styles.monthNavigation}>
          <PressableScale
            accessibilityLabel="Mes anterior"
            haptic
            onPress={() => {
              setDisplayMonth((current) => shiftCalendarMonth(current, -1));
            }}
            style={styles.monthNavigationButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={20} />
          </PressableScale>
          <Text accessibilityRole="header" style={styles.monthLabel}>
            {formatCalendarMonthLabel(displayMonth)}
          </Text>
          <PressableScale
            accessibilityLabel="Mes siguiente"
            haptic
            onPress={() => {
              setDisplayMonth((current) => shiftCalendarMonth(current, 1));
            }}
            style={styles.monthNavigationButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={20} />
          </PressableScale>
        </View>
        <View style={styles.weekdayRow}>
          {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
            <Text key={weekday} style={styles.weekdayLabel}>
              {weekday}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index.toString()}`} style={styles.calendarCell} />;
            }
            const localDate = localDateFromParts(displayMonth.year, displayMonth.month, day);
            const selected = localDate === value;
            return (
              <View key={localDate} style={styles.calendarCell}>
                <PressableScale
                  accessibilityLabel={formatLocalDatePickerLabel(localDate)}
                  accessibilityState={{ selected }}
                  haptic
                  onPress={() => {
                    onChange(localDate);
                    setVisible(false);
                  }}
                  style={[styles.dayButton, selected && styles.dayButtonSelected]}
                  testID={testID === undefined ? undefined : `${testID}-option-${localDate}`}
                >
                  <Text style={[styles.dayButtonText, selected && styles.dayButtonTextSelected]}>
                    {day.toString()}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerError: {
    borderColor: themeTokens.semanticColors.danger.foreground,
  },
  triggerText: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '25%',
    padding: 4,
  },
  dayButton: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  dayButtonSelected: {
    backgroundColor: themeTokens.colors.primary,
  },
  dayButtonText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  dayButtonTextSelected: {
    color: themeTokens.colors.surface,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavigationButton: {
    width: themeTokens.touchTarget.minimum,
    height: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '33.333333333333336%', padding: 4 },
  monthButton: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surfaceMuted,
    paddingHorizontal: 4,
  },
  monthButtonText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  monthLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: CALENDAR_COLUMN_WIDTH,
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: CALENDAR_COLUMN_WIDTH,
    padding: 2,
  },
});
