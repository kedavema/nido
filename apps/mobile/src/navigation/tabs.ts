import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Base height of the bottom tab bar, before the device's bottom safe-area inset
 * is added. The tab bar renders at `TAB_BAR_BASE_HEIGHT + insets.bottom` in
 * `(tabs)/_layout.tsx`, and `useScreenBottomInset` reserves the same amount as
 * scroll padding so content inside a tab screen clears the bar. Single source of
 * truth for both consumers.
 */
export const TAB_BAR_BASE_HEIGHT = 64;

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
