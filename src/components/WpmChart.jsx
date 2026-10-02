import { useLayoutEffect, useRef, useState } from 'react';

const HEIGHT = 220;
const PAD = { top: 16, right: 48, bottom: 28, left: 36 };

// round the axis max up to a readable step
function niceScale(maxValue) {
    const rough = Math.max(10, maxValue) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
    return { step, max: step * 4 };
}

export const formatDate = (t, withTime = false) =>
    new Date(t).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(withTime && { hour: 'numeric', minute: '2-digit' }),
    });

export const formatMode = (run) =>
    run.mode === 'time' ? `${run.n}s` : `${run.n === 'unlimited' ? '∞' : run.n} ${run.mode === 'sentences' ? 'sentences' : 'words'}`;

/**
 * Single-series line: wpm per run, oldest -> newest.
 * Crosshair snaps to the nearest run on hover; arrow keys move it when focused.
 */
export default function WpmChart({ runs }) {
    const wrapRef = useRef(null);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(null);

    useLayoutEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(wrapRef.current);
        return () => observer.disconnect();
    }, []);

    const n = runs.length;
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const { step, max } = niceScale(Math.max(...runs.map((r) => r.wpm)));

    const x = (i) => PAD.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const y = (v) => PAD.top + plotH * (1 - v / max);

    const line = runs.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.wpm)}`).join('');
    const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ticks = [0, 1, 2, 3, 4].map((k) => k * step);

    const last = runs[n - 1];
    const hovered = active != null ? runs[active] : null;

    const onPointerMove = (e) => {
        const left = e.currentTarget.getBoundingClientRect().left;
        const px = e.clientX - left - PAD.left;
        const i = n === 1 ? 0 : Math.round((px / plotW) * (n - 1));
        setActive(Math.min(n - 1, Math.max(0, i)));
    };

    const onKeyDown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + delta)));
    };

    // tooltip sits beside the crosshair, flipping left in the right half so it stays inside the chart
    const flip = hovered && x(active) > width / 2;
    const tipStyle = hovered && {
        top: PAD.top,
        left: x(active) + (flip ? -12 : 12),
        transform: flip ? 'translateX(-100%)' : 'none',
    };

    return (
        <div className="chart" ref={wrapRef}>
            {width > 0 && (
                <svg
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={`wpm over your last ${n} runs, latest ${last.wpm}`}
                    tabIndex={0}
                    onPointerMove={onPointerMove}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(n - 1)}
                    onBlur={() => setActive(null)}
                    onKeyDown={onKeyDown}
                >
                    {/* grid + y axis */}
                    {ticks.map((t) => (
                        <g key={t}>
                            <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
                            <text className="chart-tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                                {t}
                            </text>
                        </g>
                    ))}

                    {/* x axis: first and last run dates */}
                    <text className="chart-tick" x={x(0)} y={HEIGHT - 8} textAnchor={n === 1 ? 'middle' : 'start'}>
                        {formatDate(runs[0].t)}
                    </text>
                    {n > 1 && (
                        <text className="chart-tick" x={x(n - 1)} y={HEIGHT - 8} textAnchor="end">
                            {formatDate(last.t)}
                        </text>
                    )}

                    {n > 1 && <path className="chart-area" d={area} />}
                    {n > 1 && <path className="chart-line" d={line} />}

                    {/* end marker + label */}
                    <circle className="chart-dot" cx={x(n - 1)} cy={y(last.wpm)} r={4} />
                    <text className="chart-end-label" x={x(n - 1) + 10} y={y(last.wpm)} dy="0.32em">
                        {last.wpm}
                    </text>

                    {/* crosshair */}
                    {hovered && (
                        <g pointerEvents="none">
                            <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} />
                            <circle className="chart-dot" cx={x(active)} cy={y(hovered.wpm)} r={5} />
                        </g>
                    )}
                </svg>
            )}

            {hovered && (
                <div className="chart-tooltip" style={tipStyle}>
                    <div className="chart-tooltip-value">{hovered.wpm} wpm</div>
                    <div className="chart-tooltip-meta">{formatDate(hovered.t, true)}</div>
                    <div className="chart-tooltip-meta">
                        {hovered.set} · {formatMode(hovered)}
                        {hovered.acc != null && ` · ${hovered.acc}%`}
                    </div>
                </div>
            )}
        </div>
    );
}
