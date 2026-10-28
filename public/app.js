const turns = [
  { id: "TURN-01", message: "My order was supposed to arrive today. Can you check it?", region: "EU", urgency: "normal", size: "small" },
  { id: "TURN-02", message: "I'm in Berlin now and need an update urgently.", region: "EU", urgency: "urgent", size: "small" },
  { id: "TURN-03", message: "I'm flying to Singapore tonight. Keep helping me there.", region: "APAC", urgency: "urgent", size: "large" },
  { id: "TURN-04", message: "Please summarize the delivery history and keep the cost low.", region: "APAC", urgency: "cost-sensitive", size: "large" },
  { id: "TURN-05", message: "I'm back in New York. Give me the final status.", region: "AMER", urgency: "normal", size: "small" },
];

const state = {
  flash: { correct: 0, errors: 0 },
  kimi: { correct: 0, errors: 0 },
};
const $ = (id) => document.getElementById(id);

function worldFor(index) {
  return {
    tick: index + 1,
    pressure: index === 1 ? "EU congestion" : index === 2 || index === 3 ? "APAC burst" : "normal",
    capacity: { AMER: index === 4 ? "tight" : "available", EU: index === 1 ? "tight" : "available", APAC: index >= 2 && index <= 3 ? "tight" : "available" },
  };
}

function addCustomerMessage(turn) {
  const thread = $("thread");
  thread.querySelector(".empty-thread")?.remove();
  const message = document.createElement("div");
  message.className = "message customer-message";
  message.innerHTML = `<span class="message-label">CUSTOMER · ${turn.id}</span><p>${turn.message}</p><small>${turn.region} · ${turn.urgency}</small>`;
  thread.append(message);
  thread.scrollTop = thread.scrollHeight;
}

function render(modelKey, turn, decision) {
  const s = state[modelKey];
  const correct = decision.decision === "route" && decision.target_region === turn.region;
  if (correct) s.correct += 1;
  $("score-" + modelKey).textContent = `${Math.round((s.correct / turns.length) * 100)}%`;
  $("route-" + modelKey).textContent = `${s.correct}/${turns.length}`;
  $("errors-" + modelKey).textContent = s.errors;
  $("decision-" + modelKey).textContent = decision.decision === "route" ? `Route to ${decision.target_region}` : "Invalid route · 0 points";
  $("reason-" + modelKey).textContent = decision.reason;
  $("task-" + modelKey).textContent = turn.message;
  $("taskmeta-" + modelKey).textContent = `${turn.region} · ${turn.urgency}`;
  $("inbound-" + modelKey).textContent = turn.id;
  $("map-" + modelKey).querySelectorAll(".nodes span").forEach((node) => {
    node.classList.toggle("active", node.dataset.region === decision.target_region);
    node.classList.toggle("warning", node.dataset.region === turn.region && node.dataset.region !== decision.target_region);
  });
  const result = document.createElement("div");
  result.className = correct ? "model-result correct" : "model-result incorrect";
  result.textContent = `${modelKey === "flash" ? "Flash" : "Kimi"}: ${decision.target_region || "invalid"}`;
  $("thread").append(result);
  $("thread").scrollTop = $("thread").scrollHeight;
}

function recordError(modelKey, turn, error) {
  const s = state[modelKey];
  s.errors += 1;
  $("score-" + modelKey).textContent = `${Math.round((s.correct / turns.length) * 100)}%`;
  $("route-" + modelKey).textContent = `${s.correct}/${turns.length}`;
  $("errors-" + modelKey).textContent = s.errors;
  $("decision-" + modelKey).textContent = "Invalid response · 0 points";
  $("reason-" + modelKey).textContent = error.message;
  $("task-" + modelKey).textContent = turn.message;
  $("taskmeta-" + modelKey).textContent = `${turn.region} · ${turn.urgency}`;
  $("inbound-" + modelKey).textContent = turn.id;
  const result = document.createElement("div");
  result.className = "model-result incorrect";
  result.textContent = `${modelKey === "flash" ? "Flash" : "Kimi"}: invalid response`;
  $("thread").append(result);
}

async function getDecision(modelKey, turn, world) {
  const response = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelKey, request: turn, world }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Inference request failed");
  return payload.decision;
}

async function run() {
  const button = $("start");
  button.disabled = true;
  button.textContent = "Conversation is moving…";
  state.flash = { correct: 0, errors: 0 };
  state.kimi = { correct: 0, errors: 0 };
  $("thread").innerHTML = "";
  ["flash", "kimi"].forEach((key) => {
    $("score-" + key).textContent = "0%";
    $("route-" + key).textContent = `0/${turns.length}`;
    $("errors-" + key).textContent = "0";
    $("task-" + key).textContent = "Waiting for the next message";
    $("taskmeta-" + key).textContent = "—";
    $("decision-" + key).textContent = "Waiting for input";
  });
  $("status").textContent = "Customer conversation in progress";
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    addCustomerMessage(turn);
    $("turn-count").textContent = `${index + 1} / ${turns.length} turns`;
    $("event").textContent = `${turn.region} · ${turn.urgency} · both models routing`;
    const world = worldFor(index);
    await Promise.all(["flash", "kimi"].map(async (key) => {
      try {
        render(key, turn, await getDecision(key, turn, world));
      } catch (error) {
        recordError(key, turn, error);
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  const winner = state.flash.correct === state.kimi.correct ? "Conversation routing is tied" : state.flash.correct > state.kimi.correct ? "GLM 5.3 Flash leads" : "Kimi K3 leads";
  $("status").textContent = `${winner} · conversation complete`;
  $("event").textContent = `Flash ${state.flash.correct}/${turns.length} correct · Kimi ${state.kimi.correct}/${turns.length} correct`;
  button.disabled = false;
  button.innerHTML = 'Run conversation again <span>↻</span>';
}

$("start").addEventListener("click", run);
