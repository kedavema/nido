import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';

interface AppScreenProps extends PropsWithChildren {
  readonly centered?: boolean;
  readonly testID?: string;
}

export function AppScreen({ children, centered = false, testID }: AppScreenProps) {
  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={styles.safeArea}
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.screenContent, centered && styles.centeredContent]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly eyebrow?: string;
}

export function PageHeader({ title, description, eyebrow }: PageHeaderProps) {
  return (
    <View style={styles.header}>
      {eyebrow === undefined ? null : <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={[styles.card, cardShadowStyle]}>{children}</View>;
}

interface ActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly accessibilityHint?: string;
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  accessibilityHint,
}: ActionButtonProps) {
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        pressed && !blocked && styles.pressedButton,
        blocked && styles.disabledButton,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? themeTokens.colors.surface : themeTokens.colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' ? styles.primaryButtonLabel : styles.secondaryButtonLabel,
            variant === 'danger' && styles.dangerButtonLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface FormFieldProps extends TextInputProps {
  readonly label: string;
  readonly error?: string | undefined;
}

export function FormField({ label, error, style, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={themeTokens.colors.inkSecondary}
        style={[styles.input, error === undefined ? null : styles.inputError, style]}
        {...inputProps}
      />
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      )}
    </View>
  );
}

interface InlineNoticeProps {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'error' | 'success';
}

export function InlineNotice({ children, tone = 'neutral' }: InlineNoticeProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        tone === 'error' && styles.errorNotice,
        tone === 'success' && styles.successNotice,
      ]}
    >
      <Text
        style={[
          styles.noticeText,
          tone === 'error' && styles.errorNoticeText,
          tone === 'success' && styles.successNoticeText,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function LoadingContent({ label = 'Conectando…' }: { readonly label?: string }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.loading}>
      <ActivityIndicator color={themeTokens.colors.primary} size="large" />
      <Text style={styles.description}>{label}</Text>
    </View>
  );
}

export const m1TextStyles = StyleSheet.create({
  sectionTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
    lineHeight: 23,
  },
  body: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
  },
  secondary: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  token: {
    color: themeTokens.colors.ink,
    fontFamily: Platform.select({ web: 'monospace', default: 'monospace' }),
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 21,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  screenContent: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
  },
  centeredContent: {
    justifyContent: 'center',
  },
  header: {
    gap: themeTokens.spacing.base,
    marginBottom: themeTokens.spacing.base,
  },
  eyebrow: {
    color: themeTokens.colors.accent,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
    textTransform: 'uppercase',
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
    lineHeight: 34,
  },
  description: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
  },
  card: {
    gap: themeTokens.spacing.cardGap,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.cardPadding,
  },
  button: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: themeTokens.spacing.cardPadding,
    paddingVertical: 10,
  },
  primaryButton: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  secondaryButton: {
    borderColor: themeTokens.colors.borderStrong,
    backgroundColor: themeTokens.colors.surface,
  },
  dangerButton: {
    borderColor: themeTokens.semanticColors.danger.foreground,
    backgroundColor: themeTokens.semanticColors.danger.background,
  },
  pressedButton: {
    opacity: 0.78,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonLabel: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButtonLabel: {
    color: themeTokens.colors.surface,
  },
  secondaryButtonLabel: {
    color: themeTokens.colors.primary,
  },
  dangerButtonLabel: {
    color: themeTokens.semanticColors.danger.foreground,
  },
  field: {
    gap: themeTokens.spacing.base,
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  input: {
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: themeTokens.semanticColors.danger.foreground,
  },
  fieldError: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  notice: {
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.primaryTint,
    padding: 12,
  },
  errorNotice: {
    backgroundColor: themeTokens.semanticColors.danger.background,
  },
  successNotice: {
    backgroundColor: themeTokens.semanticColors.success.background,
  },
  noticeText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  errorNoticeText: {
    color: themeTokens.semanticColors.danger.foreground,
  },
  successNoticeText: {
    color: themeTokens.semanticColors.success.foreground,
  },
  loading: {
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
  },
});
