import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

interface AppBottomSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

/**
 * A declarative picker sheet backed by a native `Modal`.
 *
 * The app opens task forms with native-stack `presentation: 'modal'`. Portal-
 * based sheets hosted above the root navigator are rendered behind those task
 * routes on Android, so their trigger changes state but the picker cannot be
 * seen. A native modal owns its own window and therefore stays above both
 * regular and modal routes. The explicit close button replaces drag-to-dismiss
 * while keeping backdrop and Android-back dismissal available.
 */
export function AppBottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="slide"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessible={false} onPress={onClose} style={styles.backdrop} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.positioner}
        >
          <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
                  {title}
                </Text>
                {subtitle === undefined ? null : (
                  <Text style={m1TextStyles.secondary}>{subtitle}</Text>
                )}
              </View>
              <Pressable
                accessibilityLabel="Cerrar selector"
                accessibilityRole="button"
                hitSlop={4}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Ionicons color={themeTokens.colors.ink} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={[
                styles.content,
                { paddingBottom: themeTokens.spacing.screen + insets.bottom },
              ]}
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20, 28, 25, 0.42)',
  },
  positioner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '85%',
    overflow: 'hidden',
    borderTopLeftRadius: themeTokens.radii.modal,
    borderTopRightRadius: themeTokens.radii.modal,
    backgroundColor: themeTokens.colors.background,
  },
  header: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: themeTokens.spacing.base,
    paddingTop: themeTokens.spacing.cardPadding,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: themeTokens.spacing.base,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  closeButton: {
    width: themeTokens.touchTarget.minimum,
    height: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.72,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
  },
});
