import { router } from 'expo-router';

// M5 "Ingresos esperados" routes (T-508 — the income twin of Fijos). Unlike Fijos, the list is not
// a tab: ING-01 is a pushed sub-screen of Inicio, opened from the Balance card's "Ingresos
// recibidos" figure, so every screen here is a pushed stack screen with a back button.
export const NEW_EXPECTED_INCOME_ROUTE = '/nuevo-ingreso';

/** ING-01 — the expected-income list for a month (defaults to the current month when omitted). */
export function navigateToIngresos(monthParam?: string): void {
  if (monthParam === undefined) {
    router.push('/ingresos');
    return;
  }
  router.push(`/ingresos?month=${encodeURIComponent(monthParam)}`);
}

/** ING-03 — occurrence detail (the row's target from ING-01). */
export function navigateToIngresoDetail(occurrenceId: string): void {
  router.push(`/ingreso/${encodeURIComponent(occurrenceId)}`);
}

/** ING-02 — create a new expected income, or edit an existing one when `recurringItemId` is given. */
export function navigateToExpectedIncomeForm(recurringItemId?: string): void {
  if (recurringItemId === undefined) {
    router.push(NEW_EXPECTED_INCOME_ROUTE);
    return;
  }
  router.push(
    `${NEW_EXPECTED_INCOME_ROUTE}?recurringItemId=${encodeURIComponent(recurringItemId)}`,
  );
}

/** ING-04 — mark an occurrence received, entering the real amount. */
export function navigateToReceiveOccurrence(occurrenceId: string): void {
  router.push(`/recibir-ingreso/${encodeURIComponent(occurrenceId)}`);
}
