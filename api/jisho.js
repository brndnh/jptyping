// Vercel serverless proxy: jisho.org doesn't send CORS headers, so the browser can't call it directly.
export default async function handler(req, res) {
    const { keyword = '', page = '1' } = req.query;
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(keyword)}&page=${encodeURIComponent(page)}`;

    try {
        const upstream = await fetch(url);
        const json = await upstream.json();
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        res.status(upstream.status).json(json);
    } catch {
        res.status(502).json({ data: [] });
    }
}
