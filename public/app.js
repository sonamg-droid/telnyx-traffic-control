const requests = [
  { id: "REQ-01", region: "AMER", urgency: "urgent", size: "large", profile: "Voice orchestration" },
  { id: "REQ-02", region: "EU", urgency: "normal", size: "small", profile: "Support reply" },
  { id: "REQ-03", region: "APAC", urgency: "cost-sensitive", size: "large", profile: "Batch summary" },
  { id: "REQ-04", region: "AMER", urgency: "normal", size: "small", profile: "JSON extraction" },
  { id: "REQ-05", region: "EU", urgency: "urgent", size: "large", profile: "Agent decision" },
  { id: "REQ-06", region: "APAC", urgency: "normal", size: "small", profile: "Code repair" },
  { id: "REQ-07", region: "AMER", urgency: "cost-sensitive", size: "large", profile: "Document processing" },
  { id: "REQ-08", region: "EU", urgency: "normal", size: "small", profile: "Classification" },
  { id: "REQ-09", region: "APAC", urgency: "urgent", size: "large", profile: "Realtime agent" },
  { id: "REQ-10", region: "AMER", urgency: "normal", size: "small", profile: "Tool selection" },
  { id: "REQ-11", region: "EU", urgency: "cost-sensitive", size: "large", profile: "Long context" },
  { id: "REQ-12", region: "APAC", urgency: "normal", size: "small", profile: "Structured output" },
];

const state = {
  flash: { points: 0, valid: 0, correctRoutes: 0, errors: 0, decisions: [] },
  kimi: { points: 0, valid: 0, correctRoutes: 0, errors: 0, decisions: [] },
};
const $ = (id) => document.getElementById(id);

function worldFor(index) {
  return {
    tick: index + 1,
    pressure: index >= 4 && index <= 6 ? "EU congestion" : index >= 8 ? "APAC burst" : "normal",
    capacity: { AMER: index === 7 ? "tight" : "available", EU: index >= 4 && index <= 6 ? "tight" : "available", APAC: index >= 8 ? "tight" : "available" },
  };
}

function score(request, decision) {
  if (decision.decision === "reject") return { points: 0, valid: true, correctRoute: false };
  const region = decision.target_region === request.region;
  const tier = request.urgency === "urgent" ? decision.service_tier === "priority" : request.urgency === "cost-sensitive" ? decision.service_tier === "flex" : decision.service_tier === "default";
  const points = region && tier ? 100 : region ? 65 : tier ? 35 : 10;
  return { points, valid: true, correctRoute: region };
}

function render(modelKey, request, decision, result) {
  const s = state[modelKey];
  s.points += result.points;
  s.valid += result.valid ? 1 : 0;
  s.correctRoutes += result.correctRoute ? 1 : 0;
  s.decisions.push(decision);
  $("score-" + modelKey).textContent = `${Math.round(s.points / requests.length)}%`;
  $("valid-" + modelKey).textContent = `${s.valid}/${requests.length}`;
  $("route-" + modelKey).textContent = `${s.correctRoutes}/${requests.length}`;
  $("errors-" + modelKey).textContent = s.errors;
  $("decision-" + modelKey).textContent = `${decision.decision === "route" ? "Route" : "Reject"} · ${decision.target_region} · ${decision.service_tier}`;
  $("reason-" + modelKey).textContent = decision.reason;
  $("inbound-" + modelKey).textContent = request.id;
  $("task-" + modelKey).textContent = request.profile;
  $("taskmeta-" + modelKey).textContent = `${request.region} · ${request.urgency} · ${request.size}`;
  $("map-" + modelKey).querySelectorAll(".nodes span").forEach((node) => {
    node.classList.toggle("active", node.dataset.region === decision.target_region);
    node.classList.toggle("warning", node.dataset.region === request.region && node.dataset.region !== decision.target_region);
  });
  const line = document.createElement("div");
  line.innerHTML = `<b>${request.id}</b> ${request.profile} → ${decision.target_region} (${decision.service_tier})`;
  $("log-" + modelKey).prepend(line);
}

function recordError(modelKey, request, error) {
  const s = state[modelKey];
  s.errors += 1;
  $("score-" + modelKey).textContent = `${Math.round(s.points / requests.length)}%`;
  $("valid-" + modelKey).textContent = `${s.valid}/${requests.length}`;
  $("route-" + modelKey).textContent = `${s.correctRoutes}/${requests.length}`;
  $("errors-" + modelKey).textContent = s.errors;
  $("task-" + modelKey).textContent = request.profile;
  $("taskmeta-" + modelKey).textContent = `${request.region} · ${request.urgency} · ${request.size}`;
  $("inbound-" + modelKey).textContent = request.id;
  $("decision-" + modelKey).textContent = "Invalid response · 0 points";
  $("reason-" + modelKey).textContent = error.message;
  const line = document.createElement("div"); line.className = "error"; line.textContent = `${request.id} · invalid response · 0 points`;
  $("log-" + modelKey).prepend(line);
}

async function getDecision(modelKey, request, world) {
  const response = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelKey, request, world }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Inference request failed");
  return payload.decision;
}

async function run() {
  const button = $("start");
  button.disabled = true;
  button.textContent = "Traffic is moving…";
  state.flash = { points: 0, valid: 0, correctRoutes: 0, errors: 0, decisions: [] };
  state.kimi = { points: 0, valid: 0, correctRoutes: 0, errors: 0, decisions: [] };
  ["flash", "kimi"].forEach((key) => {
    $("score-" + key).textContent = "0%";
    $("valid-" + key).textContent = `0/${requests.length}`;
    $("route-" + key).textContent = `0/${requests.length}`;
    $("errors-" + key).textContent = "0";
    $("task-" + key).textContent = "Waiting for traffic";
    $("taskmeta-" + key).textContent = "—";
    $("log-" + key).replaceChildren();
    $("decision-" + key).textContent = "Waiting for input";
  });
  $("status").textContent = "Models are routing live traffic";
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    $("request-count").textContent = `${index + 1} / ${requests.length} requests`;
    $("event").textContent = `${request.id} · ${request.profile} · ${request.urgency}`;
    const world = worldFor(index);
    const results = await Promise.all(["flash", "kimi"].map(async (key) => {
      try {
        const decision = await getDecision(key, request, world);
        render(key, request, decision, score(request, decision));
      } catch (error) {
        recordError(key, request, error);
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  const winner = state.flash.points === state.kimi.points ? "Tie on routing score" : state.flash.points > state.kimi.points ? "GLM 5.3 Flash leads" : "Kimi K3 leads";
  $("status").textContent = `${winner} · simulation complete`;
  $("event").textContent = `Flash ${state.flash.valid}/${requests.length} valid · Kimi ${state.kimi.valid}/${requests.length} valid`;
  button.disabled = false;
  button.innerHTML = 'Run it again <span>↻</span>';
}

$("start").addEventListener("click", run);
