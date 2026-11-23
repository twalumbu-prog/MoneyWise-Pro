/**
 * Payment reminders to the CUSTOMER who owes a business money, so the business gets paid sooner without chasing by hand.
 * (The older follow-up reminders in customerInvoice.service go to the business's own finance team; these go to the customer.)
 *
 * A business turns them on (they are OFF until it does), chooses how often to repeat and how many to send. Once an unpaid credit invoice
 * has reached its follow-up date, the customer gets a WhatsApp message with a pay-now link for the CURRENT balance. They repeat every few days,
 * stop at the limit, and stop at once when the invoice is paid or voided (only open and part-paid invoices are ever picked). The daily job that
 * already runs the finance-team reminders (POST /invoices/tick, 07:00 UTC = 09:00 in Lusaka) sends them, so nobody is messaged at night.
 *
 * Every send is one WhatsApp message through the same WaAPI number the pay-link receipts use. A message that cannot be sent (no valid number,
 * WhatsApp not configured) is NOT counted, so it is tried again at the next run.
 */
import { supabase } from '../lib/supabase';
import { whatsappService, toChatId } from './whatsapp.service';
import { ensurePayLink, InvoiceError } from './customerInvoice.service';
import { isValidZambiaMobile } from '../utils/zambiaPhone';
import { getFrontendUrl } from '../utils/frontendUrl';

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 24 * 3600 * 1000;

export interface ReminderSettings { enabled: boolean; repeat_every_days: number; max_reminders: number }
export const DEFAULT_SETTINGS: ReminderSettings = { enabled: false, repeat_every_days: 7, max_reminders: 3 };

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};
/** Anything outside what makes sense is pulled back into range (a reminder every day for 60 days is not a reminder, it is a nuisance). */
export const cleanSettings = (input: any, current: ReminderSettings = DEFAULT_SETTINGS): ReminderSettings => ({
    enabled: input?.enabled === undefined ? current.enabled : input.enabled === true,
    repeat_every_days: clamp(input?.repeat_every_days ?? current.repeat_every_days, 2, 30, current.repeat_every_days),
    max_reminders: clamp(input?.max_reminders ?? current.max_reminders, 1, 6, current.max_reminders),
});

/** The date in Lusaka (UTC+2, no daylight saving) as YYYY-MM-DD. */
export const lusakaDate = (d: Date) => new Date(d.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

export interface InvoiceForReminder {
    status: string; total: number | string; amount_paid: number | string | null; follow_up_date: string; customer_phone: string | null;
    customer_reminder_count?: number | null; customer_last_reminder_at?: string | null;
}
export type Why = 'send' | 'off' | 'not_open' | 'paid' | 'not_due' | 'limit' | 'too_soon' | 'no_phone';

/** Whether a customer reminder is due for this invoice right now. Pure: the daily run and the tests use exactly this. */
export function reminderDecision(settings: ReminderSettings, inv: InvoiceForReminder, now: Date): { send: boolean; why: Why; balance: number } {
    const balance = round2(Number(inv.total) - Number(inv.amount_paid || 0));
    const no = (why: Why) => ({ send: false, why, balance });
    if (!settings.enabled) return no('off');
    if (!['OPEN', 'PARTIAL'].includes(inv.status)) return no('not_open');
    if (balance <= 0.005) return no('paid');
    if (String(inv.follow_up_date).slice(0, 10) > lusakaDate(now)) return no('not_due');
    if (Number(inv.customer_reminder_count || 0) >= settings.max_reminders) return no('limit');
    if (inv.customer_last_reminder_at && now.getTime() - new Date(inv.customer_last_reminder_at).getTime() < settings.repeat_every_days * DAY) return no('too_soon');
    if (!isValidZambiaMobile(inv.customer_phone)) return no('no_phone');
    return { send: true, why: 'send', balance };
}

/** The WhatsApp text. Short, says who it is from and how much, gives the link, and is kind about it ("if you've already paid, thank you"). */
export function reminderMessage(p: { business: string; customer: string; invoiceNumber: string; balance: number; dueDate: string; link: string; late: boolean }): string {
    const first = String(p.customer || '').trim().split(/\s+/)[0] || 'there';
    const amount = `K${p.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [
        `Hello ${first},`,
        '',
        `This is a friendly reminder from ${p.business}: invoice ${p.invoiceNumber} has ${amount} ${p.late ? 'outstanding' : 'due'}.`,
        '',
        `You can pay it securely here: ${p.link}`,
        '',
        'If you have already paid, thank you, and please ignore this message.',
    ].join('\n');
}

const missingSetup = (e: any) => !!e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || /payment_reminder_settings|customer_reminder_count|customer_last_reminder_at/.test(String(e.message ?? '')));

export async function getSettings(orgId: string): Promise<ReminderSettings> {
    const { data, error } = await supabase.from('payment_reminder_settings').select('enabled, repeat_every_days, max_reminders').eq('organization_id', orgId).maybeSingle();
    if (error) { if (missingSetup(error)) return DEFAULT_SETTINGS; throw new Error(error.message); }
    return data ? cleanSettings(data) : DEFAULT_SETTINGS;
}

export async function saveSettings(orgId: string, input: any): Promise<ReminderSettings> {
    const next = cleanSettings(input, await getSettings(orgId));
    const { error } = await supabase.from('payment_reminder_settings').upsert({ organization_id: orgId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
    if (error) {
        if (missingSetup(error)) throw new InvoiceError('Customer reminders are not available yet. Please try again shortly.', 503);
        throw new Error(error.message);
    }
    return next;
}

export type Sender = (chatId: string | null, message: string) => Promise<boolean>;

/** Sends one reminder for one invoice. Counts it only if the message really went out. */
async function deliver(orgId: string, inv: any, orgName: string, balance: number, frontend: string, send: Sender, late: boolean): Promise<boolean> {
    const link = await ensurePayLink(orgId, null, inv.id);
    const text = reminderMessage({ business: orgName, customer: inv.customer_name, invoiceNumber: inv.invoice_number, balance, dueDate: inv.follow_up_date, link: `${frontend}${link.path}`, late });
    const ok = await send(toChatId(inv.customer_phone), text);
    if (!ok) return false;
    await supabase.from('customer_invoices').update({ customer_reminder_count: Number(inv.customer_reminder_count || 0) + 1, customer_last_reminder_at: new Date().toISOString() }).eq('id', inv.id);
    return true;
}

const COLUMNS = 'id, organization_id, invoice_number, customer_name, customer_phone, follow_up_date, total, amount_paid, status, customer_reminder_count, customer_last_reminder_at';

/** The daily run: every business that has switched reminders on, every unpaid invoice that is due one. Never throws for one bad invoice. */
export async function runCustomerPaymentReminders(opts: { now?: Date; send?: Sender; frontend?: string } = {}): Promise<{ businesses: number; sent: number; skipped: number; failed: number }> {
    const now = opts.now ?? new Date();
    const send = opts.send ?? ((c, m) => whatsappService.sendMessage(c, m));
    const frontend = opts.frontend ?? getFrontendUrl();
    const out = { businesses: 0, sent: 0, skipped: 0, failed: 0 };
    const { data: on, error } = await supabase.from('payment_reminder_settings').select('organization_id, enabled, repeat_every_days, max_reminders').eq('enabled', true);
    if (error) { if (missingSetup(error)) return out; throw new Error(error.message); }
    for (const row of on ?? []) {
        const settings = cleanSettings(row);
        const orgId = (row as any).organization_id as string;
        out.businesses++;
        const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
        const { data: due, error: ie } = await supabase.from('customer_invoices').select(COLUMNS).eq('organization_id', orgId).in('status', ['OPEN', 'PARTIAL']).lte('follow_up_date', lusakaDate(now)).order('follow_up_date', { ascending: true }).limit(300);
        if (ie) { console.error(`[PaymentReminders] ${orgId}:`, ie.message); continue; }
        for (const inv of due ?? []) {
            const d = reminderDecision(settings, inv as any, now);
            if (!d.send) { out.skipped++; continue; }
            try {
                if (await deliver(orgId, inv, (org as any)?.name || 'your supplier', d.balance, frontend, send, true)) out.sent++; else out.failed++;
            } catch (e: any) { out.failed++; console.error(`[PaymentReminders] ${inv.invoice_number}:`, e?.message); }
        }
    }
    return out;
}

/** The business presses "Remind on WhatsApp". Ignores the date and the repeat gap, but never more than one a day to the same customer. */
export async function remindNow(orgId: string, invoiceId: string, opts: { now?: Date; send?: Sender; frontend?: string } = {}): Promise<{ sent: true }> {
    const now = opts.now ?? new Date();
    const { data: inv, error } = await supabase.from('customer_invoices').select(COLUMNS).eq('id', invoiceId).eq('organization_id', orgId).maybeSingle();
    if (error && !missingSetup(error)) throw new Error(error.message);
    if (error || !inv) {
        if (error) throw new InvoiceError('Customer reminders are not available yet. Please try again shortly.', 503);
        throw new InvoiceError('Invoice not found.', 404);
    }
    const balance = round2(Number((inv as any).total) - Number((inv as any).amount_paid || 0));
    if (!['OPEN', 'PARTIAL'].includes((inv as any).status) || balance <= 0.005) throw new InvoiceError('This invoice is already paid or void, so there is nothing to remind about.', 409);
    if (!isValidZambiaMobile((inv as any).customer_phone)) throw new InvoiceError('This customer has no valid mobile number on the invoice, so there is nowhere to send the reminder.', 409);
    const last = (inv as any).customer_last_reminder_at;
    if (last && now.getTime() - new Date(last).getTime() < DAY) throw new InvoiceError('This customer was already reminded in the last 24 hours.', 429);
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const ok = await deliver(orgId, inv, (org as any)?.name || 'your supplier', balance, opts.frontend ?? getFrontendUrl(), opts.send ?? ((c, m) => whatsappService.sendMessage(c, m)), String((inv as any).follow_up_date).slice(0, 10) <= lusakaDate(now));
    if (!ok) throw new InvoiceError('The WhatsApp message could not be sent just now. Nothing was counted; please try again in a few minutes.', 502);
    return { sent: true };
}
