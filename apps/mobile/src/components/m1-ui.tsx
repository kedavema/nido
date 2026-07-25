import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useScreenBottomInset } from '@/hooks/use-screen-bottom-inset';
import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';

/**
 * Safe-area edges shared by every screen variant. The bottom edge is
 * deliberately excluded: the scrollable content (or a keyboard-riding footer)
 * owns the bottom inset via `useScreenBottomInset`, so applying it here too
 * would double-count it and push content up by the home-indicator height.
 */
const SCREEN_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/**
 * Distance kept between the keyboard and a focused input when it scrolls into
 * view. Native only — the web scroll fallback ignores it.
 */
const KEYBOARD_BOTTOM_OFFSET = themeTokens.spacing.lg;

/**
 * Native builds get keyboard-controller's `KeyboardAwareScrollView` (real
 * on-focus scroll tracking); web renders a plain `ScrollView` since the native
 * module is inert there. Both accept `ScrollViewProps`, so call sites are
 * identical across platforms.
 */
const ScreenScrollView = (
  Platform.OS === 'web' ? ScrollView : KeyboardAwareScrollView
) as ComponentType<KeyboardAwareScrollViewProps>;

interface EmptyStateContent {
  readonly title: string;
  readonly message: string;
}

interface AppScreenProps extends PropsWithChildren {
  readonly centered?: boolean;
  readonly testID?: string;
  /**
   * Renders a full-screen empty state (title + centered message card) instead
   * of `children`. Folds in the former standalone `EmptyTabScreen`.
   */
  readonly empty?: EmptyStateContent;
  /**
   * Pull-to-refresh. When `onRefresh` is set the scroll view gets a native
   * `RefreshControl`; `refreshing` drives its spinner. Web renders the control
   * but the pull gesture is inert (react-native-web has no touch pull), so a
   * refresh path should always also exist elsewhere on web.
   */
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  /**
   * A floating overlay (e.g. a FAB) pinned to the bottom-right, rendered as a
   * sibling of the scroll view inside the safe area so it never scrolls and sits
   * above the tab bar via `useScreenBottomInset`.
   */
  readonly floatingAction?: ReactNode;
}

export function AppScreen({
  children,
  centered = false,
  testID,
  empty,
  refreshing,
  onRefresh,
  floatingAction,
}: AppScreenProps) {
  const bottomInset = useScreenBottomInset();

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      <ScreenScrollView
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        contentContainerStyle={[
          styles.screenContent,
          centered && styles.centeredContent,
          { paddingBottom: themeTokens.spacing.screen + bottomInset },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing ?? false}
              tintColor={themeTokens.colors.primary}
            />
          )
        }
      >
        {empty === undefined ? children : <EmptyState {...empty} />}
      </ScreenScrollView>
      <FloatingActionSlot bottomInset={bottomInset}>{floatingAction}</FloatingActionSlot>
    </SafeAreaView>
  );
}

/**
 * Bottom-right overlay host shared by `AppScreen` and `AppListScreen`. Renders
 * nothing when there is no action, so both variants keep a stable tree. The
 * container is `box-none` so taps pass through the empty area to the content
 * (or list) underneath; only the action itself is interactive.
 */
function FloatingActionSlot({
  children,
  bottomInset,
}: {
  readonly children: ReactNode;
  readonly bottomInset: number;
}) {
  if (children === undefined || children === null) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={[styles.floatingAction, { bottom: bottomInset }]}>
      {children}
    </View>
  );
}

/**
 * `FlatList`-backed screen variant for lists: native pull-to-refresh via
 * `RefreshControl`, keyboard-dismiss-on-drag, and the same safe-area/bottom
 * inset handling as `AppScreen`. The list scrolls under the tab bar, with the
 * last row clearing it through `contentContainerStyle` padding.
 */
type AppListScreenProps<ItemT> = Omit<
  FlatListProps<ItemT>,
  'contentContainerStyle' | 'refreshControl'
> & {
  readonly testID?: string;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  /**
   * A fixed header rendered inside the safe area *above* the list — it never
   * scrolls, unlike the FlatList's own `ListHeaderComponent`. Use it for
   * interactive controls that must stay put (a search box, filter chips whose
   * absolute dropdowns would be clipped by later list cells on Android).
   */
  readonly header?: ReactNode;
  /**
   * A floating overlay (e.g. a FAB) pinned bottom-right, rendered as a sibling
   * of the list so it never scrolls and clears the tab bar. The list itself
   * fills the screen, so a FAB must live here rather than in `contentContainer`.
   */
  readonly floatingAction?: ReactNode;
};

export function AppListScreen<ItemT>({
  testID,
  refreshing,
  onRefresh,
  header,
  floatingAction,
  ...listProps
}: AppListScreenProps<ItemT>) {
  const bottomInset = useScreenBottomInset();

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      {header}
      <FlatList
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: themeTokens.spacing.screen + bottomInset },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing ?? false}
              tintColor={themeTokens.colors.primary}
            />
          )
        }
        {...listProps}
      />
      <FloatingActionSlot bottomInset={bottomInset}>{floatingAction}</FloatingActionSlot>
    </SafeAreaView>
  );
}

interface AppFormScreenProps extends PropsWithChildren {
  readonly testID?: string;
  /**
   * A fixed header rendered inside the safe area *above* the scroll — it never
   * scrolls with the fields. Use it for the close button, title, and controls
   * (like a currency toggle) that must stay reachable while the keyboard is up.
   */
  readonly header?: ReactNode;
  /**
   * Primary call-to-action pinned to the bottom. On native it rides the keyboard
   * via `KeyboardStickyView` so it stays visible right above the keys — the
   * always-reachable CTA is the amount-entry action, so no separate "Done"
   * toolbar is needed (and a toolbar would sit in the same band and cover it).
   * On web it degrades to a static footer.
   */
  readonly footer: ReactElement;
}

export function AppFormScreen({ children, testID, header, footer }: AppFormScreenProps) {
  const bottomInset = useScreenBottomInset();
  const isNative = Platform.OS !== 'web';
  const footerBar = (
    <View style={[styles.formFooter, { paddingBottom: bottomInset }]}>{footer}</View>
  );

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      {header}
      <ScreenScrollView
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        style={styles.formScroll}
      >
        {children}
      </ScreenScrollView>

      {isNative ? (
        // Rides the keyboard to sit just above the keys. `opened: bottomInset`
        // pulls the bar's home-indicator padding down behind the keyboard so the
        // button hugs the keys instead of floating a safe-area gap above them.
        <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }}>
          {footerBar}
        </KeyboardStickyView>
      ) : (
        footerBar
      )}
    </SafeAreaView>
  );
}

interface ScreenHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly eyebrow?: string;
}

export function ScreenHeader({ title, description, eyebrow }: ScreenHeaderProps) {
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

/**
 * Backward-compatible alias for the pre-Phase-1 name. Screens still importing
 * `PageHeader` keep working; new code should use `ScreenHeader`.
 */
export const PageHeader = ScreenHeader;

/** The former standalone `EmptyTabScreen`, folded into `AppScreen`'s `empty` prop. */
function EmptyState({ title, message }: EmptyStateContent) {
  return (
    <View style={styles.emptyState}>
      <Text accessibilityRole="header" style={styles.emptyTitle}>
        {title}
      </Text>
      <View style={[styles.emptyCard, cardShadowStyle]}>
        <Text style={styles.emptyMessage}>{message}</Text>
      </View>
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
  screenContent: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
  },
  formScroll: {
    // Fills the space between the fixed header and the sticky footer so the
    // footer anchors to the bottom (its correct base position for the keyboard-
    // sticky lift), instead of floating right under short content.
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: themeTokens.spacing.screen,
  },
  floatingAction: {
    position: 'absolute',
    right: themeTokens.spacing.screen,
  },
  centeredContent: {
    justifyContent: 'center',
  },
  formFooter: {
    gap: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.cardGap,
  },
  emptyState: {
    flex: 1,
    gap: themeTokens.spacing.cardGap,
  },
  emptyTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  emptyCard: {
    minHeight: 112,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.cardPadding,
  },
  emptyMessage: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
    textAlign: 'center',
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
