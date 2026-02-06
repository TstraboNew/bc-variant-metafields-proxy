// /api/variant-metafield.js
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { variantId, namespace, key } = req.query;
    if (!variantId) return res.status(400).json({ error: "variantId is required" });

    const mfNamespace = namespace || "SecondaryDesc";
    const mfKey = key || "Secondary Attribute Description";

    const STORE_HASH = process.env.BC_STORE_HASH;
    const ADMIN_TOKEN = process.env.BC_ADMIN_API_TOKEN;
    const OAUTH_CLIENT = process.env.BC_OAUTH_CLIENT_ID; // only if you're using an OAuth app (optional)

    if (!STORE_HASH || !ADMIN_TOKEN) {
      return res.status(500).json({ error: "Server not configured. Missing BC_STORE_HASH or BC_ADMIN_API_TOKEN." });
    }

    const url = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/catalog/variants/${variantId}/metafields`;

    // TEMP: log useful, non-sensitive info
    console.log("[BC PROXY] Requesting:", url);
    console.log("[BC PROXY] Using OAuth client id?", Boolean(OAUTH_CLIENT));

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Auth-Token": ADMIN_TOKEN
    };

    if (OAUTH_CLIENT) {
      headers["X-Auth-Client"] = OAUTH_CLIENT;
    }

    const bcResp = await fetch(url, { method: "GET", headers });
    const text = await bcResp.text();

    // TEMP: log status
    console.log("[BC PROXY] BC status:", bcResp.status);

    if (!bcResp.ok) {
      return res.status(bcResp.status).json({ error: "BigCommerce error", details: text });
    }

    const json = JSON.parse(text);
    const items = json?.data || [];
    const match = items.find(mf => mf.namespace === mfNamespace && mf.key === mfKey);

    return res.status(200).json({
      variantId: Number(variantId),
      namespace: match?.namespace || mfNamespace,
      key: match?.key || mfKey,
      value: match?.value ?? null
    });
  } catch (err) {
    console.error("[BC PROXY] Unexpected error:", err);
    return res.status(500).json({ error: "Unexpected error", details: err?.message || String(err) });
  }
}
