import { router } from 'expo-router';

// Target route for issue #38 ("M3: mobile — Nuevo/editar gasto form"), which reads the
// `transactionId` query param to switch into edit mode. `app/nuevo-gasto.tsx` currently a
// placeholder stub (same pattern as the M0-era `movimientos.tsx`/`index.tsx` stubs); #38 replaces
// its content. The "Editar" action on a movement's detail screen (`app/movimiento/[id].tsx`)
// already targets `/nuevo-gasto?transactionId=<id>` in anticipation of that.
export const NEW_EXPENSE_ROUTE = '/nuevo-gasto';

export function navigateToNewExpense(transactionId?: string): void {
  if (transactionId === undefined) {
    router.push(NEW_EXPENSE_ROUTE);
    return;
  }
  router.push(`${NEW_EXPENSE_ROUTE}?transactionId=${encodeURIComponent(transactionId)}`);
}

/**
 * The same form, opened for money already received. It has always been kind-agnostic apart from
 * two hardcoded literals — the category picker filters by the draft's kind, so income categories
 * appear with no new code. Recording income used to mean declaring you *expected* it first.
 */
export function navigateToNewIncome(): void {
  router.push(`${NEW_EXPENSE_ROUTE}?type=INCOME`);
}
