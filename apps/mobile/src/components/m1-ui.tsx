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
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
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

export type SyncStatusTone = 'synced' | 'pending' | 'error';

const SYNC_STATUS_PILL_COPY: Record<SyncStatusTone, string> = {
  synced: '✓ Sincronizado',
  pending: '⟳ Pendiente de sincronizar',
  error: '⚠ No se pudo sincronizar · tocá para reintentar',
};

/**
 * The single amber/green/red "sync status" pill convention shared by the GAS-03/GAS-04 save
 * confirmation (nuevo-gasto.tsx) and the Movimientos "Pendientes" section's per-item badge
 * (movimientos.tsx) — one visual language for "did this reach the server yet" everywhere it shows
 * up, per the M4 offline-indicators design set. `label` overrides the default copy only for
 * call sites that need to interpolate something (none currently do; kept for flexibility).
 */
export function SyncStatusPill({
  tone,
  label,
}: {
  readonly tone: SyncStatusTone;
  readonly label?: string;
}) {
  return (
    <View style={[styles.syncPill, syncPillToneStyles[tone]]}>
      <Text numberOfLines={1} style={[styles.syncPillText, syncPillTextToneStyles[tone]]}>
        {label ?? SYNC_STATUS_PILL_COPY[tone]}
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

/** A single muted rounded-rect placeholder block, the base unit of `SummarySkeleton` (GLO-01). */
function SkeletonBlock({
  width,
  height,
  style,
}: {
  readonly width?: number | `${number}%`;
  readonly height: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={[skeletonStyles.block, { height, width: width ?? '100%' }, style]} />;
}

/**
 * GLO-01's loading skeleton for the Inicio dashboard: static muted-gray placeholder blocks shaped
 * like the real balance card, category-breakdown card, and recent-transactions card, inside the
 * same white `Card` containers used once the summary actually loads. Deliberately static (no
 * shimmer) — the design only calls for solid placeholder blocks. Exported so a future
 * Movimientos loading state (a separate issue) can reuse it; not wired there yet.
 */
export function SummarySkeleton() {
  return (
    <View
      accessibilityLabel="Cargando resumen"
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={skeletonStyles.container}
    >
      <Card>
        <SkeletonBlock height={10} width={120} />
        <SkeletonBlock height={28} width={180} />
        <View style={skeletonStyles.row}>
          <SkeletonBlock height={48} style={skeletonStyles.flexBlock} />
          <SkeletonBlock height={48} style={skeletonStyles.flexBlock} />
        </View>
      </Card>

      <Card>
        <SkeletonBlock height={10} width={140} />
        <SkeletonBlock height={14} width="70%" />
        <SkeletonBlock height={8} />
      </Card>

      <Card>
        <SkeletonBlock height={10} width={100} />
        {[0, 1, 2].map((row) => (
          <View key={row} style={skeletonStyles.recentRow}>
            <View style={skeletonStyles.avatar} />
            <View style={skeletonStyles.recentCopy}>
              <SkeletonBlock height={14} width="80%" />
              <SkeletonBlock height={11} width="45%" />
            </View>
            <SkeletonBlock height={14} width={56} />
          </View>
        ))}
      </Card>
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
  syncPill: {
    alignSelf: 'flex-start',
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncPillText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
});

const syncPillToneStyles = StyleSheet.create({
  synced: { backgroundColor: themeTokens.semanticColors.success.background },
  pending: { backgroundColor: themeTokens.semanticColors.warning.background },
  error: { backgroundColor: themeTokens.semanticColors.danger.background },
});

const syncPillTextToneStyles = StyleSheet.create({
  synced: { color: themeTokens.semanticColors.success.foreground },
  pending: { color: themeTokens.semanticColors.warning.foreground },
  error: { color: themeTokens.semanticColors.danger.foreground },
});

const skeletonStyles = StyleSheet.create({
  container: {
    gap: themeTokens.spacing.cardGap,
  },
  block: {
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  row: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
  flexBlock: {
    flex: 1,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  recentCopy: {
    flex: 1,
    gap: 4,
  },
});
