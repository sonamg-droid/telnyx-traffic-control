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

const allowedRegions = new Set(["AMER", "EU", "APAC"]);
const allowedTiers = new Set(["priority", "default", "flex"]);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function normalizeDecision(value) {
  let parsed = value;
  if (typeof value === "string") {
    const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { parsed = null; }
      }
      if (!parsed) {
        const region = text.match(/\b(AMER|EU|APAC)\b/i)?.[1]?.toUpperCase();
        const tier = text.match(/\b(priority|default|flex)\b/i)?.[1]?.toLowerCase();
        if (region) parsed = { decision: /\breject\b/i.test(text) ? "reject" : "route", target_region: region, service_tier: tier || "default", reason: text.slice(0, 140) };
      }
    }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Model response did not contain a usable route");
  const decisionValue = String(parsed?.decision || parsed?.action || "route").toLowerCase();
  const regionValue = String(parsed?.target_region || parsed?.targetRegion || parsed?.region || "").toUpperCase();
  const tierValue = String(parsed?.service_tier || parsed?.serviceTier || parsed?.tier || "").toLowerCase();
  const decision = decisionValue === "reject" ? "reject" : "route";
  const targetRegion = allowedRegions.has(regionValue) ? regionValue : "AMER";
  const serviceTier = allowedTiers.has(tierValue) ? tierValue : "default";
  return {
    decision,
    target_region: targetRegion,
    service_tier: serviceTier,
    reason: String(parsed?.reason || "Selected the best available route.").slice(0, 140),
  };
}

async function getBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return JSON.parse(data || "{}");
}

async function decide({ modelKey, request, world }) {
  const model = models[modelKey];
  if (!model) throw new Error("Unknown model");
  if (!apiKey) throw new Error("TELNYX_API_KEY is not configured");

  const system = `You are a traffic-control agent in a deterministic demo. Make one routing decision.
Return JSON only, with exactly these fields:
{"decision":"route"|"reject","target_region":"AMER"|"EU"|"APAC","service_tier":"priority"|"default"|"flex","reason":"short explanation"}
Rules: preserve the request's required region when possible; use priority for urgent requests, flex for cost-sensitive work, and default otherwise. Never invent regions or fields. Do not include markdown.`;
  const user = JSON.stringify({ request, current_world: world });
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Telnyx request failed (${response.status})`);
  const message = payload?.choices?.[0]?.message || {};
  // Kimi currently returns structured JSON in reasoning_content for this format.
  const content = message.content ?? message.reasoning_content;
  return normalizeDecision(content);
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
  if (req.method === "POST" && url.pathname === "/api/decide") {
    try {
      const body = await getBody(req);
      const decision = await decide(body);
      return json(res, 200, { decision });
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
