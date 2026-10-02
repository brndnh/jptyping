/**
 * Progress saved in the browser (localStorage).
 *
 * shape (v1):
 *  runs:  [{ t, wpm, acc, sec, mode, n, set, words }]   newest last, capped
 *  bests: { 'N5|words|10': { wpm, t } }
 *  words: { 'がっこう|学校': { s, r, seen, miss, mpc, t } }
 *         miss = moving average of "had a mistake" (0..1), mpc = moving average ms per kana
 */

const KEY = 'jptyping:progress';
const VERSION = 1;
const MAX_RUNS = 1000;
// weight of the newest attempt in the per-word moving averages
const EMA_WEIGHT = 0.35;
// fewer weak words than this and the weak-words mode falls back to a regular set
export const WEAK_MIN = 5;

const empty = () => ({ v: VERSION, runs: [], bests: {}, words: {} });

export function loadProgress() {
    try {
        const data = JSON.parse(localStorage.getItem(KEY));
        if (data?.v !== VERSION) return empty();
        return { ...empty(), ...data };
    } catch {
        return empty();
    }
}

function saveProgress(data) {
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
        // ask the browser not to evict our storage (Safari clears unvisited sites otherwise)
        navigator.storage?.persist?.().catch(() => {});
        return true;
    } catch {
        return false;
    }
}

// which pool a run used: a set id ('N4'), its sentences ('N4 sentences'), 'jisho' or 'weak'
export const runSetLabel = (results) =>
    results.content === 'sentences'
        ? `${results.setId} sentences`
        : results.source === 'local' ? results.setId : results.source;

const bestKey = (set, mode, n) => `${set}|${mode}|${n}`;

export function parseBestKey(key) {
    const [set, mode, n] = key.split('|');
    return { set, mode, n };
}

const wordKey = (w) => `${w.reading}|${w.surface}`;

/**
 * Record a finished run. Returns { isBest, previousBest }.
 */
export function recordRun(results) {
    const data = loadProgress();
    const now = Date.now();
    const set = runSetLabel(results);
    const n = results.mode === 'time' ? results.durationSec : results.targetWords;

    data.runs.push({
        t: now,
        wpm: results.wpm,
        acc: results.accuracy,
        sec: results.timeSec,
        mode: results.mode,
        n,
        set,
        words: results.completedWords,
    });
    if (data.runs.length > MAX_RUNS) data.runs = data.runs.slice(-MAX_RUNS);

    // personal best, only for runs that actually typed something
    const key = bestKey(set, results.mode, n);
    const previousBest = data.bests[key]?.wpm ?? null;
    const isBest = results.completedWords > 0 && (previousBest == null || results.wpm > previousBest);
    if (isBest) data.bests[key] = { wpm: results.wpm, t: now };

    for (const w of results.wordResults ?? []) {
        const k = wordKey(w);
        const missed = w.mistakes > 0 ? 1 : 0;
        const mpc = w.ms / Math.max(1, w.reading.length);
        const prev = data.words[k];
        data.words[k] = prev
            ? {
                ...prev,
                seen: prev.seen + 1,
                miss: prev.miss + EMA_WEIGHT * (missed - prev.miss),
                mpc: prev.mpc + EMA_WEIGHT * (mpc - prev.mpc),
                t: now,
            }
            : { s: w.surface, r: w.reading, seen: 1, miss: missed, mpc, t: now };
    }

    saveProgress(data);
    return { isBest: isBest && previousBest != null, previousBest };
}

/**
 * Words you miss or type slowly, worst first.
 * Score = mistake rate + how much slower than your average (capped).
 */
export function getWeakWords(limit = 30, data = loadProgress()) {
    const entries = Object.values(data.words);
    if (!entries.length) return [];

    const avgMpc = entries.reduce((acc, w) => acc + w.mpc, 0) / entries.length;
    return entries
        .map((w) => {
            const slowness = Math.min(2, Math.max(0, w.mpc / avgMpc - 1));
            return { ...w, score: w.miss + slowness * 0.5 };
        })
        .filter((w) => w.miss > 0.05 || w.mpc > avgMpc * 1.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function exportProgress() {
    return JSON.stringify(loadProgress(), null, 2);
}

/**
 * Replace saved progress with an exported file's contents. Returns false if it isn't one.
 */
export function importProgress(json) {
    try {
        const data = JSON.parse(json);
        if (data?.v !== VERSION || !Array.isArray(data.runs) || typeof data.words !== 'object') return false;
        return saveProgress({ ...empty(), ...data });
    } catch {
        return false;
    }
}

export function resetProgress() {
    return saveProgress(empty());
}
