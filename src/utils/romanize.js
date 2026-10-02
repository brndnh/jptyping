/**
 * Convert romaji -> hiragana.
 * Handles:
 *  - digraphs (kya/sha/cho/etc)
 *  - aliases (shi/si, chi/ti, tsu/tu, fu/hu, ji/zi/di)
 *  - sokuon っ for double consonants (kk, tta…)
 *  - syllabic ん rules, including the `n + y` disambiguation after a vowel (きんよう OK)
 *  - optional `target` (the expected kana) to resolve ambiguous spellings:
 *      kinyou -> きんよう vs yunyuu -> ゆにゅう, konnichiha -> こんにちは
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
    n: "ん", nn: "ん", "n'": "ん", "n’": "ん", // allow n' (straight or curly)

    // --- aliases below; kana -> romaji keeps the first (Hepburn) spelling above ---

    // Kunrei/Nihon-shiki digraphs (syu, zyo, cya ...)
    sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
    zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
    cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',

    // extended kana
    she: 'しぇ', che: 'ちぇ', je: 'じぇ', zye: 'じぇ', jye: 'じぇ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',

    // small kana (l- and x- prefixes)
    la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
    xtu: 'っ', ltu: 'っ',
};

// helper
const isVowel = (ch) => ch === 'a' || ch === 'i' || ch === 'u' || ch === 'e' || ch === 'o';

export function romajiToHiragana(input, target = '') {
    const s = (input || '').toLowerCase();
    const want = normalizeKana(target);
    const wants = (kana) => want.startsWith(normalizeKana(kana));

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

        // --- 'nn' + vowel: ん + な-row when that's what the target expects (konnichiha, shinnyuu) ---
        const nextSyllable = ROMAJI_TO_HIRA[s.substr(i + 1, 3)] || ROMAJI_TO_HIRA[s.substr(i + 1, 2)];
        if (ch === 'n' && ch2 === 'n' && ch3 && ch3 !== 'n' && nextSyllable && want && wants(out + 'ん' + nextSyllable)) {
            out += 'ん';
            prevRaw = 'n';
            i += 1; // consume one 'n'; the other starts the next syllable
            continue;
        }

        // --- disambiguate: vowel + 'n' + 'y' + vowel => ん + ya/yu/yo (NOT nya/nyu/nyo) ---
        // unless the target expects にゃ/にゅ/にょ (yunyuu)
        const targetWantsNya = want && wants(out + ROMAJI_TO_HIRA[s.substr(i, 3)]);
        if (ch === 'n' && ch2 === 'y' && isVowel(ch3) && isVowel(prevRaw) && !targetWantsNya) {
            out += 'ん';
            prevRaw = 'n';
            i += 1; // consume only 'n'; leave 'y...' for next loop
            continue;
        }

        // --- Hepburn 'tch' => っち (matcha) ---
        if (ch === 't' && ch2 === 'c' && ch3 === 'h') {
            out += 'っ';
            prevRaw = ch;
            i += 1;
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

// canonical (Hepburn) spellings for kana -> romaji, used for the romaji hint
const HIRA_TO_ROMAJI = {};
for (const [romaji, kana] of Object.entries(ROMAJI_TO_HIRA)) {
    // first spelling wins (shi before si, chi before ti, ...)
    if (!(kana in HIRA_TO_ROMAJI) && /^[a-z]+$/.test(romaji)) HIRA_TO_ROMAJI[kana] = romaji;
}
HIRA_TO_ROMAJI['ん'] = 'n';
HIRA_TO_ROMAJI['じ'] = 'ji'; // table lists zi first
HIRA_TO_ROMAJI['ぢ'] = 'ji';
HIRA_TO_ROMAJI['づ'] = 'zu';

/**
 * Convert hiragana -> romaji. Unknown chars pass through.
 */
export function hiraganaToRomaji(input) {
    const s = input || '';
    let out = '';
    let geminate = false;

    for (let i = 0; i < s.length; i++) {
        if (s[i] === 'っ') { geminate = true; continue; }

        const pair = HIRA_TO_ROMAJI[s.substr(i, 2)];
        let r = pair ?? HIRA_TO_ROMAJI[s[i]] ?? s[i];
        if (pair) i++;

        if (geminate) {
            r = r.startsWith('ch') ? 't' + r : r[0] + r;
            geminate = false;
        }
        // ん before a vowel, y or n needs an apostrophe to stay unambiguous
        if (out.endsWith('n') && s[i - (pair ? 2 : 1)] === 'ん' && /^[aiueoyn]/.test(r)) out += "'";
        out += r;
    }
    return out;
}

/**
 * Normalize kana for comparison:
 *  - katakana -> hiragana (katakana IME modes)
 *  - ぢ/づ -> じ/ず (most people type ji/zu, not di/du)
 */
export function normalizeKana(input) {
    return (input || '')
        .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
        .replace(/ぢ/g, 'じ')
        .replace(/づ/g, 'ず');
}

// romaji spellings that complete a kana, for canStillMatch
const COMPLETIONS = Object.keys(ROMAJI_TO_HIRA).filter((k) => /^[a-z]+$/.test(k));

/**
 * Could more typing still turn `text` into `target`? Unfinished romaji at the end
 * ("gak" for がっこう, "yuny" for ゆにゅう) counts as on track; "q" or a wrong syllable doesn't.
 */
export function canStillMatch(text, target) {
    const want = normalizeKana(target);
    const reaches = (input) => want.startsWith(normalizeKana(romajiToHiragana(input, target)));
    if (reaches(text)) return true;
    if (!/[a-z]$/i.test(text)) return false;
    return COMPLETIONS.some((c) => reaches(text + c));
}
