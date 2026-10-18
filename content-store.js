(function () {
  const STORAGE_KEY = "ewb-mjcet-site-content-v2";
  const PULSE_KEY = "ewb-sync-pulse";
  const CHANNEL_NAME = "ewb-sync-channel";
  const FIRESTORE_COLLECTION = "site_content";
  const FIRESTORE_DOC = "homepage";

  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  // Initialize BroadcastChannel with error guard
  let channel = null;
  try {
    if (typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (err) {
    console.warn("[EWB Sync] BroadcastChannel unavailable, falling back to storage pulse:", err);
  }

  // Active Cloud Firestore reference & snapshot unsubscribe
  let isFirestoreListening = false;
  let firestoreUnsubscribe = null;

  function read(defaults) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all newly added sections (like reports) exist
        return {
          ...clone(defaults || {}),
          ...parsed,
          fields: {
            ...(defaults?.fields || {}),
            ...(parsed.fields || {})
          }
        };
      }
      return clone(defaults || {});
    } catch (error) {
      console.warn("[EWB Sync] Unable to read saved content, using defaults:", error);
      return clone(defaults || {});
    }
  }

  function save(content) {
    if (!content) return;
    const toSave = clone(content);
    toSave._rev = Date.now();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      // Pulse storage event to guarantee cross-tab trigger even in edge-case browsers
      localStorage.setItem(PULSE_KEY, JSON.stringify({ rev: toSave._rev, type: "saved" }));
    } catch (err) {
      console.error("[EWB Sync] localStorage write failed:", err);
      throw err;
    }

    // Local custom event for current window
    window.dispatchEvent(new CustomEvent("ewb-content-updated", { detail: toSave }));

    // Real-time broadcast channel (sub-millisecond same-browser sync)
    if (channel) {
      try {
        channel.postMessage({ type: "content-saved", content: toSave, timestamp: toSave._rev });
      } catch (e) {
        console.warn("[EWB Sync] BroadcastChannel save error:", e);
      }
    }

    // Real-time Cloud Firestore synchronization (world-wide cross-device sync)
    if (typeof firebase !== "undefined" && firebase.firestore) {
      try {
        const db = firebase.firestore();
        db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set(toSave, { merge: true })
          .then(() => {
            console.log("[EWB Sync] Content synced to Firebase Firestore.");
          })
          .catch((err) => {
            console.warn("[EWB Sync] Firebase cloud save notice:", err.message);
          });
      } catch (cloudErr) {
        console.warn("[EWB Sync] Error triggering cloud save:", cloudErr);
      }
    }
  }

  // Explicit Cloud save returning Promise for async/await feedback
  function saveToCloud(content) {
    if (!content) return Promise.resolve();
    save(content);
    if (typeof firebase !== "undefined" && firebase.firestore) {
      const db = firebase.firestore();
      return db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set(content, { merge: true });
    }
    return Promise.resolve();
  }

  // Instant live preview broadcast as user types (without forcing heavy localStorage disk writes)
  function broadcastLive(content) {
    if (!content) return;
    const liveData = clone(content);
    liveData._rev = Date.now();

    // 1. Same-window event
    window.dispatchEvent(new CustomEvent("ewb-content-updated", { detail: liveData }));

    // 2. BroadcastChannel (sub-millisecond cross-tab delivery)
    if (channel) {
      try {
        channel.postMessage({ type: "content-live", content: liveData, timestamp: liveData._rev });
      } catch (e) {
        console.warn("[EWB Sync] BroadcastChannel live error:", e);
      }
    }

    // 3. Lightweight storage event pulse for fallback cross-tab delivery
    try {
      localStorage.setItem(PULSE_KEY, JSON.stringify({
        rev: liveData._rev,
        type: "live",
        content: liveData
      }));
    } catch (e) {
      // Ignore quota error on rapid pulse if storage is full
    }
  }

  function reset(defaults) {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PULSE_KEY);
    } catch (e) {}

    const fallback = clone(defaults || {});
    fallback._rev = Date.now();

    window.dispatchEvent(new CustomEvent("ewb-content-updated", { detail: fallback }));

    if (channel) {
      try {
        channel.postMessage({ type: "content-reset", content: fallback, timestamp: fallback._rev });
      } catch (e) {}
    }

    try {
      localStorage.setItem(PULSE_KEY, JSON.stringify({ rev: fallback._rev, type: "reset" }));
    } catch (e) {}

    // Reset cloud document in Cloud Firestore
    if (typeof firebase !== "undefined" && firebase.firestore) {
      try {
        const db = firebase.firestore();
        db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set(fallback, { merge: false })
          .then(() => console.log("[EWB Sync] Cloud database reset to factory defaults."))
          .catch((err) => console.warn("[EWB Sync] Cloud reset notice:", err.message));
      } catch (e) {
        console.warn("[EWB Sync] Exception during cloud reset:", e);
      }
    }

    return fallback;
  }

  // Initialize Real-Time Cloud Firestore Sync Listener
  function initFirestoreSync() {
    if (isFirestoreListening || typeof firebase === "undefined" || !firebase.firestore) return;
    try {
      const db = firebase.firestore();
      const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
      isFirestoreListening = true;

      firestoreUnsubscribe = docRef.onSnapshot((snapshot) => {
        if (snapshot.exists) {
          const cloudData = snapshot.data();
          if (cloudData && typeof cloudData === "object") {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
            } catch (err) {}

            const merged = {
              ...clone(window.EWB_BASE_CONTENT || {}),
              ...cloudData,
              fields: {
                ...(window.EWB_BASE_CONTENT?.fields || {}),
                ...(cloudData.fields || {})
              }
            };

            window.dispatchEvent(new CustomEvent("ewb-content-updated", { detail: merged }));
          }
        } else {
          // If Firestore document doesn't exist yet and user is authenticated admin, seed it!
          if (firebase.auth && firebase.auth().currentUser && window.EWB_BASE_CONTENT) {
            docRef.set(clone(window.EWB_BASE_CONTENT), { merge: true }).catch(() => {});
          }
        }
      }, (err) => {
        console.warn("[EWB Firestore] Listener error:", err);
      });
    } catch (err) {
      console.warn("[EWB Firestore] Initialization exception:", err);
    }
  }

  // Unified subscriber that listens across all synchronization channels (Cloud Firestore, BroadcastChannel, localStorage)
  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};

    // 1. Current window custom events
    const handleLocal = (e) => {
      if (e.detail) callback(e.detail);
    };

    // 2. Native cross-tab storage events
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const fresh = JSON.parse(e.newValue);
          callback(fresh);
        } catch (err) {}
      } else if (e.key === PULSE_KEY && e.newValue) {
        try {
          const pulse = JSON.parse(e.newValue);
          if (pulse.content) {
            callback(pulse.content);
          } else {
            const fresh = read(window.EWB_BASE_CONTENT);
            callback(fresh);
          }
        } catch (err) {}
      }
    };

    // 3. BroadcastChannel message receiver
    const handleBroadcast = (e) => {
      if (e.data && e.data.content) {
        callback(e.data.content);
      }
    };

    // 4. Tab visibility and focus sync (guarantees website is fresh when user switches tabs)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const fresh = read(window.EWB_BASE_CONTENT);
        callback(fresh);
      }
    };

    window.addEventListener("ewb-content-updated", handleLocal);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    if (channel) {
      channel.addEventListener("message", handleBroadcast);
    }

    // Ensure Firestore real-time listener is connected
    initFirestoreSync();

    return function unsubscribe() {
      window.removeEventListener("ewb-content-updated", handleLocal);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      if (channel) {
        channel.removeEventListener("message", handleBroadcast);
      }
    };
  }

  // Start Firestore connection as soon as possible
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initFirestoreSync);
    } else {
      initFirestoreSync();
    }
    window.addEventListener("load", initFirestoreSync);
  }

  window.EWBContent = {
    STORAGE_KEY,
    PULSE_KEY,
    CHANNEL_NAME,
    clone,
    read,
    save,
    saveToCloud,
    broadcastLive,
    reset,
    subscribe,
    initFirestoreSync,
    get channel() { return channel; }
  };
})();
