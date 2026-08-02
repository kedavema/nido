import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Base height of the bottom tab bar, before the device's bottom safe-area inset
 * is added. The tab bar renders at `TAB_BAR_BASE_HEIGHT + insets.bottom` in
 * `(tabs)/_layout.tsx` and participates in layout, so tab screens already end
 * above it rather than rendering underneath it.
 */
export const TAB_BAR_BASE_HEIGHT = 64;

/**
 * Bottom safe-area space owned by a screen. The persistent tab bar is not an
 * absolute overlay: React Navigation removes its full height (including the
 * device inset) from the tab screen's viewport. Reserving it again inside the
 * screen would double-count that space and push floating actions over content.
 */
export function resolveScreenBottomInset(safeAreaBottom: number, insideTabs: boolean): number {
  return insideTabs ? 0 : safeAreaBottom;
}

export interface TabDefinition {
  readonly route: string;
  readonly label: string;
  readonly icon: IoniconName;
  readonly activeIcon: IoniconName;
}

export const TAB_DEFINITIONS = [
  {
    route: 'index',
    label: 'Inicio',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    route: 'movimientos',
    label: 'Movimientos',
    icon: 'swap-vertical-outline',
    activeIcon: 'swap-vertical',
  },
  {
    route: 'presupuesto',
    label: 'Presupuesto',
    icon: 'pie-chart-outline',
    activeIcon: 'pie-chart',
  },
  {
    route: 'fijos',
    label: 'Fijos',
    icon: 'calendar-outline',
    activeIcon: 'calendar',
  },
  {
    route: 'mas',
    label: 'Más',
    icon: 'ellipsis-horizontal-circle-outline',
    activeIcon: 'ellipsis-horizontal-circle',
  },
] as const satisfies readonly TabDefinition[];
