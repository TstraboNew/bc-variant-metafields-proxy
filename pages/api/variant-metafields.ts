// pages/api/variant-metafields.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { productId } = req.query;
  if (!productId || Array.isArray(productId)) {
    return res.status(400).json({ error: 'Missing or invalid productId' });
  }

  // TODO: fetch variant metafields by productId
  return res.status(200).json({ ok: true, productId });
}
