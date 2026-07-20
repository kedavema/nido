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
