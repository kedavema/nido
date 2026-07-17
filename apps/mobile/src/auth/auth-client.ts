import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';
import * as FirebaseAuthRuntime from 'firebase/auth';
import {
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type Auth,
  type Persistence,
  type ReactNativeAsyncStorage,
} from 'firebase/auth';

import { getFirebaseApp } from './firebase-app';
import { secureFirebasePersistenceStorage } from './secure-persistence';
import type {
  AuthenticatedIdentity,
  FirebaseAuthClient,
  GoogleSignInResult,
} from './auth-client.types';
import { getPublicEnvironment } from '@/config/public-environment';

const FirebaseAuthWithNativePersistence = FirebaseAuthRuntime as typeof FirebaseAuthRuntime & {
  getReactNativePersistence: (storage: ReactNativeAsyncStorage) => Persistence;
};

let nativeAuth: Auth | undefined;
let googleConfigured = false;

function isAuthAlreadyInitialized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'auth/already-initialized'
  );
}

function getNativeAuth(): Auth {
  if (nativeAuth !== undefined) {
    return nativeAuth;
  }

  const app = getFirebaseApp();

  try {
    nativeAuth = initializeAuth(app, {
      persistence: FirebaseAuthWithNativePersistence.getReactNativePersistence(
        secureFirebasePersistenceStorage,
      ),
    });
  } catch (error) {
    if (!isAuthAlreadyInitialized(error)) {
      throw error;
    }

    nativeAuth = getAuth(app);
  }

  return nativeAuth;
}

function configureGoogle(): void {
  if (googleConfigured) {
    return;
  }

  GoogleOneTapSignIn.configure({
    webClientId: getPublicEnvironment().googleWebClientId,
  });
  googleConfigured = true;
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

async function signInWithGoogle(): Promise<GoogleSignInResult> {
  configureGoogle();
  await GoogleOneTapSignIn.checkPlayServices();

  let response = await GoogleOneTapSignIn.signIn();

  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount();
  }

  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
  }

  if (isCancelledResponse(response)) {
    return 'cancelled';
  }

  if (!isSuccessResponse(response)) {
    throw new Error('No se pudo obtener una credencial de Google válida.');
  }

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  await signInWithCredential(getNativeAuth(), credential);

  return 'signed-in';
}

export function getFirebaseAuthClient(): FirebaseAuthClient {
  const auth = getNativeAuth();

  return {
    subscribe(onIdentityChanged, onError) {
      return onAuthStateChanged(
        auth,
        () => {
          onIdentityChanged(toIdentity(auth));
        },
        onError,
      );
    },
    signInWithGoogle,
    async signOut() {
      try {
        configureGoogle();
        await GoogleOneTapSignIn.signOut();
      } catch {
        // Firebase is the API session authority; provider cleanup must not keep it active.
      } finally {
        await firebaseSignOut(auth);
      }
    },
    async getIdToken() {
      return auth.currentUser?.getIdToken() ?? null;
    },
  };
}
