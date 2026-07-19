import type { CategoryKind } from '@nido/domain-types';

export interface InitialCategory {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly children: readonly string[];
}

export const INITIAL_CATEGORIES: readonly InitialCategory[] = [
  {
    kind: 'EXPENSE',
    name: 'Housing',
    icon: 'home',
    color: '#6D5BD0',
    children: ['Rent', 'Maintenance'],
  },
  {
    kind: 'EXPENSE',
    name: 'Food',
    icon: 'restaurant',
    color: '#E67E22',
    children: ['Groceries', 'Restaurants', 'Delivery'],
  },
  {
    kind: 'EXPENSE',
    name: 'Transport',
    icon: 'car',
    color: '#2980B9',
    children: ['Fuel', 'Ride apps', 'Maintenance', 'Registration'],
  },
  {
    kind: 'EXPENSE',
    name: 'Health',
    icon: 'medical',
    color: '#27AE60',
    children: ['Appointments', 'Medication', 'Physical therapy'],
  },
  {
    kind: 'EXPENSE',
    name: 'Utilities',
    icon: 'flash',
    color: '#F2C94C',
    children: ['Electricity', 'Water', 'Internet', 'Phone', 'Subscriptions'],
  },
  {
    kind: 'EXPENSE',
    name: 'Leisure',
    icon: 'game-controller',
    color: '#9B51E0',
    children: ['Dining out', 'Streaming', 'Games', 'Events', 'Travel'],
  },
  {
    kind: 'EXPENSE',
    name: 'Other expenses',
    icon: 'ellipsis-horizontal',
    color: '#828282',
    children: ['Uncategorized'],
  },
  {
    kind: 'INCOME',
    name: 'Salary',
    icon: 'briefcase',
    color: '#219653',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Freelance',
    icon: 'laptop',
    color: '#2D9CDB',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Refund',
    icon: 'return-down-back',
    color: '#56CCF2',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Sale',
    icon: 'pricetag',
    color: '#F2994A',
    children: [],
  },
  {
    kind: 'INCOME',
    name: 'Other income',
    icon: 'add-circle',
    color: '#6FCF97',
    children: [],
  },
] as const;
