import { View, Text, Pressable, ScrollView } from 'react-native';
import { useEffect, useState, useMemo } from 'react';

export default function ResultsScreen({ route, navigation }) {
    const { wpm = 0, timeSec = 0, words = [] } = route.params ?? {};

    // Pool of kaomojis
    const KAOMOJIS = useMemo(
        () => [
            "(＾▽＾)", "(￣▽￣)", "(≧◡≦)", "ヽ(´▽`)/", "(•‿•)", "(^_−)−☆",
            "(｀・ω・´)", "(ᵔᴥᵔ)", "o(>‿<)o", "( •̀ ω •́ )✧", "╰(°▽°)╯", "ヾ(•ω•`)o",
            "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "(¬‿¬)", "(๑˃̵ᴗ˂̵)و", "✧(๑•̀ㅂ•́)و"
        ],
        []
    );

    const [kaomoji, setKaomoji] = useState('');

    // Pick a kaomoji whenever the score changes
    useEffect(() => {
        const next = KAOMOJIS[Math.floor(Math.random() * KAOMOJIS.length)];
        setKaomoji(next);
    }, [wpm, KAOMOJIS]);

    const Btn = ({ title, onPress, filled }) => (
        <Pressable
            onPress={onPress}
            style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 12,
                borderWidth: filled ? 0 : 1,
                borderColor: '#2a2f3a',
                backgroundColor: filled ? '#2a2f3a' : 'transparent',
                marginHorizontal: 6,
            }}
        >
            <Text style={{ color: '#c9d1d9', fontWeight: '600', fontSize: 16 }}>
                {title}
            </Text>
        </Pressable>
    );

    return (
        <ScrollView
            contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: 20,
            }}
        >
            {/* results card */}
            <View
                style={{
                    backgroundColor: '#161b22',
                    padding: 24,
                    borderRadius: 20,
                    alignItems: 'center',
                    width: '100%',
                    maxWidth: 400,
                    shadowColor: '#000',
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                    elevation: 4,
                }}
            >
                <Text style={{ color: '#c9d1d9', fontSize: 30, fontWeight: '500', textAlign: 'center' }}>
                    {wpm} WPM {kaomoji}
                </Text>
                <Text style={{ color: '#8b98a9', marginTop: 6, fontSize: 16 }}>
                    time: {timeSec}s
                </Text>

                <View style={{ flexDirection: 'row', marginTop: 24 }}>
                    <Btn
                        title="back"
                        onPress={() => navigation.navigate('Practice')}
                    />
                </View>
            </View>

            {/* word list */}
            {Array.isArray(words) && words.length > 0 && (
                <View
                    style={{
                        marginTop: 32,
                        width: '100%',
                        maxWidth: 400,
                        backgroundColor: '#0d1117',
                        padding: 16,
                        borderRadius: 12,
                    }}
                >
                    <Text
                        style={{
                            color: '#8b98a9',
                            marginBottom: 12,
                            fontWeight: '600',
                            fontSize: 16,
                        }}
                    >
                        words this run:
                    </Text>
                    {words.slice(0, 20).map((w, i) => (
                        <Text
                            key={i}
                            style={{ color: '#c9d1d9', opacity: 0.85, marginBottom: 4 }}
                        >
                            • {w.surface} ({w.reading})
                        </Text>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}
