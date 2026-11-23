import React, { useState } from 'react';
import { DECK_SOURCE, EBITDA_EXPECTED, PROJECTION_YEARS, REVENUE_EXPECTED, YEAR5_SCENARIOS } from './blueOpusData';

const m = (n: number) => `K${n.toLocaleString('en-US', { minimumFractionDigits: n < 10 ? 1 : 0, maximumFractionDigits: 1 })}m`;

/** Bars by year, with the value on top, light gridlines and a hover/tap highlight. Pure SVG: no chart library, so it is light and always sharp. */
const YearBars: React.FC<{ values: number[]; years: readonly number[]; color: string; label: string }> = ({ values, years, color, label }) => {
    const [hot, setHot] = useState<number | null>(null);
    const W = 520, H = 250, L = 38, R = 8, T = 22, B = 30;
    const max = Math.max(...values);
    const top = Math.ceil(max / 5) * 5 || 5;
    const ticks = [0, top / 2, top];
    const bw = (W - L - R) / values.length;
    const y = (v: number) => T + (H - T - B) * (1 - v / top);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} by year, in millions of kwacha`}>
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#E3E5E8" strokeDasharray={t === 0 ? undefined : '3 4'} />
                    <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#80868B">{t}</text>
                </g>
            ))}
            {values.map((v, i) => {
                const x = L + i * bw + bw * 0.2, w = bw * 0.6, active = hot === i;
                return (
                    <g key={years[i]} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onClick={() => setHot(active ? null : i)} style={{ cursor: 'pointer' }}>
                        <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
                        <rect x={x} y={y(v)} width={w} height={Math.max(2, y(0) - y(v))} rx="4" fill={color} opacity={hot === null || active ? 1 : 0.45} />
                        <text x={x + w / 2} y={y(v) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1F1F1F">{m(v)}</text>
                        <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="11" fill={active ? '#1F1F1F' : '#5F6368'} fontWeight={active ? 700 : 500}>{years[i]}</text>
                    </g>
                );
            })}
        </svg>
    );
};

/** Year-5 revenue under the three scenarios, as horizontal bars so the size of the gap between them is obvious. */
const ScenarioBars: React.FC = () => {
    const max = Math.max(...YEAR5_SCENARIOS.map((s) => s.revenue));
    return (
        <ul className="space-y-3" aria-label="Year-5 revenue by scenario, in millions of kwacha">
            {YEAR5_SCENARIOS.map((s) => (
                <li key={s.id}>
                    <div className="flex items-baseline justify-between text-sm"><span className="font-semibold text-[#1F1F1F]">{s.label}</span><span className="font-bold tabular-nums text-[#1F1F1F]">{m(s.revenue)}</span></div>
                    <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#F1F3F4]"><div className="h-full rounded-full" style={{ width: `${Math.max(3, (s.revenue / max) * 100)}%`, backgroundColor: s.color }} /></div>
                </li>
            ))}
        </ul>
    );
};

/** The company's own projections, clearly labelled as projections: revenue and EBITDA by year (base case), and the year-5 spread between scenarios. */
export const BlueOpusCharts: React.FC = () => {
    const [view, setView] = useState<'revenue' | 'ebitda'>('revenue');
    const growth = REVENUE_EXPECTED[REVENUE_EXPECTED.length - 1] / REVENUE_EXPECTED[0];
    return (
        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5" aria-labelledby="bo-trend">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 id="bo-trend" className="text-sm font-bold text-[#1F1F1F]">Where Blue Opus expects to go</h3>
                    <p className="mt-0.5 text-xs text-[#5F6368]">Projected, in millions of kwacha. These are the company’s forecasts (base case), not results.</p>
                </div>
                <div role="radiogroup" aria-label="Chart" className="inline-flex rounded-full bg-[#F1F3F4] p-1 text-xs font-semibold">
                    {([['revenue', 'Revenue'], ['ebitda', 'Profit (EBITDA)']] as const).map(([id, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)} className={`rounded-full px-3.5 py-1.5 transition ${view === id ? 'bg-white text-[#0B57D0] shadow-sm' : 'text-[#5F6368] hover:text-[#1F1F1F]'}`}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
                <div>
                    <YearBars values={view === 'revenue' ? REVENUE_EXPECTED : EBITDA_EXPECTED} years={PROJECTION_YEARS} color={view === 'revenue' ? '#0B57D0' : '#137333'} label={view === 'revenue' ? 'Revenue' : 'EBITDA'} />
                    <p className="mt-1 text-center text-[11px] text-[#80868B]">{view === 'revenue' ? `Revenue is projected to grow about ${Math.round(growth)}x from 2027 to 2031.` : 'EBITDA is profit before interest, tax and depreciation. Break-even is projected in Q3 2027.'}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#80868B]">Year-5 revenue, three scenarios</h4>
                    <div className="mt-3"><ScenarioBars /></div>
                    <p className="mt-3 text-[11px] text-[#80868B]">The company’s base case is “Expected”. The other two show how far results could fall short of, or beat, it.</p>
                </div>
            </div>
            <p className="mt-4 border-t border-[#E3E5E8] pt-3 text-[11px] leading-relaxed text-[#80868B]">Source: {DECK_SOURCE}. Projections are estimates and may not happen. Past results do not guarantee future ones.</p>
        </section>
    );
};
