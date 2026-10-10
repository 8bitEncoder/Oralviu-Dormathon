(() => {
  const { i18n, store, analysis, ui } = window.Oraviu;
  const { t } = i18n;
  const { el } = ui;

  const MAX_PHOTOS = 5;
  const MAX_EDGE = 1280;
  const JPEG_QUALITY = 0.85;
  const STEP_DELAY = 900;

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
  const photoList = document.querySelector("#photo-list");
  const photoCount = document.querySelector("#photo-count");
  const uploadMessages = document.querySelector("#upload-messages");
  const analyzeButton = document.querySelector("#analyze-button");
  const stepItems = Array.from(document.querySelectorAll(".analyzing__step"));
  const reportList = document.querySelector("#report-list");
  const reportEmpty = document.querySelector("#report-empty");
  const reportBody = document.querySelector("#report-body");
  const storageError = document.querySelector("#storage-error");

  const state = { view: "new", reportId: null, photos: [], messages: [], analyzing: false };
  let renderToken = 0;

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

      return { name: file.name, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY) };
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
        toPhoto(file).catch(() => {
          messages.push({ key: "patient.error.read", vars: { name: file.name } });
          return null;
        })
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

  const analyze = async () => {
    if (state.analyzing || !state.photos.length) {
      return;
    }

    state.analyzing = true;
    state.messages = [];
    showView("analyzing");

    try {
      for (let step = 0; step < stepItems.length; step += 1) {
        setStep(step);
        await wait(STEP_DELAY);
      }

      const record = await store.addCase({ photos: state.photos, analysis: analysis.run(state.photos) });

      state.photos = [];
      state.analyzing = false;
      location.hash = `#report/${record.id}`;
    } catch (error) {
      state.analyzing = false;
      state.messages = [{ key: "patient.error.save" }];
      route();
    }
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
        el("span", { class: "case-card__chips" }, [ui.statusChip(record.status), ui.urgencyChip(record.analysis.urgency)]),
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
      ui.photoGrid(record.photos),
      ui.analysisBlock(record.analysis),
      ui.reviewBlock(record.review),
      el("p", { class: "disclaimer", text: t("report.disclaimer") })
    );
  };

  const render = () => {
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
  window.addEventListener("hashchange", route);
  i18n.onChange(render);
  store.onChange(render);
  ui.bindClearButton(render);

  route();
})();
