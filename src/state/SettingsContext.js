// simple settings store with AsyncStorage persistence
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'jp.settings.v1';
const DEFAULTS = {
    romajiAid: false,
    source: 'local', // 'local' | 'jisho'
    jlpt: 'N5',      // future use
    length: 25,      // words per run
};

const SettingsCtx = createContext({
    settings: DEFAULTS,
    setSetting: () => { },
    resetSettings: () => { },
    ready: false,
});

export function SettingsProvider({ children }) {
    const [settings, setSettings] = useState(DEFAULTS);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(KEY);
                if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
            } catch { }
            setReady(true);
        })();
    }, []);

    const setSetting = (key, value) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: value };
            AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => { });
            return next;
        });
    };

    const resetSettings = () => {
        setSettings(DEFAULTS);
        AsyncStorage.setItem(KEY, JSON.stringify(DEFAULTS)).catch(() => { });
    };

    const value = useMemo(() => ({ settings, setSetting, resetSettings, ready }), [settings, ready]);
    return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);
