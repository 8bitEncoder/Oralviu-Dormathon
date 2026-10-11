(() => {
  const { i18n, store, ui } = window.Oraviu;
  const { t } = i18n;
  const { el } = ui;

  const URGENCY_RANK = { dentist: 0, monitor: 1, routine: 2 };
  const VERDICTS = ["routine", "monitor", "dentist"];
  const byOldest = (a, b) => a.seq - b.seq;
  const SORTERS = {
    priority: (a, b) =>
      Number(a.status === "reviewed") - Number(b.status === "reviewed") ||
      URGENCY_RANK[a.analysis.urgency] - URGENCY_RANK[b.analysis.urgency] ||
      byOldest(a, b),
    newest: (a, b) => b.seq - a.seq,
    oldest: byOldest
  };

  const views = {
    cases: document.querySelector("#view-cases"),
    case: document.querySelector("#view-case")
  };
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const sortSelect = document.querySelector("#sort-select");
  const inboxSummary = document.querySelector("#inbox-summary");
  const caseTable = document.querySelector("#case-table");
  const caseRows = document.querySelector("#case-rows");
  const caseEmpty = document.querySelector("#case-empty");
  const caseHeader = document.querySelector("#case-header");
  const caseMissing = document.querySelector("#case-missing");
  const caseLayout = document.querySelector("#case-layout");
  const caseDetail = document.querySelector("#case-detail");
  const reviewForm = document.querySelector("#review-form");
  const reviewLock = document.querySelector("#review-lock");
  const verdictOptions = document.querySelector("#verdict-options");
  const commentField = document.querySelector("#review-comment");
  const recommendationField = document.querySelector("#review-recommendation");
  const reviewMessage = document.querySelector("#review-message");
  const submitButton = document.querySelector("#review-submit");
  const storageError = document.querySelector("#storage-error");
  const syncStatus = document.querySelector("#sync-status");

  const state = {
    view: "cases",
    caseId: null,
    formCaseId: null,
    filter: "pending",
    sort: "priority",
    formMessage: null,
    verdict: null,
    viewed: new Set(),
    photoCount: 0,
    aiUrgency: null,
    pending: false,
    saving: false
  };
  let renderToken = 0;
  let syncMode = null;

  const renderSync = () => {
    if (!syncMode) {
      return;
    }

    syncStatus.dataset.mode = syncMode;
    syncStatus.textContent = t(syncMode === "shared" ? "sync.shared" : "sync.local");
    syncStatus.hidden = false;
  };

  const showView = (name) => {
    state.view = name;
    Object.entries(views).forEach(([key, section]) => {
      section.hidden = key !== name;
    });
    window.scrollTo(0, 0);
  };

  const statusChips = (record) =>
    el("span", { class: "chip-row" }, [ui.statusChip(record.status), record.appointment && ui.appointmentChip()]);

  const caseRow = (record) => {
    const href = `#case/${record.id}`;
    const action = t(record.status === "pending" ? "dentist.action.review" : "dentist.action.view");
    const cell = (labelKey, children) => el("td", { "data-label": t(labelKey) }, children);

    return el("tr", {}, [
      el("th", { scope: "row", "data-label": t("dentist.col.case") }, el("a", { href, text: record.id })),
      cell("dentist.col.submitted", ui.formatDate(record.createdAt)),
      cell("dentist.col.photos", String(record.photoCount)),
      cell("dentist.col.priority", ui.priorityChip(record.analysis.urgency)),
      cell("dentist.col.status", statusChips(record)),
      el(
        "td",
        { class: "case-table__action" },
        el("a", { class: "button button--small", href, "aria-label": `${action} ${record.id}`, text: action })
      )
    ]);
  };

  const emptyKey = (total) => {
    if (!total) {
      return "dentist.cases.empty";
    }

    return state.filter === "pending" ? "dentist.cases.emptyPending" : "dentist.cases.emptyFiltered";
  };

  const renderCases = async () => {
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

    const pending = records.filter((record) => record.status === "pending");
    const counts = { all: records.length, pending: pending.length, reviewed: records.length - pending.length };
    const visible = records
      .filter((record) => state.filter === "all" || record.status === state.filter)
      .sort(SORTERS[state.sort]);

    filterButtons.forEach((button) => {
      const { filter } = button.dataset;

      button.textContent = t(`dentist.filter.${filter}`, { n: counts[filter] });
      button.setAttribute("aria-pressed", String(filter === state.filter));
    });

    inboxSummary.hidden = pending.length === 0;
    inboxSummary.textContent = t("dentist.inbox.summary", {
      pending: pending.length,
      urgent: pending.filter((record) => record.analysis.urgency === "dentist").length
    });
    caseRows.replaceChildren(...visible.map(caseRow));
    caseTable.hidden = visible.length === 0;
    caseEmpty.hidden = visible.length > 0;
    caseEmpty.textContent = t(emptyKey(records.length));
  };

  const renderFormMessage = () => {
    const message = state.formMessage;

    reviewMessage.hidden = !message;

    if (message) {
      reviewMessage.textContent = t(message.key);
      reviewMessage.classList.toggle("form-message--error", message.kind === "error");
    }
  };

  // The buttons are built once and updated in place, so the pressed one keeps keyboard focus.
  const verdictButtons = VERDICTS.map((urgency) => {
    const label = el("span");
    const hint = el("span", { class: "verdict-option__ai" });
    const button = el("button", { class: `verdict-option verdict-option--${urgency}`, type: "button" }, [label, hint]);

    button.addEventListener("click", () => {
      state.verdict = urgency;
      state.formMessage = null;
      renderReviewControls();
    });
    verdictOptions.append(button);

    return { urgency, button, label, hint };
  });

  const renderReviewControls = () => {
    // A first review stays locked until every photo has been opened, so a result cannot be approved unseen.
    const locked = state.pending && state.viewed.size < state.photoCount;

    reviewLock.hidden = !locked;
    reviewLock.textContent = t("dentist.form.lock", { n: state.viewed.size, total: state.photoCount });

    verdictButtons.forEach(({ urgency, button, label, hint }) => {
      button.disabled = locked;
      button.setAttribute("aria-pressed", String(state.verdict === urgency));
      label.textContent = t(`urgency.${urgency}`);
      hint.textContent = urgency === state.aiUrgency ? t("dentist.form.aiSuggested") : "";
    });

    submitButton.disabled = locked || state.saving;
    submitButton.textContent = t(state.pending ? "dentist.form.next" : "dentist.form.update");
    renderFormMessage();
  };

  const renderCase = async () => {
    const token = (renderToken += 1);
    const id = state.caseId;
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

    caseMissing.hidden = Boolean(record);
    caseLayout.hidden = !record;

    if (!record) {
      caseHeader.replaceChildren();
      caseMissing.textContent = t("dentist.case.missing", { id });
      return;
    }

    // Set up the form once per opened case so later refreshes never overwrite the dentist's work in progress.
    if (state.formCaseId !== record.id) {
      state.formCaseId = record.id;
      state.verdict = (record.review && record.review.verdict) || null;
      state.viewed = new Set();
      commentField.value = record.review ? record.review.comment : "";
      recommendationField.value = record.review ? record.review.recommendation : "";
    }

    state.photoCount = record.photos.length;
    state.aiUrgency = record.analysis.urgency;
    state.pending = record.status === "pending";

    caseHeader.replaceChildren(
      el("h1", { text: t("dentist.case.heading", { id: record.id }) }),
      statusChips(record),
      el("p", {
        class: "report-header__meta",
        text: [
          t("case.submitted", { date: ui.formatDate(record.createdAt) }),
          i18n.plural("photos", record.photos.length),
          t("dentist.case.priority", { level: t(`priority.${record.analysis.urgency}`) })
        ].join(" · ")
      })
    );
    caseDetail.replaceChildren(
      el("section", { class: "card report-section" }, [
        el("h2", { text: t("dentist.case.photos") }),
        ui.photoGrid(record.photos, {
          viewed: state.viewed,
          onView: (index) => {
            state.viewed.add(index);
            renderReviewControls();
          }
        })
      ]),
      ui.analysisBlock(record.analysis)
    );
    renderReviewControls();
  };

  const render = () => {
    renderSync();

    if (state.view === "cases") {
      renderCases();
    } else {
      renderCase();
    }
  };

  const route = () => {
    const hash = location.hash.slice(1);

    if (hash.startsWith("case/")) {
      state.caseId = decodeURIComponent(hash.slice("case/".length));
      state.formCaseId = null;
      state.formMessage = null;
      caseHeader.replaceChildren();
      caseLayout.hidden = true;
      caseMissing.hidden = true;
      showView("case");
    } else {
      showView("cases");
    }

    render();
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderCases();
    });
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderCases();
  });

  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.verdict) {
      state.formMessage = { kind: "error", key: "dentist.form.verdictRequired" };
      renderFormMessage();
      verdictButtons[0].button.focus();
      return;
    }

    const wasPending = state.pending;

    state.saving = true;
    submitButton.disabled = true;

    try {
      const saved = await store.saveReview(state.caseId, {
        verdict: state.verdict,
        comment: commentField.value.trim(),
        recommendation: recommendationField.value.trim()
      });

      if (!saved) {
        throw new Error("Case no longer exists");
      }

      if (wasPending) {
        const next = (await store.listCases()).filter((record) => record.status === "pending").sort(SORTERS.priority)[0];

        state.saving = false;
        location.hash = next ? `#case/${next.id}` : "#cases";
        return;
      }

      state.formMessage = { kind: "success", key: "dentist.form.saved" };
    } catch (error) {
      state.formMessage = { kind: "error", key: "dentist.form.error" };
    }

    state.saving = false;
    render();
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
