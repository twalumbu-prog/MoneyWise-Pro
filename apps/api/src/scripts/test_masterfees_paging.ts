/**
 * Master Fees paging — pure tests (no network):  npx ts-node --transpile-only src/scripts/test_masterfees_paging.ts
 * Each scenario is a real failure mode seen on 2026-11-04 (overlapping pages; a transient error read as "end of data").
 */
import { collectPages } from '../services/masterfees_paging';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const noSleep = async () => undefined;
const mk = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, v: from + i }));
const ids = (rows: any[]) => rows.map(r => r.id);

(async () => {
    // 1 — a normal read: full, full, short
    { const calls: number[] = []; const pages = [mk(0, 1000), mk(1000, 1000), mk(2000, 362)];
      const r = await collectPages(async p => { calls.push(p); return pages[p - 1]; }, 'id', { sleep: noSleep });
      ok('P1 full+full+short: 2,362 rows, 3 pages, stops WITHOUT asking for page 4', r.rows.length === 2362 && r.pages === 3 && calls.length === 3 && !r.endedByError && r.duplicates === 0, JSON.stringify({ n: r.rows.length, calls })); }

    // 2 — overlapping pages (page 2 repeats 95 rows of page 1): de-duplicated and reported
    { const warns: string[] = []; const p1 = mk(0, 1000), p2 = [...mk(905, 95), ...mk(1000, 905)], p3 = mk(1905, 362);
      const r = await collectPages(async p => [p1, p2, p3][p - 1], 'id', { sleep: noSleep, onWarn: m => warns.push(m) });
      ok('P2 overlap: 95 repeated rows dropped, every distinct row kept (2,267), and the overlap is reported', r.rows.length === 2267 && r.duplicates === 95 && r.rawRows === 2362 && warns.some(w => /95 row/.test(w)), JSON.stringify({ n: r.rows.length, d: r.duplicates, warns })); }

    // 3 — a TRANSIENT error on page 2: the old loop returned only page 1 (1,000 rows); now it is retried and the read completes
    { const attempts: Record<number, number> = {}; const pages = [mk(0, 1000), mk(1000, 1000), mk(2000, 500)];
      const r = await collectPages(async p => { attempts[p] = (attempts[p] || 0) + 1; if (p === 2 && attempts[p] === 1) throw new Error('500 transient'); return pages[p - 1]; }, 'id', { sleep: noSleep });
      ok('P3 one transient error on page 2 is retried; all 2,500 rows are returned (the old code returned 1,000)', r.rows.length === 2500 && attempts[2] === 2 && !r.endedByError, JSON.stringify({ n: r.rows.length, attempts })); }

    // 4 — two transient errors in a row still recover (3 tries)
    { let n = 0; const pages = [mk(0, 1000), mk(1000, 10)];
      const r = await collectPages(async p => { if (p === 2 && n++ < 2) throw new Error('500'); return pages[p - 1]; }, 'id', { sleep: noSleep });
      ok('P4 two failures then success on page 2 still completes', r.rows.length === 1010 && !r.endedByError); }

    // 5 — a page that keeps failing after a full page: treated as the end (Master Fees answers 500 past the last page) but flagged
    { const warns: string[] = []; let tries = 0;
      const r = await collectPages(async p => { if (p === 1) return mk(0, 1000); tries++; throw new Error('500 past the last page'); }, 'id', { sleep: noSleep, onWarn: m => warns.push(m) });
      ok('P5 persistent failure after a FULL page (total is an exact multiple of 1,000): returns page 1, tried 3 times, flagged endedByError + warning', r.rows.length === 1000 && tries === 3 && r.endedByError && warns.length === 1, JSON.stringify({ tries, warns })); }

    // 6 — page 1 failing is a real error and must propagate
    { let threw = false; try { await collectPages(async () => { throw new Error('401 bad key'); }, 'id', { sleep: noSleep }); } catch (e: any) { threw = /401/.test(e.message); }
      ok('P6 page 1 failing (bad key / network) throws instead of returning an empty list', threw); }

    // 7 — an empty page ends the read
    { const r = await collectPages(async p => (p === 1 ? mk(0, 1000) : []), 'id', { sleep: noSleep });
      ok('P7 an empty page ends the read without error', r.rows.length === 1000 && !r.endedByError); }

    // 8 — rows with no id are never dropped; rows with ids are still de-duplicated
    { const r = await collectPages(async () => [{ id: 'a' }, { id: 'a' }, { x: 1 }, { x: 2 }, { id: null }], 'id', { sleep: noSleep });
      ok('P8 rows without an id are kept (3), a repeated id is dropped once', r.rows.length === 4 && r.duplicates === 1, JSON.stringify(r.rows)); }

    // 9 — no idKey: nothing is de-duplicated (back-compatible for other lists)
    { const r = await collectPages(async () => [{ id: 'a' }, { id: 'a' }], null, { sleep: noSleep });
      ok('P9 without an id key nothing is de-duplicated', r.rows.length === 2 && r.duplicates === 0); }

    // 10 — the retry waits are applied (backoff), and capped at the ceiling
    { const waits: number[] = []; const r = await collectPages(async p => { if (p === 1) return mk(0, 1000); throw new Error('500'); }, 'id', { sleep: async ms => { waits.push(ms); }, backoffMs: [100, 300] });
      ok('P10 waits 100 ms then 300 ms between the three tries of a failing page', JSON.stringify(waits) === '[100,300]' && r.endedByError, JSON.stringify(waits)); }

    // 11 — maxPages is a hard ceiling (no endless loop if the API never ends)
    { let n = 0; const r = await collectPages(async () => { n++; return mk(n * 1000, 1000); }, 'id', { sleep: noSleep, maxPages: 5 });
      ok('P11 never reads past maxPages', n === 5 && r.pages === 5); }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
