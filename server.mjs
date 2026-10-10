import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (error) {
  // No .env file: the key can also come from the shell environment.
}

const PORT = Number(process.env.PORT) || 3000;
// Local only by default, because anyone who can reach this server spends the API key's credit.
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = "claude-opus-5-5";
const MAX_PHOTOS = 5;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const JPEG_PREFIX = "data:image/jpeg;base64,";

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

const serveFile = async (pathname, response) => {
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

    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");

  if (pathname === "/api/status" && request.method === "GET") {
    sendJson(response, 200, { ai: hasCredentials() });
  } else if (pathname === "/api/analyze" && request.method === "POST") {
    handleAnalyze(request, response);
  } else if (pathname === "/favicon.ico") {
    // The project has no icon; answering empty keeps a 404 out of the browser console.
    response.writeHead(204);
    response.end();
  } else if (request.method === "GET" || request.method === "HEAD") {
    serveFile(pathname, response);
  } else {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Oraviu is running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(
    hasCredentials()
      ? `AI screening is on (${MODEL}).`
      : "AI screening is off: no ANTHROPIC_API_KEY found, so results are simulated. Add the key to .env and restart."
  );
});
