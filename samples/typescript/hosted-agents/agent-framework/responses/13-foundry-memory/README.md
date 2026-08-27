# Foundry Memory Agent (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent with persistent semantic memory backed by a **Microsoft Foundry Memory Store**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). The agent remembers facts the user has shared (e.g., dietary preferences, name) across sessions by retrieving and updating memories around every model invocation via `FoundryMemoryProvider`.

Ported from the Python sample [`hosted-agents/agent-framework/responses/13-foundry-memory`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/13-foundry-memory).

## How it works

`FoundryMemoryProvider` is wired into the agent as a context provider. Around each model invocation it:

1. **Retrieves user-profile memories** for the resolved scope on the first turn of a session.
2. **Searches for contextual memories** matching the current user message and injects them into the model context.
3. **Queues a store update** with new facts inferred from the conversation.

Memory extraction is asynchronous. Like the .NET hosted-agent sample, this agent does not block every response while a queued update is processed. Callers that immediately verify a newly taught memory should allow time for extraction to complete.

Memories are scoped per end user with `hostedUserScope()`: the hosting infrastructure injects the end-user id on every request. For local requests without that header, `MEMORY_USER_ID` supplies a stable development scope from `.env`. This is the TypeScript equivalent of .NET's `HostedFoundryMemoryProviderScopes.PerUser()`: it resolves the platform-injected end-user id to an explicit Memory scope instead of relying on the service-side `{{$userId}}` substitution used by the Python sample.

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

## Prerequisites

- Node.js >= 24
- A [Microsoft Foundry project](https://learn.microsoft.com/en-us/azure/foundry/) with:
  - A deployed chat model (e.g., `gpt-4o-mini`)
  - A deployed embedding model (e.g., `text-embedding-3-small`) — used by the memory store itself, not by the agent at runtime
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

### Required RBAC

Your identity (or the per-agent identity running the container in production) needs **Foundry User** on the Foundry project scope. This role covers provisioning the memory store with `src/provision.ts` and reading/writing memories at runtime.

The memory store embeds and retrieves memories through the project's inference endpoint, so the same identity also needs **Cognitive Services OpenAI User** on the Foundry project scope to call the embedding deployment. Without it, memory writes fail with a `401` (`Authentication to the Azure OpenAI resource failed`) and the store stays empty. When deploying, grant both roles to the hosted agent's runtime identity at the project scope.

## Provision the memory store (one time)

[src/provision.ts](src/provision.ts) creates a Foundry Memory Store with the user-profile capability enabled (and chat-summary disabled) via `FoundryMemoryProvider.ensureMemoryStoreCreated`. It then verifies both the stored model configuration and an actual memory search, catching a store whose downstream model authentication is broken before the agent starts. It is safe to re-run: if a healthy store with the same name already exists, the script leaves it alone.

```bash
npm install
cp .env.example .env   # then fill in your project endpoint and model deployments
npm run provision
```

Expected output (first run):

```text
Created memory store 'agent_framework_memory'.
Verified memory store 'agent_framework_memory' is available on the service (id=memstore_...).
Verified memory store 'agent_framework_memory' can search through its model deployments.
```

If an existing store fails the search check even though the two roles and model deployments are correct, set a new `MEMORY_STORE_NAME` and run `npm run provision` again. This avoids reusing a store that was created while its model authorization was incomplete.

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
# Memory extraction is asynchronous; wait before verifying a newly taught memory.
sleep 30
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Do you remember my name and what I like to eat?"}'
```

`FoundryMemoryProvider.whenUpdatesCompleted()` is available for deterministic tests or one-shot workflows that must verify an update immediately, but the hosted server intentionally leaves extraction off the request's critical path.

The sample fails fast when the store cannot be read or updated instead of silently behaving like a stateless agent. For local requests, `MEMORY_USER_ID` from `.env` is used when no `x-agent-user-id` header is present.

## Deploy to Foundry

This is a container-hosted agent. The current automated deployment options are the Azure Developer CLI (`azd`) and the Microsoft Foundry extension for Visual Studio Code; the Foundry SDK and REST API can also deploy a prebuilt container image. See [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent) for the supported flows.

To build the image locally, use the included multi-stage Dockerfile:

```bash
docker build -t foundry-memory-responses-agent .
```

The hosted-agent definition is in [agent.yaml](agent.yaml). `FOUNDRY_PROJECT_ENDPOINT` is injected automatically by the platform; `agent.yaml` passes `AZURE_AI_MODEL_DEPLOYMENT_NAME` and `MEMORY_STORE_NAME` into the container. Its `${VAR}` placeholders are resolved from the active deployment environment—for example, `.azure/<environment>/.env` when using `azd`—not from this sample's local `.env` file. The local `.env` is read only by the `npm run dev`, `npm start`, and `npm run provision` scripts.

Before deployment, set `MEMORY_STORE_NAME` and the model deployment name in the selected deployment environment. The deployed agent's per-agent identity needs **Foundry User** and **Cognitive Services OpenAI User** on the same Foundry project where the memory store was created.

## Environment variables

| Name | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Foundry project endpoint (auto-injected in hosted containers) |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Chat model deployment — used by the agent and by the memory store's extraction |
| `AZURE_AI_EMBEDDING_MODEL_DEPLOYMENT_NAME` | Embedding model deployment — only needed by `src/provision.ts` |
| `MEMORY_STORE_NAME` | Name of the Foundry Memory Store the agent reads/writes |
| `MEMORY_USER_ID` | Stable local-development scope used only when no hosted user id is present |
