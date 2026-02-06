// File: api/variant-metafields-sf.js
// GET /api/variant-metafields-sf?productId=1348
// Reads variant metafields via Storefront GraphQL (works even if metafields use write_and_sf_access)

const BC_STORE_HASH = process.env.BC_STORE_HASH; // e.g., nd9gle6d6h
const BC_SF_TOKEN  = process.env.BC_SF_TOKEN;   // Storefront API token (channel-specific)
const GQL_ENDPOINT = (hash) => `https://store-${hash}.mybigcommerce.com/graphql`;

// Customize to your fields
const NAMESPACE   = 'SecondaryDesc';
const TARGET_KEYS = ['Secondary Attribute Description'];

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // TEMP debug gate to confirm the env is set correctly
    if (req.query.debug === 'env') {
      const token = BC_SF_TOKEN || '';
      const masked = token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '';
      return res.status(200).json({
        hasStoreHash: !!BC_STORE_HASH,
        hasSfToken: !!BC_SF_TOKEN,
        tokenPreview: masked,
        note: "If hasSfToken=false or tokenPreview is empty after redeploy, check Vercel env scope/project."
      });
    }

    const id = Number(req.query.productId);
    if (!BC_STORE_HASH || !BC_SF_TOKEN) {
      return res.status(500).json({
        error: 'Server env not set',
        details: { hasStoreHash: !!BC_STORE_HASH, hasSfToken: !!BC_SF_TOKEN },
      });
    }
    if (!id) {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }

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

    const gqlRes = await fetch(GQL_ENDPOINT(BC_STORE_HASH), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Send both auth styles; some configurations prefer Authorization: Bearer
        'X-Auth-Token': BC_SF_TOKEN,
        'Authorization': `Bearer ${BC_SF_TOKEN}`,
      },
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
