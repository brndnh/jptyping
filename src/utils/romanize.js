// src/utils/romanize.js
// Streaming ROMAJI → HIRAGANA IME built from romanization.json

import TABLE from '../data/romanization.json';

// ---------- Build map & helpers from your JSON ----------
function buildFromJson() {
    const map = Object.create(null);
    const prefixes = new Set();

    const add = ([roma, kana]) => {
        if (!roma) return;
        map[roma.toLowerCase()] = kana; // lower-case keys
    };

    (TABLE.digraphs || []).forEach(add);
    (TABLE.syllables || []).forEach(add);

    for (const key of Object.keys(map)) {
        for (let i = 1; i < key.length; i++) {
            prefixes.add(key.slice(0, i));
        }
    }

    // Longest-first keys for greedy matching
    const keysByLen = Object.keys(map).sort((a, b) => b.length - a.length);
    return { map, prefixes, keysByLen };
}

const { map, prefixes, keysByLen } = buildFromJson();
const isVowel = (c) => /[aiueo]/.test(c);
const isLetter = (c) => /[a-z]/.test(c);

// Convert the *entire* romaji buffer to confirmed kana (greedy).
// Leaves ambiguous trailing pieces (like lone 'n') un-emitted.
export function romajiToHiragana(input) {
    const s = (input || '').toLowerCase();
    let out = '';
    let i = 0;

    while (i < s.length) {
        // 1) "n'" -> ん
        if (s[i] === 'n' && s[i + 1] === "'") {
            out += 'ん';
            i += 2;
            continue;
        }

        // 2) double consonant (except 'n') => small tsu っ
        if (
            i + 1 < s.length &&
            s[i] === s[i + 1] &&
            isLetter(s[i]) &&
            !isVowel(s[i]) &&
            s[i] !== 'n'
        ) {
            out += 'っ';
            i += 1; // consume one; next loop consumes the second
            continue;
        }

        // 3) Try longest romaji chunk first
        let matched = '';
        for (const key of keysByLen) {
            if (s.startsWith(key, i)) {
                matched = key;
                break;
            }
        }

        // 4) Lone 'n' rules
        if (!matched && s[i] === 'n') {
            const next = s[i + 1];
            if (!next) break; // wait for more input
            if (!isVowel(next) && next !== 'y') {
                out += 'ん';
                i += 1;
                continue;
            }
            // next is vowel or 'y' -> it's probably na/nya..., so wait
            break;
        }

        if (matched) {
            out += map[matched];
            i += matched.length;
            continue;
        }

        // 5) Not a known romaji start: pass through spaces/punct, or stop on unfinished prefix
        if (prefixes.has(s.slice(i, i + 2)) || prefixes.has(s[i])) break;

        out += s[i];
        i += 1;
    }

    return out;
}
