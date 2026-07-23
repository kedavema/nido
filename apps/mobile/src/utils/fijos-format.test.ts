import { describe, expect, it } from 'vitest';

import {
  avisosLabel,
  daysUntilDue,
  deriveOccurrenceDisplayStatus,
  dueInWords,
  formatOccurrenceAmount,
  frequencyLabel,
  isPending,
  notificationOffsetLabel,
  occurrenceStatusChip,
  recurrenceDetailLabel,
  settledOnLabel,
  sumPendingEstimatedPyg,
} from './fijos-format';

const TODAY = '2026-07-15';

describe('daysUntilDue', () => {
  it('counts whole days forward and backward from today', () => {
    expect(daysUntilDue('2026-07-18', TODAY)).toBe(3);
    expect(daysUntilDue('2026-07-15', TODAY)).toBe(0);
    expect(daysUntilDue('2026-07-05', TODAY)).toBe(-10);
  });

  it('crosses month boundaries without timezone drift', () => {
    expect(daysUntilDue('2026-08-01', '2026-07-31')).toBe(1);
  });
});

describe('deriveOccurrenceDisplayStatus', () => {
  it('maps SETTLED/SKIPPED/OVERDUE straight through', () => {
    expect(deriveOccurrenceDisplayStatus({ status: 'SETTLED', dueDate: '2026-07-03' }, TODAY)).toBe(
      'SETTLED',
    );
    expect(deriveOccurrenceDisplayStatus({ status: 'SKIPPED', dueDate: '2026-07-03' }, TODAY)).toBe(
      'SKIPPED',
    );
    expect(deriveOccurrenceDisplayStatus({ status: 'OVERDUE', dueDate: '2026-07-05' }, TODAY)).toBe(
      'OVERDUE',
    );
  });

  it('splits PENDING into overdue / upcoming / pending by proximity', () => {
    expect(deriveOccurrenceDisplayStatus({ status: 'PENDING', dueDate: '2026-07-05' }, TODAY)).toBe(
      'OVERDUE',
    );
    expect(deriveOccurrenceDisplayStatus({ status: 'PENDING', dueDate: '2026-07-18' }, TODAY)).toBe(
      'UPCOMING',
    );
    expect(deriveOccurrenceDisplayStatus({ status: 'PENDING', dueDate: '2026-07-22' }, TODAY)).toBe(
      'PENDING',
    );
  });
});

describe('dueInWords', () => {
  it('reads today/tomorrow/N-days', () => {
    expect(dueInWords(0)).toBe('Vence hoy');
    expect(dueInWords(1)).toBe('Vence mañana');
    expect(dueInWords(3)).toBe('Vence en 3 días');
  });
});

describe('occurrenceStatusChip', () => {
  it('labels the overdue chip with the missed due date', () => {
    expect(occurrenceStatusChip('OVERDUE', '2026-07-05', TODAY)).toEqual({
      label: 'Vencido · era el dom 5 jul',
      tone: 'danger',
    });
  });

  it('labels the upcoming chip with the countdown and due date', () => {
    expect(occurrenceStatusChip('UPCOMING', '2026-07-18', TODAY)).toEqual({
      label: 'Vence en 3 días · sáb 18 jul',
      tone: 'warning',
    });
  });

  it('labels pending and settled chips', () => {
    expect(occurrenceStatusChip('PENDING', '2026-07-22', TODAY)).toEqual({
      label: 'Vence mié 22 jul',
      tone: 'neutral',
    });
    expect(occurrenceStatusChip('SETTLED', '2026-07-03', TODAY).tone).toBe('success');
  });
});

describe('settledOnLabel', () => {
  it('uses the settled instant in the household timezone', () => {
    expect(settledOnLabel({ settledAt: '2026-07-03T14:00:00.000Z', dueDate: '2026-07-05' })).toBe(
      'Pagado el vie 3 jul',
    );
  });

  it('switches the verb for income recurring items (T-508 reuse)', () => {
    expect(
      settledOnLabel({ settledAt: '2026-07-03T14:00:00.000Z', dueDate: '2026-07-05' }, 'INCOME'),
    ).toBe('Recibido el vie 3 jul');
  });
});

describe('frequencyLabel / recurrenceDetailLabel', () => {
  it('names each frequency', () => {
    expect(frequencyLabel('ONE_TIME', null)).toBe('Una vez');
    expect(frequencyLabel('MONTHLY', null)).toBe('Mensual');
    expect(frequencyLabel('YEARLY', null)).toBe('Anual');
    expect(frequencyLabel('EVERY_N_MONTHS', 2)).toBe('Cada 2 meses');
  });

  it('adds the day-of-month detail', () => {
    expect(
      recurrenceDetailLabel({
        frequency: 'MONTHLY',
        intervalMonths: null,
        firstDueDate: '2026-07-05',
      }),
    ).toBe('Mensual · el día 5');
    expect(
      recurrenceDetailLabel({
        frequency: 'EVERY_N_MONTHS',
        intervalMonths: 2,
        firstDueDate: '2026-07-05',
      }),
    ).toBe('Cada 2 meses · el día 5');
  });
});

describe('avisosLabel', () => {
  it('joins offsets largest-first with a trailing "y"', () => {
    expect(avisosLabel([0, 3])).toBe('3 días antes y el mismo día');
    expect(avisosLabel([7, 1, 0])).toBe('7 días antes, 1 día antes y el mismo día');
  });

  it('reads "—" when there are no avisos', () => {
    expect(avisosLabel([])).toBe('—');
  });
});

describe('notificationOffsetLabel', () => {
  it('formats a single offset', () => {
    expect(notificationOffsetLabel(0)).toBe('el mismo día');
    expect(notificationOffsetLabel(1)).toBe('1 día antes');
    expect(notificationOffsetLabel(7)).toBe('7 días antes');
  });
});

describe('formatOccurrenceAmount', () => {
  it('groups PYG thousands and drops any fractional part', () => {
    expect(formatOccurrenceAmount('2800000', 'PYG')).toBe('Gs. 2.800.000');
    expect(formatOccurrenceAmount('2800000.00', 'PYG')).toBe('Gs. 2.800.000');
  });

  it('formats USD with a decimal comma', () => {
    expect(formatOccurrenceAmount('45.90', 'USD')).toBe('USD 45,90');
  });
});

describe('sumPendingEstimatedPyg', () => {
  it('sums non-settled, non-skipped PYG occurrences only', () => {
    const total = sumPendingEstimatedPyg([
      { status: 'OVERDUE', currency: 'PYG', amount: '2800000' },
      { status: 'PENDING', currency: 'PYG', amount: '420000' },
      { status: 'PENDING', currency: 'PYG', amount: '285000' },
      { status: 'SETTLED', currency: 'PYG', amount: '560000' },
      { status: 'PENDING', currency: 'USD', amount: '100.00' },
    ]);
    expect(total).toBe('3505000');
  });
});

describe('isPending', () => {
  it('treats PENDING and OVERDUE as still-owed', () => {
    expect(isPending('PENDING')).toBe(true);
    expect(isPending('OVERDUE')).toBe(true);
    expect(isPending('SETTLED')).toBe(false);
    expect(isPending('SKIPPED')).toBe(false);
  });
});
