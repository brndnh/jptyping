import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Animated, Easing } from 'react-native';

import FuriganaWord from '../components/FuriganaWord';
import { getSet, listSets, DEFAULT_SET_ID } from '../data';
import { romajiToHiragana } from '../utils/romanize';

// keep this in sync with the word container's marginright
const INTER_WORD_GAP = 32;

export default function PracticeScreen({ navigation }) {
    // ---------- test mode controls (defaults set to show "words / 10") ----------
    const [testMode, setTestMode] = useState('words'); // start on words
    const [durationSec, setDurationSec] = useState(30); // default 30s (used when in time mode)
    const [wordTarget, setWordTarget] = useState(10);   // start on 10 words

    // keep this in sync with the word container's marginright
    const INTER_WORD_GAP = 32;

    // max raw input length per word = reading length × this multiplier
    const INPUT_LIMIT_MULTIPLIER = 4;


    // ui toggles
    const [showRomaji, setShowRomaji] = useState(false);

    // active dataset
    const [setId, setSetId] = useState(DEFAULT_SET_ID);
    const lesson = useMemo(() => getSet(setId), [setId]);

    // shuffle seed (reshuffle per session)
    const [seed, setSeed] = useState(0);

    // words for this run (shuffled once)
    const words = useMemo(() => {
        const arr = [...lesson.items];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, [lesson.items, seed]);

    // session state
    const [wIndex, setWIndex] = useState(0);
    const [cIndex, setCIndex] = useState(0);
    const [errors, setErrors] = useState(0);
    const [startTs, setStartTs] = useState(null);
    const [elapsed, setElapsed] = useState(0);

    // ime buffers
    const [raw, setRaw] = useState('');
    const [typedKana, setTypedKana] = useState('');

    // refs / timers
    const inputRef = useRef(null);
    const timerRef = useRef(null);
    const endTsRef = useRef(null);

    // viewport width (for centering first char under caret)
    const [viewportW, setViewportW] = useState(0);

    // conveyor scroll offset (in px). we translate the whole row by -scrollx.
    const scrollX = useRef(new Animated.Value(0)).current;

    // caret blink (fixed at screen center)
    const caret = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(caret, { toValue: 0, duration: 450, useNativeDriver: true }),
                Animated.timing(caret, { toValue: 1, duration: 450, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    // derived for current word
    const currentWord = words[wIndex] ?? words[0];
    const currentTarget = currentWord?.reading || '';

    // per-word measurement for all words in the conveyor
    const wordTotalWidths = useRef({});
    const [layoutTick, setLayoutTick] = useState(0);

    const onMeasureWord = (i, width) => {
        // lock width on first measurement; ignore changes later
        if (wordTotalWidths.current[i] == null) {
            wordTotalWidths.current[i] = width;
            setLayoutTick((t) => t + 1);
        }
    };

    // sum widths of all previous words + fixed gaps
    const sumPrevWords = (idx) => {
        let s = 0;
        for (let k = 0; k < idx; k++) {
            s += (wordTotalWidths.current[k] ?? 0);
            s += INTER_WORD_GAP;
        }
        return s;
    };

    // focus, timers, lifecycle
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 300);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // reset when switching datasets
    useEffect(() => {
        hardReset(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setId]);

    // timer tick: update elapsed, and if in time mode check end time
    useEffect(() => {
        if (!startTs) return;
        timerRef.current = setInterval(() => {
            const now = Date.now();
            setElapsed(now - startTs);

            if (testMode === 'time' && endTsRef.current && now >= endTsRef.current) {
                finishRun();
            }
        }, 100);
        return () => clearInterval(timerRef.current);
    }, [startTs, testMode]);

    // stats
    const minutes = Math.max(0.001, elapsed / 60000);
    const grossCharsBeforeThisWord =
        words.slice(0, wIndex).reduce((acc, w) => acc + [...(w.reading || '')].length + 1, 0);
    const grossChars = grossCharsBeforeThisWord + cIndex;
    const wpm = Math.round((grossChars / 5) / minutes);

    // lcp helper for matching kana
    const lcp = (a, b) => {
        const n = Math.min(a.length, b.length);
        let i = 0;
        while (i < n && a[i] === b[i]) i++;
        return i;
    };

    // animate conveyor only when the active word changes
    const animateToOffset = (px, animated = true) => {
        if (!animated) {
            scrollX.setValue(px);
            return;
        }
        Animated.timing(scrollX, {
            toValue: px,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    // initial center (run once after viewport + first width)
    const didInitialCenter = useRef(false);
    useEffect(() => {
        if (viewportW === 0) return;
        if (!didInitialCenter.current && wordTotalWidths.current[0] != null) {
            didInitialCenter.current = true;
            const initialPx = sumPrevWords(wIndex);
            animateToOffset(initialPx, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewportW, layoutTick, wIndex]);

    // when the active word index changes, jump so the new word starts under the caret
    useEffect(() => {
        if (viewportW === 0) return;
        const targetPx = sumPrevWords(wIndex);
        animateToOffset(targetPx, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wIndex]);

    // input handler (romaji -> kana; compare against reading)
    // input handler (romaji -> kana; compare against reading)
    const onChange = (text) => {
        // start session on first keystroke
        if (!startTs && text.length > 0) {
            const now = Date.now();
            setStartTs(now);
            if (testMode === 'time') {
                endTsRef.current = now + durationSec * 1000;
            } else {
                endTsRef.current = null;
            }
        }

        // limit raw romaji length based on current target (reading length × multiplier)
        // this also guards against huge paste operations
        const targetLen = currentTarget.length || 0;
        const maxRaw = Math.max(1, targetLen * INPUT_LIMIT_MULTIPLIER);
        if (text.length > maxRaw) {
            text = text.slice(0, maxRaw);
        }

        setRaw(text);

        // convert to kana after trimming
        const kana = romajiToHiragana(text);
        setTypedKana(kana);

        const target = currentTarget;
        const prev = cIndex;
        const matched = lcp(kana, target);
        setCIndex(matched);

        // rough error heuristic: user added raw chars but match didn't advance
        if (text.length > raw.length && matched <= prev && kana.length >= prev) {
            setErrors((e) => e + 1);
        }

        // completed this word?
        if (kana === target && target.length > 0) {
            // advance to next word (this triggers the per-word conveyor jump)
            setRaw('');
            setTypedKana('');
            setCIndex(0);

            // word mode: finish if we've reached target
            if (testMode === 'words') {
                const targetCount = Number.isFinite(wordTarget) ? wordTarget : Infinity;
                if (wIndex + 1 >= targetCount || wIndex + 1 >= words.length) {
                    finishRun();
                    return;
                }
            }

            // continue to next word or finish if we ran out of words
            if (wIndex < words.length - 1) {
                setWIndex(wIndex + 1);
            } else {
                finishRun();
                return;
            }

            // keep focus
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    // finish run (navigate to results)
    const finishRun = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        const seconds =
            startTs ? Math.max(0, Math.floor((Date.now() - startTs) / 1000))
                : Math.floor((elapsed || 0) / 1000);

        const payload = {
            mode: testMode,
            durationSec: testMode === 'time' ? durationSec : undefined,
            targetWords: testMode === 'words' ? (Number.isFinite(wordTarget) ? wordTarget : 'unlimited') : undefined,
            wpm,
            timeSec: seconds,
            words: words.map(({ surface, reading }) => ({ surface, reading })),
            completedWords: wIndex + (typedKana === currentTarget && currentTarget ? 1 : 0),
        };

        navigation?.replace?.('Results', payload);
    };

    // reset session
    const hardReset = (reshuffle = true) => {
        if (timerRef.current) clearInterval(timerRef.current);
        endTsRef.current = null;
        didInitialCenter.current = false;

        if (reshuffle) setSeed((s) => s + 1);
        setWIndex(0);
        setCIndex(0);
        setRaw('');
        setTypedKana('');
        setErrors(0);
        setStartTs(null);
        setElapsed(0);
        // clear measurements
        wordTotalWidths.current = {};
        setLayoutTick((t) => t + 1);
        scrollX.setValue(0);
        setTimeout(() => {
            inputRef.current?.clear?.();
            inputRef.current?.focus?.();
        }, 200);
    };

    // cycle through sets quickly (tap dataset label)
    const setsMeta = listSets();
    const cycleSet = () => {
        const i = setsMeta.findIndex((s) => s.id === setId);
        const next = setsMeta[(i + 1) % setsMeta.length]?.id || DEFAULT_SET_ID;
        setSetId(next);
    };

    // small pill button
    const Pill = ({ active, onPress, children }) => (
        <Pressable
            onPress={onPress}
            style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? '#22c55e' : '#2a2f3a',
                marginRight: 8,
            }}
        >
            <Text style={{ color: '#c9d1d9', fontSize: 12 }}>{children}</Text>
        </Pressable>
    );

    // ui readouts
    const remainingSec = testMode === 'time'
        ? Math.max(0, Math.ceil(((endTsRef.current ?? 0) - Date.now()) / 1000))
        : null;

    const wordsProgress =
        testMode === 'words'
            ? `${Math.min(wIndex + 1, Number.isFinite(wordTarget) ? wordTarget : wIndex + 1)} / ${Number.isFinite(wordTarget) ? wordTarget : '∞'}`
            : null;

    return (
        <Pressable style={{ flex: 1, backgroundColor: '#0f1115' }} onPress={() => inputRef.current?.focus()}>
            {/* top bar: dataset label + stats */}
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 16,
                    paddingBottom: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <Pressable onPress={cycleSet}>
                    <Text style={{ color: '#8b98a9', fontSize: 12 }}>
                        {lesson.label} • {showRomaji ? 'romaji aid' : 'hiragana/kanji'}
                    </Text>
                </Pressable>

                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#c9d1d9', fontSize: 14 }}>wpm {isFinite(wpm) ? wpm : 0}</Text>
                    <Text style={{ color: '#8b98a9', fontSize: 12, marginTop: 2 }}>
                        {testMode === 'time' ? `⏱ ${remainingSec ?? Math.floor((elapsed || 0) / 1000)}s` : `🔢 ${wordsProgress}`}
                    </Text>
                </View>
            </View>

            {/* quick mode controls */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Pill
                    active={testMode === 'time'}
                    onPress={() => {
                        if (testMode !== 'time') { hardReset(false); setTestMode('time'); }
                    }}
                >
                    time
                </Pill>
                <Pill
                    active={testMode === 'words'}
                    onPress={() => {
                        if (testMode !== 'words') { hardReset(false); setTestMode('words'); }
                    }}
                >
                    words
                </Pill>

                {testMode === 'time' ? (
                    <View style={{ flexDirection: 'row', marginLeft: 6 }}>
                        <Pill active={durationSec === 15} onPress={() => { hardReset(false); setDurationSec(15); }}>15s</Pill>
                        <Pill active={durationSec === 30} onPress={() => { hardReset(false); setDurationSec(30); }}>30s</Pill>
                    </View>
                ) : (
                    <View style={{ flexDirection: 'row', marginLeft: 6 }}>
                        <Pill active={wordTarget === 10} onPress={() => { hardReset(false); setWordTarget(10); }}>10</Pill>
                        <Pill active={wordTarget === 25} onPress={() => { hardReset(false); setWordTarget(25); }}>25</Pill>
                        <Pill active={wordTarget === 50} onPress={() => { hardReset(false); setWordTarget(50); }}>50</Pill>
                        <Pill active={!Number.isFinite(wordTarget)} onPress={() => { hardReset(false); setWordTarget(Infinity); }}>∞</Pill>
                    </View>
                )}
            </View>

            {/* center line + conveyor */}
            <View style={{ flex: 1, justifyContent: 'center' }} onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}>
                {/* fixed caret at the exact horizontal center */}
                <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: viewportW / 2, top: '50%', transform: [{ translateX: -1 }, { translateY: -12 }] }}
                >
                    <Animated.Text style={{ color: '#c9d1d9', fontSize: 22, opacity: caret }}>│</Animated.Text>
                </View>

                {/* conveyor: first char starts under caret; translate left when the active word changes */}
                <Animated.View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        paddingLeft: Math.max(0, viewportW / 2),
                        transform: [{ translateX: Animated.multiply(scrollX, -1) }],
                    }}
                >
                    {words.map((w, i) => {
                        const isActive = i === wIndex;
                        return (
                            <View
                                key={`${w.surface}-${i}`}
                                onLayout={(e) => onMeasureWord(i, e.nativeEvent.layout.width)}
                                style={{ flexDirection: 'column', alignItems: 'center', marginRight: INTER_WORD_GAP }}
                            >
                                <FuriganaWord surface={w.surface} reading={w.reading} active={isActive} fontSize={30} />

                                {isActive && showRomaji && (
                                    <Text style={{ marginTop: 4, color: '#8b98a9', fontSize: 12 }}>{w.romaji}</Text>
                                )}

                                {isActive && <Text style={{ marginTop: 8, fontSize: 18, color: '#22c55e' }}>{typedKana}</Text>}
                            </View>
                        );
                    })}
                </Animated.View>
            </View>

            {/* hidden input (romaji) */}
            <TextInput
                ref={inputRef}
                value={raw}
                onChangeText={onChange}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="default"
                style={{ height: 0, width: 0, opacity: 0, position: 'absolute' }}
                blurOnSubmit={false}
            />

            {/* bottom controls */}
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Pressable
                    onPress={() => hardReset(true)}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2f3a', borderRadius: 10 }}
                >
                    <Text style={{ color: '#c9d1d9' }}>restart</Text>
                </Pressable>
                <Pressable
                    onPress={() => setShowRomaji((s) => !s)}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2f3a', borderRadius: 10 }}
                >
                    <Text style={{ color: '#c9d1d9' }}>{showRomaji ? 'romaji: on' : 'romaji: off'}</Text>
                </Pressable>
            </View>
        </Pressable>
    );
}
