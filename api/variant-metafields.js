// File: api/variant-metafields.js
// GET /api/variant-metafields?productId=1538

const BC_STORE_HASH = process.env.BC_STORE_HASH;
const BC_ADMIN_TOKEN = process.env.BC_ADMIN_TOKEN;
const BASE = `https://api.bigcommerce.com/stores`;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const id = Number(req.query.productId);

    if (!BC_STORE_HASH || !BC_ADMIN_TOKEN) {
      return res.status(500).json({
        error: 'Server env not set',
        details: { hasStoreHash: !!BC_STORE_HASH, hasAdminToken: !!BC_ADMIN_TOKEN },
      });
    }

    if (!id) {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }

    const headers = {
      'X-Auth-Token': BC_ADMIN_TOKEN,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // 1) Sanity-check the product exists
    const productUrl = `${BASE}/${BC_STORE_HASH}/v3/catalog/products/${id}`;
    const p = await fetch(productUrl, { headers });
    const productText = await p.text();
    if (!p.ok) {
      return res.status(p.status).json({
        error: 'BigCommerce product fetch failed',
        request: productUrl,
        status: p.status,
        body: productText,
        hint: 'If 404, productId may not exist in this store; if 401/403, check token/scopes.',
      });
    }

    // 2) Fetch variants for this product
    const variantsUrl = `${BASE}/${BC_STORE_HASH}/v3/catalog/products/${id}/variants?limit=250`;
    const vRes = await fetch(variantsUrl, { headers });
    const vText = await vRes.text();
    if (!vRes.ok) {
      return res.status(vRes.status).json({
        error: 'BigCommerce variants fetch failed',
        request: variantsUrl,
        status: vRes.status,
        body: vText,
      });
    }
    const vJson = JSON.parse(vText);
    const variants = Array.isArray(vJson?.data) ? vJson.data : [];

    // 3) Fetch metafields per variant, filter to your namespace/key
    const results = await Promise.all(
      variants.map(async (v) => {
        const mfUrl = `${BASE}/${BC_STORE_HASH}/v3/catalog/variants/${v.id}/metafields?limit=250`;
        const mfRes = await fetch(mfUrl, { headers });
        if (!mfRes.ok) {
          return { variantId: v.id, sku: v.sku, metafields: [], error: `HTTP ${mfRes.status}` };
        }
        const mfJson = await mfRes.json();
        const all = Array.isArray(mfJson?.data) ? mfJson.data : [];
        const filtered = all.filter(
          (m) => m.namespace === 'SecondaryDesc' && m.key === 'Secondary Attribute Description'
        );
        return { variantId: v.id, sku: v.sku, metafields: filtered };
      })
    );

    return res.status(200).json({ productId: id, variants: results });
  } catch (err) {
    return res.status(500).json({ error: 'Unhandled error', details: err?.message || String(err) });
  }
};
