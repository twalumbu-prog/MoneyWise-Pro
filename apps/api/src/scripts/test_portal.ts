/** Portal confirmations: order-book parsing. */
import 'dotenv/config';
import { parseOrderBook } from '../services/portfolioPortal.service';
let bad = 0;
const check = (n: string, ok: boolean, d = '') => { console.log(ok ? 'PASS ' : 'FAIL ', n, ok ? '' : `— ${d}`); if (!ok) bad++; };
const r = parseOrderBook('TXN/2026/0030818, 2026-10-12, 489.00, 141.80\n2026-10-28;1,985.00;564.32\n25/10/2024, 11500, 4436.48\njunk');
check('four-column line', r[0]?.flowCode === 'TXN/2026/0030818' && r[0].amount === 489 && r[0].units === 141.8, JSON.stringify(r[0]));
check('thousands separator kept', r[1]?.amount === 1985 && r[1].units === 564.32, JSON.stringify(r[1]));
check('DD/MM/YYYY dates', r[2]?.date === '2024-10-25' && r[2].amount === 11500, JSON.stringify(r[2]));
check('junk is skipped', r.length === 3, String(r.length));
process.exit(bad ? 1 : 0);
