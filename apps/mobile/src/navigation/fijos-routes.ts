import { router } from 'expo-router';

// M5 "Fijos" routes. The list lives in the `fijos` tab (FIJ-01); detail, create/edit, and the
// "marcar como pagado" flow are pushed stack screens (FIJ-03/02/04), mirroring how the Movimientos
// tab pushes `movimiento/[id]` and `nuevo-gasto`.
export const NEW_RECURRING_ITEM_ROUTE = '/nuevo-fijo';

/** FIJ-03 — occurrence detail (the row's target from FIJ-01). */
export function navigateToFijoDetail(occurrenceId: string): void {
  router.push(`/fijo/${encodeURIComponent(occurrenceId)}`);
}

/** FIJ-02 — create a new fixed expense, or edit an existing one when `recurringItemId` is given. */
export function navigateToRecurringItemForm(recurringItemId?: string): void {
  if (recurringItemId === undefined) {
    router.push(NEW_RECURRING_ITEM_ROUTE);
    return;
  }
  router.push(`${NEW_RECURRING_ITEM_ROUTE}?recurringItemId=${encodeURIComponent(recurringItemId)}`);
}

/** FIJ-04 — mark an occurrence paid, entering the real amount. */
export function navigateToSettleOccurrence(occurrenceId: string): void {
  router.push(`/pagar-fijo/${encodeURIComponent(occurrenceId)}`);
}
