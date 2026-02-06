// /api/variant-metafield.js
export default async function handler(req, res) {
  try {
    // Basic allowlist and validation
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { variantId, namespace, key } = req.query;

    if (!variantId) return res.status(400).json({ error: "variantId is required" });

    // Defaults (you can change later)
    const mfNamespace = namespace || "SecondaryDesc";
    const mfKey = key || "Secondary Attribute Description";

    // Required secrets from Vercel env vars
    const STORE_HASH = process.env.BC_STORE_HASH;
    const ADMIN_TOKEN = process.env.BC_ADMIN_API_TOKEN;

    if (!STORE_HASH || !ADMIN_TOKEN) {
      return res.status(500).json({ error: "Server not configured. Missing BC_STORE_HASH or BC_ADMIN_API_TOKEN." });
    }

    const url = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/catalog/variants/${variantId}/metafields`;

    const bcResp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": ADMIN_TOKEN,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    if (!bcResp.ok) {
      const text = await bcResp.text();
      return res.status(bcResp.status).json({ error: "BigCommerce error", details: text });
    }

    const data = await bcResp.json();
    const items = data?.data || [];

    // Find the metafield by namespace + key
    const match = items.find(mf => mf.namespace === mfNamespace && mf.key === mfKey);

    if (!match) {
      return res.status(200).json({ variantId: Number(variantId), namespace: mfNamespace, key: mfKey, value: null });
    }

    return res.status(200).json({
      variantId: Number(variantId),
      namespace: match.namespace,
      key: match.key,
      value: match.value
    });
  } catch (err) {
    return res.status(500).json({ error: "Unexpected error", details: err?.message || String(err) });
  }
}
