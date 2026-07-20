import { EmptyTabScreen } from '@/components/empty-tab-screen';

// Placeholder for issue #38 ("M3: mobile — Nuevo/editar gasto form"). Registering this route now
// (rather than leaving it unrouted) lets Expo Router's typed routes include `/nuevo-gasto` for
// real, so callers like `navigateToNewExpense` don't need an escape-hatch cast — the same
// pattern `movimientos.tsx`/`index.tsx` followed as M0-era stubs before their milestones landed.
export default function NuevoGastoScreen() {
  return <EmptyTabScreen message="Todavía no se puede cargar un gasto." title="Nuevo gasto" />;
}
