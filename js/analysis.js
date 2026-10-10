window.Oraviu = window.Oraviu || {};

(() => {
  const { t } = window.Oraviu.i18n;

  const PROFILES = [
    { key: "clear", urgency: "routine" },
    { key: "stain", urgency: "routine" },
    { key: "plaque", urgency: "monitor" },
    { key: "gum", urgency: "dentist" },
    { key: "spot", urgency: "dentist" }
  ];
  const SAMPLE_STEP = 97;

  let availability = null;

  // AI screening needs server.mjs and its API key. A page opened straight from disk has neither.
  const available = () => {
    if (!availability) {
      availability =
        location.protocol === "file:"
          ? Promise.resolve(false)
          : fetch("api/status")
              .then((response) => (response.ok ? response.json() : { ai: false }))
              .then((status) => Boolean(status.ai))
              .catch(() => false);
    }

    return availability;
  };

  const fingerprint = (photos) => {
    let hash = 2166136261;

    photos.forEach(({ dataUrl }) => {
      for (let index = 0; index < dataUrl.length; index += SAMPLE_STEP) {
        hash ^= dataUrl.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    });

    return hash >>> 0;
  };

  // Demo only: the profile is the presenter's choice or a fingerprint of the files, not what the photos show.
  const simulate = (photos, chosen) => {
    const profile = PROFILES.find(({ key }) => key === chosen) || PROFILES[fingerprint(photos) % PROFILES.length];
    return { profile: profile.key, urgency: profile.urgency, simulated: true };
  };

  const screen = async (photos, lang) => {
    const response = await fetch("api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: photos.map(({ dataUrl }) => dataUrl), lang })
    });

    if (!response.ok) {
      throw new Error(`Screening failed with status ${response.status}`);
    }

    const result = await response.json();

    if (!result.usable) {
      return { unusable: true, problem: result.problem };
    }

    const { urgency } = PROFILES.find(({ key }) => key === result.profile);
    return { profile: result.profile, urgency, simulated: false, observation: result.observation };
  };

  const run = async (photos, { lang, profile } = {}) =>
    (await available()) ? screen(photos, lang) : simulate(photos, profile);

  // The on-page notices must describe the analysis the visitor actually gets.
  available().then((ai) => {
    if (!ai) {
      return;
    }

    document.querySelectorAll("[data-i18n-ai]").forEach((node) => {
      node.dataset.i18n = node.dataset.i18nAi;
      node.textContent = t(node.dataset.i18n);
    });
  });

  window.Oraviu.analysis = { run, available };
})();
