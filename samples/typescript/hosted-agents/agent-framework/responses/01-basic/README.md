# Basic Hosted Agent (Responses Protocol) — TypeScript

A minimal [Agent Framework](https://github.com/microsoft/agent-framework) agent hosted on Microsoft Foundry using the **Responses protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). This sample demonstrates basic request/response interaction and multi-turn conversations.

Ported from the Python sample [`hosted-agents/agent-framework/responses/01-basic`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/01-basic).

## How it works

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

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
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Hi"}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t basic-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Next steps

- [Add tools to your agent](../02-tools/) — sample with local tool functions
- [Use Foundry Toolbox](../04-foundry-toolbox/) — sample with Foundry Toolbox integration
