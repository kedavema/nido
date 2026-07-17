import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';

import { getFirebaseApp } from './firebase-app';
import type { AuthenticatedIdentity, FirebaseAuthClient } from './auth-client.types';

let persistenceReady: Promise<void> | undefined;

function getWebAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  persistenceReady ??= setPersistence(auth, browserLocalPersistence).catch(() =>
    setPersistence(auth, inMemoryPersistence),
  );
  return auth;
}

function toIdentity(auth: Auth): AuthenticatedIdentity | null {
  const user = auth.currentUser;

  if (user === null) {
    return null;
  }

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoUrl: user.photoURL,
  };
}

function isPopupCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request')
  );
}

export function getFirebaseAuthClient(): FirebaseAuthClient {
  const auth = getWebAuth();

  return {
    subscribe(onIdentityChanged, onError) {
      let unsubscribe: () => void = () => undefined;
      let active = true;

      void persistenceReady
        ?.then(() => {
          if (active) {
            unsubscribe = onAuthStateChanged(
              auth,
              () => {
                onIdentityChanged(toIdentity(auth));
              },
              onError,
            );
          }
        })
        .catch(onError);

      return () => {
        active = false;
        unsubscribe();
      };
    },
    async signInWithGoogle() {
      try {
        await persistenceReady;
        await signInWithPopup(auth, new GoogleAuthProvider());
        return 'signed-in';
      } catch (error) {
        if (isPopupCancellation(error)) {
          return 'cancelled';
        }

        throw error;
      }
    },
    async signOut() {
      await persistenceReady?.catch(() => undefined);
      await firebaseSignOut(auth);
    },
    async getIdToken() {
      await persistenceReady;
      return auth.currentUser?.getIdToken() ?? null;
    },
  };
}
