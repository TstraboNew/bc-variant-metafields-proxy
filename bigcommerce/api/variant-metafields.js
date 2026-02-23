export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({ error: "Missing productId" });
  }

  // ✅ Token is read from Vercel env vars (never exposed)
  const token = process.env.BIGCOMMERCE_STOREFRONT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "Storefront token not configured" });
  }

  const query = `
    query VariantMetafields($id: Int!) {
      site {
        product(entityId: $id) {
          variants(first: 50) {
            edges {
              node {
                sku
                metafields(
                  namespace: "SecondaryDesc"
                  keys: ["Secondary Attribute Description"]
                  first: 1
                ) {
                  edges {
                    node {
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

  try {
    const response = await fetch(
      "https://store-nd9gle6d6h.mybigcommerce.com/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          query,
          variables: { id: Number(productId) },
        }),
      }
    );

    const data = await response.json();

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: "GraphQL request failed",
      details: err.message,
    });
  }
}
