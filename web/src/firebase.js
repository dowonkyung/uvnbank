// Firebase 콘솔에서 설정 복사해서 채워넣기
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCYww5IU62dYEEIQps5qPqK6BY4z1eSA_U",
  authDomain: "uvnbank.firebaseapp.com",
  projectId: "uvnbank",
  storageBucket: "uvnbank.firebasestorage.app",
  messagingSenderId: "1085684290658",
  appId: "1:1085684290658:web:1434cd13716e3e3a77ed3b",
  measurementId: "G-HTDCR7XQ1X"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
