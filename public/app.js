const turns = [
  "My order #TX-2048 was supposed to arrive today. What happened?",
  "I'm in Berlin now. Can you tell me the latest estimate?",
  "I'm flying to Singapore tonight. What should I do if it arrives late?",
  "Can you summarize the delivery history in one sentence?",
  "I'm back in New York. Give me the final status and next step.",
];

const state = {
  flash: { responses: 0, errors: 0, tokens: 0, latency: 0, messages: [] },
  kimi: { responses: 0, errors: 0, tokens: 0, latency: 0, messages: [] },
};
const $ = (id) => document.getElementById(id);

function formatReply(text) {
  const escaped = text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br />");
}

function addCustomerMessage(text, index) {
  const thread = $("thread");
  thread.querySelector(".empty-thread")?.remove();
  const message = document.createElement("div");
  message.className = "message customer-message";
  message.innerHTML = `<span class="message-label">CUSTOMER · TURN-${String(index + 1).padStart(2, "0")}</span><p>${text}</p>`;
  thread.append(message);
  thread.scrollTop = thread.scrollHeight;
}

function addModelReplies(index) {
  const thread = $("thread");
  const row = document.createElement("div");
  row.className = "reply-row";
  row.innerHTML = `<div class="reply-chip"><span>GLM 5.3 Flash</span><p id="thread-reply-flash-${index}">…</p></div><div class="reply-chip"><span>Kimi K3</span><p id="thread-reply-kimi-${index}">…</p></div>`;
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
}

function updateModel(modelKey, result, index) {
  const s = state[modelKey];
  s.responses += 1;
  s.latency += result.latencyMs;
  s.tokens += result.tokens || 0;
  const label = modelKey === "flash" ? "flash" : "kimi";
  $("reply-" + label).innerHTML = formatReply(result.text);
  $("thread-reply-" + label + "-" + index).innerHTML = formatReply(result.text);
  $("turns-" + label).textContent = `${s.responses}/${turns.length}`;
  $("errors-" + label).textContent = s.errors;
  $("tokens-" + label).textContent = s.tokens || "—";
  $("latency-" + label).textContent = `${(result.latencyMs / 1000).toFixed(1)}s`;
}

function recordError(modelKey, error, index) {
  const s = state[modelKey];
  s.errors += 1;
  const label = modelKey === "flash" ? "flash" : "kimi";
  const message = `No response: ${error.message}`;
  $("reply-" + label).textContent = message;
  $("thread-reply-" + label + "-" + index).textContent = message;
  $("turns-" + label).textContent = `${s.responses}/${turns.length}`;
  $("errors-" + label).textContent = s.errors;
}

async function getResponse(modelKey, messages) {
  const response = await fetch("/api/respond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modelKey, messages }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Inference request failed");
  return payload;
}

async function run() {
  const button = $("start");
  button.disabled = true;
  button.textContent = "Conversation is live…";
  state.flash = { responses: 0, errors: 0, tokens: 0, latency: 0, messages: [] };
  state.kimi = { responses: 0, errors: 0, tokens: 0, latency: 0, messages: [] };
  $("thread").innerHTML = "";
  ["flash", "kimi"].forEach((key) => {
    const label = key === "flash" ? "flash" : "kimi";
    $("reply-" + label).textContent = "Waiting for the next customer message.";
    $("latency-" + label).textContent = "—";
    $("turns-" + label).textContent = `0/${turns.length}`;
    $("errors-" + label).textContent = "0";
    $("tokens-" + label).textContent = "—";
  });
  $("status").textContent = "Customer conversation in progress";
  const histories = { flash: [], kimi: [] };
  for (let index = 0; index < turns.length; index += 1) {
    const customerMessage = { role: "user", content: turns[index] };
    addCustomerMessage(turns[index], index);
    addModelReplies(index);
    $("turn-count").textContent = `${index + 1} / ${turns.length} turns`;
    $("event").textContent = "Both models are answering the same message";
    await Promise.all(["flash", "kimi"].map(async (key) => {
      const messages = [...histories[key], customerMessage];
      const started = performance.now();
      try {
        const result = await getResponse(key, messages);
        result.latencyMs = result.latencyMs || Math.round(performance.now() - started);
        updateModel(key, result, index);
        histories[key].push(customerMessage, { role: "assistant", content: result.text });
      } catch (error) {
        recordError(key, error, index);
        histories[key].push(customerMessage);
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  $("status").textContent = "Conversation complete · live responses captured";
  $("event").textContent = `Flash ${state.flash.responses}/${turns.length} · Kimi ${state.kimi.responses}/${turns.length}`;
  button.disabled = false;
  button.innerHTML = 'Run conversation again <span>↻</span>';
}

$("start").addEventListener("click", run);
