// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';

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

// The content safety guardrail is not code: it is the `policies` block in agent.yaml, which the
// platform applies to the agent at runtime. The agent itself is the basic Responses agent.
const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions: 'You are a friendly assistant. Keep your answers brief.',
  // History is managed by the hosting infrastructure, thus there is no need
  // to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

const server = new ResponsesHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);
