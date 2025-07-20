// firebase.js
// Safe, single initialization of Firebase for Messenger Clone

// Your Firebase web app config
const firebaseConfig = {
  apiKey: "AIzaSyBWNIsFW0QKknbDHqhfWG7GU_GYKV-wAXM",
  authDomain: "messenger-clone-9421f.firebaseapp.com",
  databaseURL: "https://messenger-clone-9421f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "messenger-clone-9421f",
  storageBucket: "messenger-clone-9421f.appspot.com", // <-- FIXED
  messagingSenderId: "296040648748",
  appId: "1:296040648748:web:589afe85ec371386fd0189"
};

// Prevent double initialization (for dev/hot-reload)
if (!window.firebase?.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}

// Make firebase globally accessible
const auth = firebase.auth();
const db = firebase.database();

window.firebase = firebase;
window.auth = auth;
window.db = db;
