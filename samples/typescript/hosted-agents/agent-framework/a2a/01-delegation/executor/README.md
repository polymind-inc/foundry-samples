# Executor agent — math expert exposed over A2A (TypeScript)

A minimal Foundry-hosted [Agent Framework](https://github.com/microsoft/agent-framework) agent (Responses protocol) that answers arithmetic / math questions, ported to TypeScript with `@polymind-inc/agent-framework`. Once deployed, you turn on **incoming A2A** so the [caller](../caller/) (or any other A2A client) can reach it through Foundry's A2A endpoint.

Ported from the Python sample [`hosted-agents/agent-framework/a2a/01-delegation/executor`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/a2a/01-delegation/executor). For the full two-agent walkthrough, see the **[parent README](../README.md)**.

## How it works

The agent uses `FoundryChatClient` for the model and is served via `ResponsesHostServer`; `serve` binds `0.0.0.0:${PORT:-8088}`. See [src/main.ts](src/main.ts).

By default a Responses-protocol agent is reachable only through Responses. **Enabling incoming A2A** is a per-agent PATCH (REST API only — no portal UI yet) that publishes an `agent_card` for client discovery and adds `a2a` to `agent_endpoint.protocols`. After that, the agent answers both Responses **and** A2A requests at the same endpoint. The PATCH is performed by [`scripts/setup-a2a.{sh,ps1}`](scripts/).

The script's hard-coded `agent_card` (skills, description, version) describes this math-expert specifically; edit it if you adapt the executor for a different task, since the caller's tool routing depends on the advertised skill descriptions.

A2A endpoints require Microsoft Entra ID auth (Foundry User role on the project).

## Run locally

A2A is a Foundry-side feature, so a local run only exercises the Responses interface:

```bash
npm install
cp .env.example .env   # then fill in your project endpoint
npm run dev
```

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What is 15 multiplied by 23?"}'
```

## Deploy

See the [parent README](../README.md) — build (`npm run build`), containerize, deploy with [agent.yaml](agent.yaml), then run [`scripts/setup-a2a`](scripts/) to enable incoming A2A. Copy the A2A endpoint URL it prints; you'll use it as the target of the caller's `RemoteA2A` connection.
