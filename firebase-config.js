(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDg-W7_8RkxeAIZkg6iOmGvf8cijob3jGw",
    authDomain: "ewb-mjcet-portal.firebaseapp.com",
    projectId: "ewb-mjcet-portal",
    storageBucket: "ewb-mjcet-portal.firebasestorage.app",
    messagingSenderId: "83804688523",
    appId: "1:83804688523:web:3f9f4fcb78329f3c65c48e"
  };

  if (typeof firebase !== "undefined" && !firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
      console.log("[EWB Firebase] Initialized project ewb-mjcet-portal");
    } catch (err) {
      console.warn("[EWB Firebase] Initialization error:", err);
    }
  }

  window.EWB_FIREBASE_CONFIG = firebaseConfig;
})();
