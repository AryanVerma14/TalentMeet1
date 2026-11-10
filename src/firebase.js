import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA4t1cSGXeQcWDr_r_iU_PPc9tTR-lPhew",
  authDomain: "talentmeet-42604.firebaseapp.com",
  projectId: "talentmeet-42604",
  storageBucket: "talentmeet-42604.firebasestorage.app",
  messagingSenderId: "705916554520",
  appId: "1:705916554520:web:3c1063c22e9ab60800a26d",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);