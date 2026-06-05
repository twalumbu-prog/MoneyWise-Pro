import { supabase } from './src/lib/supabase';

async function retryQuery(fn: () => any, retries = 5, delay = 2000): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res: any = await fn();
            if (res && res.error) {
                const errMsg = String(res.error.message || '');
                if (errMsg.includes('fetch failed') || errMsg.includes('timeout') || errMsg.includes('ConnectTimeoutError')) {
                    console.warn(`[Supabase Retry] Attempt ${i + 1} returned transient error: ${errMsg}`);
                    if (i === retries - 1) return res;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            return res;
        } catch (err: any) {
            console.warn(`[Supabase Retry] Attempt ${i + 1} threw exception:`, err.message || err);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Unreachable');
}

async function recalculateOtherLedgers() {
    console.log('Fetching all cashbook entries...');
    const { data: entries, error } = await retryQuery(() => supabase
        .from('cashbook_entries')
        .select('*')
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
    );

    if (error) {
        console.error('Error fetching entries:', error);
        return;
    }

    // Group by organization_id and account_type
    const groups: { [key: string]: any[] } = {};
    for (const entry of entries) {
        const key = `${entry.organization_id || 'no_org'}_${entry.account_type || 'CASH'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    }

    console.log(`Found ${Object.keys(groups).length} distinct ledger accounts.`);

    for (const [key, groupEntries] of Object.entries(groups)) {
        // Skip MONEYWISE_WALLET of the primary org (handled by Lenco rebuild script)
        if (key === 'e359c84e-b42b-4b0a-b422-a2074d87d83a_MONEYWISE_WALLET') {
            console.log(`Skipping primary wallet account ${key} (handled by Lenco rebuild).`);
            continue;
        }

        console.log(`Recalculating ledger for ${key} (${groupEntries.length} entries)...`);
        let runningBalance = 0;

        for (const entry of groupEntries) {
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);
            runningBalance = Math.round((runningBalance + debit - credit) * 100) / 100;

            const { error: updateError } = await retryQuery(() => supabase
                .from('cashbook_entries')
                .update({ balance_after: runningBalance })
                .eq('id', entry.id)
            );

            if (updateError) {
                console.error(`Failed to update entry ${entry.id}:`, updateError.message);
            }
        }
        console.log(`Finished ${key}. Final balance: K${runningBalance.toFixed(2)}`);
    }
    console.log('Recalculation of other accounts completed.');
}

recalculateOtherLedgers()
    .then(() => process.exit(0))
    .catch(console.error);
