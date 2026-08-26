# Agent with Foundry Toolbox (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent that uses **Foundry Toolbox** for tool discovery, hosted on Microsoft Foundry using the **Responses protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). Foundry Toolbox is a managed tool registry in Microsoft Foundry that lets you define tools centrally and share them across agents.

Ported from the Python sample [`hosted-agents/agent-framework/responses/04-foundry-toolbox`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/04-foundry-toolbox).

## How it works

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. It connects to the toolbox's MCP endpoint via `FoundryToolbox`, which discovers and invokes the toolbox's tools over MCP at runtime, authenticates every request with the credential (`DefaultAzureCredential` by default), and forwards the platform per-request call-id.

`FoundryToolbox` builds the endpoint from `FOUNDRY_PROJECT_ENDPOINT` and the toolbox name (`TOOLBOX_NAME`). The agent is built **lazily in an agent factory** (`agent: async () => ...`): `toolbox.getTools()` runs on the first request rather than at startup, so a briefly unreachable toolbox fails one request instead of keeping the container's `/readiness` probe red. See [src/main.ts](src/main.ts).

> Unlike the Python `FoundryToolbox`, the JS `FoundryToolbox` takes a toolbox **name**, not a raw `TOOLBOX_ENDPOINT` URL. Set `TOOLBOX_NAME` to the name you gave the toolbox when you created it (e.g. `agent-tools`). `FOUNDRY_*` names are reserved by the hosted platform and must not be declared in `agent.yaml`.

## Creating the toolbox

This sample consumes a toolbox over its MCP endpoint. It bundles a [`toolbox.yaml`](toolbox.yaml) that defines 6 tools behind one endpoint:

- **Web search**, which grounds responses in real-time public web results.
- **Code interpreter**, which executes Python code in a secure sandbox and returns the output.
- **Azure Specs MCP**, which demonstrates connecting to an MCP server that doesn't require authentication.
- **GitHub MCP**, which demonstrates connecting to the GitHub MCP server using either a Personal Access Token (PAT) or OAuth2 (switch by changing the `project_connection_id` in `toolbox.yaml`).
- **Azure Language MCP with agent identity**, which demonstrates connecting to the Azure Language MCP server using agent identity for authentication.
- **Microsoft Foundry MCP with Entra pass-through**, which demonstrates connecting to the Microsoft Foundry MCP server using Entra pass-through for authentication.

### Creating connections

Before creating the toolbox, create project connections for any tools that require authentication (used in `toolbox.yaml`):

```powershell
# GitHub MCP with a PAT
azd ai connection create ghmcppat --kind remote-tool --target https://api.githubcopilot.com/mcp --auth-type custom-keys --custom-key "Authorization=Bearer <github_pat>" -p https://<account>.services.ai.azure.com/api/projects/<project>

# GitHub MCP with OAuth2 (optional alternative; switch project_connection_id in toolbox.yaml)
azd ai connection create ghmcpoauth --kind remote-tool --target https://api.githubcopilot.com/mcp --auth-type oauth2 --connector-name foundrygithubmcp -p https://<account>.services.ai.azure.com/api/projects/<project>

# Azure Language MCP with agent identity
azd ai connection create langmcpconn --kind remote-tool --target https://<language-service>.cognitiveservices.azure.com/language/mcp?api-version=2025-11-15-preview --auth-type project-managed-identity --audience https://cognitiveservices.azure.com/ -p https://<account>.services.ai.azure.com/api/projects/<project>

# Microsoft Foundry MCP with Entra pass-through
azd ai connection create foundrymcpconn --kind remote-tool --target https://mcp.ai.azure.com --auth-type user-entra-token --audience https://mcp.ai.azure.com -p https://<account>.services.ai.azure.com/api/projects/<project>
```

> An Entra pass-through connection requires an **audience** — the Entra resource the MCP server validates tokens against. For the Microsoft Foundry MCP server, read it from `https://mcp.ai.azure.com/.well-known/oauth-protected-resource` (`resource`: `https://mcp.ai.azure.com`). For connector-backed MCP servers (e.g. Microsoft 365 / WorkIQ), look up the audience with the helper scripts in [`scripts/`](scripts/): run `./scripts/list-foundry-connectors.ps1 -ConnectorName <name>` (or `./scripts/list-foundry-connectors.sh -n <name>`) and read `AzureActiveDirectoryResourceId` under `properties.x-ms-connection-parameters`.

### Creating the toolbox

Create the toolbox once from [`toolbox.yaml`](toolbox.yaml):

```bash
azd ai toolbox create agent-tools --from-file ./toolbox.yaml --project-endpoint https://<account>.services.ai.azure.com/api/projects/<project>
```

The first version becomes the default automatically. Set the toolbox name in your environment:

```bash
TOOLBOX_NAME=agent-tools
```

You can also create a Foundry Toolbox in the Foundry portal — see the [toolbox documentation](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox).

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- A toolbox registered in the project (see above)
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your project endpoint and toolbox name
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What tools do you have?"}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t foundry-toolbox-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Troubleshooting

### A single failing MCP source can fail the whole agent

A toolbox aggregates every tool source behind one MCP endpoint. If **any** referenced MCP server fails while the toolbox enumerates tools (`tools/list`), the toolbox fails the entire enumeration, so the agent can't load its tools and the request returns an error until that source recovers. Because this sample builds the agent in a factory, only the failing request errors — the container stays ready, and the next request retries the enumeration.

- Retry the request — these failures are usually transient.
- If a source is persistently unavailable, temporarily remove its tool entry (and connection) from `toolbox.yaml` and recreate the toolbox.

### Entra pass-through forwards the caller's identity

The Foundry MCP tool authenticates with **Entra pass-through** (`foundrymcpconn`): Foundry forwards the calling user's Entra token to `https://mcp.ai.azure.com`, so the tools operate as that user and only act on resources the user can already access. Running the agent **locally** uses whatever identity your `az login` represents; when hosted, the agent's managed identity. If that identity has no access to the target resources, the tool returns an authorization error even though it is discovered and called correctly.

## Next steps

- [Basic agent](../01-basic/) — minimal agent with no tools
- [Add local tools](../02-tools/) — sample with locally-defined tool functions
- [Tool catalog](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/tool-catalog) — browse available tools to extend your agent
