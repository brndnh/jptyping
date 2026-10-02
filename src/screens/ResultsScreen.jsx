import { useEffect, useState } from 'react';

const KAOMOJIS = [
    '(＾▽＾)', '(￣▽￣)', '(≧◡≦)', 'ヽ(´▽`)/', '(•‿•)', '(^_−)−☆',
    '(｀・ω・´)', '(ᵔᴥᵔ)', 'o(>‿<)o', '( •̀ ω •́ )✧', '╰(°▽°)╯', 'ヾ(•ω•`)o',
    '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(¬‿¬)', '(๑˃̵ᴗ˂̵)و', '✧(๑•̀ㅂ•́)و',
];

export default function ResultsScreen({ results, onBack }) {
    const { wpm = 0, timeSec = 0, words = [] } = results;
    const [kaomoji] = useState(() => KAOMOJIS[Math.floor(Math.random() * KAOMOJIS.length)]);

    // enter / esc goes back
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') onBack();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onBack]);

    return (
        <main className="results">
            <section className="results-card">
                <h1 className="results-wpm">
                    {wpm} WPM {kaomoji}
                </h1>
                <p className="results-time">time: {timeSec}s</p>
                <button className="button button-filled" onClick={onBack}>
                    back
                </button>
            </section>

            {words.length > 0 && (
                <section className="results-words">
                    <h2>words this run:</h2>
                    <ul>
                        {words.slice(0, 20).map((w, i) => (
                            <li key={i}>
                                • {w.surface} ({w.reading})
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
