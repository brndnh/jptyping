import { View, Text } from 'react-native';

/**
 * props:
 *  - surface: '日本語'
 *  - reading: 'にほんご'
 *  - fontSize?: number
 *  - active?: boolean   // highlight current word
 */
export default function FuriganaWord({ surface, reading, fontSize = 28, active = false }) {
    const furiSize = Math.max(10, Math.round(fontSize * 0.5));
    return (
        <View style={{ alignItems: 'center', marginHorizontal: 8, opacity: active ? 1 : 0.5 }}>
            {/* Furigana */}
            <Text
                style={{
                    fontSize: furiSize,
                    color: '#a7b1c2',
                    lineHeight: furiSize + 4,
                }}
            >
                {reading}
            </Text>
            {/* Main surface */}
            <Text
                style={{
                    fontSize,
                    color: active ? '#e6edf3' : '#c9d1d9',
                    lineHeight: fontSize + 6,
                    fontWeight: active ? '700' : '500',
                }}
            >
                {surface}
            </Text>
        </View>
    );
}
