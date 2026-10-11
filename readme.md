To access the the material and slides please click this link : https://drive.google.com/file/d/1n8_68aAWGBEl4LHta5m6plQUpIdLHiWZ/view?usp=drivesdk


# Oralviu 

Oralviu is a prototype web system for oral photo screening with dentist review. A patient uploads photos of their teeth and gums and gets one clear result with a next step; a dentist then confirms or changes that result, and the patient's report updates.

The visual style follows the SmileGuardian website, and the system covers the **Analyze**, **Review**, and **Act** steps of its Capture → Connect → Analyze → Review → Act journey. A third page shows the intraoral camera itself as an interactive 3D model.

> **Prototype only.** Without the local server the result is simulated and is not derived from the uploaded photos. With the server, a general-purpose AI model screens the photos; it is not a dental device and has not been validated on dental images. Do not use this system for medical decisions.

## Getting started

There are two ways to run it. The banner at the top of each page says which one is active.

### Simulated results (nothing to install)

1. Open `index.html` in Chrome.
2. Choose **Patient**, **Dentist**, or **Device**, or open `patient.html`, `dentist.html`, and `device.html` directly.

The result is one of five preset profiles. A **Simulated result** list on the patient page lets the presenter choose which one, so the result can match the photo being shown. Cases created this way stay in that browser.

### AI screening (local server)

This needs Node.js 20.12 or later and a Claude API key. The API is billed separately from a Claude subscription.

1. Run `npm install`.
2. Copy `.env.example` to `.env` and paste the key after `ANTHROPIC_API_KEY=`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000` in Chrome.

The server prints whether AI screening is on. Without a key it still serves the pages, with simulated results.

Run the server once and open both pages from it, or open both from disk. Cases are shared when the server is running and stay in the browser when opened from disk (see [Data storage](#data-storage)).

#### Sharing cases between a phone and a computer

The server keeps one shared case list, so the patient's phone and the dentist's computer see the same cases. The case and screening APIs only answer requests that carry an access key. A page opened on this computer is handed the key in its HTML; a page opened on a phone carries it in the `?k=` part of the link the server prints.

1. On the computer, run `npm start` and open `http://localhost:3000/patient.html` or `.../dentist.html`. The server listens on every interface by default.
2. On the phone (same Wi-Fi), open the full `http://<wifi-address>:3000/patient.html?k=...` link the server prints. Use the address shown for **Wi-Fi**, not for vEthernet, Ethernet, or VirtualBox, and never `localhost` on the phone.
3. If the phone cannot connect, allow Node.js through Windows Firewall (Private networks). On a network that isolates devices (many dorm and guest Wi-Fi networks do), the phone and computer cannot reach each other — use a phone hotspot or a home router instead.
4. To keep the server on this computer only, set `HOST=127.0.0.1`. In Windows PowerShell that is `$env:HOST='127.0.0.1'; npm start`.

Anyone who can reach the server can spend the API key's credit, so do this only on a network you trust.

#### Host a public demo

The server is a long-running process that keeps the shared cases in memory, so host it on a platform that runs a web service (Render, Railway, Fly.io, Glitch, Replit) rather than a serverless host. Vercel and Netlify run functions without shared memory, so the case list would not be shared there.

The repo includes `render.yaml`, so on Render:

1. Fork this repository (or push it to your own account).
2. Open `https://render.com/deploy?repo=<your-fork-url>` and follow the prompts, or create a **Web Service** from the repo. The blueprint sets `PUBLIC=1` and `HOST=0.0.0.0` for you.
3. Render builds with `npm install` and starts with `npm start`, then gives you a public `https://...onrender.com` URL.

`PUBLIC=1` hands the access key to every visitor, which is what lets strangers share one case list. Leave `ANTHROPIC_API_KEY` unset for a free public demo, where screening is simulated; set it to screen real photos, but then anyone with the link can spend that key's credit. The free Render plan sleeps when idle and starts with an empty list, then reloads the demo cases on wake.

The system was tested in Edge, which shares Chrome's engine. Other browsers have not been tested. The AI screening call was tested against a stand-in for the Claude API and has not yet been run with a real key.

## How it works

### Patient page (`patient.html`)

1. **Upload** up to 5 photos by drag-and-drop, the file picker, or the **Open phone camera** button (which opens the phone's rear camera). A guide lists the five views to take. Files that are not images, and photos that are too dark or too blurry to judge, are left out with a message.
2. **Analyze** screens the photos and creates a case numbered `ORV-0001`, `ORV-0002`, and so on. No personal details are collected. With AI screening, photos that do not show teeth or gums are sent back for a retake and no case is created.
3. **Report** opens with the result: *Nothing visible to worry about*, *Keep an eye on this*, or *Please see a dentist*, each with its own colour and icon, a one-line reason, and the next step. The dentist's review, the photos, and the recommendations follow.
4. **Request an appointment** appears when the result is *Please see a dentist*. The request is saved on the case and shown to the dentist.
5. **My reports** lists every report with its status: *Awaiting dentist review* or *Reviewed by dentist*.

When a dentist submits a review, the open report updates without a reload. The dentist's decision replaces the AI's, and the report says whether the dentist confirmed or changed it.

### Dentist page (`dentist.html`)

1. **Case list** opens on the cases waiting for review, with a count such as *2 to review · 1 urgent*. Each row shows the date, photo count, AI priority, status, and any appointment request.
   - Filter by Pending, All, or Reviewed.
   - Sort by Priority, Newest first, or Oldest first. Priority puts pending cases first, then High to Low, then the longest-waiting case.
2. **Case view** shows the patient's photos and the AI result with its suggested next step.
3. **Review form** takes one decision: Routine care, Monitor at home, or See a dentist. The AI's suggestion is marked. A comment and a recommendation are optional.
   - The decision and the send button stay locked until every photo has been opened full size, so a result cannot be approved unseen. Opened photos get a tick.
   - **Send and open next case** saves the review and opens the next waiting case by priority. After the last one the list shows *All caught up*.
   - A submitted review can be updated later.

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
- No frameworks or build tools in the pages
- Optional local server: Node.js with the official Anthropic SDK (`@anthropic-ai/sdk`), used for AI screening and for sharing cases between the patient's phone and the dentist's computer

## Project structure

```text
Oraviu/
├── index.html      Entry page linking to the three pages
├── patient.html    Upload, analysis, and reports
├── dentist.html    Case list and review form
├── device.html     3D model of the intraoral camera
├── styles.css      All styles
├── server.mjs      Optional local server: serves the pages and runs AI screening
├── package.json    The server's one dependency and the start script
├── render.yaml     Blueprint for hosting the shared demo on Render
├── .env.example    Template for the API key file
├── readme.md
├── assets/
│   ├── ORALVIU-detailed-concept.glb  Model file behind the GLB download
│   └── reference-blueprint.png       Drawing shown by the Blueprint button
└── js/
    ├── i18n.js         Text in three languages and the language switcher
    ├── store.js        Case storage: the shared server store, or IndexedDB offline
    ├── analysis.js     Screening: calls the server, or simulates a result without it
    ├── ui.js           Shared rendering: chips, photo grid, lightbox, report blocks
    ├── patient.js      Patient page logic
    ├── dentist.js      Dentist page logic
    ├── device-model.js Geometry of the 12 device parts
    ├── device.js       Device page logic: camera, selection, cutaway, explode
    └── vendor/
        └── three.min.js  three.js r180 with OrbitControls
```

Scripts are plain `<script>` files that share one `window.Oraviu` object, so the pages work when opened directly from disk. Load order matters: `i18n.js`, `store.js`, `analysis.js`, `ui.js`, then the page script. The entry page loads `i18n.js` and `analysis.js` only, so its banner matches the active mode. The device page loads `i18n.js`, `ui.js`, `vendor/three.min.js`, `device-model.js`, then `device.js`.

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

## Analysis

Every result is one of five profiles. The profile fixes the result the patient sees and the priority the dentist sees.

| Profile  | Observation                       | Result          | Dentist priority |
| -------- | --------------------------------- | --------------- | ---------------- |
| `clear`  | No obvious areas of concern       | Routine care    | Low              |
| `stain`  | Possible surface discolouration   | Routine care    | Low              |
| `plaque` | Possible plaque along the gumline | Monitor at home | Medium           |
| `gum`    | Possible gum redness or swelling  | See a dentist   | High             |
| `spot`   | Possible darker spot on a tooth   | See a dentist   | High             |

The wording for each profile lives in `js/i18n.js` under the `profile.*` keys.

`run(photos, { lang, profile })` in `js/analysis.js` asks `api/status` once whether the server has a key, then takes one of two paths.

### Simulated

Used when the page is opened from disk or the server has no key. The profile is the one chosen in the **Simulated result** list, or a fingerprint of the files when the list is on *Automatic*. Either way it says nothing about what the photos show, and the report is labelled *Simulated*.

### AI screening

`run` posts the photos to `api/analyze`. `server.mjs` sends them to Claude (`claude-opus-5-5`) with the instructions in `SYSTEM_PROMPT` and a JSON schema, and gets back:

```js
{ usable: true, problem: "none", profile: "spot", observation: "There is a dark spot on a lower back tooth on the left side." }
```

- **`usable` and `problem`** reject photos that cannot be judged: `not_mouth`, `too_blurry`, or `too_dark`. The patient is asked to retake them.
- **`profile`** is the most serious thing visible. The result and priority come from the table above, not from the model.
- **`observation`** is one or two plain sentences in the patient's language. It replaces the preset summary in the report and is stored as written, so it does not change when the language is switched.

The request opts into Anthropic's server-side fallback, so a request the model declines is retried on a fallback model. If the call fails, the patient sees a message and keeps their photos; the reason is printed in the server's terminal. A failed call never falls back to a simulated result.

To use a different model or service, change `screenPhotos` in `server.mjs` and keep the returned shape.

### Photo quality check

Before a photo is added, `qualityProblem` in `js/patient.js` measures its brightness and its edge sharpness in the browser. The limits (`MIN_BRIGHTNESS`, `MIN_SHARPNESS`) are loose on purpose and were set on synthetic test images, not on real mouth photos, so tune them once real photos from the camera are available.

## Server API

`server.mjs` serves the pages and these routes. Every route except `/api/status` needs the access key, sent as the `x-oraviu-key` header or a `?k=` query value; the pages get it from the served HTML.

| Route                            | Method | Purpose                                       |
| -------------------------------- | ------ | --------------------------------------------- |
| `/api/status`                    | GET    | `{ ai, store }` — is a key set, is the store on |
| `/api/analyze`                   | POST   | Screen photos (unchanged contract)            |
| `/api/cases`                     | GET    | `{ cases, version }` — the shared list        |
| `/api/cases`                     | POST   | Create a case from `{ photos, analysis }`     |
| `/api/case/ORV-0001`             | GET    | One case with its photos                      |
| `/api/case/ORV-0001/review`      | POST   | Save a review                                 |
| `/api/case/ORV-0001/appointment` | POST   | Flag an appointment request                   |
| `/api/cases/clear`               | POST   | Delete every shared case                      |

## Data storage

There are two modes, and `js/store.js` picks one when the page loads.

- **Shared (server).** When a page is served by `server.mjs`, cases are kept in the server's memory and shared by every device using that server. The patient's phone and the dentist's computer see the same list, and each page refreshes it every two seconds. The server starts with 10 realistic demo cases (histories, reviews, and drawn photos) so the dentist page is not empty; set `SEED=0` to start empty instead. Cases are lost when the server stops.
- **Offline (browser).** When a page is opened from disk (`file://`), or no server can be reached, cases are kept in this browser's IndexedDB. Nothing is shared.

With AI screening on, the photos are sent through the server to the Claude API to be screened. In shared mode they also live in the server's memory for the length of the session; the server does not write them to disk.

| Where         | Name                | Contents                                                    |
| ------------- | ------------------- | ----------------------------------------------------------- |
| Server memory | `cases` / `photos`  | Shared mode: every case while the server runs               |
| IndexedDB     | `oraviu` → `cases`  | Offline: one record per case, without photos                |
| IndexedDB     | `oraviu` → `photos` | Offline: the photos for each case                           |
| localStorage  | `oraviu:lang`       | Chosen language                                             |
| localStorage  | `oraviu:changed`    | Offline: timestamp written on every change to wake the other page |

The same case record shape is used in both modes:

```js
{
  seq: 1,
  id: "ORV-0001",
  createdAt: "2026-10-10T08:57:00.000Z",
  photoCount: 4,
  analysis: { profile: "spot", urgency: "dentist", simulated: true },  // AI screening: simulated false, plus observation
  status: "pending",            // or "reviewed"
  review: null,                 // or { verdict, comment, recommendation, reviewedAt }
  appointment: { requestedAt }  // only after the patient requests one
}
```

Photos are resized in the browser to at most 1280 px on the longest side and saved as JPEG before storage.

**Clear demo data** in the footer deletes every case in the current mode — the shared cases on the server, or this browser's offline copy — and numbering restarts at `ORV-0001`.

## Adding or changing text

All interface text is in the `messages` object in `js/i18n.js`, once per language.

1. Add the key to `en`, `zh`, and `ms`. A key missing from `zh` or `ms` falls back to English.
2. In HTML, reference it with `data-i18n="your.key"` for text or `data-i18n-aria-label="your.key"` for an `aria-label`.
3. In JavaScript, call `t("your.key", { name: value })`. Placeholders are written as `{name}` in the message.

## Current limitations

- Simulated results must not be presented as real ones. AI screening uses a general-purpose model that has not been validated on dental images, so its results are not real findings either.
- Photos show surfaces only. Decay between teeth and anything under the gums cannot be seen, so a clear result never means the mouth is healthy.
- The photo-opening lock shows that the dentist opened each photo, not that they studied it. There is no second review or audit of decisions.
- An appointment request is only a flag on the case. There is no calendar, and nobody is notified.
- There is no login. The access key in a served page keeps other devices out of the case list, but anyone given a working link can review cases, and the patient page shows every case.
- Without the server, cases exist only in one browser on one computer, and clearing the browser's site data deletes them. With the server they are shared, but they are held in memory and lost when it stops.
- Dentists choose a decision and can add a comment and a recommendation. They cannot mark up photos or accept and reject individual findings.
- Photos come from the file picker or the phone camera; on a phone the camera button opens the rear camera. The five-view guide is a list, not a step-by-step capture, and there is still no connection to the intraoral device.
- The 3D model is a concept. Its dimensions are illustrative, and the chips, PCB layout, and connectors are proposals that the pitch deck does not specify.
