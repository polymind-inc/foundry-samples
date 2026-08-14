// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

import { Agent, tool } from '@polymind-inc/agent-framework';
import { serve } from '@polymind-inc/agent-framework/agentserver/node';
import { FoundryChatClient } from '@polymind-inc/agent-framework/foundry';
import { ResponsesHostServer } from '@polymind-inc/agent-framework/foundry/hosting';
import { z } from 'zod';

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const getWeather = tool({
  name: 'get_weather',
  description: 'Get the weather for a given location.',
  parameters: z.object({
    location: z.string().describe('The location to get the weather for.'),
  }),
  execute: ({ location }) => {
    const conditions = ['sunny', 'cloudy', 'rainy', 'stormy'] as const;
    const condition = conditions[randomInt(0, conditions.length - 1)];
    return `The weather in ${location} is ${condition} with a high of ${randomInt(10, 30)}°C.`;
  },
});

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

const agent = new Agent({
  client: new FoundryChatClient({
    projectEndpoint,
    target: { modelDeployment: modelName },
  }),
  instructions: 'You are a friendly assistant. Keep your answers brief.',
  tools: [getWeather],
  // History is managed by the hosting infrastructure, thus there is no need
  // to store history by the service. Learn more at:
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  defaultOptions: { store: false },
});

const server = new ResponsesHostServer({ agent });
const { port } = await serve(server);
console.log(`Agent host listening on 0.0.0.0:${port}`);
