# Caller agent — A2A delegation (TypeScript)

A Foundry-hosted [Agent Framework](https://github.com/microsoft/agent-framework) agent (Responses protocol) that acts as a friendly concierge, ported to TypeScript with `@polymind-inc/agent-framework`: when the user asks a question a specialist can answer better, the caller delegates it to a remote agent over the [A2A protocol](https://a2a-protocol.org/latest/) and summarizes the result back.

Ported from the Python sample [`hosted-agents/agent-framework/a2a/01-delegation/caller`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/a2a/01-delegation/caller). For the full two-agent walkthrough that pairs this caller with the included [executor](../executor/), see the **[parent README](../README.md)**.

## How it works

The caller reaches the executor through a Foundry **Toolbox** that exposes one `a2a_preview` tool, backed by a `RemoteA2A` project connection (see the parent README for how those are created). The caller looks the toolbox up at runtime by name (`TOOLBOX_NAME`) using `FoundryToolbox` from `@polymind-inc/agent-framework/foundry/hosting`, which opens the toolbox MCP endpoint (`{project_endpoint}/toolboxes/{name}/mcp?api-version=v1`) and lets the model auto-discover the executor's skills from the agent card. See [src/main.ts](src/main.ts).

The agent is built in an **async agent factory** passed to `ResponsesHostServer`, so the toolbox connection (`tools/list`) happens lazily on the first request instead of before the HTTP server is bound — otherwise a slow MCP handshake keeps `/readiness` red and the platform fails every invocation with `424 session_not_ready`.

> **Deviations from the Python sample:**
>
> - Python builds the toolbox tool by hand (`MCPStreamableHTTPTool` + an `httpx` auth hook injecting a bearer token). The JS `FoundryToolbox` handles the endpoint URL, per-call token, and lazy connection itself.
> - Python subclasses `ResponsesHostServer` to wrap `context.get_history()` against an alpha SDK bug. That workaround is Python-specific and not ported.

### Alternative: direct A2A from the client

If you don't need the Foundry Toolbox in the middle, the framework can also speak A2A directly: `A2AAgent.fromUrl` from `@polymind-inc/agent-framework/a2a` resolves the executor's agent card and returns an agent you can call (or hand to another agent as a tool):

```ts
import { A2AAgent } from '@polymind-inc/agent-framework/a2a';

const mathExpert = await A2AAgent.fromUrl(a2aEndpointUrl);
const response = await mathExpert.run('What is 15 multiplied by 23?');
```

This bypasses the `RemoteA2A` connection / toolbox entirely — you bring your own auth and endpoint discovery instead.

## Run locally

The toolbox / A2A connection lives in Foundry, so a local run still talks to the same remote executor:

```bash
npm install
cp .env.example .env   # then fill in your project endpoint and toolbox name
npm run dev
```

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What is 15 multiplied by 23?"}'
```

## Deploy

See the [parent README](../README.md) — deploy the executor and run `setup-a2a` first to enable incoming A2A, create the `RemoteA2A` connection + `a2a_preview` toolbox, then build (`npm run build`), containerize, and deploy with [agent.yaml](agent.yaml).

## Verify the deployed agent

Ask the deployed caller `What is 17 times 23?` — it should delegate the question over A2A and return a short answer (e.g. `17 times 23 is 391.`).
