# Content Safety Guardrail (Responses Protocol) — TypeScript

An [Agent Framework](https://github.com/microsoft/agent-framework) agent hosted on Microsoft Foundry using the **Responses protocol**, with a Responsible AI (RAI) **content safety guardrail** attached, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). The guardrail screens the prompts the agent receives and the responses it returns against an RAI policy, so harmful content is filtered according to your safety configuration.

Ported from the Python sample [`hosted-agents/agent-framework/responses/16-content-safety-guardrail`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/16-content-safety-guardrail).

## How it works

The agent itself is the basic `FoundryChatClient` agent served via `ResponsesHostServer` — see [src/main.ts](src/main.ts). The guardrail is **not** code; it's a definition-level setting. The agent definition ([agent.yaml](agent.yaml)) declares a `policies` list with a `rai_policy` entry that points to an RAI policy by its full Azure Resource Manager (ARM) resource ID:

```yaml
policies:
  - type: rai_policy
    raiPolicyName: /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.CognitiveServices/accounts/<account>/raiPolicies/<policy-name>
```

The platform applies that policy to the agent at runtime. Omit the `policies` block entirely to deploy the agent without a content safety guardrail. `raiPolicyName` is **required** on every `rai_policy` entry. To use the built-in default policy, give its full ARM resource ID with `Microsoft.DefaultV2` as the policy name, scoped to the account that hosts your agent.

For a conceptual overview, see [Add a content safety guardrail to a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-hosted-agent-guardrails).

> [!WARNING]
> Don't rely on deploy-time validation to catch a bad policy ID. On many subscriptions an agent that points at a policy that doesn't exist — including the `<subscription-id>`/`<policy-name>` placeholder that ships in [agent.yaml](agent.yaml) — deploys successfully and reports `active`, but **no content filtering is applied**: the guardrail fails open and harmful prompts reach the agent. Always replace the placeholder with a real policy ID and run [Verify the guardrail](#verify-the-guardrail) before you rely on this agent's content safety.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`
- An RAI policy created on your Foundry resource, and its full ARM resource ID. To create one, see [Configure guardrails and controls](https://learn.microsoft.com/en-us/azure/foundry/guardrails/how-to-create-guardrails). The ARM resource ID has this form:

  ```text
  /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.CognitiveServices/accounts/<account>/raiPolicies/<policy-name>
  ```

## Run locally

The guardrail is applied by the Foundry platform, so a local run behaves like the basic agent — no content filtering happens on your machine.

```bash
npm install
cp .env.example .env   # then fill in your project endpoint
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"Write a short friendly hello message."}'
```

## Deploy to Foundry

Set `raiPolicyName` in [agent.yaml](agent.yaml) to your RAI policy's full ARM resource ID (the full ID, not the bare policy name). Then build the self-contained bundle and the container image, and deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t content-safety-guardrail-agent .
```

The platform applies the guardrail when it creates the agent version. For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Verify the guardrail

After deployment, confirm the guardrail filters content by sending a benign prompt and a prompt that violates your policy to the agent's Responses endpoint. The platform screens prompts at the input stage and rejects a violating prompt before the agent runs.

A prompt that passes the policy returns `HTTP 200` with the agent's response. A blocked prompt returns `HTTP 400` with a `content_filter` error:

```json
{
  "error": {
    "code": "content_filter",
    "message": "The request was blocked due to content safety policy violation at input stage.",
    "type": "content_safety_error"
  }
}
```

If a violating prompt isn't blocked, check in this order:

1. `raiPolicyName` names a policy that **actually exists** on your account. A nonexistent policy (including the shipped placeholder) fails open with no error. List the policies on your account and confirm the final segment of `raiPolicyName` matches one of them:

   ```bash
   az rest --method get \
     --url "https://management.azure.com/subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.CognitiveServices/accounts/<account>/raiPolicies?api-version=2024-10-01" \
     --query "value[].name" -o tsv
   ```

2. The policy is configured to filter the relevant content category and severity, with `source: Prompt` for input-stage filtering.

The guardrail applies to streaming requests too. With `"stream": true`, a violating prompt is rejected with the same `HTTP 400` before any SSE event is emitted.

## Next steps

- [Add a content safety guardrail to a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/add-hosted-agent-guardrails) — set a guardrail with `azd`, the SDK, or REST
- [Guardrails and controls overview](https://learn.microsoft.com/en-us/azure/foundry/guardrails/guardrails-overview) — what guardrails are and the risks they detect
- [Basic hosted agent](../01-basic/) — the agent this sample builds on
