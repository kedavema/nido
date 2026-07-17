export interface LocalUser {
  readonly id: string;
  readonly firebaseUid: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly timezone: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VerifiedIdentity {
  readonly firebaseUid: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}
