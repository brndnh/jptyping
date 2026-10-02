import { useEffect, useState } from 'react';

import PracticeScreen from './screens/PracticeScreen.jsx';
import ResultsScreen from './screens/ResultsScreen.jsx';
import StatsScreen from './screens/StatsScreen.jsx';
import { recordRun } from './utils/progress';
import { DEFAULT_SET_ID } from './data';

const SETTINGS_KEY = 'jptyping:settings';

const DEFAULT_SETTINGS = {
    testMode: 'words', // 'time' | 'words'
    durationSec: 30,
    wordTarget: 10, // Infinity = unlimited
    source: 'local', // 'local' | 'jisho'
    setId: DEFAULT_SET_ID,
    showRomaji: false,
    showFurigana: true,
    theme: 'auto', // 'auto' (follow system) | 'light' | 'dark'
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
    const [screen, setScreen] = useState('practice'); // 'practice' | 'results' | 'stats'
    const [results, setResults] = useState(null);

    useEffect(() => {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch {
            // storage unavailable (private mode etc.) - settings just won't persist
        }
    }, [settings]);

    // 'auto' leaves it to prefers-color-scheme in styles.css
    useEffect(() => {
        const root = document.documentElement;
        if (settings.theme === 'auto') delete root.dataset.theme;
        else root.dataset.theme = settings.theme;

        const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    }, [settings.theme]);

    const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

    const finishRun = (run) => {
        setResults({ ...run, ...recordRun(run) });
        setScreen('results');
    };

    const practiceWeakWords = () => {
        updateSettings({ source: 'weak' });
        setScreen('practice');
    };

    if (screen === 'results') {
        return (
            <ResultsScreen
                results={results}
                onBack={() => setScreen('practice')}
                onOpenStats={() => setScreen('stats')}
            />
        );
    }
    if (screen === 'stats') {
        return <StatsScreen onBack={() => setScreen('practice')} onPracticeWeak={practiceWeakWords} />;
    }
    return (
        <PracticeScreen
            settings={settings}
            updateSettings={updateSettings}
            onFinish={finishRun}
            onOpenStats={() => setScreen('stats')}
        />
    );
}
