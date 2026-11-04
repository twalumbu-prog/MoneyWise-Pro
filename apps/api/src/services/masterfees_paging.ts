/**
 * Reading every page of a Master Fees list, safely.
 *
 * Master Fees' `?page=N` listing has two behaviours the old loop did not allow for (found 2026-11-04 while checking Twalumbu's invoice coverage):
 *   1. Pages OVERLAP: page 2 of /transactions repeated 95 rows of page 1 (4,362 rows over 5 pages, only 4,267 distinct).
 *   2. A request for the page AFTER the last one answers HTTP 500, but so does a transient failure. The old loop treated any error on page 2 or
 *      later as "end of data", so one hiccup silently truncated the list (a pull returned exactly 1,000 of 4,267 transactions) and the sync then
 *      worked from a partial list until the next tick.
 *
 * So: a failing page is retried before it is believed to be the end; rows are de-duplicated by id; overlap and error-ended reads are reported.
 * A SHORT page still ends the read without another request (the cheap, normal case), so the retry cost is only ever paid when a full page is
 * followed by an error, i.e. a total that is an exact multiple of the page size, or a real fault.
 */

export interface PagingOptions {
    pageSize?: number;          // rows in a full page (Master Fees: 1000)
    maxPages?: number;          // sanity ceiling
    attempts?: number;          // tries per page before giving up on it (first try + retries)
    backoffMs?: number[];       // wait before retry 1, 2, ... (last value is reused)
    sleep?: (ms: number) => Promise<void>;
    onWarn?: (message: string) => void;
}

export interface PagingResult<T> {
    rows: T[];                  // de-duplicated, in first-seen order
    pages: number;              // pages that returned rows
    rawRows: number;            // rows received before de-duplication
    duplicates: number;         // rows that repeated an earlier row (overlapping pages)
    endedByError: boolean;      // the read stopped because a page kept failing, not because the data ended
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function collectPages<T extends Record<string, any>>(
    fetchPage: (page: number) => Promise<T[]>,
    idKey: string | null,
    opts: PagingOptions = {},
): Promise<PagingResult<T>> {
    const pageSize = opts.pageSize ?? 1000;
    const maxPages = opts.maxPages ?? 200;
    const attempts = Math.max(1, opts.attempts ?? 3);
    const backoff = opts.backoffMs ?? [500, 1500];
    const sleep = opts.sleep ?? defaultSleep;
    const warn = opts.onWarn ?? (() => undefined);

    const rows: T[] = [];
    const seen = new Set<string>();
    let pages = 0, rawRows = 0, duplicates = 0, endedByError = false;

    for (let page = 1; page <= maxPages; page++) {
        let batch: T[] | null = null;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= attempts && batch === null; attempt++) {
            try {
                batch = await fetchPage(page);
            } catch (err) {
                lastErr = err;
                if (attempt < attempts) await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 500);
            }
        }
        if (batch === null) {
            if (page === 1) throw lastErr;                 // the first page must succeed: auth / network / configuration problem
            endedByError = true;                           // later page: Master Fees also answers 500 past the last page, so this may be the end
            warn(`page ${page} failed ${attempts} times (${(lastErr as any)?.message ?? lastErr}); treating the data as ended after ${pages} page(s). If this repeats the list may be incomplete.`);
            break;
        }
        if (batch.length === 0) break;
        pages++;
        rawRows += batch.length;
        for (const row of batch) {
            const id = idKey ? row?.[idKey] : undefined;
            if (id === undefined || id === null || id === '') { rows.push(row); continue; }   // never drop a row just because it has no id
            const key = String(id);
            if (seen.has(key)) { duplicates++; continue; }
            seen.add(key);
            rows.push(row);
        }
        if (batch.length < pageSize) break;                // short page = last page (avoids one wasted round trip)
    }
    if (duplicates > 0) warn(`${duplicates} row(s) repeated across overlapping pages and were de-duplicated (${rawRows} received, ${rows.length} distinct).`);
    return { rows, pages, rawRows, duplicates, endedByError };
}
