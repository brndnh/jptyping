import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    Animated,
    Easing,
} from 'react-native';

import FuriganaWord from '../components/FuriganaWord';
import { getSet, listSets, DEFAULT_SET_ID } from '../data';
import { romajiToHiragana } from '../utils/romanize';

// Gap between word blocks in the conveyor (must match marginRight below)
const INTER_WORD_GAP = 32;

export default function PracticeScreen() {
    // UI toggles
    const [showRomaji, setShowRomaji] = useState(false);

    // Active dataset
    const [setId, setSetId] = useState(DEFAULT_SET_ID);
    const lesson = useMemo(() => getSet(setId), [setId]);

    // Shuffle seed (reshuffle per session)
    const [seed, setSeed] = useState(0);

    // Words for this run (shuffled once)
    const words = useMemo(() => {
        const arr = [...lesson.items];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, [lesson.items, seed]);

    // Session state
    const [wIndex, setWIndex] = useState(0); // current word index
    const [cIndex, setCIndex] = useState(0); // matched kana chars inside current reading
    const [errors, setErrors] = useState(0);
    const [startTs, setStartTs] = useState(null);
    const [elapsed, setElapsed] = useState(0);

    // IME buffers
    const [raw, setRaw] = useState('');              // romaji user typed
    const [typedKana, setTypedKana] = useState('');  // converted kana (display)

    // Refs / timers
    const inputRef = useRef(null);
    const timerRef = useRef(null);

    // Viewport width (for centering first char under caret)
    const [viewportW, setViewportW] = useState(0);

    // Conveyor scroll offset (in px). We translate the whole row by -scrollX.
    const scrollX = useRef(new Animated.Value(0)).current;

    // ---- Caret blink (fixed at screen center) ----
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

    // ---- Derived for current word ----
    const currentWord = words[wIndex] ?? words[0];
    const currentTarget = currentWord?.reading || '';

    // ---- Per-WORD measurement for *all* words in the conveyor ----
    const wordTotalWidths = useRef({}); // { [i]: widthPx }
    const [layoutTick, setLayoutTick] = useState(0); // bump when widths change to trigger effects

    const onMeasureWord = (i, width) => {
        if (wordTotalWidths.current[i] !== width) {
            wordTotalWidths.current[i] = width;
            setLayoutTick((t) => t + 1);
        }
    };

    // Sum widths of all previous words + gap after each previous word
    const sumPrevWords = (idx) => {
        let s = 0;
        for (let k = 0; k < idx; k++) {
            s += (wordTotalWidths.current[k] ?? 0);
            s += INTER_WORD_GAP;
        }
        return s;
    };

    // ---- Focus, timers, lifecycle ----
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 300);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    useEffect(() => {
        hardReset(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setId]);

    useEffect(() => {
        if (!startTs) return;
        timerRef.current = setInterval(() => setElapsed(Date.now() - startTs), 200);
        return () => clearInterval(timerRef.current);
    }, [startTs]);

    // ---- Stats ----
    const minutes = Math.max(0.001, elapsed / 60000);
    const grossCharsBeforeThisWord =
        words.slice(0, wIndex).reduce((acc, w) => acc + [...(w.reading || '')].length + 1 /* gap */, 0);
    const grossChars = grossCharsBeforeThisWord + cIndex;
    const wpm = Math.round((grossChars / 5) / minutes);
    const accuracy = Math.max(0, Math.round(((grossChars - errors) / Math.max(1, grossChars)) * 100));

    // ---- LCP helper for matching kana ----
    const lcp = (a, b) => {
        const n = Math.min(a.length, b.length);
        let i = 0;
        while (i < n && a[i] === b[i]) i++;
        return i;
    };

    // ---- Animate conveyor ONLY when the active word changes ----
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

    // Center the first word once we know viewport + first word width
    useEffect(() => {
        if (viewportW === 0) return;
        // when widths are known, jump to offset for wIndex=0 (which is 0)
        const initialPx = sumPrevWords(0);
        animateToOffset(initialPx, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewportW, layoutTick]);

    // When the active word index changes, jump the conveyor so that new word starts under the caret
    useEffect(() => {
        if (viewportW === 0) return;
        const targetPx = sumPrevWords(wIndex);
        animateToOffset(targetPx, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wIndex]);

    // ---- Input handler (romaji -> kana; compare against reading) ----
    const onChange = (text) => {
        if (!startTs && text.length > 0) setStartTs(Date.now());
        setRaw(text);

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

        // Completed this word?
        if (kana === target && target.length > 0) {
            // advance to next word (this triggers the per-word conveyor jump in the effect above)
            setRaw('');
            setTypedKana('');
            setCIndex(0);

            if (wIndex < words.length - 1) {
                setWIndex(wIndex + 1);
            } else {
                if (timerRef.current) clearInterval(timerRef.current);
            }

            // keep focus
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    // ---- Reset session ----
    const hardReset = (reshuffle = true) => {
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

    // ---- Cycle through sets quickly (tap dataset label) ----
    const setsMeta = listSets();
    const cycleSet = () => {
        const i = setsMeta.findIndex((s) => s.id === setId);
        const next = setsMeta[(i + 1) % setsMeta.length]?.id || DEFAULT_SET_ID;
        setSetId(next);
    };

    return (
        <Pressable
            style={{ flex: 1, backgroundColor: '#0f1115' }}
            onPress={() => inputRef.current?.focus()}
        >
            {/* Top bar: dataset label + stats */}
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
                <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Text style={{ color: '#c9d1d9', fontSize: 14 }}>WPM {wpm}</Text>
                    <Text style={{ color: '#c9d1d9', fontSize: 14 }}>
                        ACC {isNaN(accuracy) ? 100 : accuracy}%
                    </Text>
                    <Text style={{ color: '#c9d1d9', fontSize: 14 }}>
                        {Math.floor((elapsed || 0) / 1000)}s
                    </Text>
                </View>
            </View>

            {/* Center line + conveyor */}
            <View
                style={{ flex: 1, justifyContent: 'center' }}
                onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
            >
                {/* Fixed caret at the exact horizontal center */}
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: viewportW / 2,
                        top: '50%',
                        transform: [{ translateX: -1 }, { translateY: -12 }],
                    }}
                >
                    <Animated.Text style={{ color: '#c9d1d9', fontSize: 22, opacity: caret }}>
                        │
                    </Animated.Text>
                </View>

                {/* Conveyor: first char starts under caret via paddingLeft = viewportW/2.
           We then translate left ONLY when the active word changes. */}
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
                                style={{
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    marginRight: INTER_WORD_GAP, // keep in sync with INTER_WORD_GAP
                                }}
                            >
                                {/* Main word with furigana above */}
                                <FuriganaWord
                                    surface={w.surface}
                                    reading={w.reading}
                                    active={isActive}
                                    fontSize={30}
                                />

                                {/* Optional romaji under active word */}
                                {isActive && showRomaji && (
                                    <Text style={{ marginTop: 4, color: '#8b98a9', fontSize: 12 }}>
                                        {w.romaji}
                                    </Text>
                                )}

                                {/* Typed kana preview under the active word (informational) */}
                                {isActive && (
                                    <Text style={{ marginTop: 8, fontSize: 18, color: '#22c55e' }}>
                                        {typedKana}
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </Animated.View>
            </View>

            {/* Hidden input (romaji) */}
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

            {/* Bottom controls */}
            <View
                style={{
                    padding: 16,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <Pressable
                    onPress={() => hardReset(true)}
                    style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderWidth: 1,
                        borderColor: '#2a2f3a',
                        borderRadius: 10,
                    }}
                >
                    <Text style={{ color: '#c9d1d9' }}>restart</Text>
                </Pressable>
                <Pressable
                    onPress={() => setShowRomaji((s) => !s)}
                    style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderWidth: 1,
                        borderColor: '#2a2f3a',
                        borderRadius: 10,
                    }}
                >
                    <Text style={{ color: '#c9d1d9' }}>
                        {showRomaji ? 'romaji: on' : 'romaji: off'}
                    </Text>
                </Pressable>
            </View>
        </Pressable>
    );
}
