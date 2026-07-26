import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

/**
 * A single tall detent rather than a range. These sheets are pickers: the user
 * came to choose one thing and leave, so a resizable sheet would only add a
 * decision. The gap at the top keeps the screen underneath visible, which is
 * what tells you the form is still there and nothing was lost.
 */
const SNAP_POINTS = ['85%'];

interface AppBottomSheetProps {
  readonly visible: boolean;
  /**
   * Called both when the caller closes the sheet and when the user dismisses it
   * themselves by dragging down or tapping the backdrop, so the parent's
   * visibility state cannot drift out of sync with what is on screen.
   */
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

/**
 * The app's bottom sheet: a drag handle, a title, and a scrollable body over a
 * dimmed backdrop. Replaces the full-screen `Modal` the pickers used to open —
 * a full-screen takeover reads as "you left the form", while a sheet reads as
 * "you are choosing something for it", which is what is actually happening.
 *
 * Driven by a `visible` prop instead of the library's imperative ref so call
 * sites stay declarative, and closing always routes through `onClose`.
 */
export function AppBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: AppBottomSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      enableDynamicSizing={false}
      handleIndicatorStyle={styles.handleIndicator}
      // The category sheet has a search field: `interactive` lets the sheet ride
      // the keyboard instead of being covered by it, and `restore` puts it back
      // where it was once the field loses focus.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onDismiss={onClose}
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle === undefined ? null : <Text style={m1TextStyles.secondary}>{subtitle}</Text>}
      </View>
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: themeTokens.spacing.screen + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: themeTokens.colors.background,
    borderTopLeftRadius: themeTokens.radii.modal,
    borderTopRightRadius: themeTokens.radii.modal,
  },
  handleIndicator: {
    backgroundColor: themeTokens.colors.borderStrong,
  },
  header: {
    gap: themeTokens.spacing.base,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  content: {
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
  },
});
