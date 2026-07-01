const { kv } = require('@vercel/kv');

const DEFAULTS = {
  title: 'Hello, World!',
  content:
    'This site is controlled entirely from Telegram. Send /update to change this text, or /ask to have Claude write something and publish it live.',
  updatedAt: null,
  updatedBy: null,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const site = (await kv.get('site')) || DEFAULTS;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(site);
  } catch (err) {
    console.error('content.js error:', err);
    // Fail soft — the frontend still has something to show.
    return res.status(200).json(DEFAULTS);
  }
};
