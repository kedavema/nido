import { AppScreen } from '@/components/m1-ui';

export default function PresupuestoScreen() {
  return (
    <AppScreen
      empty={{
        title: 'Presupuesto',
        message: 'Todavía no hay un presupuesto para mostrar.',
      }}
    />
  );
}
