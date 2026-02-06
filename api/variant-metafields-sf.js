// File: api/variant-metafields-sf.js
// GET /api/variant-metafields-sf?productId=1348
// Reads variant metafields via Storefront GraphQL (works with write_and_sf_access)

// ── Environment ────────────────────────────────────────────────────────────────
const BC_STORE_HASH = process.env.BC_STORE_HASH;               // e.g., "nd9gle6d6h"
const BC_SF_TOKEN   = process.env.BC_SF_TOKEN;                 // Storefront API token (Token value, NOT Client ID)
const BC_SF_GRAPHQL_ENDPOINT = process.env.BC_SF_GRAPHQL_ENDPOINT || ""; 
// You set this to: https://store-nd9gle6d6h.mybigcommerce.com/graphql

// Fallback to store-hash endpoint if override not provided (you already provided it)
const DEFAULT_GQL_ENDPOINT = (hash) => `https://store-${hash}.mybigcommerce.com/graphql`;
const RESOLVED_ENDPOINT = BC_SF_GRAPHQL_ENDPOINT || (BC_STORE_HASH ? DEFAULT_GQL_ENDPOINT(BC_STORE_HASH) : "");

// Customize to your metafields
const NAMESPACE   = "SecondaryDesc";
const TARGET_KEYS = ["Secondary Attribute Description"];

// ── Handler ────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- Debug: verify env vars (safe) ---
    if (req.query.debug === "env") {
      const token = BC_SF_TOKEN || "";
      const masked = token ? `${token.slice(0,4)}…${token.slice(-4)}` : "";
      return res.status(200).json({
        hasStoreHash: !!BC_STORE_HASH,
        hasSfToken: !!BC_SF_TOKEN,
        endpoint: RESOLVED_ENDPOINT || null,
        tokenPreview: masked,
      });
    }

    // --- Debug: minimal ping to confirm BigCommerce accepts headers from this function ---
    if (req.query.debug === "ping") {
      if (!BC_SF_TOKEN || !RESOLVED_ENDPOINT) {
        return res.status(500).json({
          error: "Missing envs",
          details: { hasSfToken: !!BC_SF_TOKEN, endpoint: RESOLVED_ENDPOINT || null },
        });
      }

      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        // Send both casings (paranoid mode) to avoid any edge cases
        "X-Auth-Token": BC_SF_TOKEN,
        "x-auth-token": BC_SF_TOKEN,
      };

      const pingQuery = `query { site { settings { storeName } } }`;

      const pingRes = await fetch(RESOLVED_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: pingQuery }),
      });

      const body = await pingRes.text();
      // Return upstream status and body verbatim so we can see exactly what BC says
      res.status(pingRes.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(body);
    }

    // Validate envs for normal operation
    if (!BC_SF_TOKEN) {
      return res.status(500).json({ error: "Missing BC_SF_TOKEN (Storefront API token)" });
    }
    if (!RESOLVED_ENDPOINT) {
      return res.status(500).json({ error: "Missing RESOLVED_ENDPOINT (set BC_SF_GRAPHQL_ENDPOINT or BC_STORE_HASH)" });
    }

    const productId = Number(req.query.productId);
    if (!productId) {
      return res.status(400).json({ error: "Missing or invalid productId" });
    }

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      // IMPORTANT: Storefront API token ONLY goes in X-Auth-Token (and lower-case duplicate)
      "X-Auth-Token": BC_SF_TOKEN,
      "x-auth-token": BC_SF_TOKEN,
    };

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
      productId,
      namespace: NAMESPACE,
      keys: TARGET_KEYS,
    };

    const gqlRes = await fetch(RESOLVED_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const text = await gqlRes.text();
    if (!gqlRes.ok) {
      // Bubble up upstream response for transparency
      return res.status(gqlRes.status).json({ error: "Storefront GraphQL error", body: text });
    }

    const json = JSON.parse(text);
    if (json.errors?.length) {
      return res.status(502).json({ error: "GraphQL errors", details: json.errors });
    }

    const edges = json?.data?.site?.product?.variants?.edges ?? [];
    const variants = edges.map(({ node }) => ({
      variantId: node.entityId,
      sku: node.sku,
      metafields: (node.metafields?.edges ?? []).map(e => e.node), // [{ key, value }]
    }));

    return res.status(200).json({ productId, variants });
  } catch (err) {
    return res.status(500).json({ error: "Unhandled error", details: err?.message || String(err) });
  }
};
