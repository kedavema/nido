import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveScreenBottomInset } from '@/navigation/tabs';

/**
 * Bottom padding (in px) that a scrollable screen must reserve so its last row
 * clears the home indicator. Screens under `(tabs)` need no extra inset because
 * the persistent, non-absolute tab bar already shortens their viewport by its
 * full height, including the device safe area.
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

  return resolveScreenBottomInset(insets.bottom, insideTabs);
}
