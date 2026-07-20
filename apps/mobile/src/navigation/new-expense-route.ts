import { router, type Href } from 'expo-router';

// Target route for issue #38 ("M3: mobile — Nuevo/editar gasto form"), which has not landed yet.
// Expo Router's typed routes only know about files that exist under `app/`, so this is cast
// through `unknown` rather than left as a plain string. #38 should create `app/nuevo-gasto.tsx`
// (matching this route name) and read the `transactionId` query param to switch into edit mode —
// the "Editar" action on a movement's detail screen (`app/movimiento/[id].tsx`) already targets
// `/nuevo-gasto?transactionId=<id>` in anticipation of that.
export const NEW_EXPENSE_ROUTE = '/nuevo-gasto';

export function navigateToNewExpense(transactionId?: string): void {
  const href =
    transactionId === undefined
      ? NEW_EXPENSE_ROUTE
      : `${NEW_EXPENSE_ROUTE}?transactionId=${encodeURIComponent(transactionId)}`;
  router.push(href as unknown as Href);
}
