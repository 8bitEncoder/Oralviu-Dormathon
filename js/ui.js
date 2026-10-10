window.Oraviu = window.Oraviu || {};

(() => {
  const { i18n, store } = window.Oraviu;
  const { t } = i18n;

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);

    Object.entries(props).forEach(([name, value]) => {
      if (value === false || value === null || value === undefined) {
        return;
      }

      if (name === "class") {
        node.className = value;
      } else if (name === "text") {
        node.textContent = value;
      } else {
        node.setAttribute(name, value === true ? "" : value);
      }
    });

    [].concat(children).forEach((child) => {
      if (child) {
        node.append(child);
      }
    });

    return node;
  };

  const formatDate = (iso) =>
    new Intl.DateTimeFormat(i18n.locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const chip = (kind, label) => el("span", { class: `chip chip--${kind}`, text: label });
  const statusChip = (status) => chip(status, t(`status.${status}`));
  const urgencyChip = (urgency) => chip(urgency, t(`urgency.${urgency}`));
  const priorityChip = (urgency) => chip(urgency, t(`priority.${urgency}`));
  const appointmentChip = () => chip("dentist", t("appointment.chip"));

  // The dentist's decision replaces the AI's as soon as there is one.
  const finalUrgency = (record) => (record.review && record.review.verdict) || record.analysis.urgency;

  let lightbox = null;

  const getLightbox = () => {
    if (lightbox) {
      return lightbox;
    }

    const image = el("img", { class: "lightbox__image", alt: "" });
    const caption = el("p");
    const close = el("button", { class: "lightbox__close", type: "button", text: "×" });
    const previous = el("button", { class: "lightbox__nav", type: "button", text: "‹" });
    const next = el("button", { class: "lightbox__nav", type: "button", text: "›" });
    const dialog = el("dialog", { class: "lightbox" }, [
      close,
      image,
      el("div", { class: "lightbox__bar" }, [previous, caption, next])
    ]);

    let photos = [];
    let index = 0;
    let onShow = null;

    const show = () => {
      const label = t("photo.alt", { n: index + 1, total: photos.length });

      image.src = photos[index].dataUrl;
      image.alt = label;
      caption.textContent = label;
      close.setAttribute("aria-label", t("lightbox.close"));
      previous.setAttribute("aria-label", t("lightbox.previous"));
      next.setAttribute("aria-label", t("lightbox.next"));
      previous.hidden = photos.length < 2;
      next.hidden = photos.length < 2;

      if (onShow) {
        onShow(index);
      }
    };

    const step = (delta) => {
      index = (index + delta + photos.length) % photos.length;
      show();
    };

    close.addEventListener("click", () => dialog.close());
    previous.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        step(-1);
      } else if (event.key === "ArrowRight") {
        step(1);
      }
    });

    document.body.append(dialog);

    lightbox = {
      open: (items, startIndex, onPhotoShown) => {
        photos = items;
        index = startIndex;
        onShow = onPhotoShown || null;
        show();
        dialog.showModal();
      }
    };

    return lightbox;
  };

  // Pass viewed (a Set of photo indexes) and onView to mark and report the photos that were opened full size.
  const photoGrid = (photos, { viewed, onView } = {}) => {
    const items = photos.map((photo, index) => {
      const button = el(
        "button",
        { class: "photo-thumb__open", type: "button", "aria-label": t("photo.open", { n: index + 1 }) },
        el("img", { src: photo.dataUrl, alt: "" })
      );

      button.addEventListener("click", () => getLightbox().open(photos, index, onView && markViewed));
      return el("li", { class: viewed && viewed.has(index) ? "photo-thumb is-viewed" : "photo-thumb" }, button);
    });

    const markViewed = (index) => {
      items[index].classList.add("is-viewed");
      onView(index);
    };

    return el("ul", { class: "photo-grid" }, items);
  };

  const VERDICT_ICONS = { routine: "✓", monitor: "!", dentist: "✚" };

  const verdictBlock = (record, { onAppointment } = {}) => {
    const { analysis, review, appointment } = record;
    const urgency = finalUrgency(record);
    const changed = Boolean(review) && urgency !== analysis.urgency;
    const base = `profile.${analysis.profile}`;
    let source = analysis.simulated ? "simulated" : "ai";
    let action = null;

    if (review) {
      source = changed ? "changed" : "confirmed";
    }

    if (urgency === "dentist" && appointment) {
      action = el("p", {
        class: "verdict__done",
        text: t("appointment.requested", { date: formatDate(appointment.requestedAt) })
      });
    } else if (urgency === "dentist" && onAppointment) {
      action = el("button", { class: "button", type: "button", text: t("appointment.request") });
      action.addEventListener("click", onAppointment);
    }

    return el("section", { class: `verdict verdict--${urgency}` }, [
      el("p", { class: "verdict__source", text: t(`verdict.source.${source}`) }),
      el("h2", { class: "verdict__title" }, [
        el("span", { class: "verdict__icon", "aria-hidden": "true", text: VERDICT_ICONS[urgency] }),
        t(`verdict.${urgency}.title`)
      ]),
      // After the dentist changes the result, the AI's description no longer matches it.
      el("p", { text: changed ? t(`verdict.${urgency}.text`) : analysis.observation || t(`${base}.summary`) }),
      !changed && el("p", { class: "verdict__next", text: t(`${base}.next`) }),
      action
    ]);
  };

  const analysisBlock = (analysis, { nextStep = true } = {}) => {
    const base = `profile.${analysis.profile}`;

    return el("section", { class: "card report-section" }, [
      el("div", { class: "report-section__title" }, [
        el("h2", { text: t("report.summary") }),
        el("span", { class: "tag", text: t(analysis.simulated ? "report.simulated" : "report.aiTag") })
      ]),
      el("p", { text: analysis.observation || t(`${base}.summary`) }),
      el("h3", { text: t("report.recommendations") }),
      el(
        "ul",
        { class: "bullet-list" },
        [1, 2, 3].map((n) => el("li", { text: t(`${base}.rec${n}`) }))
      ),
      nextStep &&
        el("div", { class: `next-step next-step--${analysis.urgency}` }, [
          el("h3", { text: t("report.nextStep") }),
          urgencyChip(analysis.urgency),
          el("p", { text: t(`${base}.next`) })
        ])
    ]);
  };

  const reviewBlock = (review) => {
    const children = [el("h2", { text: t("report.review") })];

    if (!review) {
      children.push(el("p", { class: "muted", text: t("report.review.awaiting") }));
    } else {
      if (review.verdict) {
        children.push(el("h3", { text: t("report.review.verdict") }), el("p", {}, urgencyChip(review.verdict)));
      }

      if (review.comment) {
        children.push(el("h3", { text: t("report.review.comment") }), el("p", { class: "prewrap", text: review.comment }));
      }

      if (review.recommendation) {
        children.push(
          el("h3", { text: t("report.review.recommendation") }),
          el("p", { class: "prewrap", text: review.recommendation })
        );
      }

      children.push(el("p", { class: "muted", text: t("report.review.date", { date: formatDate(review.reviewedAt) }) }));
    }

    return el("section", { class: "card report-section report-section--review" }, children);
  };

  const bindClearButton = (onCleared) => {
    document.querySelector("#clear-data").addEventListener("click", () => {
      if (window.confirm(t("footer.clearConfirm"))) {
        store.clear().then(onCleared, onCleared);
      }
    });
  };

  window.Oraviu.ui = {
    el,
    formatDate,
    statusChip,
    urgencyChip,
    priorityChip,
    appointmentChip,
    finalUrgency,
    photoGrid,
    verdictBlock,
    analysisBlock,
    reviewBlock,
    bindClearButton
  };
})();
