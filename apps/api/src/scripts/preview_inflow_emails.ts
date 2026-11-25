/** Dry run of tonight's inflow digest + samples of the requisition and digest emails. Sends nothing. Usage: npx tsx src/scripts/preview_inflow_emails.ts <outDir> */
import fs from 'fs';
import path from 'path';
import { sendInflowDigests, renderInflowDigest } from '../services/inflowDigest.service';
import { requisitionEmail } from '../services/requisitionEmails';

(async () => {
    const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
    const r = await sendInflowDigests({ dryRun: true });
    console.log('Digest dry run (today):', JSON.stringify(r));
    const d = renderInflowDigest({ userId: 'x', email: 'a@b.c', firstName: 'Charley' }, 'Siba Hair Braiding', false,
        [{ description: 'Mary Banda | Ref: A1', amount: 1200 }, { description: 'Airtel Money deposit', amount: 450 }, { description: 'Chanda — braids', amount: 300 }, { description: 'Walk-in', amount: 150 }, { description: 'Tips', amount: 40 }, { description: 'MTN deposit', amount: 25 }, { description: 'MTN deposit', amount: 20 }], 2185);
    fs.writeFileSync(path.join(out, 'inflow-digest.html'), d.html); console.log('digest:', d.subject);
    const ctx = { ref: 'REQ-104', description: 'Fuel for deliveries', total: 350, requestor: 'Mary', personal: false, moneywisePay: false, link: 'https://moneywise.blueopus.cloud/requisitions' };
    for (const t of ['NEW_REQUISITION', 'REQUISITION_APPROVED', 'CASH_DISBURSED'] as const) {
        const m = requisitionEmail(t, ctx, 'Charley')!; fs.writeFileSync(path.join(out, `req-${t}.html`), m.html); console.log(t + ':', m.subject);
    }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
