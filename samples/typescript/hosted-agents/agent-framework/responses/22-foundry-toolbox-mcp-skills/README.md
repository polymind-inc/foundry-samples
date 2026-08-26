# Foundry Toolbox MCP Skills (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent that discovers **Agent Skills attached to a Foundry Toolbox** over the **MCP protocol** and exposes them to the model using the [Agent Skills](https://agentskills.io/) progressive-disclosure pattern, hosted on Microsoft Foundry using the **Responses protocol**. Ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`).

Ported from the Python sample [`hosted-agents/agent-framework/responses/22-foundry-toolbox-mcp-skills`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/22-foundry-toolbox-mcp-skills).

This sample is **self-contained**: it ships the `SKILL.md` sources under [skills/](skills/) and a [toolbox.yaml](toolbox.yaml), and walks you through creating the skills and the toolbox from zero with `azd` — you don't need an existing toolbox to run it.

## How it works

[src/main.ts](src/main.ts):

1. Constructs a `FoundryToolbox({ projectEndpoint, name, loadTools: false })`. The toolbox derives its MCP endpoint from the project endpoint and the toolbox name, authenticates every request with `DefaultAzureCredential`, and forwards the platform per-request call-id. `loadTools: false` keeps the toolbox's tools hidden so only its Agent Skills are surfaced — `getTools()` answers with an empty list without ever asking the gateway.
2. Builds the agent through an **async factory** passed to `ResponsesHostServer`, so construction-time work (and any consent-gated refusal) happens on the first request instead of keeping `/readiness` red at startup.
3. Wires `tools: await toolbox.getTools()` **and** `contextProviders: [toolbox.asSkillsProvider(...)]`. The provider discovers skills from the well-known `skill://index.json` resource on the toolbox's MCP session and fetches `SKILL.md` bodies on demand via `resources/read`.
4. Relaxes `load_skill` approval to `never_require` — the analogue of Python's `disable_load_skill_approval=True`. This unattended, session-less host has no one to answer an approval request mid-turn.

### How progressive disclosure works

1. **Advertise** — each skill's name and description are injected into the system prompt so the model knows what is available (~100 tokens per skill).
2. **Load** — when the model decides a skill is relevant, it retrieves the full `SKILL.md` body on demand via `resources/read`.

### The bundled skills

| Skill | Purpose |
|---|---|
| [`support-style`](skills/support-style/SKILL.md) | Voice, formatting, and signature rules for Contoso Outdoors support replies. |
| [`escalation-policy`](skills/escalation-policy/SKILL.md) | When and how to escalate a customer ticket, including the refund-authority matrix. |

Each file includes a unique `*-CANARY-*` token the model is asked to echo, so a response proves the model actually **loaded** the skill rather than hallucinating: `STYLE-CANARY-3318` for `support-style`, `ESC-CANARY-7742` for `escalation-policy`.

> The `name` and `description` values in the YAML front matter must be **unquoted** — quoting them causes the Skills API to reject the import.

### Deviations from the Python sample

- **Toolbox addressing:** the Python sample reads a full versioned MCP URL from `TOOLBOX_ENDPOINT`. agent-framework-js's `FoundryToolbox` instead takes the **toolbox name** (`TOOLBOX_NAME`) plus `FOUNDRY_PROJECT_ENDPOINT` and derives `<endpoint>/toolboxes/<name>/mcp?api-version=v1`, which always targets the toolbox's **default version** rather than a pinned one. `FOUNDRY_*` names are reserved by the hosted platform, so the user-configurable name deliberately uses no reserved prefix.
- **Approvals:** Python's `disable_load_skill_approval=True` maps to `approvals: { loadSkill: 'never_require' }`. This sample additionally relaxes `readSkillResource`, matching the upstream agent-framework-js toolbox-skills example, so a multi-file (archive) skill would not stall the unattended host either. `run_skill_script`'s default approval is left alone — toolbox skills carry no runnable scripts.

## Prerequisites

1. An existing Foundry project with a deployed model.
2. Node.js >= 24.
3. **Roles (RBAC):** the identity running the sample (and, in production, the Managed Identity running the container) needs the **Foundry User** role on the Foundry project. This covers creating skills, creating the toolbox, and discovering skills over MCP at runtime.
4. A Foundry Toolbox that serves the two bundled skills — see [Building the toolbox from zero](#building-the-toolbox-from-zero).
5. Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`.

## Building the toolbox from zero

Run these commands from this sample directory, where `toolbox.yaml` and `skills/` live. You need the [Azure Developer CLI](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/install-azd) with the Foundry extension (`azd ext install microsoft.foundry`, `azd auth login`).

Point `azd` at your project once:

```bash
azd ai project set "https://<account>.services.ai.azure.com/api/projects/<project>"
```

### Step 1 — Create the skills in Foundry

```bash
azd ai skill create support-style     --file ./skills/support-style/SKILL.md     --no-prompt
azd ai skill create escalation-policy --file ./skills/escalation-policy/SKILL.md --no-prompt
```

### Step 2 — Create the toolbox

```bash
azd ai toolbox create maf-skills-toolbox --from-file ./toolbox.yaml --no-prompt
```

> **Why a placeholder tool?** `azd ai toolbox create` requires at least one `tools` or `connections` entry, so the bundled `toolbox.yaml` includes a single connectionless `code_interpreter` tool. Because the agent builds the toolbox with `loadTools: false`, that tool is never surfaced to the model — only the skills are.

### Step 3 — Store the toolbox name

Put the toolbox name in your `.env` (see [.env.example](.env.example)):

```bash
TOOLBOX_NAME=maf-skills-toolbox
```

Unlike the Python sample, no endpoint URL needs to be copied — the agent derives it from `FOUNDRY_PROJECT_ENDPOINT` and the name.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in endpoint, model, and toolbox name
npm run dev
```

Invoke the local agent from another terminal:

```bash
# Discover what the toolbox advertises (advertise step only)
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What skills do you have available?"}'

# Routine question -> loads support-style
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Hi, I am Alex. Can I return my tent within 30 days?"}'

# Large refund + legal threat -> loads escalation-policy (which includes the refund matrix)
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"I want a $750 refund on Order #A-1042 right now or I am calling my lawyer."}'
```

| Prompt mentions | Skill that should drive the response | Canary you should see |
|---|---|---|
| Routine return / shipping / care question | `support-style` | `STYLE-CANARY-3318` |
| Injury, legal threat, press, or refund > $500 | `escalation-policy` (+ `support-style`) | `ESC-CANARY-7742` |

Because skills are loaded on demand, a canary token in a response proves the model actually invoked `load_skill` for the matching skill — not that it merely saw the name in the advertised list.

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t toolbox-mcp-skills-agent .
```

The `skills/` folder and `toolbox.yaml` are authoring inputs only and are not copied into the image — the running agent discovers everything it needs from the toolbox MCP endpoint. Make sure the skills and toolbox exist in the **same** Foundry project you deploy to, and that `TOOLBOX_NAME` is set for the hosted container (see [agent.yaml](agent.yaml)). The deployed agent's Managed Identity needs the **Foundry User** role on the Foundry project. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `FOUNDRY_PROJECT_ENDPOINT` | yes | Foundry project endpoint; also the base the toolbox MCP endpoint is derived from. |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | yes | Model deployment name (`FOUNDRY_MODEL_NAME` also accepted). |
| `TOOLBOX_NAME` | yes | Name of the skills toolbox registered in the project. Replaces the Python sample's `TOOLBOX_ENDPOINT` URL. |
| `SAMPLE_AGENT_NAME` | no | The agent's display name. Defaults to `hosted-toolbox-mcp-skills`. |

## Troubleshooting

- **The agent reports no skills** — the toolbox is connected lazily on the first run. Verify `TOOLBOX_NAME` names a toolbox whose default version has both skills attached (`azd ai toolbox show maf-skills-toolbox`).
- **A skill is missing from the advertised list** — confirm the skill exists in the same Foundry project as the toolbox and that its `name:` front matter matches the name in `toolbox.yaml`.
- **Skill-loading requests hang** — if you removed the `approvals` relaxation, `load_skill` defaults to requiring approval, and this unattended host has no one to answer it. Keep `loadSkill: 'never_require'`.

## Next steps

- [07-skills](../07-skills/) — the same progressive-disclosure pattern with local file-based skills instead of a toolbox
