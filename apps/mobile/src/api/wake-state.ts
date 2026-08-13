/**
 * Whether any request is currently waiting on a sleeping API to wake up.
 *
 * The zero-cost deployment profile (docs/system-design.md §15) runs the API on a free tier that
 * sleeps after inactivity and takes about a minute to come back. `client.ts` covers that with one
 * long-deadline retry, but a silent 75-second spinner is its own kind of bad — so the loading
 * affordances read this and say what is actually happening.
 *
 * A counter rather than a boolean, because Inicio fires the summary, occurrences, catalog and
 * members concurrently: several requests can be in a wake retry at once, and the state must only
 * clear when the last of them finishes.
 *
 * Deliberately framework-free so it can be unit tested under vitest's node environment; the React
 * binding lives with the components that consume it.
 */

let pendingWakeRetries = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function isApiWaking(): boolean {
  return pendingWakeRetries > 0;
}

/**
 * Marks one wake retry as started, returning the function that marks it finished.
 *
 * Returning the ender rather than exposing a bare decrement keeps the pairing at the call site and
 * makes double-release harmless: the returned function only counts once, however often it runs.
 */
export function beginApiWakeRetry(): () => void {
  const wasWaking = isApiWaking();
  pendingWakeRetries += 1;
  if (!wasWaking) {
    notify();
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    pendingWakeRetries -= 1;
    if (!isApiWaking()) {
      notify();
    }
  };
}

export function subscribeToApiWaking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops all state so one case cannot leak a pending retry into the next. */
export function resetApiWakeStateForTests(): void {
  pendingWakeRetries = 0;
  listeners.clear();
}
