import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_BASE_HEIGHT } from '@/navigation/tabs';

/**
 * Bottom padding (in px) that a scrollable screen must reserve so its last row
 * clears the home indicator and — when the screen lives under `(tabs)` — the
 * bottom tab bar that floats over it.
 *
 * The unified screen primitives (`AppScreen`, `AppListScreen`, `AppFormScreen`)
 * own the bottom edge through this value instead of a `SafeAreaView` `bottom`
 * edge, which keeps the inset from being counted twice and lets content scroll
 * naturally under the safe area. Membership in the tab group is detected from
 * the router segments, so screens need no explicit "inside tabs" prop.
 */
export function useScreenBottomInset(): number {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const insideTabs = (segments as readonly string[]).includes('(tabs)');

  return insets.bottom + (insideTabs ? TAB_BAR_BASE_HEIGHT : 0);
}
