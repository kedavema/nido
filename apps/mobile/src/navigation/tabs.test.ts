import { describe, expect, it } from 'vitest';

import { TAB_DEFINITIONS } from './tabs';

describe('persistent tab navigation', () => {
  it('contains exactly the five canonical tabs in order', () => {
    expect(TAB_DEFINITIONS.map(({ label }) => label)).toEqual([
      'Inicio',
      'Movimientos',
      'Presupuesto',
      'Fijos',
      'Más',
    ]);
  });

  it('gives every tab one unique route and visible icon variants', () => {
    const routes = TAB_DEFINITIONS.map(({ route }) => route);

    expect(new Set(routes).size).toBe(5);
    expect(TAB_DEFINITIONS).toHaveLength(5);
    for (const tab of TAB_DEFINITIONS) {
      expect(tab.icon).not.toHaveLength(0);
      expect(tab.activeIcon).not.toHaveLength(0);
    }
  });
});
