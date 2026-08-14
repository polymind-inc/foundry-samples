# Foundry Memory Agent (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent with persistent semantic memory backed by an **Azure AI Foundry Memory Store**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). The agent remembers facts the user has shared (e.g., dietary preferences, name) across sessions by retrieving and updating memories around every model invocation via `FoundryMemoryProvider`.

Ported from the Python sample [`hosted-agents/agent-framework/responses/13-foundry-memory`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/13-foundry-memory).

## How it works

`FoundryMemoryProvider` is wired into the agent as a context provider. Around each model invocation it:

1. **Retrieves user-profile memories** for the resolved scope on the first turn of a session.
2. **Searches for contextual memories** matching the current user message and injects them into the model context.
3. **Updates the store** with new facts inferred from the conversation (extraction runs asynchronously on the service).

Memories are scoped per end user with `hostedUserScope()`: the hosting infrastructure injects the end-user id on every request, so one provider instance serves every user of the container without ever mixing two users' memories. This is the TypeScript counterpart of the Python sample's `scope="{{$userId}}"` placeholder.

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with:
  - A deployed chat model (e.g., `gpt-4o-mini`)
  - A deployed embedding model (e.g., `text-embedding-3-small`) — used by the memory store itself, not by the agent at runtime
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

### Required RBAC

Your identity (or the per-agent identity running the container in production) needs **Azure AI User** on the Foundry project scope. This role covers provisioning the memory store with `src/provision.ts` and reading/writing memories at runtime.

The memory store embeds and retrieves memories through the project's inference endpoint, so the same identity also needs **Cognitive Services OpenAI User** on the Foundry project scope to call the embedding deployment. Without it, memory writes fail with a `401` (`Authentication to the Azure OpenAI resource failed`) and the store stays empty. When deploying, grant both roles to the hosted agent's runtime identity at the project scope.

## Provision the memory store (one time)

[src/provision.ts](src/provision.ts) creates a Foundry Memory Store with the user-profile capability enabled (and chat-summary disabled) via `FoundryMemoryProvider.ensureMemoryStoreCreated`, then verifies the store is reachable on the service. It is safe to re-run: if a store with the same name already exists, the script leaves it alone.

```bash
npm install
cp .env.example .env   # then fill in your project endpoint and model deployments
npm run provision
```

Expected output (first run):

```text
Creating memory store 'agent_framework_memory'...
Verified memory store 'agent_framework_memory' is available on the service (id=memstore_...).
```

To erase everything stored for one user (a clean slate while trying the sample out):

```bash
npm run provision -- --reset <user-id>
```

## Run locally

```bash
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Hi, my name is Alex and I am vegetarian."}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Do you remember my name and what I like to eat?"}'
```

> Memory extraction is asynchronous on the service, so a fact stated in one turn may take a moment before it is searchable in the next conversation.

If `MEMORY_STORE_NAME` is not set, the agent still starts and responds — just without the memory capability.

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t foundry-memory-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml); it declares `MEMORY_STORE_NAME` so the deployed container reads and writes the store you provisioned. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent). The deployed agent's per-agent identity needs **Azure AI User** (and **Cognitive Services OpenAI User**) on the same Foundry project the memory store was created against.

## Environment variables

| Name | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Foundry project endpoint (auto-injected in hosted containers) |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Chat model deployment — used by the agent and by the memory store's extraction |
| `AZURE_AI_EMBEDDING_MODEL_DEPLOYMENT_NAME` | Embedding model deployment — only needed by `src/provision.ts` |
| `MEMORY_STORE_NAME` | Name of the Foundry Memory Store the agent reads/writes |
