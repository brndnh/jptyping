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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FuriganaWord from '../components/FuriganaWord';
import { getSet, listSets, DEFAULT_SET_ID } from '../data';
import { romajiToHiragana } from '../utils/romanize';

// keep this in sync with the word container's marginright
const INTER_WORD_GAP = 32;

// max raw input length per word = reading length × this multiplier
const INPUT_LIMIT_MULTIPLIER = 4;

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
    // ----- safe area + keyboard offsets -----
    const insets = useSafeAreaInsets();
    const KAV_OFFSET = Platform.OS === 'ios' ? insets.top + 40: (StatusBar.currentHeight || 0);
    const EXTRA_BOTTOM_PAD = insets.bottom + -80; // positive padding so content clears keyboard

    // ---------- test mode controls ----------
    const [testMode, setTestMode] = useState('words');
    const [durationSec, setDurationSec] = useState(30);
    const [wordTarget, setWordTarget] = useState(10);

    // data source: local lesson set or live jisho
    const [source, setSource] = useState('local'); // 'local' | 'jisho'
    const [remoteWords, setRemoteWords] = useState(null);
    const [loadingJisho, setLoadingJisho] = useState(false);

    // ui toggles
    const [showRomaji, setShowRomaji] = useState(false);

    // active dataset
    const [setId, setSetId] = useState(DEFAULT_SET_ID);
    const lesson = useMemo(() => getSet(setId), [setId]);

    // shuffle seed
    const [seed, setSeed] = useState(0);

    // pick the pool for this run
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

    // viewport width
    const [viewportW, setViewportW] = useState(0);

    // conveyor offset (animated)
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

    // animator (used for centering)
    const animateToOffset = (px, animated = true) => {
        if (!animated) { scrollX.setValue(px); return; }
        Animated.timing(scrollX, {
            toValue: px,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    };

    // --- NEW: center the active word, not a caret ---
    const leftOf = (i) => sumPrevWords(i); // left x (content coords) of word i
    const computeCenterOffset = (idx) => {
        const w = wordTotalWidths.current[idx] ?? 0;     // measured width of active word
        const left = leftOf(idx);
        const centerX = left + w / 2;                    // midpoint of active word
        return Math.round((viewportW / 2) - centerX);    // translate so midpoint sits at screen center
    };

    // recenter whenever viewport, measurements, or active word changes
    useEffect(() => {
        if (viewportW === 0) return;
        if (wordTotalWidths.current[wIndex] == null) return; // wait for measurement
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

    // finish run
    const finishRun = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        const seconds = startTs
            ? Math.max(0, Math.floor((Date.now() - startTs) / 1000))
            : Math.floor((elapsed || 0) / 1000);

        const payload = {
            mode: testMode,
            source,
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

    // small pill
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
            style={{ flex: 1, backgroundColor: '#0f1115' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={KAV_OFFSET}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, paddingBottom: EXTRA_BOTTOM_PAD }}
                keyboardShouldPersistTaps="handled"
            >
                <Pressable style={{ flex: 1 }} onPress={() => inputRef.current?.focus()}>
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
                                {testMode === 'time'
                                    ? `⏱ ${remainingSec ?? Math.floor((elapsed || 0) / 1000)}s`
                                    : `🔢 ${wordsProgress}`}
                            </Text>
                        </View>
                    </View>

                    {/* quick mode controls (row 1) */}
                    <View style={{ paddingHorizontal: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Pill active={testMode === 'time'} onPress={() => { if (testMode !== 'time') { hardReset(false); setTestMode('time'); } }}>time</Pill>
                        <Pill active={testMode === 'words'} onPress={() => { if (testMode !== 'words') { hardReset(false); setTestMode('words'); } }}>words</Pill>

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

                    {/* source picker + jisho loading indicator (row 2) */}
                    <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                        <Pill active={source === 'local'} onPress={() => { setSource('local'); hardReset(false); }}>local</Pill>
                        <Pill active={source === 'jisho'} onPress={() => { setSource('jisho'); hardReset(true); }}>jisho</Pill>

                        {source === 'jisho' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                                {loadingJisho ? (
                                    <>
                                        <ActivityIndicator size="small" />
                                        <Text style={{ color: '#8b98a9', marginLeft: 6, fontSize: 12 }}>fetching words…</Text>
                                    </>
                                ) : (
                                    <Text style={{ color: '#8b98a9', marginLeft: 6, fontSize: 12 }}>
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
                        style={{ flex: 1, justifyContent: 'center' }}
                        onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
                    >
                        <Animated.View
                            style={{
                                opacity: source === 'jisho' && loadingJisho ? 0.5 : 1,
                                flexDirection: 'row',
                                alignItems: 'flex-end',
                                transform: [{ translateX: scrollX }], // active word midpoint anchored to screen center
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
                        autoFocus
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
                    <View
                        style={{
                            padding: 10,
                            paddingBottom: -20 + insets.bottom, // small, positive padding that respects safe area
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
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
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
