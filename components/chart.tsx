'use client';
import { useState } from 'react';
import type { Row } from '../domain/types';
import { number, hourLabel } from './format';
export function ForecastChart({ rows, secondary = false, secondaryLabel = 'Recorded generation', primaryLabel = 'Available forecast' }: {
    rows: Row[];
    secondary?: boolean;
    secondaryLabel?: string;
    primaryLabel?: string;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const W = 860, H = 285, L = 50, R = 18, T = 25, B = 37;
    const vals = rows.flatMap(r => [r.forecast_mw, secondary ? r.actual_mw : null]).filter((n): n is number => n !== null && n !== undefined);
    const max = Math.max(4000, Math.ceil(Math.max(...vals, 0) / 4000) * 4000);
    const x = (i: number) => L + i * (W - L - R) / Math.max(rows.length - 1, 1), y = (v: number) => T + (1 - v / max) * (H - T - B);
    const paths = (key: 'forecast_mw' | 'actual_mw') => { const result: {
        line: string;
        area: string;
    }[] = []; let part: number[] = []; const flush = () => { if (part.length) {
        const line = part.map((i, j) => `${j ? 'L' : 'M'}${x(i)},${y(rows[i][key]!)}`).join(' ');
        result.push({ line, area: `${line} L${x(part[part.length - 1])},${H - B} L${x(part[0])},${H - B} Z` });
        part = [];
    } }; rows.forEach((r, i) => { if (r[key] == null)
        flush();
    else
        part.push(i); }); flush(); return result; };
    const picked = selected === null ? null : rows[selected];
    return <div className="forecast-chart"><div className="chart-legend"><span><i />{primaryLabel}</span>{secondary && <span><i className="actual-key"/>{secondaryLabel}</span>}<span className="chart-unit">Gigawatts (GW)</span></div><div className="plot"><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Hourly wind output. Select a point to inspect its value. Exact values are available in the source table."><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#568f77" stopOpacity=".2"/><stop offset="1" stopColor="#568f77" stopOpacity=".015"/></linearGradient></defs>{[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e8ece8" strokeDasharray={t ? '3 5' : undefined}/><text x={L - 14} y={y(max * t) + 4} textAnchor="end" className="axis-label">{number(max * t / 1000)}</text></g>)}{paths('forecast_mw').map((p, i) => <g key={i}><path d={p.area} fill="url(#chart-fill)"/><path d={p.line} fill="none" stroke="#35745c" strokeWidth="2.7" strokeLinejoin="round"/></g>)}{secondary && paths('actual_mw').map((p, i) => <path key={i} d={p.line} fill="none" stroke="#bd8a51" strokeWidth="2" strokeDasharray="5 5"/>)}{rows.map((r, i) => <g key={r.target_start}>{(i % 4 === 0 || i === 23) && <text x={x(i)} y={H - 10} textAnchor="middle" className="axis-label">{hourLabel(r.target_start)}</text>}{r.forecast_mw !== null && <circle cx={x(i)} cy={y(r.forecast_mw)} r="12" fill="transparent" tabIndex={0} role="button" aria-label={`${hourLabel(r.target_start)}: ${number(r.forecast_mw)} megawatts`} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === 'Escape')
        setSelected(null); if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelected(n => Math.min((n ?? i) + 1, rows.length - 1));
    } if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelected(n => Math.max((n ?? i) - 1, 0));
    } }}/>}</g>)}{picked && picked.forecast_mw !== null && selected !== null && <g pointerEvents="none"><line x1={x(selected)} x2={x(selected)} y1={T} y2={H - B} stroke="#7b9a89" strokeDasharray="3 4"/><circle cx={x(selected)} cy={y(picked.forecast_mw)} r="5" fill="#35745c" stroke="white" strokeWidth="2"/></g>}</svg>{picked && <div className="chart-tooltip" role="status"><b>{hourLabel(picked.target_start)} London</b><span>{primaryLabel}: {number(picked.forecast_mw! / 1000, 2)} GW</span>{secondary && <span>{secondaryLabel}: {picked.actual_mw == null ? 'Unavailable' : number(picked.actual_mw / 1000, 2) + ' GW'}</span>}<button onClick={() => setSelected(null)} aria-label="Close chart detail">×</button></div>}</div><div className="axis-caption">Delivery hour · Europe/London</div></div>;
}
