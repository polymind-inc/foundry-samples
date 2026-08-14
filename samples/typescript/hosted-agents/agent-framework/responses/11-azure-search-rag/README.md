# Azure AI Search RAG Agent (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent with **Retrieval Augmented Generation (RAG)** capabilities backed by **Azure AI Search**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). The agent grounds its answers in product documentation by running a search against an Azure AI Search index before each model invocation, then citing the source in its response.

Ported from the Python sample [`hosted-agents/agent-framework/responses/11-azure-search-rag`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/11-azure-search-rag).

## How it works

The Python sample uses the bundled `AzureAISearchContextProvider`; agent-framework-js has no bundled equivalent, so this port implements the same behaviour as a custom `ContextProvider` in [src/search-context-provider.ts](src/search-context-provider.ts). In `beforeRun` it runs a full-text search against the configured index with the run's user input as the query, and injects the top 3 matching documents into the model context — a context prompt first, then one message per document, each carrying its `[Source: id]` plus the source document's name and link so the model can cite it.

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects. See [src/main.ts](src/main.ts).

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- An Azure AI Search service ([create one](https://learn.microsoft.com/azure/search/search-create-service-portal)) with RBAC enabled (Portal → search service → **Keys** → **API Access control** → "Both" or "Role-based access control")
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

### Required RBAC

Your identity (or the per-agent identity running the container in production) needs:

- **Azure AI User** on the Foundry project scope
- **Search Index Data Reader** on the Azure AI Search service (the agent only reads from the index)

To run the provisioning script your identity additionally needs, on the search service scope:

- **Search Service Contributor** — to create the index
- **Search Index Data Contributor** — to upload documents

```powershell
$searchId = az search service show -n <search-name> -g <rg> --query id -o tsv
$me = az ad signed-in-user show --query id -o tsv

az role assignment create --assignee $me --role "Search Service Contributor"    --scope $searchId
az role assignment create --assignee $me --role "Search Index Data Contributor" --scope $searchId
```

Role propagation typically takes 1–5 minutes.

## Provision the search index (one time)

[src/provision-index.ts](src/provision-index.ts) creates the index (if it doesn't already exist) and seeds it with three Contoso Outdoors documents using `DefaultAzureCredential`. It is safe to re-run: an existing index's schema is left untouched and the documents are merged-or-uploaded.

```bash
npm install
cp .env.example .env   # then fill in the search endpoint and index name
npm run provision
```

### Index schema

| Field | Type | Attributes |
|---|---|---|
| `id` | `Edm.String` | key, filterable |
| `content` | `Edm.String` | searchable (full-text) |
| `sourceName` | `Edm.String` | retrievable, filterable |
| `sourceLink` | `Edm.String` | retrievable |

Each seeded document includes a unique `*-CANARY-*` token that does not exist in any model training data, so you can prove an answer was grounded in retrieved content (not fabricated from training) by asking for the canary and checking it appears in the response. You can also point the sample at any existing index that exposes a retrievable text field named `content`.

## Run locally

```bash
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What is your return policy?"}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"How long does shipping take?"}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"How do I clean my tent?"}'
```

| User query mentions | Search result injected |
|---|---|
| "return", "refund" | Contoso Outdoors Return Policy (canary token: `TR-CANARY-7821`) |
| "shipping", "promo" | Contoso Outdoors Shipping Guide (canary token: `SHIP-CANARY-4493`) |
| "tent", "fabric" | TrailRunner Tent Care Instructions (canary token: `TENT-CANARY-9067`) |

If the Azure Search environment variables are not set, the agent still starts and responds — just without the RAG capability.

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t azure-search-rag-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml); it declares the search environment variables so the deployed container receives them. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent). The deployed agent's per-agent identity needs **Search Index Data Reader** on the Azure AI Search service.

## Environment variables

| Name | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Foundry project endpoint (auto-injected in hosted containers) |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Model deployment the agent talks to |
| `AZURE_SEARCH_ENDPOINT` | Azure AI Search endpoint, e.g. `https://<your-search>.search.windows.net` |
| `AZURE_SEARCH_INDEX_NAME` | Search index to query, e.g. `contoso-outdoors` |
