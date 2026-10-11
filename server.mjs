import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (error) {
  // No .env file: the key can also come from the shell environment.
}

const PORT = Number(process.env.PORT) || 3000;
// Listen on every network interface so a phone on the same Wi-Fi can open the patient page.
// The case and screening APIs still need the access key, and a page only gets that key in
// its HTML when it is opened from this computer (or through the shared phone link).
// Set HOST=127.0.0.1 to keep the server on this computer only.
const HOST = process.env.HOST || "0.0.0.0";
const MODEL = "claude-opus-5-5";
const MAX_PHOTOS = 5;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const JPEG_PREFIX = "data:image/jpeg;base64,";
const MAX_CASES = 200;
// Every page baked by this server carries this key, so the shared cases are only
// readable by devices the server handed a page to. It changes on each restart.
const ACCESS_KEY = randomBytes(18).toString("hex");
// On a public host (Render, Railway, ...) visitors never come from the loopback address,
// so PUBLIC=1 hands the key to every page instead. Use it for a public demo only.
const PUBLIC = process.env.PUBLIC === "1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary"
};
// Only the pages and their assets are served, so .env, this file and node_modules stay private.
const PUBLIC_PATH = /^(?:[\w-]+\.html|styles\.css|(?:js|assets)\/[\w./-]+)$/;

const LANGUAGES = { en: "English", zh: "Simplified Chinese", ms: "Bahasa Melayu" };
const PROBLEMS = ["none", "not_mouth", "too_blurry", "too_dark"];
const PROFILES = ["clear", "stain", "plaque", "gum", "spot"];
const VERDICTS = ["routine", "monitor", "dentist"];

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    usable: { type: "boolean" },
    problem: { type: "string", enum: PROBLEMS },
    profile: { type: "string", enum: PROFILES },
    observation: { type: "string" }
  },
  required: ["usable", "problem", "profile", "observation"],
  additionalProperties: false
};

const SYSTEM_PROMPT = `You are the screening step in Oraviu, a prototype that lets a patient photograph their own teeth and gums at home between dental visits. Your result is shown to the patient straight away as a first impression, and a dentist reviews every case afterwards and can overrule you. You are sorting cases, not diagnosing: the patient needs to know whether to carry on as usual, keep an eye on something, or see a dentist, and the dentist needs to know which cases to open first.

First decide whether the photos can be judged at all, because a confident result on a bad photo is worse than asking for a retake.
- If none of the photos shows teeth or gums, set usable to false and problem to "not_mouth".
- If teeth or gums are in the photos but every photo is too blurry to judge, set usable to false and problem to "too_blurry".
- If every photo is too dark to judge, set usable to false and problem to "too_dark".
- If at least one photo shows teeth or gums clearly enough to judge, set usable to true and problem to "none", and judge from the photos that are clear.
When usable is false, the profile is ignored (use "clear"), and the observation says in one sentence what is wrong with the photos.

When the photos are usable, choose the one profile that matches the most serious thing you can see:
- "spot": a dark or brown spot, pit, hole or broken area on a tooth that could be decay
- "gum": gums that look clearly red, swollen or bleeding
- "plaque": visible soft or hard deposits on the teeth, mostly along the gumline
- "stain": surface discolouration on teeth that otherwise look intact
- "clear": none of the above is visible
The list runs from most to least serious. When more than one applies, choose the one nearest the top, because the patient gets a single next step and a missed problem costs more than an unnecessary dentist visit. Judge only what is visible; do not guess at what a photo does not show.

The observation is one or two short sentences for the patient, saying what you see and where, for example "There is a dark spot on a lower back tooth on the left side." Use plain everyday words. Leave out disease names, diagnoses and treatment advice, because the dentist gives those. Photos cannot show decay between teeth or anything under the gums, so never say the mouth is healthy; say what is or is not visible.`;

// Shared store: the patient's phone and the dentist's laptop read and write the same cases.
// It lives in memory only, so it starts empty each time the server starts.
const caseStore = { seq: 0, version: 0, cases: [], photos: new Map() };

const formatCaseId = (seq) => `ORV-${String(seq).padStart(4, "0")}`;
const findCase = (id) => caseStore.cases.find((record) => record.id === id);
const touch = () => {
  caseStore.version += 1;
};

// The demo starts with a realistic case list so the dentist page is not an empty shell.
// Set SEED=0 to start with an empty list instead.
const rng = (seed) => {
  let state = (seed >>> 0) || 1;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

// Draws a rough intraoral photo of the front teeth, so each demo case has something to show.
const demoPhoto = (profile, seed) => {
  const random = rng(seed);
  const W = 512;
  const H = 384;
  const count = 6;
  const pad = 26;
  const gap = 8;
  const toothW = (W - pad * 2 - gap * (count - 1)) / count;
  const gumTop = profile === "gum" ? "#c0392b" : "#bf6a72";
  const gumBottom = profile === "gum" ? "#8e2418" : "#8f4550";
  const gumLine = profile === "gum" ? 158 : 150;
  const root = 96;
  let teeth = "";
  let papillae = "";
  let extra = "";

  for (let index = 0; index < count; index += 1) {
    const x = pad + index * (toothW + gap);
    const top = root + Math.round(random() * 8);
    const bottom = gumLine + 150;
    const radius = Math.round(toothW * 0.26);
    let marks = "";

    if (profile === "stain" && (index === 1 || index === 4)) {
      marks += `<rect x="${(x + 5).toFixed(1)}" y="${top + 96}" width="${(toothW - 10).toFixed(1)}" height="66" rx="10" fill="#c8a24b" opacity="0.42"/>`;
    }

    if (profile === "spot" && index === count - 3) {
      marks += `<ellipse cx="${(x + toothW / 2).toFixed(1)}" cy="${top + 150}" rx="17" ry="21" fill="#2a1309" opacity="0.9"/>`;
      marks += `<ellipse cx="${(x + toothW / 2).toFixed(1)}" cy="${top + 150}" rx="8" ry="11" fill="#0b0502"/>`;
    }

    if (profile === "plaque") {
      marks += `<rect x="${(x + 3).toFixed(1)}" y="${gumLine - 2}" width="${(toothW - 6).toFixed(1)}" height="24" rx="10" fill="#e6dca6" opacity="0.65"/>`;
    }

    teeth += `<g><rect x="${x.toFixed(1)}" y="${top}" width="${toothW.toFixed(1)}" height="${bottom - top}" rx="${radius}" fill="url(#tooth)"/><rect x="${(x + toothW * 0.16).toFixed(1)}" y="${top + 14}" width="${(toothW * 0.16).toFixed(1)}" height="${bottom - top - 48}" rx="8" fill="#ffffff" opacity="0.3"/>${marks}</g>`;

    const centre = pad + (index + 1) * toothW + gap * index + gap / 2;
    papillae += `<path d="M${(centre - 9).toFixed(1)},${gumLine - 14} Q${centre.toFixed(1)},${gumLine + 16} ${(centre + 9).toFixed(1)},${gumLine - 14} Z" fill="url(#gum)"/>`;
  }

  if (profile === "gum") {
    extra += `<ellipse cx="150" cy="120" rx="70" ry="30" fill="#d4544a" opacity="0.5"/>`;
    extra += `<ellipse cx="360" cy="118" rx="66" ry="28" fill="#d4544a" opacity="0.45"/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
    `<linearGradient id="tooth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8f4ec"/><stop offset="1" stop-color="#d8d0bf"/></linearGradient>` +
    `<linearGradient id="gum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gumTop}"/><stop offset="1" stop-color="${gumBottom}"/></linearGradient>` +
    `<radialGradient id="vig" cx="0.5" cy="0.45" r="0.72"><stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.6"/></radialGradient>` +
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="#1c1013"/>` +
    teeth +
    `<rect x="0" y="46" width="${W}" height="${gumLine - 46}" rx="20" fill="url(#gum)"/>` +
    papillae +
    extra +
    `<rect y="${gumLine + 150}" width="${W}" height="${H - (gumLine + 150)}" fill="#160c0f"/>` +
    `<rect width="${W}" height="${H}" fill="url(#vig)"/>` +
    `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>` +
    `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

// Oldest first, so the case numbers read in the order they arrived.
const DEMO_CASES = [
  {
    profile: "gum",
    urgency: "dentist",
    photos: 2,
    daysAgo: 9,
    status: "reviewed",
    verdict: "dentist",
    observation: "The gums around the lower front teeth look red and puffy, and one area looks tender.",
    comment: "The lower front gums are red and swollen, more than the other areas. This looks like early gum inflammation that has been building up.",
    recommendation: "Please book an appointment for an examination and a professional clean within the next two weeks, and use a soft brush along the gumline in the meantime.",
    appointment: true
  },
  {
    profile: "plaque",
    urgency: "monitor",
    photos: 2,
    daysAgo: 7,
    status: "reviewed",
    verdict: "monitor",
    observation: "There is a pale, soft-looking film along the gumline of the lower front teeth.",
    comment: "Soft deposits sit along the gumline of the lower front teeth. The gums themselves are not angry yet, so this is still at an early stage.",
    recommendation: "Brush along the gumline with a fluoride toothpaste and floss once a day. A scale and polish at your next check-up would clear the rest."
  },
  {
    profile: "stain",
    urgency: "routine",
    photos: 1,
    daysAgo: 6,
    status: "reviewed",
    verdict: "routine",
    observation: "The front teeth show light brown staining that sits on the surface.",
    comment: "Surface staining only. The enamel underneath looks intact, and there are no pits or dark spots.",
    recommendation: "Cutting down on coffee, tea and smoking will slow this down. A whitening toothpaste or a polish at your next visit can lift what is there."
  },
  {
    profile: "clear",
    urgency: "routine",
    photos: 3,
    daysAgo: 5,
    status: "reviewed",
    verdict: "routine",
    observation: "The teeth and gums in these photos look even in colour, with no spots or swelling visible.",
    comment: "No decay or inflammation is visible in these photos. Photos cannot show the spaces between the teeth or what is under the gums, so this is a first impression only.",
    recommendation: "Keep brushing twice a day with fluoride toothpaste and flossing once a day, and keep your regular check-up."
  },
  {
    profile: "plaque",
    urgency: "monitor",
    photos: 2,
    daysAgo: 3.5,
    status: "pending",
    observation: "A pale deposit is visible along the gumline of the lower front teeth, mostly on the sides."
  },
  {
    profile: "spot",
    urgency: "dentist",
    photos: 2,
    daysAgo: 2.4,
    status: "pending",
    observation: "There is a small broken area on an upper right tooth near the gumline."
  },
  {
    profile: "stain",
    urgency: "routine",
    photos: 1,
    daysAgo: 1.8,
    status: "pending",
    observation: "The front teeth show light brown staining that looks like it sits on the surface."
  },
  {
    profile: "plaque",
    urgency: "monitor",
    photos: 3,
    daysAgo: 1.1,
    status: "pending",
    observation: "There is a soft yellow film along the gumline of several upper teeth."
  },
  {
    profile: "gum",
    urgency: "dentist",
    photos: 2,
    daysAgo: 0.6,
    status: "pending",
    observation: "The gums along the lower front teeth look red and a little swollen."
  },
  {
    profile: "spot",
    urgency: "dentist",
    photos: 2,
    daysAgo: 0.2,
    status: "pending",
    observation: "There is a dark spot on a lower back tooth on the left side.",
    appointment: true
  }
];

const seedCases = () => {
  DEMO_CASES.forEach((demo, index) => {
    const seq = index + 1;
    const id = formatCaseId(seq);
    const createdAt = new Date(Date.now() - demo.daysAgo * 24 * 60 * 60 * 1000);
    const photos = Array.from({ length: demo.photos }, (_, photoIndex) => ({
      id: `${id}-${photoIndex + 1}`,
      dataUrl: demoPhoto(demo.profile, seq * 1009 + photoIndex + 1)
    }));
    const record = {
      seq,
      id,
      createdAt: createdAt.toISOString(),
      photoCount: photos.length,
      analysis: { profile: demo.profile, urgency: demo.urgency, simulated: true, observation: demo.observation },
      status: demo.status,
      review: null
    };

    if (demo.status === "reviewed") {
      record.review = {
        verdict: demo.verdict,
        comment: demo.comment,
        recommendation: demo.recommendation,
        reviewedAt: new Date(createdAt.getTime() + 36 * 60 * 60 * 1000).toISOString()
      };
    }

    if (demo.appointment) {
      record.appointment = { requestedAt: new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString() };
    }

    caseStore.cases.push(record);
    caseStore.photos.set(seq, photos);
  });

  caseStore.seq = DEMO_CASES.length;
  caseStore.version += 1;
};

let client = null;

const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const getClient = () => {
  if (!client) {
    client = new Anthropic();
  }

  return client;
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const screenPhotos = async (photos, language) => {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If the model declines a request, the API retries it on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          ...photos.map((dataUrl) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: dataUrl.slice(JPEG_PREFIX.length) }
          })),
          { type: "text", text: `Screen these photos. Write the observation in ${language}.` }
        ]
      }
    ]
  });

  if (response.stop_reason !== "end_turn") {
    throw new Error(`Screening stopped early: ${response.stop_reason}`);
  }

  const text = response.content.find((block) => block.type === "text");
  const result = JSON.parse(text.text);

  if (!PROBLEMS.includes(result.problem) || !PROFILES.includes(result.profile)) {
    throw new Error("Screening returned an unknown value");
  }

  return result;
};

const handleAnalyze = async (request, response) => {
  if (!hasCredentials()) {
    sendJson(response, 503, { error: "no_key" });
    return;
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  const photos = Array.isArray(body.photos) ? body.photos : [];
  const valid =
    photos.length > 0 &&
    photos.length <= MAX_PHOTOS &&
    photos.every((photo) => typeof photo === "string" && photo.startsWith(JPEG_PREFIX));

  if (!valid) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  try {
    sendJson(response, 200, await screenPhotos(photos, LANGUAGES[body.lang] || LANGUAGES.en));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Screening failed: the API key was rejected. Check ANTHROPIC_API_KEY in .env.");
      sendJson(response, 502, { error: "auth" });
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error("Screening failed: rate limited. Wait a moment and try again.");
      sendJson(response, 502, { error: "busy" });
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error("Screening failed: could not reach the Claude API. Check the internet connection.");
      sendJson(response, 502, { error: "unreachable" });
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Screening failed: API error ${error.status}: ${error.message}`);
      sendJson(response, 502, { error: "api" });
    } else {
      console.error(`Screening failed: ${error.message}`);
      sendJson(response, 502, { error: "failed" });
    }
  }
};

const handleListCases = (response) => {
  sendJson(response, 200, { cases: caseStore.cases, version: caseStore.version });
};

const handleCreateCase = async (request, response) => {
  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  const photos = Array.isArray(body.photos) ? body.photos : [];
  const valid =
    photos.length > 0 &&
    photos.length <= MAX_PHOTOS &&
    photos.every((photo) => typeof photo === "string" && photo.startsWith(JPEG_PREFIX)) &&
    body.analysis &&
    typeof body.analysis === "object";

  if (!valid) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  if (caseStore.cases.length >= MAX_CASES) {
    sendJson(response, 409, { error: "full" });
    return;
  }

  caseStore.seq += 1;

  const record = {
    seq: caseStore.seq,
    id: formatCaseId(caseStore.seq),
    createdAt: new Date().toISOString(),
    photoCount: photos.length,
    analysis: body.analysis,
    status: "pending",
    review: null
  };

  caseStore.cases.push(record);
  caseStore.photos.set(
    record.seq,
    photos.map((dataUrl, index) => ({ id: `${record.id}-${index + 1}`, dataUrl }))
  );
  touch();
  sendJson(response, 201, { case: record });
};

const handleGetCase = (response, pathname) => {
  const id = pathname.slice("/api/case/".length);
  const record = findCase(id);

  if (!record) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  sendJson(response, 200, { case: { ...record, photos: caseStore.photos.get(record.seq) || [] } });
};

const handleReview = async (request, response, pathname) => {
  const id = pathname.slice("/api/case/".length, -"/review".length);
  const record = findCase(id);

  if (!record) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  if (!VERDICTS.includes(body.verdict)) {
    sendJson(response, 400, { error: "bad_request" });
    return;
  }

  record.status = "reviewed";
  record.review = {
    verdict: body.verdict,
    comment: String(body.comment || "").slice(0, 2000),
    recommendation: String(body.recommendation || "").slice(0, 2000),
    reviewedAt: new Date().toISOString()
  };

  touch();
  sendJson(response, 200, { case: record });
};

const handleAppointment = (response, pathname) => {
  const id = pathname.slice("/api/case/".length, -"/appointment".length);
  const record = findCase(id);

  if (!record) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  record.appointment = { requestedAt: new Date().toISOString() };
  touch();
  sendJson(response, 200, { case: record });
};

// A request from this computer itself, where it is safe to bake the access key into the page.
const isLoopback = (request) => {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
};

const serveFile = async (pathname, response, request) => {
  let relative;

  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  } catch (error) {
    relative = "";
  }

  const type = MIME_TYPES[path.extname(relative)];

  if (!type || !PUBLIC_PATH.test(relative) || relative.includes("..")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const content = await readFile(path.join(ROOT, relative));
    // A page opened on this computer carries the access key, so its navigation stays in the
    // shared store. A page opened from a phone does not; it carries the key in its ?k= link.
    const inject = path.extname(relative) === ".html" && (PUBLIC || isLoopback(request));
    const body = inject
      ? content
          .toString("utf8")
          .replace("</head>", `<script>window.__ORAVIU_KEY__ = ${JSON.stringify(ACCESS_KEY)};</script></head>`)
      : content;

    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const { pathname } = url;

  try {
    if (pathname === "/api/status" && request.method === "GET") {
      sendJson(response, 200, { ai: hasCredentials(), store: true });
    } else if (pathname.startsWith("/api/")) {
      const supplied = request.headers["x-oraviu-key"] || url.searchParams.get("k");

      if (supplied !== ACCESS_KEY) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }

      if (pathname === "/api/analyze" && request.method === "POST") {
        await handleAnalyze(request, response);
      } else if (pathname === "/api/cases" && request.method === "GET") {
        handleListCases(response);
      } else if (pathname === "/api/cases" && request.method === "POST") {
        await handleCreateCase(request, response);
      } else if (pathname === "/api/cases/clear" && request.method === "POST") {
        caseStore.seq = 0;
        caseStore.cases = [];
        caseStore.photos.clear();
        touch();
        sendJson(response, 200, { ok: true });
      } else if (/^\/api\/case\/ORV-\d+\/review$/.test(pathname) && request.method === "POST") {
        await handleReview(request, response, pathname);
      } else if (/^\/api\/case\/ORV-\d+\/appointment$/.test(pathname) && request.method === "POST") {
        handleAppointment(response, pathname);
      } else if (/^\/api\/case\/ORV-\d+$/.test(pathname) && request.method === "GET") {
        handleGetCase(response, pathname);
      } else {
        sendJson(response, 404, { error: "not_found" });
      }
    } else if (pathname === "/favicon.ico") {
      // The project has no icon; answering empty keeps a 404 out of the browser console.
      response.writeHead(204);
      response.end();
    } else if (request.method === "GET" || request.method === "HEAD") {
      await serveFile(pathname, response, request);
    } else {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
    }
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    sendJson(response, 500, { error: "server_error" });
  }
});

const localAddresses = () => {
  const addresses = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push({ name, address: entry.address });
      }
    }
  }

  return addresses;
};

// Start with the demo cases in place so the dentist page has something to show. Set SEED=0 to skip.
if (process.env.SEED !== "0") {
  seedCases();
}

server.listen(PORT, HOST, () => {
  console.log("Oraviu is running.");
  console.log(
    hasCredentials()
      ? `AI screening is on (${MODEL}).`
      : "AI screening is off: no ANTHROPIC_API_KEY found, so results are simulated. Add the key to .env and restart."
  );
  console.log(`\nShared cases are on: the patient and dentist pages see the same list (${caseStore.cases.length} demo cases loaded).`);
  console.log(`\nOn this computer:\n  Patient: http://localhost:${PORT}/patient.html\n  Dentist: http://localhost:${PORT}/dentist.html`);

  const addresses = localAddresses();

  if (HOST === "0.0.0.0" && addresses.length) {
    console.log("\nOn a phone on the same Wi-Fi (pick the address for Wi-Fi, not vEthernet/Ethernet/VirtualBox):");
    for (const { name, address } of addresses) {
      console.log(`  ${name}: http://${address}:${PORT}/patient.html?k=${ACCESS_KEY}`);
    }
    console.log("\nUse the full link, including the ?k= part. Do not use localhost on the phone.");
    console.log("If the phone still cannot connect, allow Node.js through Windows Firewall (Private networks).");
  } else if (HOST !== "0.0.0.0") {
    console.log("\nThe server is limited to this computer (HOST=" + HOST + ").");
  }
});
