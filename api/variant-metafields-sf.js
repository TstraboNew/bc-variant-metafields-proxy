// File: api/variant-metafields-sf.js
// GET /api/variant-metafields-sf?productId=1348
// Reads variant metafields via Storefront GraphQL (works with write_and_sf_access)
// Auth: Use ONLY X-Auth-Token (Storefront API token). Do NOT send Authorization: Bearer.

// ── Env ────────────────────────────────────────────────────────────────────────
const BC_STORE_HASH = process.env.BC_STORE_HASH;          // e.g., "nd9gle6d6h"
const BC_SF_TOKEN   = process.env.BC_SF_TOKEN;            // Storefront API token (token value, NOT client id)
const BC_CHANNEL_ID = process.env.BC_CHANNEL_ID || "";    // OPTIONAL: numeric channel id, e.g., "1"
const BC_SF_GRAPHQL_ENDPOINT = process.env.BC_SF_GRAPHQL_ENDPOINT || ""; // OPTIONAL: full URL, e.g., "https://yourdomain.com/graphql"

// Default endpoint if override is not provided:
const DEFAULT_GQL_ENDPOINT = (hash) => `https://store-${hash}.mybigcommerce.com/graphql`;
const RESOLVED_ENDPOINT = BC_SF_GRAPHQL_ENDPOINT || (BC_STORE_HASH ? DEFAULT_GQL_ENDPOINT(BC_STORE_HASH) : "");

// Customize to your fields
const NAMESPACE   = 'SecondaryDesc';
const TARGET_KEYS = ['Secondary Attribute Description'];

// ── Handlers ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // TEMP debug: verify env vars are visible at runtime (remove when done)
    if (req.query.debug === 'env') {
      const token = BC_SF_TOKEN || '';
      const masked = token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '';
      return res.status(200).json({
        hasStoreHash: !!BC_STORE_HASH,
        hasSfToken: !!BC_SF_TOKEN,
        hasChannelId: !!BC_CHANNEL_ID,
        endpoint: RESOLVED_ENDPOINT || null,
        tokenPreview: masked,
        note: "If hasSfToken=false or endpoint is null after redeploy, check Vercel env scope/project."
      });
    }

    // TEMP debug: fire a trivial GQL to confirm auth is actually sent/accepted
    if (req.query.debug === 'ping') {
      const hdrs = {
        'Content-Type': 'application/json',
        'X-Auth-Token': BC_SF_TOKEN || '',
      };
      if (BC_CHANNEL_ID) hdrs['X-Channel-Id'] = BC_CHANNEL_ID;

      const pingQuery = `query { site { settings { storeName } } }`;
      const pingRes = await fetch(RESOLVED_ENDPOINT, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ query: pingQuery }),
      });
      const pingText = await pingRes.text();
      return res.status(pingRes.status).send(pingText);
    }

    // Validate env
    if (!BC_SF_TOKEN) {
      return res.status(500).json({
        error: 'Server env not set: missing BC_SF_TOKEN (Storefront API token).',
        details: { hasSfToken: !!BC_SF_TOKEN }
      });
    }
    if (!RESOLVED_ENDPOINT) {
      return res.status(500).json({
        error: 'Server env not set: missing BC_STORE_HASH or BC_SF_GRAPHQL_ENDPOINT.',
        details: { hasStoreHash: !!BC_STORE_HASH, endpoint: RESOLVED_ENDPOINT || null }
      });
    }

    // Inputs
    const id = Number(req.query.productId);
    if (!id) {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }

    // GraphQL
    const query = `
      query VariantMetafields($productId: Int!, $namespace: String!, $keys: [String!]!) {
        site {
          product(entityId: $productId) {
            entityId
            variants(first: 250) {
              edges {
                node {
                  entityId
                  sku
                  metafields(namespace: $namespace, keys: $keys) {
                    edges {
                      node {
                        key
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const variables = {
      productId: id,
      namespace: NAMESPACE,
      keys: TARGET_KEYS,
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Auth-Token': BC_SF_TOKEN,      // IMPORTANT: Storefront API token goes here
      'Accept': 'application/json',
    };
    // Some multi-storefront setups require this header to target the channel explicitly
    if (BC_CHANNEL_ID) headers['X-Channel-Id'] = BC_CHANNEL_ID;

    const gqlRes = await fetch(RESOLVED_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const text = await gqlRes.text();
    if (!gqlRes.ok) {
      return res.status(gqlRes.status).json({ error: 'Storefront GraphQL error', body: text });
    }

    const json = JSON.parse(text);
    if (json.errors?.length) {
      return res.status(502).json({ error: 'GraphQL errors', details: json.errors });
    }

    const edges = json?.data?.site?.product?.variants?.edges ?? [];
    const variants = edges.map(({ node }) => ({
      variantId: node.entityId,
      sku: node.sku,
      metafields: (node.metafields?.edges ?? []).map(e => e.node), // [{ key, value }]
    }));

    return res.status(200).json({ productId: id, variants });
  } catch (err) {
    return res.status(500).json({ error: 'Unhandled error', details: err?.message || String(err) });
  }
};
