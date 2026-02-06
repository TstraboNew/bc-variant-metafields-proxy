const BC_STORE_HASH = process.env.BC_STORE_HASH;
const BC_ADMIN_TOKEN = process.env.BC_ADMIN_TOKEN;

const NAMESPACE = 'SecondaryDesc';

export default async function handler(req, res) {
  try {
    const { productId } = req.query;
    const id = Number(productId);

    if (!BC_STORE_HASH || !BC_ADMIN_TOKEN) {
      return res.status(500).json({
        error: 'Server env not set',
        details: {
          hasStoreHash: !!BC_STORE_HASH,
          hasAdminToken: !!BC_ADMIN_TOKEN,
        },
      });
    }

    if (!id) {
      return res.status(400).json({ error: 'Missing or invalid productId' });
    }

    // 1) Sanity-check the product exists
    const productUrl = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/catalog/products/${id}`;
    const p = await fetch(productUrl, {
      headers: {
        'X-Auth-Token': BC_ADMIN_TOKEN,
        'Accept': 'application/json',
      },
    });
    const productText = await p.text();

    if (!p.ok) {
      return res.status(p.status).json({
        error: 'BigCommerce product fetch failed',
        request: productUrl,
        status: p.status,
        body: productText,
        hint: 'If status=404, your BC_STORE_HASH is likely wrong or productId does not exist.',
      });
    }

    // 2) Fetch variants + metafields
    const variantsUrl = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/catalog/products/${id}/variants?include=metafields&limit=250`;
    const r = await fetch(variantsUrl, {
      headers: {
        'X-Auth-Token': BC_ADMIN_TOKEN,
        'Accept': 'application/json',
      },
    });

    const variantsText = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({
        error: 'BigCommerce variants+metafields fetch failed',
        request: variantsUrl,
        status: r.status,
        body: variantsText,
        hint: '404 here usually means the store hash is wrong. Verify BC_STORE_HASH is the short hash from your admin URL (no "store-" prefix).',
      });
    }

    const json = JSON.parse(variantsText);

    const variants = (json?.data ?? []).map(v => {
      const fields = {};
      (v?.metafields ?? []).forEach(mf => {
        if (mf.namespace === NAMESPACE) {
          fields[mf.key] = mf.value;
        }
      });
      return {
        variantId: v.id,
        sku: v.sku,
        fields,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ productId: id, namespace: NAMESPACE, variants });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err?.message || String(err) });
  }
}
