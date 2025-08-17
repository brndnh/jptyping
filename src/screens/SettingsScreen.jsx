import { View, Text, Pressable, Switch } from 'react-native';
import { useSettings } from '../state/SettingsContext';

const Row = ({ children }) => (
    <View style={{ paddingVertical: 12, borderBottomColor: '#22262f', borderBottomWidth: 1 }}>
        {children}
    </View>
);

export default function SettingsScreen() {
    const { settings, setSetting, resetSettings, ready } = useSettings();
    if (!ready) return null;

    const Toggle = ({ label, value, onValueChange }) => (
        <Row>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#c9d1d9', fontSize: 16 }}>{label}</Text>
                <Switch value={value} onValueChange={onValueChange} />
            </View>
        </Row>
    );

    const Option = ({ label, value, options }) => (
        <Row>
            <Text style={{ color: '#c9d1d9', marginBottom: 8 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {options.map((opt) => (
                    <Pressable
                        key={opt}
                        onPress={() => setSetting(value, opt)}
                        style={{
                            paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginRight: 8, marginBottom: 8,
                            borderWidth: 1, borderColor: settings[value] === opt ? '#22c55e' : '#2a2f3a',
                        }}
                    >
                        <Text style={{ color: '#c9d1d9' }}>{opt}</Text>
                    </Pressable>
                ))}
            </View>
        </Row>
    );

    return (
        <View style={{ flex: 1, padding: 20 }}>
            <Toggle
                label="Show romaji aid under active word"
                value={settings.romajiAid}
                onValueChange={(v) => setSetting('romajiAid', v)}
            />
            <Option label="Data source" value="source" options={['local', 'jisho']} />
            <Option label="Words per run" value="length" options={[10, 25, 50].map(String)} />
            <Option label="JLPT level (future)" value="jlpt" options={['N5', 'N4', 'N3']} />

            <Pressable
                onPress={resetSettings}
                style={{
                    marginTop: 24, alignSelf: 'flex-start',
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                    borderWidth: 1, borderColor: '#2a2f3a',
                }}
            >
                <Text style={{ color: '#c9d1d9' }}>Reset to defaults</Text>
            </Pressable>
        </View>
    );
}
