/** Investment holdings maths (services/investmentPortfolio.service.ts → buildHoldings): invested, current value, gain/loss %. */
import { buildHoldings } from '../services/investmentPortfolio.service';

let bad = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(ok ? 'PASS ' : 'FAIL ', name, ok ? '' : `— ${detail}`); if (!ok) bad++; };
const targets = new Map([['A', { name: 'Longhorn', logoUrl: null }], ['B', { name: 'Kapstone', logoUrl: 'x' }], ['C', { name: 'Zero', logoUrl: null }]]);

const h = buildHoldings(
    [
        { investment_target_id: 'A', amount: 1000, at: '2026-09-01T10:00:00Z' },
        { investment_target_id: 'A', amount: 500, at: '2026-10-20T10:00:00Z' },
        { investment_target_id: 'B', amount: 2000, at: '2026-08-01T10:00:00Z' },
        { investment_target_id: 'C', amount: 0, at: '2026-08-01T10:00:00Z' },
    ],
    [
        { investment_target_id: 'A', value: 1100, created_at: '2026-10-01T10:00:00Z' },
        { investment_target_id: 'A', value: 1200, created_at: '2026-10-10T10:00:00Z' },
        { investment_target_id: 'B', value: 1500, created_at: '2026-10-05T10:00:00Z' },
    ],
    targets,
);
const a = h.find((x) => x.targetId === 'A')!, b = h.find((x) => x.targetId === 'B')!;
check('the newest recorded value wins, and money put in after it is added on top', a.currentValue === 1700 && a.invested === 1500, JSON.stringify(a));
check('a gain shows the amount and percentage', a.gain === 200 && a.gainPct === 13.33, JSON.stringify(a));
check('a loss is negative', b.gain === -500 && b.gainPct === -25 && b.currentValue === 1500, JSON.stringify(b));
check('a holding with nothing invested is left out', !h.some((x) => x.targetId === 'C'), JSON.stringify(h.map((x) => x.targetId)));
check('largest holding first', h[0].targetId === 'A', h.map((x) => x.targetId).join());

const none = buildHoldings([{ investment_target_id: 'A', amount: 800, at: '2026-09-01T10:00:00Z' }], [], targets)[0];
check('with no value recorded it is unchanged and flagged as not valued', none.currentValue === 800 && none.gain === 0 && none.gainPct === 0 && none.valued === false, JSON.stringify(none));
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
