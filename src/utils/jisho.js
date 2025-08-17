// utils/jisho.js
const BUCKETS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ'];
export async function fetchRandomJishoWord() {
    const q = BUCKETS[Math.floor(Math.random() * BUCKETS.length)];
    const page = 1 + Math.floor(Math.random() * 5); // light randomness
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}&page=${page}`;
    const res = await fetch(url); const json = await res.json();
    const pick = json.data?.[Math.floor(Math.random() * (json.data?.length || 1))];
    if (!pick) return null;
    const jp = pick.japanese?.[0] || {};
    const senses = pick.senses?.[0] || {};
    return {
        surface: jp.word || jp.reading || '',
        reading: jp.reading || '',
        romaji: undefined, // optional
        gloss: senses.english_definitions?.join(', ') || '',
    };
}
