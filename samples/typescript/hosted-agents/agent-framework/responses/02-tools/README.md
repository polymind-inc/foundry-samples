# Agent with Local Tools (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent with **locally-defined tools** hosted on Microsoft Foundry using the **Responses protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). This sample shows how to define custom tools with the `tool()` helper and register them with the agent so the model can call them during a conversation. A `get_weather` function is included as an example tool.

Ported from the Python sample [`hosted-agents/agent-framework/responses/02-tools`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/02-tools).

> **When to use local tools vs. a toolbox:** Local `tool()` functions are the right choice for self-contained logic you own and run in-process. For tools you want to share across agents — web search, code interpreter, MCP servers, OpenAPI, and more — package them behind a [Foundry Toolbox](../04-foundry-toolbox/) instead, which adds a single managed MCP endpoint with centralized authentication and versioning.

## How it works

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. Custom tools are declared with `tool()` — the model sees each tool's name, description and [Zod](https://zod.dev/) parameter schema and decides when to call them. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

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

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What is the weather in Seattle?"}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t local-tools-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Next steps

- [Basic agent](../01-basic/) — minimal agent with no tools
- [Use Foundry Toolbox](../04-foundry-toolbox/) — sample with Foundry Toolbox integration
