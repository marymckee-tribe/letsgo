import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
export const isMock = !apiKey || apiKey === "mock-key";

let app: any, auth: any, db: any, googleProvider: any;

if (!isMock) {
  const firebaseConfig = {
    apiKey: apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);

  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
  googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
} else {
  db = {};
}

export const signInWithGoogle = async () => {
  if (isMock) {
    return { user: { uid: 'dev-bypass-id', displayName: 'Executive User' }, token: 'mock-token' };
  }
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return { user: result.user, token: credential?.accessToken };
};

export const subscribeToAuth = (callback: (user: any) => void) => {
  if (isMock) {
    const hasToken = typeof window !== "undefined" ? localStorage.getItem("google_access_token") : null;
    callback(hasToken === "mock-token" ? { uid: 'dev-bypass-id', displayName: 'Executive User' } : null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

export const logOutUser = async () => {
  if (!isMock) await signOut(auth);
};

export { app, auth, db };
