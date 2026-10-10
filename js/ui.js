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
      open: (items, startIndex) => {
        photos = items;
        index = startIndex;
        show();
        dialog.showModal();
      }
    };

    return lightbox;
  };

  const photoGrid = (photos) =>
    el(
      "ul",
      { class: "photo-grid" },
      photos.map((photo, index) => {
        const button = el(
          "button",
          { class: "photo-thumb__open", type: "button", "aria-label": t("photo.open", { n: index + 1 }) },
          el("img", { src: photo.dataUrl, alt: "" })
        );

        button.addEventListener("click", () => getLightbox().open(photos, index));
        return el("li", { class: "photo-thumb" }, button);
      })
    );

  const analysisBlock = (analysis) => {
    const base = `profile.${analysis.profile}`;

    return el("section", { class: "card report-section" }, [
      el("div", { class: "report-section__title" }, [
        el("h2", { text: t("report.summary") }),
        el("span", { class: "tag", text: t("report.simulated") })
      ]),
      el("p", { text: t(`${base}.summary`) }),
      el("h3", { text: t("report.recommendations") }),
      el(
        "ul",
        { class: "bullet-list" },
        [1, 2, 3].map((n) => el("li", { text: t(`${base}.rec${n}`) }))
      ),
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
    photoGrid,
    analysisBlock,
    reviewBlock,
    bindClearButton
  };
})();
