export interface AuthenticatedIdentity {
  readonly uid: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly photoUrl: string | null;
}

export type GoogleSignInResult = 'signed-in' | 'cancelled';

export interface FirebaseAuthClient {
  readonly subscribe: (
    onIdentityChanged: (identity: AuthenticatedIdentity | null) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  readonly signInWithGoogle: () => Promise<GoogleSignInResult>;
  readonly signOut: () => Promise<void>;
  readonly getIdToken: () => Promise<string | null>;
}
