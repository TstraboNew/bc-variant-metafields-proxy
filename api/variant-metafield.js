// /api/variant-metafield.js
//
// Minimal serverless proxy for reading a single variant metafield via
// BigCommerce Admin REST, without exposing credentials to the browser.
//
// Env vars required in Vercel Project Settings:
// - BC_STORE_HASH            (e.g., "abc123")
// - BC_ADMIN_API_TOKEN       (Admin API token with Products read scope)
// Optional (only if using an OAuth app token instead of API Account token):
// - BC_OAUTH_CLIENT_ID       (OAuth client_id; adds X-Auth-Client header)
// Optional domain allow-list for CORS (comma-separated):
// - ALLOWED_ORIGINS          (e.g., "https://www.yourstore.com,https://staging.yourstore.com")
// Optional lightweight shared secret for your storefront (recommended):
// - PROXY_API_KEY            (arbitrary string; send in header: x-proxy-key)
//
// Usage (GET):
//   /api/variant-metafield?variantId=7769&namespace=SecondaryDesc&key=Secondary%20Attribute%20Description
//
// Defaults if namespace/key omitted:
//   namespace = "SecondaryDesc"
//   key       = "Secondary Attribute Description"
//
// Returns:
//   200: { variantId, namespace, key, value }  // value may be null if not found
//   4xx/5xx with { error, details? } on failure
//

export default async function handler(req, res) {
  try {
    // --- Method guard --------------------------------------------------------
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- Basic CORS (allow-list) --------------------------------------------
    const allowed = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const origin = req.headers.origin;
    if (origin && allowed.length && allowed.includes(origin)) {
      // Allow only explicitly listed origins
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-proxy-key");
    }

    if (req.method === "OPTIONS") {
      // Preflight
      return res.status(204).end();
    }

    // --- Optional shared secret check ---------------------------------------
    const requiredKey = process.env.PROXY_API_KEY;
    if (requiredKey) {
      const provided = req.headers["x-proxy-key"];
      if (!provided || provided !== requiredKey) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // --- Params & defaults ---------------------------------------------------
    const { variantId, namespace, key } = req.query;

    if (!variantId || isNaN(Number(variantId))) {
      return res.status(400).json({ error: "variantId is required and must be a number" });
    }

    const mfNamespace = (namespace || "SecondaryDesc").toString();
    const mfKey = (key || "Secondary Attribute Description").toString();

    // --- Env vars ------------------------------------------------------------
    const STORE_HASH = process.env.BC_STORE_HASH;
    const ADMIN_TOKEN = process.env.BC_ADMIN_API_TOKEN;
    const OAUTH_CLIENT = process.env.BC_OAUTH_CLIENT_ID; // optional

    if (!STORE_HASH || !ADMIN_TOKEN) {
      return res.status(500).json({
        error: "Server not configured. Missing BC_STORE_HASH or BC_ADMIN_API_TOKEN."
      });
    }

    // --- Build Admin REST request -------------------------------------------
    const url = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/catalog/variants/${variantId}/metafields`;

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Auth-Token": ADMIN_TOKEN
    };
    if (OAUTH_CLIENT) {
      headers["X-Auth-Client"] = OAUTH_CLIENT;
    }

    // --- Call BigCommerce ----------------------------------------------------
    const bcResp = await fetch(url, { method: "GET", headers });

    // Read text for better error bubbling/logging (BC often returns JSON)
    const bcText = await bcResp.text();

    if (!bcResp.ok) {
      // Surface BC error body to caller for easier troubleshooting
      return res.status(bcResp.status).json({
        error: "BigCommerce error",
        details: bcText
      });
    }

    // Parse success payload
    let bcJson = {};
    try {
      bcJson = bcText ? JSON.parse(bcText) : {};
    } catch {
      // Unexpected non-JSON; still return a clear error
      return res.status(502).json({
        error: "Invalid JSON from BigCommerce",
        details: bcText
      });
    }

    const items = Array.isArray(bcJson?.data) ? bcJson.data : [];

    // Find the metafield by namespace + key; if multiple, take the first match
    const match = items.find(mf => mf?.namespace === mfNamespace && mf?.key === mfKey);

    return res.status(200).json({
      variantId: Number(variantId),
      namespace: match?.namespace || mfNamespace,
      key: match?.key || mfKey,
      value: match?.value ?? null
    });
  } catch (err) {
    // Avoid leaking internals, but include a concise message for diagnostics
    console.error("[variant-metafield] Unexpected error:", err);
    return res.status(500).json({
      error: "Unexpected error",
      details: err?.message || String(err)
    });
  }
}
