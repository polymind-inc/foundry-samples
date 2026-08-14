// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { FoundryToolbox, ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

const modelName = process.env.AZURE_AI_MODEL_DEPLOYMENT_NAME ?? process.env.FOUNDRY_MODEL_NAME;
if (!modelName) {
  throw new Error(
    'Model deployment name is not configured. Set AZURE_AI_MODEL_DEPLOYMENT_NAME or FOUNDRY_MODEL_NAME.',
  );
}

const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
if (!projectEndpoint) {
  throw new Error('Set FOUNDRY_PROJECT_ENDPOINT to your Foundry project endpoint.');
}

const toolboxName = process.env.TOOLBOX_NAME;
if (!toolboxName) {
  throw new Error('Set TOOLBOX_NAME to the Foundry toolbox exposing the a2a_preview tool.');
}

// The toolbox exposes an `a2a_preview` tool that proxies calls to the remote
// A2A executor agent through the project's `RemoteA2A` connection.
// `FoundryToolbox` reaches it over the toolbox MCP endpoint
// ({project_endpoint}/toolboxes/{name}/mcp?api-version=v1) and authenticates
// each call with DefaultAzureCredential.
const toolbox = new FoundryToolbox({ name: toolboxName, projectEndpoint });

// An async agent factory keeps startup lazy: the toolbox's MCP `tools/list`
// runs on the first request rather than before the HTTP server is bound.
// A handshake still in flight at startup would otherwise keep `/readiness`
// red and fail every invocation with 424 session_not_ready (the Python
// sample works around the same race).
const server = new ResponsesHostServer({
  agent: async () =>
    new Agent({
      client: new FoundryChatClient({
        projectEndpoint,
        target: { modelDeployment: modelName },
      }),
      instructions:
        'You are a friendly concierge agent. When the user asks a question that ' +
        'is best answered by a specialist, delegate the request to the remote ' +
        'agent that is exposed through the A2A tool, then summarize the result ' +
        'back to the user in a concise, friendly tone. If no remote skill is ' +
        'relevant, answer directly.',
      tools: await toolbox.getTools(),
      // History is managed by the hosting infrastructure; we don't need
      // the service to store it. See:
      // https://developers.openai.com/api/reference/resources/responses/methods/create
      defaultOptions: { store: false },
    }),
});

const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);
