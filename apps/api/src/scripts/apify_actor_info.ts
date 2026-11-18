/** Read-only: shows what an Apify actor does and what input it takes. Run: npx tsx src/scripts/apify_actor_info.ts [owner~actor] */
import 'dotenv/config';

(async () => {
    const id = process.argv[2] || 'amycole~jan-japan-release-delay-checks-beta';
    const token = process.env.APIFY_TOKEN;
    if (!token) { console.log('APIFY_TOKEN is not set'); process.exit(1); }
    const get = async (path: string) => { const r = await fetch(`https://api.apify.com/v2${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

    const a = await get(`/acts/${id}`);
    console.log('actor', a.status, a.body?.error?.message ?? '');
    const d = a.body?.data;
    if (d) {
        console.log('name:', d.name, '| title:', d.title);
        console.log('description:', d.description);
        console.log('pricing:', JSON.stringify(d.pricingInfos?.slice(-1)[0] ?? d.pricing ?? 'none').slice(0, 300));
        console.log('stats runs:', d.stats?.totalRuns, '| last run:', d.stats?.lastRunStartedAt);
        const v = d.taggedBuilds?.latest ?? null;
        console.log('latest build:', JSON.stringify(v));
        const build = d.taggedBuilds?.latest?.buildId;
        if (build) {
            const b = await get(`/actor-builds/${build}`);
            console.log('readme:', String(b.body?.data?.actorDefinition?.readme ?? '').slice(0, 2500));
            console.log('input schema:', JSON.stringify(b.body?.data?.inputSchema ?? b.body?.data?.actorDefinition?.input ?? null).slice(0, 2000));
        }
    }
    process.exit(0);
})();
