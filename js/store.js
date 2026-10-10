window.Oraviu = window.Oraviu || {};

(() => {
  const DB_NAME = "oraviu";
  const DB_VERSION = 1;
  const CASES = "cases";
  const PHOTOS = "photos";
  const SIGNAL_KEY = "oraviu:changed";
  const ID_PATTERN = /^ORV-(\d+)$/;

  const listeners = [];
  let dbPromise = null;

  const formatId = (seq) => `ORV-${String(seq).padStart(4, "0")}`;

  const parseId = (id) => {
    const match = ID_PATTERN.exec(id);
    return match ? Number(match[1]) : null;
  };

  const openDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          request.result.createObjectStore(CASES, { keyPath: "seq" });
          request.result.createObjectStore(PHOTOS, { keyPath: "seq" });
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

  const notify = () => listeners.forEach((listener) => listener());

  const addCase = ({ photos, analysis }) =>
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
    }).then(announce);

  const listCases = () =>
    transact([CASES], "readonly", (tx, done) => {
      tx.objectStore(CASES).getAll().onsuccess = (event) => done(event.target.result);
    });

  const getCase = (id) => {
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
  };

  const updateCase = (id, change) => {
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
  };

  const saveReview = (id, { verdict, comment, recommendation }) =>
    updateCase(id, (record) => {
      record.status = "reviewed";
      record.review = { verdict, comment, recommendation, reviewedAt: new Date().toISOString() };
    });

  const requestAppointment = (id) =>
    updateCase(id, (record) => {
      record.appointment = { requestedAt: new Date().toISOString() };
    });

  const clear = () =>
    transact([CASES, PHOTOS], "readwrite", (tx) => {
      tx.objectStore(CASES).clear();
      tx.objectStore(PHOTOS).clear();
    }).then(announce);

  window.addEventListener("storage", (event) => {
    if (event.key === SIGNAL_KEY) {
      notify();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      notify();
    }
  });

  window.Oraviu.store = {
    addCase,
    listCases,
    getCase,
    saveReview,
    requestAppointment,
    clear,
    onChange: (listener) => listeners.push(listener)
  };
})();
