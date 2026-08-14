# Downstream Azure Services Agent (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) hosted agent that performs data-plane operations on **two Azure services — Blob Storage and Service Bus —** using its **per-agent Microsoft Entra identity** (no connection strings, no shared keys), ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`).

Ported from the Python sample [`hosted-agents/agent-framework/responses/10-downstream-azure`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/10-downstream-azure).

## How it works

When you deploy a hosted agent to Foundry, the platform provisions a dedicated Microsoft Entra **service identity** for that agent. Every outbound call the agent makes can use `DefaultAzureCredential` and Foundry will inject the per-agent identity at runtime. To let the agent touch a downstream Azure resource, you assign that identity the appropriate data-plane RBAC role on the target resource.

The tools are declared with `tool()` and registered with the agent in [src/main.ts](src/main.ts). Each tool builds its client with `new DefaultAzureCredential()` so the same code works locally (your developer identity) and in Foundry (the per-agent identity).

| Service       | Tools                                                  | SDK                    |
| ------------- | ------------------------------------------------------ | ---------------------- |
| Blob Storage  | `storage_put_blob`, `storage_get_blob`                 | `@azure/storage-blob`  |
| Service Bus   | `servicebus_send_message`, `servicebus_peek_messages`  | `@azure/service-bus`   |

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. `serve` binds `0.0.0.0:${PORT:-8088}` — the address the platform's readiness probe expects.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`
- **Azure Blob Storage** — an existing storage account and container the agent will read/write
- **Azure Service Bus** — an existing namespace and queue the agent will send to / peek from

### Granting data-plane access

Both services use standard Azure RBAC. When running **locally**, assign the roles to **your developer principal** (`az ad signed-in-user show --query id -o tsv`, principal type `User`). When running on **Foundry**, assign them to the **per-agent identity** (a `ServicePrincipal`; find its object id in the Foundry portal or via `azd ai agent show`).

```bash
# Blob Storage — Storage Blob Data Contributor on the container
STORAGE_SCOPE=$(az storage account show --name "$AZURE_STORAGE_ACCOUNT_NAME" --query id -o tsv)/blobServices/default/containers/$AZURE_STORAGE_CONTAINER_NAME
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type "$PRINCIPAL_TYPE" \
  --role "Storage Blob Data Contributor" --scope "$STORAGE_SCOPE"

# Service Bus — Data Sender + Data Receiver on the queue
QUEUE_SCOPE=$(az servicebus queue show --namespace-name "<namespace>" --resource-group "<rg>" --name "$AZURE_SERVICEBUS_QUEUE_NAME" --query id -o tsv)
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type "$PRINCIPAL_TYPE" \
  --role "Azure Service Bus Data Sender" --scope "$QUEUE_SCOPE"
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type "$PRINCIPAL_TYPE" \
  --role "Azure Service Bus Data Receiver" --scope "$QUEUE_SCOPE"
```

Role assignments take a minute or two to propagate.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in endpoint, storage and service bus settings
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' \
  -d '{"input":"Upload a blob named hello.txt with the content \"hi from the agent\"."}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' \
  -d '{"input":"Read the blob hello.txt and tell me what it contains."}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' \
  -d '{"input":"Send a Service Bus message with the body {\"orderId\": 42}."}'
curl -X POST localhost:8088/responses -H 'content-type: application/json' \
  -d '{"input":"Peek the next message on the queue."}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t downstream-azure-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml); it declares the four sample-specific environment variables so the deployed container receives them. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent). After deployment, apply the role assignments above to the **per-agent identity** before invoking the deployed agent.

## Environment variables

| Name | Purpose |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Foundry project endpoint (auto-injected in hosted containers) |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Model deployment the agent talks to |
| `AZURE_STORAGE_ACCOUNT_NAME` | Storage account for the `storage_*` tools |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container the agent reads/writes |
| `AZURE_SERVICEBUS_FQDN` | Service Bus namespace, e.g. `<namespace>.servicebus.windows.net` |
| `AZURE_SERVICEBUS_QUEUE_NAME` | Queue the agent sends to / peeks from |

## Troubleshooting

- **`AuthorizationPermissionMismatch` from Storage** — the role assignment hasn't propagated yet, or the scope is wrong. Verify the scope ends with `/containers/<your-container>`.
- **`Unauthorized` from Service Bus** — assign **both** Sender and Receiver; Sender alone cannot peek.
- **Local runs fail with credential errors** — `DefaultAzureCredential` falls back to your developer identity locally. Run `az login` and assign your user the same roles on the same scopes.
