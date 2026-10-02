import { useEffect, useState } from 'react';

import PracticeScreen from './screens/PracticeScreen.jsx';
import ResultsScreen from './screens/ResultsScreen.jsx';

const SETTINGS_KEY = 'jptyping:settings';

const DEFAULT_SETTINGS = {
    testMode: 'words', // 'time' | 'words'
    durationSec: 30,
    wordTarget: 10, // Infinity = unlimited
    source: 'local', // 'local' | 'jisho'
    showRomaji: false,
    showFurigana: true,
};

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (!saved) return DEFAULT_SETTINGS;
        // Infinity serializes as null
        return { ...DEFAULT_SETTINGS, ...saved, wordTarget: saved.wordTarget ?? Infinity };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export default function App() {
    const [settings, setSettings] = useState(loadSettings);
    const [results, setResults] = useState(null);

    useEffect(() => {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch {
            // storage unavailable (private mode etc.) - settings just won't persist
        }
    }, [settings]);

    const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

    return results ? (
        <ResultsScreen results={results} onBack={() => setResults(null)} />
    ) : (
        <PracticeScreen settings={settings} updateSettings={updateSettings} onFinish={setResults} />
    );
}
