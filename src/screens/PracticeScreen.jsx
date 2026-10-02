import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import FuriganaWord from '../components/FuriganaWord.jsx';
import { getSet, listSets, DEFAULT_SET_ID } from '../data';
import { romajiToHiragana, hiraganaToRomaji } from '../utils/romanize';

// input guard
const INPUT_LIMIT_MULTIPLIER = 4;
// jisho: words taken from each fetched page
const WORDS_PER_PAGE = 5;
// readings we can type (katakana/ー can't be produced from romaji)
const TYPEABLE_READING = /^[ぁ-ゖ]+$/;

const KANA_BUCKETS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'や', 'ゆ', 'よ', 'ら', 'り', 'る', 'れ', 'ろ', 'わ', 'を', 'ん'];

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// one random jisho page -> up to WORDS_PER_PAGE typeable words
async function fetchJishoPage() {
    const keyword = randomItem(KANA_BUCKETS);
    const page = 1 + Math.floor(Math.random() * 5);
    try {
        const res = await fetch(`/api/jisho?keyword=${encodeURIComponent(keyword)}&page=${page}`);
        const json = await res.json();
        const words = (json?.data ?? [])
            .map((entry) => entry?.japanese?.[0] ?? {})
            .filter((jp) => jp.reading && TYPEABLE_READING.test(jp.reading))
            .map((jp) => ({ surface: jp.word || jp.reading, reading: jp.reading, romaji: '' }));
        return shuffle(words).slice(0, WORDS_PER_PAGE);
    } catch {
        return [];
    }
}

async function fetchRandomJishoWords(count = 25) {
    const pages = await Promise.all(
        Array.from({ length: Math.ceil(count / WORDS_PER_PAGE) + 1 }, fetchJishoPage)
    );
    const seen = new Set();
    return pages
        .flat()
        .filter((w) => {
            const key = `${w.surface}|${w.reading}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, count);
}

// stored romaji when it actually types the reading, generated otherwise
const romajiHint = (w) =>
    w.romaji && romajiToHiragana(w.romaji) === w.reading ? w.romaji : hiraganaToRomaji(w.reading);

// longest common prefix length
const lcp = (a, b) => {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
};

// buttons keep focus on the hidden input so the mobile keyboard stays open
const keepFocus = (e) => e.preventDefault();

const Pill = ({ active, onClick, children }) => (
    <button
        type="button"
        className={`pill${active ? ' pill-active' : ''}`}
        onMouseDown={keepFocus}
        onClick={onClick}
    >
        {children}
    </button>
);

const Button = ({ onClick, children }) => (
    <button type="button" className="button" onMouseDown={keepFocus} onClick={onClick}>
        {children}
    </button>
);

export default function PracticeScreen({ settings, updateSettings, onFinish }) {
    const { testMode, durationSec, wordTarget, source, showRomaji, showFurigana } = settings;

    // data source
    const [remoteWords, setRemoteWords] = useState(null);
    const [loadingJisho, setLoadingJisho] = useState(false);

    // dataset
    const [setId, setSetId] = useState(DEFAULT_SET_ID);
    const lesson = useMemo(() => getSet(setId), [setId]);

    // shuffle seed
    const [seed, setSeed] = useState(0);

    // pool
    const wordPool =
        source === 'jisho' && Array.isArray(remoteWords) && remoteWords.length
            ? remoteWords
            : lesson.items;

    // words (shuffled)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const words = useMemo(() => shuffle(wordPool), [wordPool, seed]);

    // session state
    const [wIndex, setWIndex] = useState(0);
    const [cIndex, setCIndex] = useState(0);
    const [startTs, setStartTs] = useState(null);
    const [elapsed, setElapsed] = useState(0);

    // ime buffers
    const [raw, setRaw] = useState('');
    const [typedKana, setTypedKana] = useState('');
    const composingRef = useRef(false);

    // refs / timers
    const inputRef = useRef(null);
    const timerRef = useRef(null);
    const endTsRef = useRef(null);
    const [focused, setFocused] = useState(false);

    // conveyor
    const stageRef = useRef(null);
    const wordRefs = useRef([]);
    const [offset, setOffset] = useState(0);

    // current word
    const currentWord = words[wIndex] ?? words[0];
    const currentTarget = currentWord?.reading || '';

    const focusInput = () => inputRef.current?.focus({ preventScroll: true });

    // center the active word in the stage
    const recenter = useCallback(() => {
        const stage = stageRef.current;
        const el = wordRefs.current[wIndex];
        if (!stage || !el) return;
        setOffset(Math.round(stage.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2)));
    }, [wIndex]);

    useLayoutEffect(recenter, [recenter, words, showFurigana]);

    useEffect(() => {
        const observer = new ResizeObserver(recenter);
        observer.observe(stageRef.current);
        // CJK fonts can load late and change word widths
        document.fonts?.ready.then(recenter);
        return () => observer.disconnect();
    }, [recenter]);

    // focus & cleanup
    useEffect(() => {
        focusInput();
        return () => clearInterval(timerRef.current);
    }, []);

    // jisho prefetch
    useEffect(() => {
        if (source !== 'jisho') return;
        let alive = true;
        setLoadingJisho(true);
        const need = Number.isFinite(wordTarget) ? wordTarget : 25;
        fetchRandomJishoWords(Math.max(10, need)).then((got) => {
            if (!alive) return;
            setRemoteWords(got);
            setLoadingJisho(false);
        });
        return () => { alive = false; };
    }, [source, wordTarget, seed]);

    // stats
    const minutes = Math.max(0.001, elapsed / 60000);
    const grossCharsBeforeThisWord =
        words.slice(0, wIndex).reduce((acc, w) => acc + [...(w.reading || '')].length + 1 /* gap */, 0);
    const grossChars = grossCharsBeforeThisWord + cIndex;
    const wpm = Math.round((grossChars / 5) / minutes);

    // finish run
    const finishRun = () => {
        clearInterval(timerRef.current);

        // compute precise elapsed for final wpm (don't rely on state that may be stale)
        const finalMs =
            testMode === 'time'
                ? durationSec * 1000
                : (startTs ? Math.max(0, Date.now() - startTs) : (elapsed || 0));

        // clamp to at least 1s to avoid insane spikes from ~0 minutes
        const finalMinutes = Math.max(1 / 60, finalMs / 60000);
        const wpmFinal = Math.round((grossChars / 5) / finalMinutes);

        onFinish({
            mode: testMode,
            source,
            durationSec: testMode === 'time' ? durationSec : undefined,
            targetWords: testMode === 'words'
                ? (Number.isFinite(wordTarget) ? wordTarget : 'unlimited')
                : undefined,
            wpm: wpmFinal,
            timeSec: Math.floor(finalMs / 1000),
            words: words.map(({ surface, reading }) => ({ surface, reading })),
            completedWords: wIndex + (typedKana === currentTarget && currentTarget ? 1 : 0),
        });
    };

    // the interval outlives renders, so it calls the latest finishRun through a ref
    const finishRef = useRef(finishRun);
    finishRef.current = finishRun;

    // timer tick
    useEffect(() => {
        if (!startTs) return;
        timerRef.current = setInterval(() => {
            const now = Date.now();
            setElapsed(now - startTs);
            if (testMode === 'time' && endTsRef.current && now >= endTsRef.current) {
                finishRef.current();
            }
        }, 100);
        return () => clearInterval(timerRef.current);
    }, [startTs, testMode]);

    // input handler with per-word cap
    const handleText = (text) => {
        if (!startTs && text.length > 0) {
            const now = Date.now();
            setStartTs(now);
            endTsRef.current = testMode === 'time' ? now + durationSec * 1000 : null;
        }

        // never trim mid-composition, it breaks the IME
        const maxRaw = Math.max(1, currentTarget.length * INPUT_LIMIT_MULTIPLIER);
        if (!composingRef.current && text.length > maxRaw) text = text.slice(0, maxRaw);

        setRaw(text);

        const kana = romajiToHiragana(text);
        setTypedKana(kana);
        setCIndex(lcp(kana, currentTarget));

        // kana IMEs: wait for the composition to be committed before advancing
        if (kana !== currentTarget || !currentTarget || composingRef.current) return;

        setRaw('');
        setTypedKana('');
        setCIndex(0);

        const targetCount = testMode === 'words' && Number.isFinite(wordTarget) ? wordTarget : Infinity;
        if (wIndex + 1 >= targetCount || wIndex + 1 >= words.length) {
            finishRun();
            return;
        }
        setWIndex(wIndex + 1);
    };

    // reset session
    const hardReset = (reshuffle = true) => {
        clearInterval(timerRef.current);
        endTsRef.current = null;

        if (reshuffle) setSeed((s) => s + 1);
        setWIndex(0);
        setCIndex(0);
        setRaw('');
        setTypedKana('');
        setStartTs(null);
        setElapsed(0);
        focusInput();
    };

    // settings changes restart the run
    const changeSetting = (patch, reshuffle = false) => {
        hardReset(reshuffle);
        updateSettings(patch);
    };

    // esc restarts
    const hardResetRef = useRef(hardReset);
    hardResetRef.current = hardReset;
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && !e.isComposing) hardResetRef.current(true);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // cycle sets
    const setsMeta = listSets();
    const cycleSet = () => {
        const i = setsMeta.findIndex((s) => s.id === setId);
        const next = setsMeta[(i + 1) % setsMeta.length]?.id || DEFAULT_SET_ID;
        setSetId(next);
        hardReset(false);
    };

    // ui readouts
    const remainingSec =
        testMode === 'time' && endTsRef.current
            ? Math.max(0, Math.ceil((endTsRef.current - Date.now()) / 1000))
            : durationSec;

    const wordsProgress =
        `${Math.min(wIndex + 1, Number.isFinite(wordTarget) ? wordTarget : wIndex + 1)} / ${Number.isFinite(wordTarget) ? wordTarget : '∞'}`;

    return (
        <main className="practice" onClick={focusInput}>
            {/* top bar */}
            <header className="top-bar">
                <button type="button" className="top-label" onMouseDown={keepFocus} onClick={cycleSet}>
                    {lesson.label}
                </button>

                <div className="top-right">
                    <div className="wpm">wpm {isFinite(wpm) ? wpm : 0}</div>
                    <div className="meter">
                        {testMode === 'time' ? `⏱ ${remainingSec}s` : wordsProgress}
                    </div>
                </div>
            </header>

            {/* quick mode controls (row 1) */}
            <div className="row">
                <Pill active={testMode === 'time'} onClick={() => testMode !== 'time' && changeSetting({ testMode: 'time' })}>time</Pill>
                <Pill active={testMode === 'words'} onClick={() => testMode !== 'words' && changeSetting({ testMode: 'words' })}>words</Pill>

                <span className="row-divider" />

                {testMode === 'time' ? (
                    <>
                        <Pill active={durationSec === 15} onClick={() => changeSetting({ durationSec: 15 })}>15s</Pill>
                        <Pill active={durationSec === 30} onClick={() => changeSetting({ durationSec: 30 })}>30s</Pill>
                    </>
                ) : (
                    <>
                        <Pill active={wordTarget === 10} onClick={() => changeSetting({ wordTarget: 10 })}>10</Pill>
                        <Pill active={wordTarget === 25} onClick={() => changeSetting({ wordTarget: 25 })}>25</Pill>
                        <Pill active={wordTarget === 50} onClick={() => changeSetting({ wordTarget: 50 })}>50</Pill>
                        <Pill active={!Number.isFinite(wordTarget)} onClick={() => changeSetting({ wordTarget: Infinity })}>∞</Pill>
                    </>
                )}
            </div>

            {/* source picker + jisho indicator (row 2) */}
            <div className="row">
                <Pill active={source === 'local'} onClick={() => changeSetting({ source: 'local' })}>local</Pill>
                <Pill active={source === 'jisho'} onClick={() => changeSetting({ source: 'jisho' }, true)}>jisho</Pill>

                {source === 'jisho' && (
                    <span className="hint">
                        {loadingJisho
                            ? 'fetching words…'
                            : Array.isArray(remoteWords) && remoteWords.length
                                ? `${remoteWords.length} loaded`
                                : 'no results, using local fallback'}
                    </span>
                )}
            </div>

            {/* stage + conveyor (active word centered) */}
            <div className="stage" ref={stageRef}>
                <div
                    className="conveyor"
                    style={{
                        opacity: source === 'jisho' && loadingJisho ? 0.5 : 1,
                        transform: `translateX(${offset}px)`,
                        // jumping back to the first word (reset) shouldn't animate
                        transition: wIndex === 0 ? 'none' : undefined,
                    }}
                >
                    {words.map((w, i) => {
                        const isActive = i === wIndex;
                        return (
                            <div
                                key={`${w.surface}-${i}`}
                                ref={(el) => { wordRefs.current[i] = el; }}
                                className="word-block"
                            >
                                <FuriganaWord
                                    surface={w.surface}
                                    reading={showFurigana ? w.reading : ''}
                                    matched={isActive ? cIndex : 0}
                                    active={isActive}
                                />

                                {isActive && (
                                    <div className="word-below">
                                        {showRomaji && (
                                            <div className="romaji">{romajiHint(w)}</div>
                                        )}
                                        <div className="typed-kana">{typedKana}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {!focused && <div className="focus-hint">tap here to start typing</div>}
            </div>

            {/* hidden input (romaji or kana) */}
            <input
                ref={inputRef}
                className="hidden-input"
                value={raw}
                onChange={(e) => handleText(e.target.value)}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={(e) => {
                    composingRef.current = false;
                    handleText(e.currentTarget.value);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-label="type the reading"
            />

            {/* bottom controls */}
            <footer className="bottom-bar">
                <Button onClick={() => hardReset(true)}>restart</Button>

                <div className="bottom-toggles">
                    <Button onClick={() => updateSettings({ showRomaji: !showRomaji })}>
                        {showRomaji ? 'romaji: on' : 'romaji: off'}
                    </Button>
                    <Button onClick={() => updateSettings({ showFurigana: !showFurigana })}>
                        {showFurigana ? 'furigana: on' : 'furigana: off'}
                    </Button>
                </div>
            </footer>
        </main>
    );
}
