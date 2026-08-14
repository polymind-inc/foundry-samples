# Basic Hosted Agent (Invocations Protocol) — TypeScript

A minimal [Agent Framework](https://github.com/microsoft/agent-framework) agent hosted on Microsoft Foundry using the **Invocations protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). Unlike the Responses protocol, the Invocations protocol does **not** provide platform-side conversation history — the conversation lives in the agent process, keyed by session id.

Ported from the Python sample [`hosted-agents/agent-framework/invocations/01-basic`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/invocations/01-basic).

## How it works

The agent uses `FoundryChatClient` and is served via `InvocationsHostServer`, which publishes it over `POST /invocations` (Invocations container protocol v2.0.0). `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

The request body is `{ "message": string, "stream"?: boolean }`. A non-streaming turn answers the agent's text as `text/plain`; a streaming one answers the update text chunks as `text/event-stream`. Conversation state is kept in-process, partitioned per session (and per user when hosted): the caller keeps a conversation going by pinning the `agent_session_id` query parameter to the value the previous response's `x-agent-session-id` header reported.

> **Deviation from the Python sample:** the Python version hand-rolls an in-memory session store on a Starlette app (`@app.invoke_handler`). The JS `InvocationsHostServer` already implements the protocol including per-session state, so this port needs no custom handler or store. As in Python, that state is in-process — it is lost on restart; use durable storage in production.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your project endpoint
npm run dev
```

Invoke the local agent from another terminal. The Invocations protocol uses a `{"message": "..."}` payload:

```bash
curl -i -X POST localhost:8088/invocations -H 'content-type: application/json' -d '{"message":"Hi"}'
```

For multi-turn conversations, copy the `x-agent-session-id` header from the response and pin it on the next request:

```bash
curl -X POST 'localhost:8088/invocations?agent_session_id=<id-from-previous-response>' \
  -H 'content-type: application/json' -d '{"message":"How are you?"}'
```

To stream the reply as server-sent events, add `"stream": true`:

```bash
curl -N -X POST localhost:8088/invocations -H 'content-type: application/json' -d '{"message":"Hi","stream":true}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t basic-invocations-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Next steps

- [Basic Responses-protocol agent](../../responses/01-basic/) — the same agent on the Responses protocol, with platform-managed history
