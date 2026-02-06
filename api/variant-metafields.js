// Vercel serverless function: /api/variant-metafields
// Returns a safe subset of variant metafields for a product.

const BC_STORE_HASH = process.env.BC_STORE_HASH;
const BC_ADMIN_TOKEN = process.env.BC_ADMIN_TOKEN;

// Customize these to your actual metafields
const NAMESPACE = 'SecondaryDesc';
const TARGET_KEY = 'Secondary Attribute Description';

export default async function handler(req, res) {
  try {
    const { productId } = req.query;
    const id = Number(productId);
    if (!id) {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }

    const url = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/catalog/products/${id}/variants?include=metafields&limit=250`;

    const r = await fetch(url, {
      headers: {
        'X-Auth-Token': BC_ADMIN_TOKEN,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'BigCommerce API error', details: text });
    }

    const json = await r.json();

    const variants = (json?.data ?? []).map(v => {
      const fields = {};
      (v?.metafields ?? []).forEach(mf => {
        if (mf.namespace === NAMESPACE) {
          fields[mf.key] = mf.value;
        }
      });
      return {
        variantId: v.id,  // Admin API numeric id
        sku: v.sku,
        fields,           // e.g., { "Secondary Attribute Description": "<p>..</p>|10952" }
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ productId: id, namespace: NAMESPACE, variants });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err?.message || String(err) });
  }
}
