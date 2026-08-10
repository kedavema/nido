import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useScreenBottomInset } from '@/hooks/use-screen-bottom-inset';
import { selectionFeedback } from '@/lib/haptics';
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
   * A fixed header rendered inside the safe area *above* the scroll — it never
   * scrolls with the content. Same slot as `AppListScreen`/`AppFormScreen`, so a
   * screen that swaps between browsing and editing keeps its header in place.
   */
  readonly header?: ReactNode;
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
   * sibling of the scroll view inside the safe area so it never scrolls. The tab
   * navigator already keeps the screen viewport above its persistent bar.
   */
  readonly floatingAction?: ReactNode;
}

export function AppScreen({
  children,
  centered = false,
  testID,
  header,
  empty,
  refreshing,
  onRefresh,
  floatingAction,
}: AppScreenProps) {
  const bottomInset = useScreenBottomInset();
  const { clearance, measure } = useFloatingActionClearance();

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      {header}
      <ScreenScrollView
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        contentContainerStyle={[
          styles.screenContent,
          centered && styles.centeredContent,
          { paddingBottom: themeTokens.spacing.screen + bottomInset + clearance },
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
      <FloatingActionSlot bottomInset={bottomInset} onLayout={measure}>
        {floatingAction}
      </FloatingActionSlot>
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
  onLayout,
}: {
  readonly children: ReactNode;
  readonly bottomInset: number;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}) {
  if (children === undefined || children === null) {
    return null;
  }
  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.floatingAction, { bottom: bottomInset + themeTokens.spacing.screen }]}
    >
      {children}
    </View>
  );
}

/**
 * Bottom padding a scroll view must add so its last row can clear the floating
 * action drawn over it. The action lives outside the scroll, so the content has
 * no idea it is there: without this a FAB simply paints over the last card
 * whenever the content is too short to scroll out from under it.
 *
 * Returns 0 until the action has been measured, and while there is no action at
 * all, so screens without one keep their previous padding exactly.
 */
function useFloatingActionClearance(): {
  readonly clearance: number;
  readonly measure: (event: LayoutChangeEvent) => void;
} {
  const [height, setHeight] = useState(0);

  const measure = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  }, []);

  return {
    clearance: height === 0 ? 0 : height + themeTokens.spacing.cardGap,
    measure,
  };
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
  const { clearance, measure } = useFloatingActionClearance();

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      {header}
      <FlatList
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: themeTokens.spacing.screen + bottomInset + clearance },
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
      <FloatingActionSlot bottomInset={bottomInset} onLayout={measure}>
        {floatingAction}
      </FloatingActionSlot>
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
  const [footerHeight, setFooterHeight] = useState(0);
  const isNative = Platform.OS !== 'web';

  const measureFooter = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height);
  }, []);

  /**
   * How much of the scroll area the footer covers once it rides the keyboard:
   * its full height minus the home-indicator padding, which the sticky offset
   * pulls back down behind the keys. The scroll view has to know this — the
   * footer is drawn over the band the keyboard-aware scrolling treats as free
   * space, so without it a field near the end of the form lands underneath the
   * bar with no way to scroll further.
   */
  const footerOverlap = Math.max(0, footerHeight - bottomInset);

  // The safe-area inset is *added* to the bar's own padding rather than serving
  // as it: on a device with hardware/gesture buttons `bottomInset` can be small
  // or zero, which would leave the button flush against the screen edge. This
  // keeps the bar symmetric (same breathing room above and below the button)
  // and still clears the home indicator where there is one.
  const footerBar = (
    <View
      onLayout={measureFooter}
      style={[styles.formFooter, { paddingBottom: themeTokens.spacing.cardGap + bottomInset }]}
    >
      {footer}
    </View>
  );

  return (
    <SafeAreaView edges={SCREEN_EDGES} style={styles.safeArea} testID={testID}>
      {header}
      <ScreenScrollView
        // `bottomOffset` is the gap between the keyboard and the focused caret,
        // so it has to clear the footer as well; `extraKeyboardSpace` adds the
        // matching scroll travel (it interpolates with the keyboard, so it costs
        // nothing while the keyboard is closed).
        bottomOffset={footerOverlap + KEYBOARD_BOTTOM_OFFSET}
        contentContainerStyle={styles.screenContent}
        extraKeyboardSpace={footerOverlap}
        keyboardShouldPersistTaps="handled"
        style={styles.formScroll}
      >
        {children}
      </ScreenScrollView>

      {isNative ? (
        // Rides the keyboard to sit just above the keys. `opened: bottomInset`
        // pulls only the home-indicator share of the bar's padding down behind
        // the keyboard — the bar's own padding stays, so the button keeps the
        // same breathing room over the keys that it has over the screen edge.
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
  readonly title: ReactNode;
  readonly description?: string;
  readonly eyebrow?: string;
  /**
   * Rendered left of the copy — the back affordance on a pushed screen. One size for every
   * screen; they had drifted to 20 and 22 while hand-rolling this.
   */
  readonly leading?: ReactNode;
  /**
   * Rendered right of the copy, vertically centred against it: the month stepper, an avatar row.
   * Its absence is why six screens hand-rolled a header — a screen with a trailing control had
   * nowhere to put it.
   */
  readonly trailing?: ReactNode;
  /**
   * `hero` (28px) is the standalone-screen title. `compact` (20px) is what the tab screens
   * already used before adopting this component, kept as a variant on purpose: #6 is about the
   * spacing disagreement, and unifying the *size* would silently redesign five screens. Picking
   * one size is a separate decision.
   */
  readonly size?: 'hero' | 'compact';
}

export function ScreenHeader({
  title,
  description,
  eyebrow,
  leading,
  trailing,
  size = 'hero',
}: ScreenHeaderProps) {
  const copy = (
    <View style={styles.headerCopy}>
      {eyebrow === undefined ? null : <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text accessibilityRole="header" style={size === 'hero' ? styles.title : styles.titleCompact}>
        {title}
      </Text>
      {description === undefined ? null : (
        <Text style={size === 'hero' ? styles.description : styles.descriptionCompact}>
          {description}
        </Text>
      )}
    </View>
  );

  if (leading === undefined && trailing === undefined) {
    return <View style={styles.header}>{copy}</View>;
  }

  return (
    <View style={[styles.header, styles.headerRow]}>
      {leading}
      {copy}
      {trailing}
    </View>
  );
}

/**
 * Backward-compatible alias for the pre-Phase-1 name. Screens still importing
 * `PageHeader` keep working; new code should use `ScreenHeader`.
 */
export const PageHeader = ScreenHeader;

/** The back affordance for a pushed screen's `ScreenHeader`. Hand-rolled at 20 and 22 before. */
export function HeaderBackButton({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Volver"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.headerBackButton}
    >
      <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={20} />
    </Pressable>
  );
}

/**
 * Diameter of the header's circular icon button. Matches the hand-rolled headers
 * shipped with the amount-entry forms so the pending retrofit of those screens is
 * a pure deduplication with no visual change.
 */
const FORM_HEADER_BUTTON_SIZE = 40;

const DISMISS_AFFORDANCES = {
  close: { icon: 'close', label: 'Cerrar' },
  back: { icon: 'chevron-back', label: 'Volver' },
} as const;

interface FormHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  /**
   * Escape affordance rendered left of the title, and the reason this exists as
   * a *fixed* header: it stays reachable while the keyboard is up. Omit it on a
   * screen with nowhere to go back to (a root screen).
   */
  readonly onDismiss?: () => void;
  /**
   * `close` (×) reads as "leave this editor" and suits a screen that took over
   * to edit something; `back` (chevron) reads as "return to where I came from"
   * and suits a pushed route.
   */
  readonly dismissIcon?: keyof typeof DISMISS_AFFORDANCES;
  /**
   * Trailing slot for a control that must stay reachable while typing (a
   * currency toggle, a delete action).
   */
  readonly trailing?: ReactNode;
}

/**
 * The fixed header for `AppFormScreen` (and for `AppScreen` when a screen needs
 * the same pinned title/back row): dismiss affordance, title, optional subtitle,
 * optional trailing control. Replaces the per-screen `headerRow`/`closeButton`
 * style blocks each form used to hand-roll.
 */
export function FormHeader({
  title,
  subtitle,
  onDismiss,
  dismissIcon = 'close',
  trailing,
}: FormHeaderProps) {
  const dismiss = DISMISS_AFFORDANCES[dismissIcon];

  return (
    <View style={styles.formHeader}>
      {onDismiss === undefined ? null : (
        <Pressable
          accessibilityLabel={dismiss.label}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => [styles.formHeaderButton, pressed && styles.pressedButton]}
        >
          <Ionicons color={themeTokens.colors.ink} name={dismiss.icon} size={20} />
        </Pressable>
      )}
      <View style={styles.formHeaderCopy}>
        <Text accessibilityRole="header" style={styles.formHeaderTitle}>
          {title}
        </Text>
        {subtitle === undefined ? null : <Text style={m1TextStyles.secondary}>{subtitle}</Text>}
      </View>
      {trailing}
    </View>
  );
}

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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How far a control shrinks while held, and how long it takes to get there. */
const PRESS_SCALE = 0.97;
const PRESS_DURATION_MS = 90;

interface PressableScaleProps {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly accessibilityState?: {
    readonly busy?: boolean;
    readonly disabled?: boolean;
    readonly expanded?: boolean;
    readonly selected?: boolean;
  };
  readonly testID?: string | undefined;
  /** Fires a light haptic on press. Off by default so it stays a deliberate choice. */
  readonly haptic?: boolean;
}

/**
 * A `Pressable` that dips slightly under the finger. The scale is what makes a
 * control feel physical rather than like a link — it starts the moment the touch
 * lands, before any navigation or network work, so the app answers instantly
 * even when the action behind it does not.
 *
 * Runs on the UI thread through Reanimated, which is supported on web too, so
 * this needs no platform branch. The optional haptic is separately guarded.
 */
export function PressableScale({
  children,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
  haptic = false,
}: PressableScaleProps) {
  const pressProgress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * (1 - PRESS_SCALE) }],
  }));

  return (
    <AnimatedPressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={() => {
        if (haptic) {
          selectionFeedback();
        }
        onPress();
      }}
      onPressIn={() => {
        pressProgress.value = withTiming(1, { duration: PRESS_DURATION_MS });
      }}
      onPressOut={() => {
        pressProgress.value = withTiming(0, { duration: PRESS_DURATION_MS });
      }}
      style={[style, animatedStyle]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  );
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
    // Every CTA in the app routes through here, so the press-scale and the light
    // haptic land everywhere at once rather than screen by screen.
    <PressableScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: blocked }}
      disabled={blocked}
      haptic
      onPress={onPress}
      style={[
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
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
    </PressableScale>
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

/**
 * GLO-01's pulse: opacity 1 → .5 → 1 over 1.6s, so each leg is half of that.
 *
 * The reference states it as `@keyframes nidoPulse{0%,100%{opacity:1}50%{opacity:.5}}` with
 * `1.6s ease-in-out infinite`; `withTiming`'s default easing is already an in-out curve, and
 * `withRepeat(..., -1, true)` reverses each leg, which is what makes the round trip 1.6s.
 */
const SKELETON_PULSE_LEG_MS = 800;
const SKELETON_PULSE_MIN_OPACITY = 0.5;

/**
 * Carries one pulse clock down to every block of a skeleton.
 *
 * GLO-01 has every placeholder in phase. Giving each block its own `withRepeat` would leave them
 * free to drift apart into a shimmer the reference does not ask for, so the driving shared value
 * is created once per skeleton and read by all of them. `null` means "do not pulse" — the
 * reduced-motion path, and the default for any block rendered outside a skeleton.
 */
const SkeletonPulseContext = createContext<SharedValue<number> | null>(null);

/**
 * Drives the shared opacity value for one skeleton, or leaves it still when the user has asked
 * for reduced motion. An animation that never stops is precisely what that setting exists to
 * suppress, so the accessible path is the static block this component rendered before the pulse
 * existed rather than a second, subtler animation.
 */
function useSkeletonPulse(): SharedValue<number> | null {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    opacity.value = withRepeat(
      withTiming(SKELETON_PULSE_MIN_OPACITY, { duration: SKELETON_PULSE_LEG_MS }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
      opacity.value = 1;
    };
  }, [opacity, reduceMotion]);

  return reduceMotion ? null : opacity;
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
  const pulse = useContext(SkeletonPulseContext);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse === null ? 1 : pulse.value }));

  return (
    <Animated.View
      style={[skeletonStyles.block, { height, width: width ?? '100%' }, pulseStyle, style]}
    />
  );
}

/**
 * GLO-01's loading skeleton for the Inicio dashboard: muted-gray placeholder blocks shaped like
 * the real balance card, category-breakdown card, and recent-transactions card, inside the same
 * white `Card` containers used once the summary actually loads. Every block pulses in phase, per
 * the reference — see `useSkeletonPulse` for the reduced-motion carve-out. Exported so a future
 * Movimientos loading state (a separate issue) can reuse it; not wired there yet.
 *
 * The screen header is deliberately not part of this: household name, month label and the month
 * stepper are all local state, available before any request is in flight, so skeletonising them
 * would hide information the screen already has.
 */
export function SummarySkeleton() {
  const pulse = useSkeletonPulse();

  return (
    <SkeletonPulseContext.Provider value={pulse}>
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
              <SkeletonBlock height={40} style={skeletonStyles.avatar} width={40} />
              <View style={skeletonStyles.recentCopy}>
                <SkeletonBlock height={14} width="80%" />
                <SkeletonBlock height={11} width="45%" />
              </View>
              <SkeletonBlock height={14} width={56} />
            </View>
          ))}
        </Card>
      </View>
    </SkeletonPulseContext.Provider>
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
    // Both platforms resolve the same family; this was a Platform.select whose
    // branches were identical, which implied a difference that does not exist.
    fontFamily: 'monospace',
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
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    // `screen`, not `base`, because this header renders *outside* the ScrollView and so gets none
    // of `screenContent`'s padding — unlike `ScreenHeader`, which sits inside it. `base` is 4, and
    // on web the safe-area top inset is 0, which left the title flush against the viewport edge.
    paddingTop: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  formHeaderButton: {
    width: FORM_HEADER_BUTTON_SIZE,
    height: FORM_HEADER_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FORM_HEADER_BUTTON_SIZE / 2,
    backgroundColor: themeTokens.colors.surface,
  },
  formHeaderCopy: {
    flex: 1,
  },
  formHeaderTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
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
  // Slots sit beside the copy, not above it, and the copy takes the slack so a long title wraps
  // rather than pushing a stepper off the edge.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
  },
  headerCopy: {
    flexGrow: 1,
    flexShrink: 1,
    gap: themeTokens.spacing.base,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
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
  titleCompact: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  description: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
  },
  // A compact header scales as a whole. Left at body size, the subtitle came out larger than the
  // screen-local style it replaced, which is the kind of silent redesign this issue set out to
  // avoid; every sibling screen uses the secondary scale for the same subtitle role.
  descriptionCompact: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
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
  // Width, height and the muted fill come from `SkeletonBlock`; this only rounds it into a circle.
  avatar: {
    borderRadius: 20,
  },
  recentCopy: {
    flex: 1,
    gap: 4,
  },
});
