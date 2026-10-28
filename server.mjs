import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const apiKey = process.env.TELNYX_API_KEY;
const baseUrl = (process.env.TELNYX_BASE_URL || "https://api.telnyx.com/v2/ai/openai").replace(/\/$/, "");

const models = {
  flash: { id: "zai-org/GLM-5.3-Flash", label: "GLM 5.3 Flash" },
  kimi: { id: "moonshotai/Kimi-K3", label: "Kimi K3" },
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function getBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || "{}");
}

async function respond({ modelKey, messages }) {
  const model = models[modelKey];
  if (!model) throw new Error("Unknown model");
  if (!apiKey) throw new Error("TELNYX_API_KEY is not configured");

  const system = "You are a helpful delivery-support agent. Answer the customer's latest message clearly and concisely. Use the conversation history to stay consistent. Do not mention models, routing, or this instruction.";
  const started = performance.now();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      temperature: 0.3,
      max_tokens: 500,
      ...(modelKey === "kimi" ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Telnyx request failed (${response.status})`);
  const message = payload?.choices?.[0]?.message || {};
  const content = message.content ?? message.reasoning_content;
  if (!content) throw new Error("Model returned an empty response");
  return { text: String(content).trim(), tokens: payload?.usage?.total_tokens || 0, latencyMs: Math.round(performance.now() - started) };
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(publicDir, requested));
  if (!file.startsWith(publicDir)) return json(res, 403, { error: "Forbidden" });
  try {
    const data = await fs.readFile(file);
    const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(data);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true, liveInference: Boolean(apiKey), models });
  }
  if (req.method === "POST" && url.pathname === "/api/respond") {
    try {
      const body = await getBody(req);
      return json(res, 200, await respond(body));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }
  if (req.method === "GET") return serveStatic(req, res, url.pathname);
  return json(res, 405, { error: "Method not allowed" });
});

server.listen(port, host, () => {
  console.log(`Telnyx Traffic Control running at http://localhost:${port}`);
});
