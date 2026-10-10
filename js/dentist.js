(() => {
  const { i18n, store, ui } = window.Oraviu;
  const { t } = i18n;
  const { el } = ui;

  const URGENCY_RANK = { dentist: 0, monitor: 1, routine: 2 };
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
  const caseTable = document.querySelector("#case-table");
  const caseRows = document.querySelector("#case-rows");
  const caseEmpty = document.querySelector("#case-empty");
  const caseHeader = document.querySelector("#case-header");
  const caseMissing = document.querySelector("#case-missing");
  const caseLayout = document.querySelector("#case-layout");
  const caseDetail = document.querySelector("#case-detail");
  const reviewForm = document.querySelector("#review-form");
  const commentField = document.querySelector("#review-comment");
  const recommendationField = document.querySelector("#review-recommendation");
  const reviewMessage = document.querySelector("#review-message");
  const submitButton = document.querySelector("#review-submit");
  const storageError = document.querySelector("#storage-error");

  const state = { view: "cases", caseId: null, formCaseId: null, filter: "all", sort: "priority", formMessage: null };
  let renderToken = 0;

  const showView = (name) => {
    state.view = name;
    Object.entries(views).forEach(([key, section]) => {
      section.hidden = key !== name;
    });
    window.scrollTo(0, 0);
  };

  const caseRow = (record) => {
    const href = `#case/${record.id}`;
    const action = t(record.status === "pending" ? "dentist.action.review" : "dentist.action.view");
    const cell = (labelKey, children) => el("td", { "data-label": t(labelKey) }, children);

    return el("tr", {}, [
      el("th", { scope: "row", "data-label": t("dentist.col.case") }, el("a", { href, text: record.id })),
      cell("dentist.col.submitted", ui.formatDate(record.createdAt)),
      cell("dentist.col.photos", String(record.photoCount)),
      cell("dentist.col.priority", ui.priorityChip(record.analysis.urgency)),
      cell("dentist.col.status", ui.statusChip(record.status)),
      el(
        "td",
        { class: "case-table__action" },
        el("a", { class: "button button--small", href, "aria-label": `${action} ${record.id}`, text: action })
      )
    ]);
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

    const counts = {
      all: records.length,
      pending: records.filter((record) => record.status === "pending").length,
      reviewed: records.filter((record) => record.status === "reviewed").length
    };
    const visible = records
      .filter((record) => state.filter === "all" || record.status === state.filter)
      .sort(SORTERS[state.sort]);

    filterButtons.forEach((button) => {
      const { filter } = button.dataset;

      button.textContent = t(`dentist.filter.${filter}`, { n: counts[filter] });
      button.setAttribute("aria-pressed", String(filter === state.filter));
    });

    caseRows.replaceChildren(...visible.map(caseRow));
    caseTable.hidden = visible.length === 0;
    caseEmpty.hidden = visible.length > 0;
    caseEmpty.textContent = t(records.length ? "dentist.cases.emptyFiltered" : "dentist.cases.empty");
  };

  const renderFormMessage = () => {
    const message = state.formMessage;

    reviewMessage.hidden = !message;

    if (message) {
      reviewMessage.textContent = t(message.key);
      reviewMessage.classList.toggle("form-message--error", message.kind === "error");
    }
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

    caseHeader.replaceChildren(
      el("h1", { text: t("dentist.case.heading", { id: record.id }) }),
      ui.statusChip(record.status),
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
        ui.photoGrid(record.photos)
      ]),
      ui.analysisBlock(record.analysis)
    );
    submitButton.textContent = t(record.review ? "dentist.form.update" : "dentist.form.submit");
    renderFormMessage();

    // Fill the form once per opened case so later refreshes never overwrite what the dentist is typing.
    if (state.formCaseId !== record.id) {
      state.formCaseId = record.id;
      commentField.value = record.review ? record.review.comment : "";
      recommendationField.value = record.review ? record.review.recommendation : "";
    }
  };

  const render = () => {
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

    const comment = commentField.value.trim();
    const recommendation = recommendationField.value.trim();

    if (!comment && !recommendation) {
      state.formMessage = { kind: "error", key: "dentist.form.required" };
      renderFormMessage();
      commentField.focus();
      return;
    }

    submitButton.disabled = true;

    try {
      const saved = await store.saveReview(state.caseId, { comment, recommendation });

      if (!saved) {
        throw new Error("Case no longer exists");
      }

      state.formMessage = { kind: "success", key: "dentist.form.saved" };
    } catch (error) {
      state.formMessage = { kind: "error", key: "dentist.form.error" };
    }

    submitButton.disabled = false;
    render();
  });

  window.addEventListener("hashchange", route);
  i18n.onChange(render);
  store.onChange(render);
  ui.bindClearButton(render);

  route();
})();
