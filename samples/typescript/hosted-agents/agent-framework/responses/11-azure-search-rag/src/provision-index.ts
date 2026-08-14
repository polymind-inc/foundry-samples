// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

/**
 * Provision the Azure AI Search index used by this sample.
 *
 * Creates (or updates) the `contoso-outdoors` index with the schema documented
 * in README.md and seeds it with three Contoso Outdoors documents containing
 * unique canary tokens. Safe to re-run; existing documents are merged-or-uploaded.
 *
 * Usage (from this directory, with `az login` done):
 *
 *     npm run provision
 *
 * Required env vars (also read from a local `.env` file if present):
 *
 *     AZURE_SEARCH_ENDPOINT      e.g. https://<your-search>.search.windows.net
 *     AZURE_SEARCH_INDEX_NAME    e.g. contoso-outdoors
 *
 * Your identity needs `Search Service Contributor` (to create the index) and
 * `Search Index Data Contributor` (to upload documents) on the search service.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { SearchClient, SearchIndexClient } from '@azure/search-documents';
import type { SearchIndex } from '@azure/search-documents';

interface SearchDocument {
  id: string;
  sourceName: string;
  sourceLink: string;
  content: string;
}

const DOCUMENTS: SearchDocument[] = [
  {
    id: 'return-policy',
    sourceName: 'Contoso Outdoors Return Policy',
    sourceLink: 'https://contoso.com/policies/returns',
    content:
      'Customers may return any item within 30 days of delivery. Items should be ' +
      'unused and include original packaging. Refunds are issued to the original ' +
      'payment method within 5 business days of inspection. As a thank you, every ' +
      'accepted return ships back with a complimentary Contoso TrailRunner sticker ' +
      'pack, item code TR-CANARY-7821.',
  },
  {
    id: 'shipping-guide',
    sourceName: 'Contoso Outdoors Shipping Guide',
    sourceLink: 'https://contoso.com/help/shipping',
    content:
      'Standard shipping is free on orders over $50 and typically arrives in 3-5 ' +
      'business days within the continental United States. Expedited options are ' +
      'available at checkout. Use promo code SHIP-CANARY-4493 at checkout for a ' +
      'one-time free overnight upgrade on your first order.',
  },
  {
    id: 'tent-care',
    sourceName: 'TrailRunner Tent Care Instructions',
    sourceLink: 'https://contoso.com/manuals/trailrunner-tent',
    content:
      'Clean the tent fabric with lukewarm water and a non-detergent soap. Allow ' +
      'it to air dry completely before storage and avoid prolonged UV exposure to ' +
      'extend the lifespan of the waterproof coating. Replacement waterproofing ' +
      'kits are stocked under SKU TENT-CANARY-9067.',
  },
];

function buildIndex(name: string): SearchIndex {
  return {
    name,
    fields: [
      { name: 'id', type: 'Edm.String', key: true, filterable: true },
      { name: 'content', type: 'Edm.String', searchable: true, analyzerName: 'standard.lucene' },
      { name: 'sourceName', type: 'Edm.String', filterable: true },
      { name: 'sourceLink', type: 'Edm.String' },
    ],
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set.`);
  }
  return value;
}

/** Whether an Azure SDK error is a 404 (index not found). */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: unknown }).statusCode === 404
  );
}

const endpoint = requireEnv('AZURE_SEARCH_ENDPOINT');
const indexName = requireEnv('AZURE_SEARCH_INDEX_NAME');

const credential = new DefaultAzureCredential();
const indexClient = new SearchIndexClient(endpoint, credential);
const searchClient = new SearchClient<SearchDocument>(endpoint, indexName, credential);

try {
  await indexClient.getIndex(indexName);
  console.log(
    `Index '${indexName}' already exists; leaving schema as-is ` +
      '(delete the index manually to change the schema).',
  );
} catch (error) {
  if (!isNotFound(error)) {
    throw error;
  }
  console.log(`Creating index '${indexName}'...`);
  await indexClient.createIndex(buildIndex(indexName));
}

console.log(`Uploading ${DOCUMENTS.length} document(s)...`);
const { results } = await searchClient.mergeOrUploadDocuments(DOCUMENTS);
const failed = results.filter((r) => !r.succeeded).map((r) => [r.key, r.errorMessage]);
if (failed.length > 0) {
  throw new Error(`Failed to upload documents: ${JSON.stringify(failed)}`);
}

console.log('Done.');
