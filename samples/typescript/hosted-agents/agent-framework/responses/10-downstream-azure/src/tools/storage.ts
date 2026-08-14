// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Azure Blob Storage tools.
 *
 * RBAC: the calling principal must have `Storage Blob Data Contributor` (or a
 * narrower equivalent) on the target container — see the sample README.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { tool } from '@polymind-inc/agent-framework';
import { z } from 'zod';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set.`);
  }
  return value;
}

function containerClient(): ContainerClient {
  const account = requireEnv('AZURE_STORAGE_ACCOUNT_NAME');
  const container = requireEnv('AZURE_STORAGE_CONTAINER_NAME');
  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  return service.getContainerClient(container);
}

/** Whether an Azure SDK error is a 404 (blob or container not found). */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: unknown }).statusCode === 404
  );
}

export const storagePutBlob = tool({
  name: 'storage_put_blob',
  description: 'Upsert a blob in the configured Azure Storage container.',
  approvalMode: 'never_require',
  parameters: z.object({
    name: z.string().describe('Blob name (acts as the key).'),
    content: z.string().describe('Blob content as text.'),
  }),
  execute: async ({ name, content }) => {
    const container = containerClient();
    const data = Buffer.from(content, 'utf-8');
    const blob = container.getBlockBlobClient(name);
    try {
      await blob.upload(data, data.byteLength);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      // The container does not exist yet; create it (ignoring a concurrent create) and retry.
      await container.createIfNotExists();
      await blob.upload(data, data.byteLength);
    }
    console.log(`Uploaded blob ${name} (${content.length} bytes)`);
    return `Uploaded blob '${name}'.`;
  },
});

export const storageGetBlob = tool({
  name: 'storage_get_blob',
  description: "Read a blob's content as text.",
  approvalMode: 'never_require',
  parameters: z.object({
    name: z.string().describe('Blob name to read.'),
  }),
  execute: async ({ name }) => {
    const container = containerClient();
    try {
      const buffer = await container.getBlockBlobClient(name).downloadToBuffer();
      return buffer.toString('utf-8');
    } catch (error) {
      if (isNotFound(error)) {
        return `No blob named '${name}'.`;
      }
      throw error;
    }
  },
});
