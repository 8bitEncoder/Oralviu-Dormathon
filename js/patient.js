(() => {
  const { i18n, store, analysis, ui } = window.Oraviu;
  const { t } = i18n;
  const { el } = ui;

  const MAX_PHOTOS = 5;
  const MAX_EDGE = 1280;
  const JPEG_QUALITY = 0.85;
  const STEP_DELAY = 900;
  // Quality limits are deliberately loose: they only stop photos that nobody could judge.
  const QUALITY_EDGE = 512;
  const MIN_BRIGHTNESS = 35;
  const MIN_SHARPNESS = 10;

  const views = {
    new: document.querySelector("#view-new"),
    analyzing: document.querySelector("#view-analyzing"),
    reports: document.querySelector("#view-reports"),
    report: document.querySelector("#view-report")
  };
  const tabs = document.querySelector(".tabs");
  const tabLinks = Array.from(tabs.querySelectorAll(".tabs__link"));
  const dropzone = document.querySelector("#dropzone");
  const photoInput = document.querySelector("#photo-input");
  const cameraInput = document.querySelector("#camera-input");
  const syncStatus = document.querySelector("#sync-status");
  const photoList = document.querySelector("#photo-list");
  const photoCount = document.querySelector("#photo-count");
  const uploadMessages = document.querySelector("#upload-messages");
  const analyzeButton = document.querySelector("#analyze-button");
  const demoControl = document.querySelector("#demo-control");
  const demoProfile = document.querySelector("#demo-profile");
  const stepItems = Array.from(document.querySelectorAll(".analyzing__step"));
  const reportList = document.querySelector("#report-list");
  const reportEmpty = document.querySelector("#report-empty");
  const reportBody = document.querySelector("#report-body");
  const storageError = document.querySelector("#storage-error");

  const state = { view: "new", reportId: null, photos: [], messages: [], analyzing: false };
  let renderToken = 0;
  let syncMode = null;

  const showView = (name) => {
    const activeTab = name === "reports" || name === "report" ? "reports" : "new";

    state.view = name;
    Object.entries(views).forEach(([key, section]) => {
      section.hidden = key !== name;
    });
    tabLinks.forEach((link) => {
      if (link.dataset.tab === activeTab) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    tabs.inert = name === "analyzing";
    window.scrollTo(0, 0);
  };

  const loadImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);

        if (image.naturalWidth && image.naturalHeight) {
          resolve(image);
        } else {
          reject(new Error("Image has no size"));
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image could not be decoded"));
      };
      image.src = url;
    });

  // Returns "dark" or "blurry" for a photo that cannot be judged, or null for a usable one.
  const qualityProblem = (source) => {
    const scale = Math.min(1, QUALITY_EDGE / Math.max(source.width, source.height));
    const width = Math.max(3, Math.round(source.width * scale));
    const height = Math.max(3, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = width;
    canvas.height = height;
    context.drawImage(source, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const luma = new Float32Array(width * height);
    let brightness = 0;

    for (let index = 0; index < luma.length; index += 1) {
      luma[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
      brightness += luma[index];
    }

    if (brightness / luma.length < MIN_BRIGHTNESS) {
      return "dark";
    }

    // Sharp photos have strong edges, so the edge strength (Laplacian) varies a lot across the image.
    let sum = 0;
    let sumOfSquares = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const edge = luma[index - width] + luma[index + width] + luma[index - 1] + luma[index + 1] - 4 * luma[index];

        sum += edge;
        sumOfSquares += edge * edge;
      }
    }

    const count = (width - 2) * (height - 2);
    const mean = sum / count;

    return sumOfSquares / count - mean * mean < MIN_SHARPNESS ? "blurry" : null;
  };

  const toPhoto = (file) =>
    loadImage(file).then((image) => {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      return {
        name: file.name,
        dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
        problem: qualityProblem(canvas)
      };
    });

  const renderUpload = () => {
    const total = state.photos.length;
    const isFull = total >= MAX_PHOTOS;

    photoList.replaceChildren(
      ...state.photos.map((photo, index) => {
        const remove = el("button", {
          class: "photo-thumb__remove",
          type: "button",
          "aria-label": t("patient.photos.remove", { n: index + 1 }),
          text: "×"
        });

        remove.addEventListener("click", () => {
          state.photos.splice(index, 1);
          state.messages = [];
          renderUpload();
        });

        return el("li", { class: "photo-thumb" }, [
          el("img", { src: photo.dataUrl, alt: t("photo.alt", { n: index + 1, total }) }),
          remove
        ]);
      })
    );

    uploadMessages.replaceChildren(
      ...state.messages.map(({ key, vars }) => el("p", { class: "form-message form-message--error", text: t(key, vars) }))
    );

    photoCount.textContent = t("patient.photos.count", { n: total, max: MAX_PHOTOS });
    analyzeButton.disabled = total === 0;
    photoInput.disabled = isFull;
    photoInput.parentElement.classList.toggle("is-disabled", isFull);
    cameraInput.disabled = isFull;
    cameraInput.parentElement.classList.toggle("is-disabled", isFull);
  };

  const addFiles = async (files) => {
    const messages = [];
    const images = [];

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        images.push(file);
      } else {
        messages.push({ key: "patient.error.type", vars: { name: file.name } });
      }
    });

    const room = MAX_PHOTOS - state.photos.length;

    if (images.length > room) {
      messages.push({ key: "patient.error.max", vars: { max: MAX_PHOTOS } });
    }

    const photos = await Promise.all(
      images.slice(0, room).map((file) =>
        toPhoto(file).then(
          ({ problem, ...photo }) => {
            if (problem) {
              messages.push({ key: `patient.error.${problem}`, vars: { name: file.name } });
              return null;
            }

            return photo;
          },
          () => {
            messages.push({ key: "patient.error.read", vars: { name: file.name } });
            return null;
          }
        )
      )
    );

    state.photos = state.photos.concat(photos.filter(Boolean)).slice(0, MAX_PHOTOS);
    state.messages = messages;
    renderUpload();
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const setStep = (active) => {
    stepItems.forEach((item, index) => {
      item.classList.toggle("is-done", index < active);
      item.classList.toggle("is-active", index === active);
    });
  };

  // Back to the upload view with the photos kept, so the patient can swap one and try again.
  const failAnalysis = (key) => {
    state.analyzing = false;
    state.messages = [{ key }];
    route();
  };

  const analyze = async () => {
    if (state.analyzing || !state.photos.length) {
      return;
    }

    state.analyzing = true;
    state.messages = [];
    showView("analyzing");

    // The screening starts now and the steps play meanwhile; the last step stays active until it answers.
    const screening = analysis
      .run(state.photos, { lang: i18n.language(), profile: demoProfile.value })
      .then(
        (result) => ({ result }),
        (error) => ({ error })
      );

    for (let step = 0; step < stepItems.length; step += 1) {
      setStep(step);
      await wait(STEP_DELAY);
    }

    const { result, error } = await screening;

    if (error) {
      failAnalysis("patient.error.analysis");
      return;
    }

    if (result.unusable) {
      failAnalysis(`patient.error.unusable.${result.problem}`);
      return;
    }

    try {
      const record = await store.addCase({ photos: state.photos, analysis: result });

      state.photos = [];
      state.analyzing = false;
      location.hash = `#report/${record.id}`;
    } catch (saveError) {
      failAnalysis("patient.error.save");
    }
  };

  const requestAppointment = async () => {
    try {
      await store.requestAppointment(state.reportId);
    } catch (error) {
      storageError.hidden = false;
    }

    renderReport();
  };

  const reportCard = (record) =>
    el(
      "li",
      {},
      el("a", { class: "case-card__link", href: `#report/${record.id}` }, [
        el("span", { class: "case-card__id", text: record.id }),
        el("span", {
          class: "case-card__meta",
          text: `${t("case.submitted", { date: ui.formatDate(record.createdAt) })} · ${i18n.plural("photos", record.photoCount)}`
        }),
        el("span", { class: "case-card__chips" }, [
          ui.statusChip(record.status),
          ui.urgencyChip(ui.finalUrgency(record))
        ]),
        el("span", { class: "case-card__view", text: t("patient.reports.view") })
      ])
    );

  const renderReports = async () => {
    const token = (renderToken += 1);
    let records;

    try {
      records = await store.listCases();
    } catch (error) {
      storageError.hidden = false;
      return;
    }

    if (token !== renderToken) {
      return;
    }

    records.sort((a, b) => b.seq - a.seq);
    reportList.replaceChildren(...records.map(reportCard));
    reportEmpty.hidden = records.length > 0;
  };

  const renderReport = async () => {
    const token = (renderToken += 1);
    const id = state.reportId;
    let record;

    try {
      record = await store.getCase(id);
    } catch (error) {
      storageError.hidden = false;
      return;
    }

    if (token !== renderToken) {
      return;
    }

    if (!record) {
      reportBody.replaceChildren(el("p", { class: "empty-state", text: t("patient.report.missing", { id }) }));
      return;
    }

    reportBody.replaceChildren(
      el("header", { class: "report-header" }, [
        el("h1", { text: t("patient.report.heading", { id: record.id }) }),
        ui.statusChip(record.status),
        el("p", {
          class: "report-header__meta",
          text: `${t("case.submitted", { date: ui.formatDate(record.createdAt) })} · ${i18n.plural("photos", record.photos.length)}`
        })
      ]),
      ui.verdictBlock(record, { onAppointment: requestAppointment }),
      ui.reviewBlock(record.review),
      ui.photoGrid(record.photos),
      ui.analysisBlock(record.analysis, { nextStep: false }),
      el("p", { class: "disclaimer", text: t("report.disclaimer") })
    );
  };

  const renderSync = () => {
    if (!syncMode) {
      return;
    }

    syncStatus.dataset.mode = syncMode;
    syncStatus.textContent = t(syncMode === "shared" ? "sync.shared" : "sync.local");
    syncStatus.hidden = false;
  };

  const render = () => {
    renderSync();

    if (state.view === "new") {
      renderUpload();
    } else if (state.view === "reports") {
      renderReports();
    } else if (state.view === "report") {
      renderReport();
    }
  };

  const route = () => {
    if (state.analyzing) {
      return;
    }

    const hash = location.hash.slice(1);

    if (hash.startsWith("report/")) {
      state.reportId = decodeURIComponent(hash.slice("report/".length));
      reportBody.replaceChildren();
      showView("report");
    } else if (hash === "reports") {
      showView("reports");
    } else {
      showView("new");
    }

    render();
  };

  photoInput.addEventListener("change", () => {
    addFiles(photoInput.files);
    photoInput.value = "";
  });

  cameraInput.addEventListener("change", () => {
    addFiles(cameraInput.files);
    cameraInput.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    dropzone.addEventListener(type, () => dropzone.classList.remove("is-dragover"));
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  });

  // A photo dropped just outside the dropzone would otherwise replace the page.
  ["dragover", "drop"].forEach((type) => {
    window.addEventListener(type, (event) => event.preventDefault());
  });

  analyzeButton.addEventListener("click", analyze);
  // Choosing the result by hand only makes sense while results are simulated.
  analysis.available().then((ai) => {
    demoControl.hidden = ai;
  });
  window.addEventListener("hashchange", route);
  i18n.onChange(render);
  store.onChange(render);
  ui.bindClearButton(render);

  store.ready().then((mode) => {
    syncMode = mode;
    renderSync();
  });

  route();
})();
