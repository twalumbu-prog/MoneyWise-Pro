/**
 * Shows what the personal emails would look like, without sending anything: a dry run over everyone (who would get which nudge today),
 * plus each nudge rendered to an HTML file for one person. Run: npx tsx src/scripts/preview_personal_emails.ts <email> <outDir>
 */
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase';
import { runNudgeEmails, billsNudge, setupNudge, progressNudge, teamNudge, Ctx } from '../services/nudgeEmail.service';
import { firstNameOf } from '../services/emailPersonal';
import { renderWeeklyHighlightsEmail } from '../services/weeklyHighlights.service';
import { emailService } from '../services/email.service';

(async () => {
    const [email, outDir] = [process.argv[2], process.argv[3]];
    fs.mkdirSync(outDir, { recursive: true });

    const plan = await runNudgeEmails({ dryRun: true });
    console.log(`Dry run over everyone: ${plan.people} people, ${plan.planned.length} would get a nudge today, ${plan.skipped} opted out, ${plan.errors.length} errors`);
    for (const p of plan.planned) console.log(`  ${p.kind.padEnd(8)} ${p.email}  —  ${p.subject}`);
    plan.errors.forEach((e) => console.log('  error:', e));

    const { data: u } = await supabase.from('users').select('id, email, name, first_name, organization_id, role, created_at').eq('email', email).maybeSingle();
    if (!u) { console.log('no such user'); return; }
    const { data: org } = await supabase.from('organizations').select('name, is_personal').eq('id', (u as any).organization_id).maybeSingle();
    const sunday = new Date('2026-11-29T10:00:00Z'), friday = new Date('2026-11-27T10:00:00Z');
    const base: Ctx = {
        userId: u.id, email: u.email, person: { userId: u.id, email: u.email, firstName: firstNameOf(u) }, orgId: (u as any).organization_id,
        orgName: (org as any)?.name ?? 'Workspace', personal: (org as any)?.is_personal === true, isAdmin: true, createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), now: new Date(),
    };
    const tries: [string, () => Promise<{ subject: string; html: string } | null>][] = [
        ['bills', () => billsNudge(base)],
        ['setup', () => setupNudge(base)],
        ['progress', () => progressNudge({ ...base, personal: true, now: sunday })],
        ['team', () => teamNudge({ ...base, personal: false, now: friday })],
    ];
    for (const [name, fn] of tries) {
        const n = await fn().catch((e) => { console.log(name, 'error', e.message); return null; });
        if (!n) { console.log(`${name}: nothing to say for this person right now`); continue; }
        fs.writeFileSync(path.join(outDir, `${name}.html`), n.html);
        console.log(`${name}: "${n.subject}" -> ${name}.html`);
    }

    // Payment received, as it now reads for an admin.
    const pay = emailService.renderPaymentEmail({ amount: 1200, customerName: 'Mary Banda', serviceLabel: 'Braids', reference: 'MW-1042', when: new Date(), firstName: firstNameOf(u) });
    fs.writeFileSync(path.join(outDir, 'payment.html'), pay);
    console.log('payment: -> payment.html');
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
