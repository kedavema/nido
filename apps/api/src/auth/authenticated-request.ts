import type { LocalUser } from '../users/user.js';

export interface AuthenticatedRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly params?: Record<string, string | undefined>;
  authenticatedUser?: LocalUser;
  householdAccess?: {
    readonly actorId: string;
    readonly householdId: string;
    readonly role: 'OWNER' | 'MEMBER';
    readonly joinedAt: Date;
  };
}
