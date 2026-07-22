import type { CategoryKind } from '@nido/domain-types';

export interface InitialCategory {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly children: readonly string[];
}

// Root names/colors must stay in sync with the Spanish taxonomy in docs/system-design.md §6.9
// and the `categoryColors` palette in apps/mobile/src/theme/tokens.ts (duplicated here, not
// imported, since the API must not depend on the mobile app).
export const INITIAL_CATEGORIES: readonly InitialCategory[] = [
  {
    kind: 'EXPENSE',
    name: 'Vivienda',
    icon: 'home',
    color: '#3E5C76',
    children: ['Alquiler', 'Mantenimiento', 'Expensas'],
  },
  {
    kind: 'EXPENSE',
    name: 'Alimentación',
    icon: 'restaurant',
    color: '#3E6B34',
    children: ['Supermercado', 'Delivery', 'Verdulería', 'Panadería'],
  },
  {
    kind: 'EXPENSE',
    name: 'Transporte',
    icon: 'car',
    color: '#7A4B6E',
    children: ['Combustible', 'Apps de transporte', 'Mantenimiento'],
  },
  {
    kind: 'EXPENSE',
    name: 'Salud',
    icon: 'medical',
    color: '#A04848',
    children: ['Consultas', 'Medicamentos', 'Kinesiología'],
  },
  {
    kind: 'EXPENSE',
    name: 'Servicios',
    icon: 'flash',
    color: '#3E5C76',
    children: ['Electricidad', 'Agua', 'Internet', 'Suscripciones'],
  },
  {
    kind: 'EXPENSE',
    name: 'Ocio',
    icon: 'game-controller',
    color: '#B4632F',
    children: ['Salidas', 'Streaming', 'Juegos', 'Eventos', 'Viajes'],
  },
  {
    kind: 'EXPENSE',
    name: 'Otros',
    icon: 'ellipsis-horizontal',
    color: '#5C6862',
    children: ['Sin categorizar'],
  },
  {
    kind: 'INCOME',
    name: 'Sueldo',
    icon: 'briefcase',
    color: '#219653',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Trabajo independiente',
    icon: 'laptop',
    color: '#2D9CDB',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Reembolso',
    icon: 'return-down-back',
    color: '#56CCF2',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Venta',
    icon: 'pricetag',
    color: '#F2994A',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Otros ingresos',
    icon: 'add-circle',
    color: '#6FCF97',
    children: [],
  },
] as const;
