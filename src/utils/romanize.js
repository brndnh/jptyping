/**
 * Convert romaji -> hiragana.
 * Handles:
 *  - digraphs (kya/sha/cho/etc)
 *  - aliases (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi/di)
 *  - sokuon っ for double consonants (kk, tta…)
 *  - syllabic ん rules, including the `n + y` disambiguation after a vowel (きんよう OK)
 */

// includes common aliases (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi/di, jya/ja …)
const ROMAJI_TO_HIRA = {
    // vowels
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',

    // k
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',

    // g
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',

    // s
    sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ',

    // z/j
    za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ja: 'じゃ', jya: 'じゃ', ju: 'じゅ', jyu: 'じゅ', jo: 'じょ', jyo: 'じょ',

    // t/ch/ts
    ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
    tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',

    // d
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',

    // n
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',

    // h/f
    ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',

    // b
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ',

    // p
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',

    // m
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    mya: 'みゃ', myu: 'みゅ', myo: 'みょ',

    // y
    ya: 'や', yu: 'ゆ', yo: 'よ',

    // r
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',

    // w
    wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',

    // small vowels (rarely needed but safe)
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',

    // misc
    n: "ん", nn: "ん", "n'": "ん", "n’": "ん" // allow n' (straight or curly)

};

// helper
const isVowel = (ch) => ch === 'a' || ch === 'i' || ch === 'u' || ch === 'e' || ch === 'o';

export function romajiToHiragana(input) {
    const s = (input || '').toLowerCase();

    let out = '';
    let i = 0;
    let prevRaw = ''; // previous raw romaji char we consumed

    while (i < s.length) {
        const ch = s[i];
        const ch2 = s[i + 1] || '';
        const ch3 = s[i + 2] || '';

        // --- treat explicit n' as ん ---
        if (ch === 'n' && (ch2 === "'" || ch2 === '’')) {
            out += 'ん';
            prevRaw = ch2;
            i += 2;
            continue;
        }

        // --- disambiguate: vowel + 'n' + 'y' + vowel => ん + ya/yu/yo (NOT nya/nyu/nyo) ---
        if (ch === 'n' && ch2 === 'y' && isVowel(ch3) && isVowel(prevRaw)) {
            out += 'ん';
            prevRaw = 'n';
            i += 1; // consume only 'n'; leave 'y...' for next loop
            continue;
        }

        // --- sokuon っ for double consonants (except 'nn') ---
        if (i + 1 < s.length && s[i] === s[i + 1] && !isVowel(ch) && ch !== 'n') {
            out += 'っ';
            prevRaw = s[i];
            i += 1;
            continue;
        }

        // --- try longest match first: 3 -> 2 -> 1 ---
        const tri = ROMAJI_TO_HIRA[s.substr(i, 3)];
        if (tri) {
            out += tri;
            prevRaw = s[i + 2];
            i += 3;
            continue;
        }
        const bi = ROMAJI_TO_HIRA[s.substr(i, 2)];
        if (bi) {
            out += bi;
            prevRaw = s[i + 1];
            i += 2;
            continue;
        }

        // --- standalone 'n' as ん (when not followed by a vowel or y+vowel) ---
        if (ch === 'n') {
            const nextMakesSyllable = isVowel(ch2) || (ch2 === 'y' && isVowel(ch3));
            if (!nextMakesSyllable) {
                out += 'ん';
                prevRaw = 'n';
                i += 1;
                continue;
            }
            // else: let normal mapping handle 'na/ni/..' or 'nya/..'
        }

        const uni = ROMAJI_TO_HIRA[ch];
        if (uni) {
            out += uni;
            prevRaw = ch;
            i += 1;
            continue;
        }

        // unknown char: pass through
        out += ch;
        prevRaw = ch;
        i += 1;
    }

    return out;
}
