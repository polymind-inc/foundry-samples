// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Provision the Azure AI Foundry Memory Store used by this sample.
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
 * Required env vars (also read from a local `.env` file if present):
 *
 *     FOUNDRY_PROJECT_ENDPOINT                  e.g. https://<account>.services.ai.azure.com/api/projects/<project>
 *     AZURE_AI_MODEL_DEPLOYMENT_NAME            Chat model deployment used by the memory store
 *     AZURE_AI_EMBEDDING_MODEL_DEPLOYMENT_NAME  Embedding model deployment used by the memory store
 *     MEMORY_STORE_NAME                         Name of the memory store to create
 *
 * Your identity needs `Azure AI User` on the Foundry project scope.
 */

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
  console.log(`Memory store '${memoryStoreName}' already exists; leaving as-is.`);
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

if (resetIndex !== -1) {
  if (resetUser === undefined) {
    throw new Error('--reset needs the user id whose memories should be erased.');
  }
  const erased = await memory.deleteStoredMemories(resetUser);
  console.log(erased ? `Erased the memories of '${resetUser}'.` : `'${resetUser}' had no memories.`);
}
