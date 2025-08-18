import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    ActivityIndicator,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FuriganaWord from '../components/FuriganaWord';
import { getSet, listSets, DEFAULT_SET_ID } from '../data';
import { romajiToHiragana } from '../utils/romanize';

// layout
const INTER_WORD_GAP = 32;
// input guard
const INPUT_LIMIT_MULTIPLIER = 4;

// design tokens
const COLORS = {
    bg: '#0f1115',
    text: '#c9d1d9',
    subtext: '#8b98a9',
    accent: '#22c55e',
    border: '#2a2f3a',
};

const FONT_SIZES = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 32,
    display: 40, // main word size
};

// tiny jisho fetcher (random-ish) – returns [{ surface, reading }]
async function fetchRandomJishoWords(count = 25) {
    const buckets = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'や', 'ゆ', 'よ', 'ら', 'り', 'る', 'れ', 'ろ', 'わ', 'を', 'ん'];
    const out = [];
    let guard = 0;

    while (out.length < count && guard++ < count * 5) {
        const q = buckets[Math.floor(Math.random() * buckets.length)];
        const page = 1 + Math.floor(Math.random() * 5);
        const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(q)}&page=${page}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            const arr = json?.data ?? [];
            if (!arr.length) continue;
            const pick = arr[Math.floor(Math.random() * arr.length)];
            const jp = pick?.japanese?.[0] ?? {};
            const surface = jp.word || jp.reading || '';
            const reading = jp.reading || '';
            if (!reading) continue;
            out.push({ surface, reading, romaji: undefined });
        } catch {
            // ignore and continue
        }
    }
    return out;
}

export default function PracticeScreen({ navigation }) {
    // safe area + keyboard offsets
    const insets = useSafeAreaInsets();
    const KAV_OFFSET = Platform.OS === 'ios' ? insets.top + 40 : (StatusBar.currentHeight || 0);
    const EXTRA_BOTTOM_PAD = insets.bottom + -80; // keep content clear of tall keyboards

    // test mode controls
    const [testMode, setTestMode] = useState('words');
    const [durationSec, setDurationSec] = useState(30);
    const [wordTarget, setWordTarget] = useState(10);

    // data source
    const [source, setSource] = useState('local'); // 'local' | 'jisho'
    const [remoteWords, setRemoteWords] = useState(null);
    const [loadingJisho, setLoadingJisho] = useState(false);

    // ui toggles
    const [showRomaji, setShowRomaji] = useState(false);
    const [showFurigana, setShowFurigana] = useState(true);


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
    const words = useMemo(() => {
        const arr = [...wordPool];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, [wordPool, seed]);

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

    // viewport
    const [viewportW, setViewportW] = useState(0);

    // conveyor offset
    const scrollX = useRef(new Animated.Value(0)).current;

    // current word
    const currentWord = words[wIndex] ?? words[0];
    const currentTarget = currentWord?.reading || '';

    // measurement
    const wordTotalWidths = useRef({});
    const [layoutTick, setLayoutTick] = useState(0);

    const onMeasureWord = (i, width) => {
        if (wordTotalWidths.current[i] == null) {
            wordTotalWidths.current[i] = width;
            setLayoutTick((t) => t + 1);
        }
    };

    const sumPrevWords = (idx) => {
        let s = 0;
        for (let k = 0; k < idx; k++) {
            s += (wordTotalWidths.current[k] ?? 0);
            s += INTER_WORD_GAP;
        }
        return s;
    };

    // focus & cleanup
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 300);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => () => timerRef.current && clearInterval(timerRef.current), []);

    // jisho prefetch
    useEffect(() => {
        let alive = true;
        (async () => {
            if (source !== 'jisho') return;
            setLoadingJisho(true);
            const need = Number.isFinite(wordTarget) ? wordTarget : 25;
            const got = await fetchRandomJishoWords(Math.max(10, need));
            if (alive) {
                setRemoteWords(got);
                setLoadingJisho(false);
            }
        })();
        return () => { alive = false; };
    }, [source, wordTarget, seed]);

    // reset when dataset changes
    useEffect(() => {
        hardReset(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setId]);

    // timer tick
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

    // lcp
    const lcp = (a, b) => {
        const n = Math.min(a.length, b.length);
        let i = 0;
        while (i < n && a[i] === b[i]) i++;
        return i;
    };

    // animator (centering)
    const animateToOffset = (px, animated = true) => {
        if (!animated) { scrollX.setValue(px); return; }
        Animated.timing(scrollX, {
            toValue: px,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    // center the active word
    const leftOf = (i) => sumPrevWords(i);
    const computeCenterOffset = (idx) => {
        const w = wordTotalWidths.current[idx] ?? 0;
        const left = leftOf(idx);
        const centerX = left + w / 2;
        return Math.round((viewportW / 2) - centerX);
    };

    useEffect(() => {
        if (viewportW === 0) return;
        if (wordTotalWidths.current[wIndex] == null) return;
        animateToOffset(computeCenterOffset(wIndex), true);
    }, [viewportW, layoutTick, wIndex]); // eslint-disable-line

    // input handler with per-word cap
    const onChange = (text) => {
        if (!startTs && text.length > 0) {
            const now = Date.now();
            setStartTs(now);
            endTsRef.current = testMode === 'time' ? now + durationSec * 1000 : null;
        }

        const targetLen = currentTarget.length || 0;
        const maxRaw = Math.max(1, targetLen * INPUT_LIMIT_MULTIPLIER);
        if (text.length > maxRaw) text = text.slice(0, maxRaw);

        setRaw(text);

        const kana = romajiToHiragana(text);
        setTypedKana(kana);

        const prev = cIndex;
        const matched = lcp(kana, currentTarget);
        setCIndex(matched);

        if (text.length > raw.length && matched <= prev && kana.length >= prev) {
            setErrors((e) => e + 1);
        }

        if (kana === currentTarget && currentTarget.length > 0) {
            setRaw('');
            setTypedKana('');
            setCIndex(0);

            if (testMode === 'words') {
                const targetCount = Number.isFinite(wordTarget) ? wordTarget : Infinity;
                if (wIndex + 1 >= targetCount || wIndex + 1 >= words.length) {
                    finishRun();
                    return;
                }
            }

            if (wIndex < words.length - 1) setWIndex(wIndex + 1);
            else { finishRun(); return; }

            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    // helper: gross chars typed up to "now" (completed words + current match)
    const grossCharsUpToNow = () => {
        const before = words.slice(0, wIndex)
            .reduce((acc, w) => acc + [...(w.reading || '')].length + 1 /* gap */, 0);
        return before + cIndex;
    };

    // finish run
    const finishRun = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        // compute precise elapsed for final wpm (don't rely on state that may be stale)
        const finalMs =
            testMode === 'time'
                ? durationSec * 1000
                : (startTs ? Math.max(0, Date.now() - startTs) : (elapsed || 0));

        // clamp to at least 1s to avoid insane spikes from ~0 minutes
        const finalMinutes = Math.max(1 / 60, finalMs / 60000);
        const finalGross = grossCharsUpToNow();
        const wpmFinal = Math.round((finalGross / 5) / finalMinutes);

        const seconds = Math.floor(finalMs / 1000);

        const payload = {
            mode: testMode,
            source,
            durationSec: testMode === 'time' ? durationSec : undefined,
            targetWords: testMode === 'words'
                ? (Number.isFinite(wordTarget) ? wordTarget : 'unlimited')
                : undefined,
            wpm: wpmFinal,
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

        if (reshuffle) setSeed((s) => s + 1);
        setWIndex(0);
        setCIndex(0);
        setRaw('');
        setTypedKana('');
        setErrors(0);
        setStartTs(null);
        setElapsed(0);
        wordTotalWidths.current = {};
        setLayoutTick((t) => t + 1);
        scrollX.setValue(0);
        setTimeout(() => {
            inputRef.current?.clear?.();
            inputRef.current?.focus?.();
        }, 200);
    };

    // cycle sets
    const setsMeta = listSets();
    const cycleSet = () => {
        const i = setsMeta.findIndex((s) => s.id === setId);
        const next = setsMeta[(i + 1) % setsMeta.length]?.id || DEFAULT_SET_ID;
        setSetId(next);
    };

    // pill
    const Pill = ({ active, onPress, children }) => (
        <Pressable
            onPress={onPress}
            style={[styles.pill, active && styles.pillActive]}
        >
            <Text style={styles.pillText}>{children}</Text>
        </Pressable>
    );

    // ui readouts
    const remainingSec =
        testMode === 'time'
            ? Math.max(0, Math.ceil(((endTsRef.current ?? 0) - Date.now()) / 1000))
            : null;

    const wordsProgress =
        testMode === 'words'
            ? `${Math.min(wIndex + 1, Number.isFinite(wordTarget) ? wordTarget : wIndex + 1)} / ${Number.isFinite(wordTarget) ? wordTarget : '∞'}`
            : null;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={KAV_OFFSET}
        >
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: EXTRA_BOTTOM_PAD }]}
                keyboardShouldPersistTaps="handled"
            >
                <Pressable style={styles.flex} onPress={() => inputRef.current?.focus()}>
                    {/* top bar */}
                    <View style={styles.topBar}>
                        <Pressable onPress={cycleSet}>
                            <Text style={styles.topLabel}>
                                {lesson.label} 
                                {/* • {showRomaji ? 'romaji aid' : 'hiragana/kanji'} */}
                            </Text>
                        </Pressable>

                        <View style={styles.topRight}>
                            <Text style={styles.wpm}>wpm {isFinite(wpm) ? wpm : 0}</Text>
                            <Text style={styles.meter}>
                                {testMode === 'time'
                                    ? `⏱ ${remainingSec ?? Math.floor((elapsed || 0) / 1000)}s`
                                    : `${wordsProgress}`}
                            </Text>
                        </View>
                    </View>

                    {/* quick mode controls (row 1) */}
                    <View style={styles.rowControls}>
                        <Pill active={testMode === 'time'} onPress={() => { if (testMode !== 'time') { hardReset(false); setTestMode('time'); } }}>time</Pill>
                        <Pill active={testMode === 'words'} onPress={() => { if (testMode !== 'words') { hardReset(false); setTestMode('words'); } }}>words</Pill>

                        {testMode === 'time' ? (
                            <View style={styles.inlineRow}>
                                <Pill active={durationSec === 15} onPress={() => { hardReset(false); setDurationSec(15); }}>15s</Pill>
                                <Pill active={durationSec === 30} onPress={() => { hardReset(false); setDurationSec(30); }}>30s</Pill>
                            </View>
                        ) : (
                            <View style={styles.inlineRow}>
                                <Pill active={wordTarget === 10} onPress={() => { hardReset(false); setWordTarget(10); }}>10</Pill>
                                <Pill active={wordTarget === 25} onPress={() => { hardReset(false); setWordTarget(25); }}>25</Pill>
                                <Pill active={wordTarget === 50} onPress={() => { hardReset(false); setWordTarget(50); }}>50</Pill>
                                <Pill active={!Number.isFinite(wordTarget)} onPress={() => { hardReset(false); setWordTarget(Infinity); }}>∞</Pill>
                            </View>
                        )}
                    </View>

                    {/* source picker + jisho indicator (row 2) */}
                    <View style={styles.rowSource}>
                        <Pill active={source === 'local'} onPress={() => { setSource('local'); hardReset(false); }}>local</Pill>
                        <Pill active={source === 'jisho'} onPress={() => { setSource('jisho'); hardReset(true); }}>jisho</Pill>

                        {source === 'jisho' && (
                            <View style={styles.inlineRow}>
                                {loadingJisho ? (
                                    <>
                                        <ActivityIndicator size="small" />
                                        <Text style={styles.hint}>fetching words…</Text>
                                    </>
                                ) : (
                                    <Text style={styles.hint}>
                                        {Array.isArray(remoteWords) && remoteWords.length
                                            ? `${remoteWords.length} loaded`
                                            : 'no results, using local fallback'}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>

                    {/* center area + conveyor (active word centered) */}
                    <View
                        style={styles.centerArea}
                        onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
                    >
                        <Animated.View
                            style={[
                                styles.conveyor,
                                { opacity: source === 'jisho' && loadingJisho ? 0.5 : 1, transform: [{ translateX: scrollX }] },
                            ]}
                        >
                            {words.map((w, i) => {
                                const isActive = i === wIndex;
                                return (
                                    <View
                                        key={`${w.surface}-${i}`}
                                        onLayout={(e) => onMeasureWord(i, e.nativeEvent.layout.width)}
                                        style={styles.wordBlock}
                                    >
                                        <FuriganaWord
                                            surface={w.surface}
                                            reading={showFurigana ? w.reading : ''}
                                            active={isActive}
                                            fontSize={FONT_SIZES.display}
                                        />


                                        {isActive && showRomaji && (
                                            <Text style={styles.romaji}>{w.romaji}</Text>
                                        )}

                                        {isActive && (
                                            <Text style={styles.typedKana}>{typedKana}</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </Animated.View>
                    </View>

                    {/* hidden input (romaji) */}
                    <TextInput
                        autoFocus
                        ref={inputRef}
                        value={raw}
                        onChangeText={onChange}
                        autoCorrect={false}
                        autoCapitalize="none"
                        keyboardType="default"
                        style={styles.hiddenInput}
                        blurOnSubmit={false}
                    />

                    {/* bottom controls */}
                    <View style={[styles.bottomBar, { paddingBottom: -20 + insets.bottom }]}>
                        <Pressable onPress={() => hardReset(true)} style={styles.button}>
                            <Text style={styles.buttonText}>restart</Text>
                        </Pressable>

                        <View style={{ flexDirection: 'row' }}>
                            <Pressable onPress={() => setShowRomaji((s) => !s)} style={styles.button}>
                                <Text style={styles.buttonText}>{showRomaji ? 'romaji: on' : 'romaji: off'}</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => setShowFurigana((s) => !s)}
                                style={[styles.button, { marginLeft: 10 }]}  // small gap, preserves overall spacing
                            >
                                <Text style={styles.buttonText}>{showFurigana ? 'furigana: on' : 'furigana: off'}</Text>
                            </Pressable>
                        </View>
                    </View>

                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    scrollContent: {
        flexGrow: 1,
    },
    flex: {
        flex: 1,
    },

    // top bar
    topBar: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    topLabel: {
        color: COLORS.subtext,
        fontSize: FONT_SIZES.md,
    },
    topRight: {
        alignItems: 'flex-end',
    },
    wpm: {
        color: COLORS.text,
        fontSize: FONT_SIZES.lg,
    },
    meter: {
        color: COLORS.subtext,
        fontSize: FONT_SIZES.sm,
        marginTop: 4,
    },

    // controls rows
    rowControls: {
        paddingHorizontal: 16,
        paddingBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    rowSource: {
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    inlineRow: {
        flexDirection: 'row',
        marginLeft: 8,
        alignItems: 'center',
    },

    // pill
    pill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginRight: 8,
    },
    pillActive: {
        borderColor: COLORS.accent,
    },
    pillText: {
        color: COLORS.text,
        fontSize: FONT_SIZES.md,
    },

    // hints / helper text
    hint: {
        color: COLORS.subtext,
        fontSize: FONT_SIZES.sm,
        marginLeft: 8,
    },

    // center + conveyor
    centerArea: {
        flex: 1,
        justifyContent: 'center',
    },
    conveyor: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    wordBlock: {
        flexDirection: 'column',
        alignItems: 'center',
        marginRight: INTER_WORD_GAP,
    },
    romaji: {
        marginTop: 6,
        color: COLORS.subtext,
        fontSize: FONT_SIZES.md,
    },
    typedKana: {
        marginTop: 10,
        fontSize: FONT_SIZES.lg,
        color: COLORS.accent,
    },

    // hidden input
    hiddenInput: {
        height: 0,
        width: 0,
        opacity: 0,
        position: 'absolute',
    },

    // bottom controls
    bottomBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
    },
    buttonText: {
        color: COLORS.text,
        fontSize: FONT_SIZES.md,
    },
});
