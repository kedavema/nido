import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';

import { themeTokens } from '@/theme/tokens';
import { SessionProvider, useSession } from '@/auth/session-provider';
import { destinationForSession } from '@/auth/session-machine';
import { SyncQueueProvider } from '@/sync/sync-queue-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(themeTokens.colors.background);
  }, []);

  useEffect(() => {
    if (fontsReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider statusBarTranslucent>
        <SafeAreaProvider>
          <Head>
            <title>Nido</title>
            <meta content="Finanzas del hogar para dos" name="description" />
          </Head>
          <StatusBar style="dark" />
          <SessionProvider>
            <SyncQueueProvider>
              <SessionStack />
            </SyncQueueProvider>
          </SessionProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Create and detail routes are opened on top of a list the user is still
 * conceptually inside, so on native they slide up as modals and the previous
 * screen stays behind them — the standard "this is a task, not a destination"
 * signal. `presentation` and `animation` are Android/iOS-only options, and on
 * web these routes are ordinary addressable pages that the browser's own back
 * button already handles, so the whole thing is skipped there.
 *
 * Note this stops at slide-up plus the system back gesture: drag-to-dismiss on
 * Android needs `presentation: 'formSheet'`, which turns the screen into a
 * partial-height sheet and would fight the keyboard-riding footer these forms
 * depend on.
 */
const MODAL_ROUTE_OPTIONS = Platform.select({
  web: {},
  default: { presentation: 'modal', animation: 'slide_from_bottom' },
} as const);

/** Routes that open as a task on top of the current context rather than as a destination. */
const MODAL_ROUTES = [
  'nuevo-gasto',
  'nuevo-fijo',
  'nuevo-ingreso',
  'pagar-fijo/[id]',
  'recibir-ingreso/[id]',
  'movimiento/[id]',
  'fijo/[id]',
  'ingreso/[id]',
] as const;

function SessionStack() {
  const { state } = useSession();
  const destination = destinationForSession(state);

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: themeTokens.colors.background },
        headerShown: false,
      }}
    >
      <Stack.Protected guard={destination === 'loading'}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'error'}>
        <Stack.Screen name="session-error" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'sign-in'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'onboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={destination === 'tabs'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={state.kind === 'authenticated'}>
        <Stack.Screen name="invitation" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="payment-sources" />
        <Stack.Screen name="ingresos" />
        <Stack.Screen name="informes" />
        {MODAL_ROUTES.map((name) => (
          <Stack.Screen key={name} name={name} options={MODAL_ROUTE_OPTIONS} />
        ))}
      </Stack.Protected>
    </Stack>
  );
}
