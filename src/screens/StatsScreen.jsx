import { useEffect, useMemo, useRef, useState } from 'react';

import WpmChart, { formatDate, formatMode } from '../components/WpmChart.jsx';
import {
    loadProgress,
    getWeakWords,
    exportProgress,
    importProgress,
    resetProgress,
    parseBestKey,
    WEAK_MIN,
} from '../utils/progress';

const SET_ORDER = ['N5', 'N4', 'N3', 'N5 sentences', 'N4 sentences', 'N3 sentences', 'jisho', 'weak'];
const CHART_RUNS = 50;
const TABLE_RUNS = 20;

const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
}

const Tile = ({ label, value }) => (
    <div className="stat-tile">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
    </div>
);

export default function StatsScreen({ onBack, onPracticeWeak }) {
    const [data, setData] = useState(loadProgress);
    const [filter, setFilter] = useState('all');
    const [notice, setNotice] = useState('');
    const fileRef = useRef(null);

    // esc goes back
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onBack();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onBack]);

    const setsUsed = SET_ORDER.filter((set) => data.runs.some((r) => r.set === set));
    const runs = useMemo(
        () => (filter === 'all' ? data.runs : data.runs.filter((r) => r.set === filter)),
        [data, filter]
    );
    const recent = runs.slice(-10);

    const bests = Object.entries(data.bests)
        .map(([key, best]) => ({ ...parseBestKey(key), ...best }))
        .filter((b) => filter === 'all' || b.set === filter)
        .sort((a, b) =>
            SET_ORDER.indexOf(a.set) - SET_ORDER.indexOf(b.set)
            || a.mode.localeCompare(b.mode)
            || Number(a.n) - Number(b.n));

    const weakWords = useMemo(() => getWeakWords(15, data), [data]);

    const download = () => {
        const blob = new Blob([exportProgress()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jptyping-progress-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const upload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!window.confirm('Replace your saved progress with this file?')) return;
        const ok = importProgress(await file.text());
        setNotice(ok ? 'progress imported' : "that file isn't a jptyping progress export");
        if (ok) setData(loadProgress());
    };

    const reset = () => {
        if (!window.confirm('Delete all saved runs, bests and word history? This can\'t be undone.')) return;
        resetProgress();
        setData(loadProgress());
        setNotice('progress reset');
    };

    return (
        <main className="stats">
            <header className="stats-header">
                <h1>progress</h1>
                <button type="button" className="button" onClick={onBack}>back</button>
            </header>

            {data.runs.length === 0 ? (
                <p className="stats-empty">no runs yet. finish a run and it'll show up here.</p>
            ) : (
                <>
                    {/* filter scopes everything below */}
                    <div className="row">
                        {['all', ...setsUsed].map((set) => (
                            <button
                                key={set}
                                type="button"
                                className={`pill${filter === set ? ' pill-active' : ''}`}
                                onClick={() => setFilter(set)}
                            >
                                {set}
                            </button>
                        ))}
                    </div>

                    {runs.length === 0 ? (
                        <p className="stats-empty">no runs for {filter} yet.</p>
                    ) : (
                        <>
                            <section className="stat-tiles">
                                <Tile label="Runs" value={runs.length} />
                                <Tile label="Best wpm" value={Math.max(...runs.map((r) => r.wpm))} />
                                <Tile label="Avg wpm, last 10" value={Math.round(average(recent.map((r) => r.wpm)))} />
                                <Tile
                                    label="Accuracy, last 10"
                                    value={(() => {
                                        const acc = average(recent.map((r) => r.acc).filter((a) => a != null));
                                        return acc == null ? '–' : `${Math.round(acc)}%`;
                                    })()}
                                />
                                <Tile label="Time practiced" value={formatDuration(runs.reduce((a, r) => a + r.sec, 0))} />
                            </section>

                            <section className="stats-section">
                                <h2>wpm over your last {Math.min(runs.length, CHART_RUNS)} runs</h2>
                                <WpmChart runs={runs.slice(-CHART_RUNS)} />
                            </section>

                            {bests.length > 0 && (
                                <section className="stats-section">
                                    <h2>personal bests</h2>
                                    <table className="stats-table">
                                        <thead>
                                            <tr><th>set</th><th>test</th><th className="num">wpm</th><th>date</th></tr>
                                        </thead>
                                        <tbody>
                                            {bests.map((b) => (
                                                <tr key={`${b.set}|${b.mode}|${b.n}`}>
                                                    <td>{b.set}</td>
                                                    <td>{formatMode(b)}</td>
                                                    <td className="num">{b.wpm}</td>
                                                    <td>{formatDate(b.t)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </section>
                            )}

                            <section className="stats-section">
                                <h2>recent runs</h2>
                                <table className="stats-table">
                                    <thead>
                                        <tr><th>date</th><th>set</th><th>test</th><th className="num">wpm</th><th className="num">acc</th></tr>
                                    </thead>
                                    <tbody>
                                        {runs.slice(-TABLE_RUNS).reverse().map((r) => (
                                            <tr key={r.t}>
                                                <td>{formatDate(r.t, true)}</td>
                                                <td>{r.set}</td>
                                                <td>{formatMode(r)}</td>
                                                <td className="num">{r.wpm}</td>
                                                <td className="num">{r.acc == null ? '–' : `${r.acc}%`}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        </>
                    )}
                </>
            )}

            <section className="stats-section">
                <div className="stats-section-head">
                    <h2>weak words</h2>
                    <button
                        type="button"
                        className="button"
                        onClick={onPracticeWeak}
                        disabled={weakWords.length < WEAK_MIN}
                    >
                        practice these
                    </button>
                </div>
                {weakWords.length === 0 ? (
                    <p className="stats-empty">nothing yet. words you miss or type slowly will collect here.</p>
                ) : (
                    <>
                        {weakWords.length < WEAK_MIN && (
                            <p className="hint">need at least {WEAK_MIN} to practice them as a set.</p>
                        )}
                        <table className="stats-table">
                            <thead>
                                <tr><th>word</th><th className="num">misses</th><th className="num">avg time</th><th className="num">seen</th></tr>
                            </thead>
                            <tbody>
                                {weakWords.map((w) => (
                                    <tr key={`${w.r}|${w.s}`}>
                                        <td>
                                            {w.s} <span className="stats-reading">{w.s !== w.r ? w.r : ''}</span>
                                        </td>
                                        <td className="num">{Math.round(w.miss * 100)}%</td>
                                        <td className="num">{((w.mpc * w.r.length) / 1000).toFixed(1)}s</td>
                                        <td className="num">{w.seen}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </section>

            <section className="stats-section">
                <h2>your data</h2>
                <p className="hint">
                    progress is saved in this browser only. export it to back it up or move it to another device.
                </p>
                <div className="stats-actions">
                    <button type="button" className="button" onClick={download}>export</button>
                    <button type="button" className="button" onClick={() => fileRef.current?.click()}>import</button>
                    <button type="button" className="button button-danger" onClick={reset}>reset</button>
                    <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={upload} />
                </div>
                {notice && <p className="hint" role="status">{notice}</p>}
            </section>
        </main>
    );
}
