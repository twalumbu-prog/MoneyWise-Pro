/**
 * Re-encrypts every stored Meta token with a new key.
 *
 *   OLD_MESSAGING_TOKEN_KEY=<current key> MESSAGING_TOKEN_KEY=<new key> npx ts-node --transpile-only src/scripts/rotate_messaging_token_key.ts
 *
 * This is a dry run: it proves every token decrypts and writes nothing. Add --apply to write. Tokens are never printed.
 * Deploy the new MESSAGING_TOKEN_KEY straight after applying, because the running API can't read rotated tokens until then.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { decryptToken, encryptToken } from '../lib/tokenCrypto';

async function main() {
    const oldKey = process.env.OLD_MESSAGING_TOKEN_KEY;
    const newKey = process.env.MESSAGING_TOKEN_KEY;
    if (!oldKey || !newKey || oldKey === newKey) throw new Error('Set OLD_MESSAGING_TOKEN_KEY and a different MESSAGING_TOKEN_KEY');
    const apply = process.argv.includes('--apply');

    const { data, error } = await supabase.from('messaging_connections').select('id, access_token_enc').not('access_token_enc', 'is', null);
    if (error) throw new Error(error.message);

    // Everything is re-encrypted in memory first, so one unreadable token stops the run before any row changes.
    const rotated = (data || []).map((row: any) => {
        process.env.MESSAGING_TOKEN_KEY = oldKey;
        const plain = decryptToken(row.access_token_enc);
        process.env.MESSAGING_TOKEN_KEY = newKey;
        return { id: row.id as string, enc: encryptToken(plain) };
    });

    if (!apply) { console.log(`Dry run: ${rotated.length} token(s) can be rotated. Re-run with --apply to write.`); return; }
    for (const r of rotated) {
        const { error: upErr } = await supabase.from('messaging_connections').update({ access_token_enc: r.enc }).eq('id', r.id);
        if (upErr) throw new Error(`Stopped at ${r.id}: ${upErr.message}. Rows before it use the new key.`);
    }
    console.log(`Rotated ${rotated.length} token(s).`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
