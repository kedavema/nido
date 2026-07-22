import { describe, expect, it } from 'vitest';

import {
  generateOccurrenceSchedule,
  truncateToUtcDate,
} from '../src/recurring-items/occurrence-generation.js';

const isoDates = (dates: readonly Date[]): string[] =>
  dates.map((date) => date.toISOString().slice(0, 10));

describe('generateOccurrenceSchedule', () => {
  it('ONE_TIME produces exactly one occurrence at firstDueDate', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'ONE_TIME',
      intervalMonths: null,
      endDate: null,
    });

    expect(isoDates(schedule)).toEqual(['2026-07-10']);
  });

  it('MONTHLY produces every month from firstDueDate through the 12-month horizon inclusive', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'MONTHLY',
      intervalMonths: null,
      endDate: null,
    });

    expect(isoDates(schedule)).toEqual([
      '2026-07-10',
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
      '2027-02-10',
      '2027-03-10',
      '2027-04-10',
      '2027-05-10',
      '2027-06-10',
      '2027-07-10',
    ]);
  });

  it('YEARLY within a 12-month horizon produces the first due date and the one exactly at the boundary', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'YEARLY',
      intervalMonths: null,
      endDate: null,
    });

    expect(isoDates(schedule)).toEqual(['2026-07-10', '2027-07-10']);
  });

  it('EVERY_N_MONTHS spaces occurrences by intervalMonths within the horizon', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'EVERY_N_MONTHS',
      intervalMonths: 3,
      endDate: null,
    });

    expect(isoDates(schedule)).toEqual([
      '2026-07-10',
      '2026-10-10',
      '2027-01-10',
      '2027-04-10',
      '2027-07-10',
    ]);
  });

  it('clamps day-31 due dates to the last calendar day of shorter months (Feb non-leap)', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-01-31T00:00:00.000Z'),
      frequency: 'MONTHLY',
      intervalMonths: null,
      endDate: null,
    });

    expect(schedule[1]?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('stops early when endDate falls before the 12-month horizon', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'MONTHLY',
      intervalMonths: null,
      endDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(isoDates(schedule)).toEqual(['2026-07-10', '2026-08-10', '2026-09-10']);
  });

  it('returns an empty schedule when endDate is before firstDueDate', () => {
    const schedule = generateOccurrenceSchedule({
      firstDueDate: new Date('2026-07-10T00:00:00.000Z'),
      frequency: 'MONTHLY',
      intervalMonths: null,
      endDate: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(schedule).toEqual([]);
  });
});

describe('truncateToUtcDate', () => {
  it('drops the time-of-day component, keeping the UTC calendar day', () => {
    const truncated = truncateToUtcDate(new Date('2026-07-19T23:45:00.000Z'));
    expect(truncated.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });
});
