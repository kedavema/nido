import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
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
    <SafeAreaProvider>
      <Head>
        <title>Nido</title>
        <meta content="Finanzas del hogar para dos" name="description" />
      </Head>
      <StatusBar style="dark" />
      <SessionProvider>
        <SessionStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

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
      </Stack.Protected>
    </Stack>
  );
}
