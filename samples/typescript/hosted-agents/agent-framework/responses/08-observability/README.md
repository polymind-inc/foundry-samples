# Observability (Responses Protocol) — TypeScript

An instrumented [Agent Framework](https://github.com/microsoft/agent-framework) agent hosted on Microsoft Foundry using the **Responses protocol**, ported to TypeScript with [agent-framework-js](https://github.com/polymind-inc/agent-framework-js) (`@polymind-inc/agent-framework`). Traces, metrics and logs flow to Application Insights / OTLP, and the included local tools (`get_weather`, `get_current_location`) make tool-execution spans show up in traces.

Ported from the Python sample [`hosted-agents/agent-framework/responses/08-observability`](https://github.com/microsoft-foundry/foundry-samples/tree/main/samples/python/hosted-agents/agent-framework/responses/08-observability).

## How it works

The agent uses `FoundryChatClient` and is served via `ResponsesHostServer`, which exposes a REST API compatible with the OpenAI Responses container protocol v2.0.0. See [src/main.ts](src/main.ts).

### Instrumentation

Agent Framework is **natively instrumented**: with no OTel SDK registered, spans go to the no-op tracer and cost nothing. `setupHostObservability()` (from `@polymind-inc/agent-framework/agentserver/observability`) configures the process's OTel pipeline for hosted operation — `serve` calls it automatically, and this sample also calls it explicitly to report which export paths are live. Exporters activate from the environment:

- `APPLICATIONINSIGHTS_CONNECTION_STRING` → Azure Monitor. Injected automatically when the agent is deployed to Foundry; set it locally to export from your machine.
- `OTEL_EXPORTER_OTLP_ENDPOINT` (or a per-signal endpoint) → OTLP.

Spans created by the framework's instrumentation, following the [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/):

- `invoke_agent`: the invocation of the agent, capturing start and end of processing.
- `chat`: the call to the underlying model.
- `execute_tool`: the execution of any tools invoked by the agent.

### Sensitive data

Prompt, completion and tool-argument content is only recorded on spans when you opt in. Set `ENABLE_SENSITIVE_DATA=true` (the same switch the Python framework honors, so one env var configures a polyglot deployment) or the standard `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`.

> **Deviations from the Python sample:** The Python framework gates all instrumentation behind `ENABLE_INSTRUMENTATION`; the TypeScript framework has no such switch — spans are always emitted and are simply inert (no-op tracer) until an exporter is configured, so only `ENABLE_SENSITIVE_DATA` is carried over. The log pipeline and Agent365 export are not implemented in the TypeScript host observability; traces and metrics are.

## Prerequisites

- Node.js >= 24
- An [Azure AI Foundry project](https://learn.microsoft.com/en-us/azure/ai-foundry/) with a model deployment
- Azure CLI signed in (`az login`) — auth uses `DefaultAzureCredential`
- Optional, for local telemetry export: an Application Insights resource (its connection string) or an OTLP endpoint

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your project endpoint (and optionally a telemetry connection string)
npm run dev
```

Invoke the local agent from another terminal:

```bash
curl -X POST localhost:8088/responses -H 'content-type: application/json' -d '{"input":"What is the weather where I am?"}'
```

## Deploy to Foundry

Build the container image (a multi-stage build compiles the bundle inside Docker), then deploy with your preferred flow (Foundry portal, VS Code Foundry Toolkit, or `az`):

```bash
docker build -t observability-responses-agent .
```

The agent definition is in [agent.yaml](agent.yaml). For the full deployment guide, see [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent).

## Viewing telemetry in Foundry

Once the agent is deployed to Foundry, `APPLICATIONINSIGHTS_CONNECTION_STRING` is injected and telemetry is collected automatically into the Application Insights resource associated with your Foundry project. In the Foundry UI, next to the **Playground** tab is the **Traces** tab, where you can find the conversations and their corresponding trace IDs; clicking a trace ID drills into the detailed trace for that conversation.

## Next steps

- [Basic agent](../01-basic/) — minimal agent with no tools
- [Add tools to your agent](../02-tools/) — sample with local tool functions
