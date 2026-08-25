// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Provision the Microsoft Foundry Memory Store used by this sample.
 *
 * Creates the memory store named by `MEMORY_STORE_NAME` if it does not
 * already exist. The store is configured with the user-profile capability so
 * the agent can remember stable facts about a user across sessions;
 * chat-summary is disabled to keep the demo focused on durable preferences.
 * Safe to re-run: if a store with the same name already exists, the script
 * leaves it alone.
 *
 * Usage (from this directory, with `az login` done):
 *
 *     npm run provision
 *
 * Pass `--reset <user-id>` to also erase everything stored for one user,
 * which is how you get a clean slate while trying the sample out:
 *
 *     npm run provision -- --reset <user-id>
 *
 * Required env vars (read from the required local `.env` file):
 *
 *     FOUNDRY_PROJECT_ENDPOINT                  e.g. https://<account>.services.ai.azure.com/api/projects/<project>
 *     AZURE_AI_MODEL_DEPLOYMENT_NAME            Chat model deployment used by the memory store
 *     AZURE_AI_EMBEDDING_MODEL_DEPLOYMENT_NAME  Embedding model deployment used by the memory store
 *     MEMORY_STORE_NAME                         Name of the memory store to create
 *
 * Your identity needs `Foundry User` and `Cognitive Services OpenAI User`
 * on the Foundry project scope.
 */

import { AgentSession, message } from '@polymind-inc/agent-framework';
import type { ProviderRunContext } from '@polymind-inc/agent-framework';
import { FoundryMemoryProvider } from '@polymind-inc/agent-framework/foundry';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set.`);
  }
  return value;
}

const projectEndpoint = requireEnv('FOUNDRY_PROJECT_ENDPOINT');
const memoryStoreName = requireEnv('MEMORY_STORE_NAME');
const chatModel = requireEnv('AZURE_AI_MODEL_DEPLOYMENT_NAME');
const embeddingModel = requireEnv('AZURE_AI_EMBEDDING_MODEL_DEPLOYMENT_NAME');

// The scope is irrelevant to provisioning — no run happens here — but it is a
// required part of the provider's contract, so the script names the user it
// may also be asked to reset.
const resetIndex = process.argv.indexOf('--reset');
const resetUser = resetIndex === -1 ? undefined : process.argv[resetIndex + 1];
const memory = new FoundryMemoryProvider({
  projectEndpoint,
  memoryStoreName,
  scope: resetUser ?? 'provisioning',
  failureMode: 'throw',
});

const created = await memory.ensureMemoryStoreCreated(
  {
    kind: 'default',
    chat_model: chatModel,
    embedding_model: embeddingModel,
    options: {
      chat_summary_enabled: false,
      user_profile_enabled: true,
      user_profile_details:
        'Avoid irrelevant or sensitive data, such as age, financials, precise location, and credentials',
    },
  },
  { description: 'Memory store for the Agent Framework foundry-hosted memory sample' },
);

if (created) {
  console.log(`Created memory store '${memoryStoreName}'.`);
} else {
  console.log(`Memory store '${memoryStoreName}' already exists; validating its model configuration.`);
}

// Verify the store actually exists on the service by reading it back.
// `ensureMemoryStoreCreated` reports what it did, but a follow-up `get`
// confirms the store is persisted and reachable for the agent at runtime.
const verified = await memory.getMemoryStore();
if (verified === undefined) {
  throw new Error(
    `Memory store '${memoryStoreName}' was not found after creation; ` +
      'the service may not have persisted it.',
  );
}
console.log(
  `Verified memory store '${verified.name ?? memoryStoreName}' is available on the service (id=${verified.id ?? 'unknown'}).`,
);

const existingDefinition = verified.definition;
if (
  existingDefinition !== undefined &&
  (existingDefinition.chat_model !== chatModel || existingDefinition.embedding_model !== embeddingModel)
) {
  throw new Error(
    `Memory store '${memoryStoreName}' uses chat='${existingDefinition.chat_model}' and ` +
      `embedding='${existingDefinition.embedding_model}', but .env requests chat='${chatModel}' and ` +
      `embedding='${embeddingModel}'. Set MEMORY_STORE_NAME to a new store name or restore the matching model values.`,
  );
}

// A store can exist while its downstream chat/embedding authorization is
// broken. Exercise the same profile-search path the runtime uses so `provision`
// fails now instead of letting the agent silently behave as stateless later.
const verificationContext: ProviderRunContext = {
  agent: { id: 'memory-store-provisioning-check' },
  session: new AgentSession(),
  state: {},
  // A user message is required: with no input the provider has nothing to
  // search for and `beforeRun` can succeed without reaching the embedding
  // deployment at all.
  inputMessages: [message('user', 'memory store provisioning connectivity check')],
  extendMessages: () => {},
  extendInstructions: () => {},
  extendTools: () => {},
};

try {
  await memory.beforeRun(verificationContext);
  console.log(`Verified memory store '${memoryStoreName}' can search through its model deployments.`);
} catch (error) {
  throw new Error(
    `Memory store '${memoryStoreName}' exists but cannot search. Verify that the caller has ` +
      `'Foundry User' and 'Cognitive Services OpenAI User' on the project, and that both model ` +
      `deployment names in .env are valid. If those checks pass, choose a new MEMORY_STORE_NAME ` +
      `and provision a fresh store instead of reusing this unhealthy one.`,
    { cause: error },
  );
}

if (resetIndex !== -1) {
  if (resetUser === undefined) {
    throw new Error('--reset needs the user id whose memories should be erased.');
  }
  const erased = await memory.deleteStoredMemories(resetUser);
  console.log(erased ? `Erased the memories of '${resetUser}'.` : `'${resetUser}' had no memories.`);
}
