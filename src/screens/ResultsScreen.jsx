import { useEffect, useState } from 'react';

const KAOMOJIS = [
    '(＾▽＾)', '(￣▽￣)', '(≧◡≦)', 'ヽ(´▽`)/', '(•‿•)', '(^_−)−☆',
    '(｀・ω・´)', '(ᵔᴥᵔ)', 'o(>‿<)o', '( •̀ ω •́ )✧', '╰(°▽°)╯', 'ヾ(•ω•`)o',
    '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(¬‿¬)', '(๑˃̵ᴗ˂̵)و', '✧(๑•̀ㅂ•́)و',
];

export default function ResultsScreen({ results, onBack, onOpenStats }) {
    const { wpm = 0, timeSec = 0, accuracy = null, words = [], isBest, previousBest } = results;
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
                {isBest && <p className="results-best">new personal best! (was {previousBest})</p>}
                <p className="results-time">
                    time: {timeSec}s{accuracy != null && ` · accuracy: ${accuracy}%`}
                </p>
                <div className="results-actions">
                    <button className="button button-filled" onClick={onBack}>
                        back
                    </button>
                    <button className="button" onClick={onOpenStats}>
                        stats
                    </button>
                </div>
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
