import { toHiragana } from '../utils/romanize';

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

const CHAR_STEP = 24; // px per kana char to scroll (simple, smooth MVP)

export default function PracticeScreen() {
    // UI toggles
    const [showRomaji, setShowRomaji] = useState(false);

    // Which data set is active (modular!)
    const [setId, setSetId] = useState(DEFAULT_SET_ID);
    const lesson = useMemo(() => getSet(setId), [setId]);

    // Shuffle key
    const [seed, setSeed] = useState(0);

    // Shuffle items once per session for variety
    const words = useMemo(() => {
        const arr = [...lesson.items];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, [lesson.items, seed]);

    // Typing/session state
    const [wIndex, setWIndex] = useState(0);   // active word
    const [cIndex, setCIndex] = useState(0);   // char index within active word (reading)
    const [typed, setTyped] = useState('');    // input buffer
    const [errors, setErrors] = useState(0);
    const [startTs, setStartTs] = useState(null);
    const [elapsed, setElapsed] = useState(0);

    // Refs
    const scrollX = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);
    const timerRef = useRef(null);

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

    // Derived
    const currentWord = words[wIndex] ?? words[0];
    const currentTarget = currentWord?.reading || '';

    // Focus hidden input on mount
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 300);
        return () => clearTimeout(t);
    }, []);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Reset session when set changes
    useEffect(() => {
        hardReset(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setId]);

    // Timer for WPM
    useEffect(() => {
        if (!startTs) return;
        timerRef.current = setInterval(() => setElapsed(Date.now() - startTs), 200);
        return () => clearInterval(timerRef.current);
    }, [startTs]);

    // Smooth scroll whenever we advance characters/words
    useEffect(() => {
        const totalTypedChars =
            words.slice(0, wIndex).reduce((acc, w) => acc + [...(w.reading || '')].length + 1 /* gap */, 0) +
            cIndex;

        Animated.timing(scrollX, {
            toValue: totalTypedChars * CHAR_STEP,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [cIndex, wIndex, words, scrollX]);

    // Stats
    const minutes = Math.max(0.001, elapsed / 60000);
    const grossChars =
        words.slice(0, wIndex).reduce((acc, w) => acc + [...(w.reading || '')].length, 0) + cIndex;
    const wpm = Math.round((grossChars / 5) / minutes);
    const accuracy = Math.max(0, Math.round(((grossChars - errors) / Math.max(1, grossChars)) * 100));

    // Input handler (kana typing against reading)
    const onChange = (text) => {
        if (!startTs && text.length > 0) setStartTs(Date.now());

        const target = currentTarget;
        const nextChar = target[cIndex];

        // Delete
        if (text.length < typed.length) {
            setTyped(text);
            if (cIndex > 0) setCIndex(cIndex - 1);
            return;
        }

        // Added char
        const added = text[text.length - 1];
        setTyped(text);

        if (!nextChar) return;

        if (added === nextChar) {
            const nextIndex = cIndex + 1;
            setCIndex(nextIndex);

            // Word complete → advance
            if (nextIndex >= target.length) {
                setTyped('');
                setCIndex(0);
                if (wIndex < words.length - 1) {
                    setWIndex(wIndex + 1);
                } else {
                    // Session complete
                    if (timerRef.current) clearInterval(timerRef.current);
                }
            }
        } else {
            setErrors((e) => e + 1);
        }
    };

    // Full reset (optionally reshuffle)
    const hardReset = (reshuffle = true) => {
        if (reshuffle) setSeed((s) => s + 1);
        setWIndex(0);
        setCIndex(0);
        setTyped('');
        setErrors(0);
        setStartTs(null);
        setElapsed(0);
        scrollX.setValue(0);
        inputRef.current?.clear();
        setTimeout(() => inputRef.current?.focus(), 200);
    };

    // Cycle through available sets quickly (tap the label)
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

            {/* Conveyor viewport */}
            <View style={{ flex: 1, justifyContent: 'center', overflow: 'hidden' }}>
                <Animated.View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        transform: [{ translateX: Animated.multiply(scrollX, -1) }],
                        paddingLeft: 80, // visual center offset
                    }}
                >
                    {words.map((w, i) => {
                        const isActive = i === wIndex;
                        const reading = w.reading || '';
                        const activePrefix = isActive ? reading.slice(0, cIndex) : '';
                        const activeChar = isActive ? reading[cIndex] : '';
                        const activeSuffix = isActive ? reading.slice(cIndex + 1) : '';

                        return (
                            <View
                                key={`${w.surface}-${i}`}
                                style={{ flexDirection: 'column', alignItems: 'center', marginRight: 18 }}
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
                                    <Text style={{ marginTop: 4, color: '#8b98a9', fontSize: 12 }}>{w.romaji}</Text>
                                )}

                                {/* Active reading progress (under word) */}
                                {isActive && (
                                    <View style={{ marginTop: 8, alignItems: 'center' }}>
                                        {/* Typed text with caret only */}
                                        <Text style={{ fontSize: 18, color: '#22c55e' }}>
                                            {typed}
                                            <Animated.Text style={{ opacity: caret }}>▌</Animated.Text>
                                        </Text>
                                    </View>
                                )}

                            </View>
                        );
                    })}
                </Animated.View>
            </View>

            {/* Hidden input to capture keystrokes */}
            <TextInput
                ref={inputRef}
                value={typed}
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
                    <Text style={{ color: '#c9d1d9' }}>{showRomaji ? 'romaji: on' : 'romaji: off'}</Text>
                </Pressable>
            </View>
        </Pressable>
    );
}
