import { describe, expect, it } from 'vitest';

import {
  categoryLimitProgress,
  formatReportPercentage,
  formatSignedReportPyg,
  largestReportAmount,
  reportBarWidth,
} from './report-format';

describe('report presentation helpers', () => {
  it('finds the largest amount without converting money to number', () => {
    expect(largestReportAmount(['9007199254740993', '3410000', '9007199254740995'])).toBe(
      '9007199254740995',
    );
    expect(largestReportAmount([])).toBe('0');
  });

  it('scales bars against their largest value with half-up rounding', () => {
    expect(reportBarWidth('1', '3')).toBe('33.33%');
    expect(reportBarWidth('1', '8')).toBe('12.5%');
    expect(reportBarWidth('12', '10')).toBe('100%');
    expect(reportBarWidth('10', '0')).toBe('0%');
  });

  it('formats percentages and signed PYG consistently', () => {
    expect(formatReportPercentage(70.5)).toBe('70,5');
    expect(formatReportPercentage(100)).toBe('100');
    expect(formatSignedReportPyg('3380000')).toBe('+Gs. 3.380.000');
    expect(formatSignedReportPyg('-620000')).toBe('−Gs. 620.000');
  });
});

describe('categoryLimitProgress', () => {
  it('has no progress to report without a limit', () => {
    expect(categoryLimitProgress('5000', undefined)).toBeUndefined();
  });

  // A zero limit is not "fully spent", it is an absent limit written down. Dividing by it would
  // read as 100 % consumed on a category nobody budgeted.
  it('treats a zero limit as no limit', () => {
    expect(categoryLimitProgress('5000', '0')).toBeUndefined();
  });

  it('reports what is left below the limit', () => {
    expect(categoryLimitProgress('75000', '200000')).toEqual({
      width: '37.5%',
      remainingPyg: '125000',
      isOver: false,
    });
  });

  it('reports the overspend as a positive distance', () => {
    expect(categoryLimitProgress('250000', '200000')).toEqual({
      width: '100%',
      remainingPyg: '50000',
      isOver: true,
    });
  });

  // The bar cannot exceed its track, so an overspent category and a merely exhausted one both
  // render full — which is why the row also carries the amount in words.
  it('clamps the bar at the limit', () => {
    expect(categoryLimitProgress('999999999', '1000')?.width).toBe('100%');
  });

  it('reports an exactly exhausted limit as not over', () => {
    expect(categoryLimitProgress('200000', '200000')).toEqual({
      width: '100%',
      remainingPyg: '0',
      isOver: false,
    });
  });
});
