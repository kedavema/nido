import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback for the app's primary interactions.
 *
 * Every function here is a no-op on web, where the API does not exist, so call
 * sites never need a platform check of their own. Failures are swallowed on
 * purpose: haptics are decoration, and a device with no vibrator — or a user who
 * turned it off — must never break the action the feedback was attached to.
 */
const isSupported = Platform.OS !== 'web';

function fire(effect: () => Promise<void>): void {
  if (!isSupported) {
    return;
  }

  effect().catch(() => {
    // Deliberately ignored: see the note above.
  });
}

/** A light tap. For choosing something: a tab, a chip, a picker row. */
export function selectionFeedback(): void {
  fire(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });
}

/** A committed action landed: an expense saved, a fixed cost settled. */
export function successFeedback(): void {
  fire(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  });
}

/** An action was refused: failed validation, a submit that did not go through. */
export function errorFeedback(): void {
  fire(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  });
}
