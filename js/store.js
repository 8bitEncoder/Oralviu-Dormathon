window.Oraviu = window.Oraviu || {};

(() => {
  const DB_NAME = "oraviu";
  const DB_VERSION = 1;
  const CASES = "cases";
  const PHOTOS = "photos";
  const SIGNAL_KEY = "oraviu:changed";
  const ID_PATTERN = /^ORV-(\d+)$/;
  const POLL_MS = 2000;

  const listeners = [];
  // The access key reaches the page baked in by the server, or in the link (?k=...).
  const accessKey = window.__ORAVIU_KEY__ || new URLSearchParams(location.search).get("k") || "";
  let currentMode = "local";
  let backendPromise = null;
  let dbPromise = null;
  let pollTimer = null;
  let rememberedVersion = null;

  const formatId = (seq) => `ORV-${String(seq).padStart(4, "0")}`;

  const parseId = (id) => {
    const match = ID_PATTERN.exec(id);
    return match ? Number(match[1]) : null;
  };

  const notify = () => listeners.forEach((listener) => listener());

  // ---------------------------------------------------------------------------
  // Offline backend: the original IndexedDB store, used when no server is present.
  // ---------------------------------------------------------------------------

  const openDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(CASES)) {
            request.result.createObjectStore(CASES, { keyPath: "seq" });
          }
          if (!request.result.objectStoreNames.contains(PHOTOS)) {
            request.result.createObjectStore(PHOTOS, { keyPath: "seq" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      dbPromise.catch(() => {
        dbPromise = null;
      });
    }

    return dbPromise;
  };

  const transact = (storeNames, mode, work) =>
    openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeNames, mode);
          let result = null;

          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);

          work(tx, (value) => {
            result = value;
          });
        })
    );

  // IndexedDB has no cross-tab change event, so writes ping localStorage to wake the other page.
  const announce = (value) => {
    try {
      localStorage.setItem(SIGNAL_KEY, String(Date.now()));
    } catch (error) {
      // The other page still refreshes when it becomes visible again.
    }

    return value;
  };

  const local = {
    addCase: ({ photos, analysis }) =>
      transact([CASES, PHOTOS], "readwrite", (tx, done) => {
        const cases = tx.objectStore(CASES);

        cases.openCursor(null, "prev").onsuccess = (event) => {
          const cursor = event.target.result;
          const seq = cursor ? cursor.key + 1 : 1;
          const record = {
            seq,
            id: formatId(seq),
            createdAt: new Date().toISOString(),
            photoCount: photos.length,
            analysis,
            status: "pending",
            review: null
          };

          cases.add(record);
          tx.objectStore(PHOTOS).add({ seq, items: photos });
          done(record);
        };
      }).then(announce),

    listCases: () =>
      transact([CASES], "readonly", (tx, done) => {
        tx.objectStore(CASES).getAll().onsuccess = (event) => done(event.target.result);
      }),

    getCase: (id) => {
      const seq = parseId(id);

      if (seq === null) {
        return Promise.resolve(null);
      }

      return transact([CASES, PHOTOS], "readonly", (tx, done) => {
        tx.objectStore(CASES).get(seq).onsuccess = (event) => {
          const record = event.target.result;

          if (!record) {
            return;
          }

          tx.objectStore(PHOTOS).get(seq).onsuccess = (photoEvent) => {
            const stored = photoEvent.target.result;
            done({ ...record, photos: stored ? stored.items : [] });
          };
        };
      });
    },

    updateCase: (id, change) => {
      const seq = parseId(id);

      if (seq === null) {
        return Promise.resolve(null);
      }

      return transact([CASES], "readwrite", (tx, done) => {
        const cases = tx.objectStore(CASES);

        cases.get(seq).onsuccess = (event) => {
          const record = event.target.result;

          if (!record) {
            return;
          }

          change(record);
          cases.put(record);
          done(record);
        };
      }).then(announce);
    },

    saveReview: (id, { verdict, comment, recommendation }) =>
      local.updateCase(id, (record) => {
        record.status = "reviewed";
        record.review = { verdict, comment, recommendation, reviewedAt: new Date().toISOString() };
      }),

    requestAppointment: (id) =>
      local.updateCase(id, (record) => {
        record.appointment = { requestedAt: new Date().toISOString() };
      }),

    clear: () =>
      transact([CASES, PHOTOS], "readwrite", (tx) => {
        tx.objectStore(CASES).clear();
        tx.objectStore(PHOTOS).clear();
      }).then(announce)
  };

  // ---------------------------------------------------------------------------
  // Shared backend: talks to server.mjs so the phone and the laptop share cases.
  // ---------------------------------------------------------------------------

  const request = async (route, options = {}) => {
    const response = await fetch(`api${route}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "x-oraviu-key": accessKey
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    });

    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  };

  const shared = {
    addCase: ({ photos, analysis }) =>
      request("/cases", {
        method: "POST",
        body: { photos: photos.map(({ dataUrl }) => dataUrl), analysis }
      }).then((data) => data.case),

    listCases: () =>
      request("/cases").then((data) => {
        rememberedVersion = data.version;
        return data.cases;
      }),

    getCase: (id) =>
      request(`/case/${encodeURIComponent(id)}`)
        .then((data) => data.case)
        .catch((error) => (error.status === 404 ? null : Promise.reject(error))),

    saveReview: (id, { verdict, comment, recommendation }) =>
      request(`/case/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: { verdict, comment, recommendation }
      }).then((data) => data.case),

    requestAppointment: (id) =>
      request(`/case/${encodeURIComponent(id)}/appointment`, { method: "POST" }).then((data) => data.case),

    clear: () => request("/cases/clear", { method: "POST" }).then(() => undefined)
  };

  const poll = () =>
    request("/cases")
      .then((data) => {
        if (rememberedVersion !== null && data.version !== rememberedVersion) {
          notify();
        }

        rememberedVersion = data.version;
      })
      .catch(() => {
        // A dropped connection is expected (phone sleeping); the next tick retries.
      });

  const startPolling = () => {
    if (pollTimer) {
      return;
    }

    pollTimer = setInterval(() => {
      if (!document.hidden) {
        poll();
      }
    }, POLL_MS);
  };

  // A page served by server.mjs uses the shared store; a page opened from disk uses IndexedDB.
  const pick = () => {
    if (location.protocol === "file:") {
      currentMode = "local";
      return Promise.resolve(local);
    }

    return fetch("api/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (status && status.store && accessKey) {
          currentMode = "shared";
          startPolling();
          return shared;
        }

        currentMode = "local";
        return local;
      })
      .catch(() => {
        currentMode = "local";
        return local;
      });
  };

  const backend = () => {
    if (!backendPromise) {
      backendPromise = pick();
    }

    return backendPromise;
  };

  window.addEventListener("storage", (event) => {
    if (event.key === SIGNAL_KEY) {
      notify();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (currentMode === "shared") {
        poll();
      } else {
        notify();
      }
    }
  });

  window.Oraviu.store = {
    addCase: (args) => backend().then((store) => store.addCase(args)),
    listCases: () => backend().then((store) => store.listCases()),
    getCase: (id) => backend().then((store) => store.getCase(id)),
    saveReview: (id, review) => backend().then((store) => store.saveReview(id, review)),
    requestAppointment: (id) => backend().then((store) => store.requestAppointment(id)),
    clear: () => backend().then((store) => store.clear()),
    ready: () => backend().then(() => currentMode),
    onChange: (listener) => listeners.push(listener)
  };
})();
