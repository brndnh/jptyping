import TABLE from '../data/romanization.json';

// Convert katakana to hiragana
export const kataToHira = (s) =>
    s.replace(/[\u30A1-\u30F6]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );

// Build a map and a sorted key list for greedy parsing (longest first)
function buildMap() {
    const map = {};
    const add = ([r, h]) => { map[r] = h; };

    TABLE.digraphs.forEach(add);
    TABLE.syllables.forEach(add);

    // Return keys sorted by length desc so we can match greedily
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    return { map, keys };
}

const { map: ROMAJI_MAP, keys: ROMAJI_KEYS } = buildMap();

/**
 * Basic romaji -> hiragana, using the external data.
 * Includes a couple of common preprocessing steps:
 * - sokuon from doubled consonants (e.g., gakkou -> がっこう)
 * - 'nn' -> ん
 */
export function romajiToHiragana(input) {
    if (!input) return '';
    let s = input.toLowerCase().trim();

    // sokuon for doubled consonants except 'n' (e.g., kk -> っk)
    s = s.replace(/([^aeiou\s])\1/g, 'っ$1');

    // 'nn' -> ん (basic handling)
    s = s.replace(/nn/g, 'ん');

    let out = '';
    while (s.length) {
        let matched = false;

        // Try greedy longest match from our external table
        for (const k of ROMAJI_KEYS) {
            if (s.startsWith(k)) {
                out += ROMAJI_MAP[k];
                s = s.slice(k.length);
                matched = true;
                break;
            }
        }

        if (!matched) {
            // If kana slipped in, normalize & keep; else drop the char
            const ch = s[0];
            if (/[ぁ-ゖ]/.test(ch)) out += ch;
            else if (/[ァ-ヶ]/.test(ch)) out += kataToHira(ch);
            s = s.slice(1);
        }
    }
    return out;
}

/**
 * Normalize any user input to hiragana:
 * - Katakana -> hiragana
 * - Romaji -> hiragana (via the table)
 * - Hiragana stays
 * - Kanji stays (not converted)
 */
export function toHiragana(input) {
    if (!input) return '';
    const normalizedKana = kataToHira(input);
    if (/[a-z]/i.test(normalizedKana)) {
        return romajiToHiragana(normalizedKana);
    }
    return normalizedKana;
}
