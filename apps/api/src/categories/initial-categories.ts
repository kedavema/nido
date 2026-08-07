import type { CategoryKind } from '@nido/domain-types';

export interface InitialCategory {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly children: readonly string[];
}

// Root names/colors must stay in sync with the Spanish taxonomy in docs/system-design.md §6.9
// and the `categorySwatches` palette in apps/mobile/src/theme/tokens.ts (duplicated here, not
// imported, since the API must not depend on the mobile app).
//
// Every color below is drawn from that validated set. A category avatar draws its glyph in the
// color on a 15% tint of the same color, so the gate is WCAG text contrast (4.5:1) against that
// tint — initial-categories.spec.ts recomputes it rather than pinning a list of known-good hexes.
//
// Nine validated swatches cannot give twelve roots a color each, so three pairs share one. All
// three cross the EXPENSE/INCOME boundary (Alimentación↔Sueldo, Servicios↔Venta,
// Otros↔Otros ingresos), which is the one place the categories screen puts a section heading
// between them, and every row carries its own name and icon besides.
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
    color: '#886108',
    children: ['Electricidad', 'Agua', 'Internet', 'Suscripciones'],
  },
  {
    kind: 'EXPENSE',
    name: 'Ocio',
    icon: 'game-controller',
    color: '#6559C3',
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
    color: '#3E6B34',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Trabajo independiente',
    icon: 'laptop',
    color: '#026AB6',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Reembolso',
    icon: 'return-down-back',
    color: '#99469F',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Venta',
    icon: 'pricetag',
    color: '#886108',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Otros ingresos',
    icon: 'add-circle',
    color: '#5C6862',
    children: [],
  },
] as const;
