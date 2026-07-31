import { describe, expect, it } from 'vitest';

import {
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
