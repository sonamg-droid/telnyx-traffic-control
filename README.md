# Telnyx Traffic Control

A live, two-model Inference showdown for video demos. GLM 5.3 Flash and Kimi K3 receive the same five-turn delivery-support conversation and generate real replies through Telnyx Inference.

The model calls and responses are live. The customer messages are deterministic so the two models can be compared on the same conversation. The app reports observable response counts, latency, token usage when returned, and errors; it does not manufacture a quality score or claim a winner.

## Run locally

Set `TELNYX_API_KEY` in your environment, then run:

```bash
npm start
```

Open <http://localhost:4173>.

The server defaults to Telnyx's OpenAI-compatible base URL:

```text
https://api.telnyx.com/v2/ai/openai
```

The API key is used only by the server and is never sent to the browser.
