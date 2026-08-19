import { Platform } from 'react-native';

/**
 * The smallest font iOS Safari will focus without zooming the page in — and it never zooms back
 * out, so the user is left scrolling sideways through a form.
 */
export const MINIMUM_WEB_INPUT_FONT_SIZE = 16;

/**
 * Lifts a text control's font to what Safari needs, on web only.
 *
 * The app's body scale is 15, so every plain field triggered the zoom. Raising the scale itself
 * would move every label and paragraph in the app to fix a rule that applies to focused form
 * controls; native has no such rule and no reason to change.
 *
 * A global `input { font-size: 16px }` was tried first and did nothing: react-native-web emits its
 * styles as generated classes (`.r-a023e6{font-size:15px}`), and a class outranks a type selector.
 * Winning that would take `!important`, which would also flatten the 44px amount field — the one
 * control already large enough. Deciding it per style keeps the amount at 44 (`Math.max` leaves
 * anything already above the floor alone) and leaves no global rule to trip over later.
 */
export function inputFontSize(size: number): number {
  return Platform.OS === 'web' ? Math.max(size, MINIMUM_WEB_INPUT_FONT_SIZE) : size;
}
