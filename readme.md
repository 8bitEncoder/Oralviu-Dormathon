# Oraviu

Oraviu is a demo web system for oral photo analysis with dentist review. A patient uploads photos of their teeth and gums and receives a short report; a dentist then reviews the case and writes comments that appear in the patient's report.

The visual style follows the SmileGuardian website, and the system covers the **Analyze** and **Review** steps of its Capture → Connect → Analyze → Review → Act journey. A third page shows the intraoral camera itself as an interactive 3D model.

> **Demo only.** The analysis is simulated: results are not derived from the uploaded photos. Do not use this system for medical decisions.

## Getting started

There is nothing to install or build.

1. Open `index.html` in Chrome.
2. Choose **Patient**, **Dentist**, or **Device**, or open `patient.html`, `dentist.html`, and `device.html` directly.

Open the patient and dentist pages in the same browser on the same computer, because cases are stored in that browser (see [Data storage](#data-storage)).

The system was tested in Chrome by opening the files directly. Other browsers have not been tested. A browser that keeps separate storage for each local file will not share cases between the two pages; in that case, serve the folder with a static file server such as the VS Code Live Server extension.

## How it works

### Patient page (`patient.html`)

1. **Upload** up to 5 photos by drag-and-drop or the file picker. Files that are not images are left out with a message.
2. **Analyze** runs the simulated analysis and creates a case numbered `ORV-0001`, `ORV-0002`, and so on. No personal details are collected.
3. **Report** shows the photos, a short AI observation summary, three recommendations, and a next step.
4. **My reports** lists every report with its status: *Awaiting dentist review* or *Reviewed by dentist*.

When a dentist submits a review, the open report updates without a reload.

### Dentist page (`dentist.html`)

1. **Case list** shows every submitted case with its date, photo count, AI priority, and status.
   - Filter by All, Pending, or Reviewed.
   - Sort by Priority, Newest first, or Oldest first. Priority puts pending cases first, then High to Low, then the longest-waiting case.
2. **Case view** shows the patient's photos and the same AI summary the patient sees.
3. **Review form** takes a comment and a recommendation for the patient. At least one is required. A submitted review can be updated later.

### Device page (`device.html`)

A 3D workbench for the intraoral camera. It needs a browser with WebGL and stores nothing.

1. **Drag** to orbit and **scroll** to zoom.
2. **Assembly tree** lists the 12 parts. Choosing one zooms in on it and shows its description; a part inside the shell also opens the cutaway. Clicking a part on the model selects it without moving the camera.
3. **Isolate component** hides every other part.
4. **Toolbar** switches between Assembly and Cutaway, pulls the parts apart with the Explode slider, rotates the model, jumps to the front or side view, and resets everything.
5. **Blueprint** opens the original technical drawing, and **GLB** downloads the model.

The model is an engineering concept, not production CAD. Each part names its source in the pitch deck or is marked as a proposed detail.

### Languages

All pages switch between English, 中文, and Bahasa Melayu from the header. The choice is remembered in the browser. Text typed by a dentist is shown as written and is not translated.

## Technology stack

- Semantic HTML
- CSS
- Vanilla JavaScript
- three.js r180 for the 3D model, kept in the project as one prebuilt file
- No frameworks, build tools, packages, or backend

## Project structure

```text
Oraviu/
├── index.html      Entry page linking to the three pages
├── patient.html    Upload, analysis, and reports
├── dentist.html    Case list and review form
├── device.html     3D model of the intraoral camera
├── styles.css      All styles
├── readme.md
├── assets/
│   ├── ORALVIU-detailed-concept.glb  Model file behind the GLB download
│   └── reference-blueprint.png       Drawing shown by the Blueprint button
└── js/
    ├── i18n.js         Text in three languages and the language switcher
    ├── store.js        Case storage (IndexedDB) and cross-page change signal
    ├── analysis.js     Simulated analysis
    ├── ui.js           Shared rendering: chips, photo grid, lightbox, report blocks
    ├── patient.js      Patient page logic
    ├── dentist.js      Dentist page logic
    ├── device-model.js Geometry of the 12 device parts
    ├── device.js       Device page logic: camera, selection, cutaway, explode
    └── vendor/
        └── three.min.js  three.js r180 with OrbitControls
```

Scripts are plain `<script>` files that share one `window.Oraviu` object, so the pages work when opened directly from disk. Load order matters: `i18n.js`, `store.js`, `analysis.js` (patient page only), `ui.js`, then the page script. The device page loads `i18n.js`, `ui.js`, `vendor/three.min.js`, `device-model.js`, then `device.js`.

## 3D device model

`js/device-model.js` builds the camera from three.js shapes each time the page loads. No model file is read to draw it.

- **Changing a part.** Edit its geometry in `createDevice()`. Each part is one group, listed in `PARTS` with the keys of its system and source labels.
- **Changing the text.** Part names and descriptions are in `js/i18n.js` under `device.part.*`, `device.system.*`, and `device.basis.*`.
- **The GLB download is a separate export.** `assets/ORALVIU-detailed-concept.glb` does not change when `device-model.js` changes, so export it again after editing the geometry.

`js/vendor/three.min.js` is three.js with OrbitControls bundled into a classic script that sets `window.THREE`, because a browser will not load ES modules from a page opened from disk. To rebuild it for another three.js version, run this in an empty folder outside the project and copy the result over the file:

```sh
npm install three@0.180.0 esbuild
echo 'export * from "three"; export { OrbitControls } from "three/addons/controls/OrbitControls.js";' > entry.js
npx esbuild entry.js --bundle --format=iife --global-name=THREE --minify --outfile=three.min.js
```

## Simulated analysis

`js/analysis.js` picks one of five preset profiles from a fingerprint of the uploaded files. The same photos always give the same profile, but the profile says nothing about what the photos show.

| Profile  | Observation                       | Next step       | Dentist priority |
| -------- | --------------------------------- | --------------- | ---------------- |
| `clear`  | No obvious areas of concern       | Routine care    | Low              |
| `stain`  | Possible surface discolouration   | Routine care    | Low              |
| `plaque` | Possible plaque along the gumline | Monitor at home | Medium           |
| `gum`    | Possible gum redness or swelling  | See a dentist   | High             |
| `spot`   | Possible darker spot on a tooth   | See a dentist   | High             |

The wording for each profile lives in `js/i18n.js` under the `profile.*` keys.

### Replacing it with a real model

`run(photos)` in `js/analysis.js` is the only function to replace. It receives the photos as `{ name, dataUrl }` objects and returns:

```js
{ profile: "plaque", urgency: "monitor", simulated: true }
```

Three things change with a real model:

- **A backend is needed.** An API key must not be placed in these static files.
- **The call becomes asynchronous.** `analyze()` in `js/patient.js` uses the result of `run` directly, so add `await` there.
- **Free-text results need a new renderer.** `analysisBlock` in `js/ui.js` looks up text by profile key, so a model that writes its own summary needs that function changed.

## Data storage

Everything is stored in the browser. Nothing is sent to a server.

| Where        | Name                | Contents                                                 |
| ------------ | ------------------- | -------------------------------------------------------- |
| IndexedDB    | `oraviu` → `cases`  | One record per case, without photos                      |
| IndexedDB    | `oraviu` → `photos` | The photos for each case                                 |
| localStorage | `oraviu:lang`       | Chosen language                                          |
| localStorage | `oraviu:changed`    | Timestamp written on every change to wake the other page |

A case record looks like this:

```js
{
  seq: 1,
  id: "ORV-0001",
  createdAt: "2026-10-10T08:57:00.000Z",
  photoCount: 4,
  analysis: { profile: "spot", urgency: "dentist", simulated: true },
  status: "pending",            // or "reviewed"
  review: null                  // or { comment, recommendation, reviewedAt }
}
```

Photos are resized in the browser to at most 1280 px on the longest side and saved as JPEG before storage.

**Clear demo data** in the footer of either page deletes every case in the browser, and numbering restarts at `ORV-0001`.

## Adding or changing text

All interface text is in the `messages` object in `js/i18n.js`, once per language.

1. Add the key to `en`, `zh`, and `ms`. A key missing from `zh` or `ms` falls back to English.
2. In HTML, reference it with `data-i18n="your.key"` for text or `data-i18n-aria-label="your.key"` for an `aria-label`.
3. In JavaScript, call `t("your.key", { name: value })`. Placeholders are written as `{name}` in the message.

## Current limitations

- The analysis is simulated and must not be presented as a real result.
- There is no login. Anyone who opens `dentist.html` can review cases, and the patient page shows every report stored in the browser.
- Cases exist only in one browser on one computer. Clearing the browser's site data deletes them.
- Dentists can write a comment and a recommendation. They cannot mark up photos or accept and reject individual findings.
- Photos come from file upload only. Camera capture and a connection to the intraoral device are not included.
- The 3D model is a concept. Its dimensions are illustrative, and the chips, PCB layout, and connectors are proposals that the pitch deck does not specify.
