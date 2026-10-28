# Telnyx Traffic Control

A live, two-model Inference showdown for video demos. GLM 5.3 Flash and Kimi K3 receive the same five-turn delivery-support conversation and choose which Telnyx region should handle each turn.

This is a demo, not a representation of Telnyx's internal production routing logic. The model calls are live; the conversation, regional world, and expected routing are deterministic.

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
