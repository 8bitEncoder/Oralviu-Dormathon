window.Oraviu = window.Oraviu || {};

(() => {
  const PROFILES = [
    { key: "clear", urgency: "routine" },
    { key: "stain", urgency: "routine" },
    { key: "plaque", urgency: "monitor" },
    { key: "gum", urgency: "dentist" },
    { key: "spot", urgency: "dentist" }
  ];
  const SAMPLE_STEP = 97;

  // Demo only: the profile is picked from a fingerprint of the files, not from what the photos show.
  // Replace run() with a real model call to make the analysis genuine.
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

  const run = (photos) => {
    const profile = PROFILES[fingerprint(photos) % PROFILES.length];
    return { profile: profile.key, urgency: profile.urgency, simulated: true };
  };

  window.Oraviu.analysis = { run };
})();
