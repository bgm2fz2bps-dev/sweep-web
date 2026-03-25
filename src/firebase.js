import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAxnys_FHWUd2c63HQ7ChrdT7vbBlu9sVk",
  authDomain: "sweep-bf841.firebaseapp.com",
  projectId: "sweep-bf841",
  storageBucket: "sweep-bf841.firebasestorage.app",
  messagingSenderId: "1044190309662",
  appId: "1:1044190309662:web:f4cea2a13418e3dbd92d0f"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
