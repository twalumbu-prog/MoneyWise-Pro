/** Prints the product-looking links on a category page so a discovery pattern can be written. Run: npx tsx src/scripts/probe_links.ts <url> <regex> */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
(async () => {
    const [url, re] = [process.argv[2], new RegExp(process.argv[3] ?? '.')];
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(25_000) });
    const t = await r.text();
    const links = [...new Set([...t.matchAll(/href="([^"#]+)"/g)].map((m) => { try { return new URL(m[1].replace(/&amp;/g, '&'), r.url).toString(); } catch { return ''; } }))].filter((u) => re.test(u));
    console.log(r.status, t.length, 'links', links.length);
    links.slice(0, 25).forEach((l) => console.log(' ', l));
    process.exit(0);
})();
