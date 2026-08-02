export const INTERNAL_JOB_NONCES_REPOSITORY = Symbol('INTERNAL_JOB_NONCES_REPOSITORY');

/** How long a nonce stays remembered. Comfortably wider than the signature's clock window. */
export const NONCE_RETENTION_MINUTES = 10;

export interface InternalJobNoncesRepository {
  /**
   * Records a nonce and reports whether it was new. The duplicate insert **is** the replay
   * detection, so there is no read-then-write window for two concurrent replays to slip through.
   */
  remember(nonce: string, now: Date): Promise<boolean>;

  /** Drops nonces older than the retention window, so the table cannot grow without bound. */
  prune(now: Date): Promise<void>;
}
