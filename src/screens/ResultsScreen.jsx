import { View, Text, Pressable } from 'react-native';

export default function ResultsScreen({ route, navigation }) {
    const { wpm = 0, timeSec = 0, words = [] } = route.params ?? {};

    const Btn = ({ title, onPress }) => (
        <Pressable
            onPress={onPress}
            style={{
                paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
                borderWidth: 1, borderColor: '#2a2f3a', marginRight: 10,
            }}
        >
            <Text style={{ color: '#c9d1d9' }}>{title}</Text>
        </Pressable>
    );

    return (
        <View style={{ flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#c9d1d9', fontSize: 42, fontWeight: '800' }}>{wpm} WPM</Text>

            <View style={{ flexDirection: 'row', marginTop: 20 }}>
                <Btn title="retry" onPress={() => navigation.replace('Practice')} />
            </View>

            {/* optional: missed words list */}
            {Array.isArray(words) && words.length > 0 && (
                <View style={{ marginTop: 24, width: '100%' }}>
                    <Text style={{ color: '#8b98a9', marginBottom: 8 }}>words this run:</Text>
                    {words.slice(0, 20).map((w, i) => (
                        <Text key={i} style={{ color: '#c9d1d9', opacity: 0.8 }}>
                            • {w.surface} ({w.reading})
                        </Text>
                    ))}
                </View>
            )}
        </View>
    );
}
