import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
// این دو خط رو تغییر دادیم
import { initializeFirestore } from "firebase/firestore"; 

const firebaseConfig = {
  apiKey: "AIzaSyBLZxJGGHkV3tBg_i3KotMT0BqB5AktcBk",
  authDomain: "my-chat-app-53910.firebaseapp.com",
  projectId: "my-chat-app-53910",
  storageBucket: "my-chat-app-53910.firebasestorage.app",
  messagingSenderId: "130949815000",
  appId: "1:130949815000:web:5ee123d15849ffac2395ad"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// اینجا به فایربیس میگیم از Long Polling استفاده کنه
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
});

export { signInAnonymously };