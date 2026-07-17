import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

import { getPublicEnvironment } from '@/config/public-environment';

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  const environment = getPublicEnvironment();

  return initializeApp({
    apiKey: environment.firebaseApiKey,
    authDomain: environment.firebaseAuthDomain,
    projectId: environment.firebaseProjectId,
    appId: environment.firebaseAppId,
    messagingSenderId: environment.firebaseMessagingSenderId,
  });
}
