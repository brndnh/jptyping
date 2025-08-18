// tiny jisho helper – random-ish pulls with fallback fields
export async function fetchRandomJishoWords(count = 25) {
    const BUCKETS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];
    const out = [];
    let guard = 0;

    while (out.length < count && guard++ < count * 4) {
        const q = BUCKETS[Math.floor(Math.random() * BUCKETS.length)];
        const page = 1 + Math.floor(Math.random() * 5);
        const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}&page=${page}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            const picks = json?.data ?? [];
            if (picks.length === 0) continue;
            const item = picks[Math.floor(Math.random() * picks.length)];
            const jp = item.japanese?.[0] || {};
            const surface = jp.word || jp.reading || '';
            const reading = jp.reading || '';
            if (!reading) continue;
            out.push({ surface, reading, romaji: undefined });
        } catch {
            // ignore and try again
        }
    }

    return out;
}
