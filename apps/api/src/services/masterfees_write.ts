/**
 * Changing things in a school's Master Fees from MoneyWise: the write side of the Master Fees data API
 * (Master Fees' docs/SCHOOL_WRITE_API.md). Record a payment, create or change a student, create an invoice, void an invoice or a payment.
 *
 * Master Fees decides what is allowed: the school must switch writing on in its own settings, one switch per kind of change, and a request for
 * something that is off answers 403 (`write_disabled` / `write_kind_disabled`). This file makes sure MoneyWise only ever sends what that API
 * accepts: an unknown field is refused by Master Fees (never ignored), so each request is cut down to the fields it names, and every value is
 * checked here first so a mistake is said plainly before anything is sent. Nothing here deletes anything: there is no delete in that API.
 *
 * Every create needs our own reference. Sending the same request again returns the first result (`idempotent: true`) and a repeat after a
 * timeout is therefore always safe; the same reference with different details is a 409.
 */
import axios from 'axios';
import type { MasterFeesConfig } from './masterfees.service';

export class MasterFeesWriteError extends Error {
    constructor(message: string, public status: number, public code: string | null = null, public details: unknown = null, public retryable = false) {
        super(message);
        this.name = 'MasterFeesWriteError';
    }
}

const invalid = (message: string, code = 'invalid') => new MasterFeesWriteError(message, 422, code);

const REFERENCE = /^[A-Za-z0-9._:-]{1,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only money recorded by hand can be written. Mobile money and card are real wallet money, made through Master Fees. */
export const WRITABLE_PAYMENT_METHODS = ['manual', 'cash', 'bank', 'cheque'] as const;

const text = (v: unknown, label: string, max: number, required = false): string | undefined => {
    const s = String(v ?? '').trim();
    if (!s) { if (required) throw invalid(`${label} is required.`); return undefined; }
    if (s.length > max) throw invalid(`${label} is too long (at most ${max} characters).`);
    return s;
};
export const money = (v: unknown, label = 'amount'): number => {
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
    if (!Number.isFinite(n) || n <= 0) throw invalid(`${label} must be a positive number.`);
    if (n > 10_000_000) throw invalid(`${label} is too large (at most 10,000,000).`);
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw invalid(`${label} can have at most two decimals.`);
    return Math.round(n * 100) / 100;
};
const reference = (v: unknown, label = 'external_reference'): string => {
    const s = String(v ?? '').trim();
    if (!REFERENCE.test(s)) throw invalid(`${label} is required: letters, digits and . _ : - only, up to 60 characters.`);
    return s;
};
const date = (v: unknown, label: string): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const s = String(v).trim();
    if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw invalid(`${label} must be a date like 2026-11-10.`);
    return s;
};
const uuid = (v: unknown, label: string, required = false): string | undefined => {
    if (v === undefined || v === null || v === '') { if (required) throw invalid(`${label} is required.`); return undefined; }
    const s = String(v).trim();
    if (!UUID.test(s)) throw invalid(`${label} is not a valid id.`);
    return s;
};
const defined = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function cleanPayment(input: any) {
    const studentId = uuid(input?.student_id, 'student_id');
    const admission = text(input?.admission_number, 'admission_number', 60);
    if (!studentId && !admission) throw invalid('Say which student: student_id or admission_number.');
    const method = String(input?.payment_method ?? 'manual').toLowerCase();
    if (!(WRITABLE_PAYMENT_METHODS as readonly string[]).includes(method)) {
        throw invalid(`payment_method must be one of ${WRITABLE_PAYMENT_METHODS.join(', ')}. Mobile money and card payments are made through Master Fees itself.`, 'payment_method');
    }
    return defined({
        external_reference: reference(input?.external_reference),
        student_id: studentId, admission_number: studentId ? undefined : admission,
        amount: money(input?.amount),
        payment_date: date(input?.payment_date, 'payment_date'),
        payment_method: method,
        invoice_id: uuid(input?.invoice_id, 'invoice_id'),
        reason: text(input?.reason, 'reason', 200), payer_name: text(input?.payer_name, 'payer_name', 120), notes: text(input?.notes, 'notes', 500),
    });
}

export function cleanStudentCreate(input: any) {
    const gender = input?.gender === undefined || input?.gender === '' ? undefined : String(input.gender).toLowerCase();
    if (gender !== undefined && gender !== 'male' && gender !== 'female') throw invalid('gender must be male or female.');
    const year = input?.year === undefined || input?.year === '' ? undefined : Number(input.year);
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) throw invalid('year must be a year like 2026.');
    return defined({
        first_name: text(input?.first_name, 'first_name', 80, true), last_name: text(input?.last_name, 'last_name', 80, true),
        gender, date_of_birth: date(input?.date_of_birth, 'date_of_birth'), date_of_enrollment: date(input?.date_of_enrollment, 'date_of_enrollment'),
        admission_number: text(input?.admission_number, 'admission_number', 60), grade: text(input?.grade, 'grade', 60), year,
        external_id: input?.external_id === undefined || input?.external_id === '' ? undefined : reference(input.external_id, 'external_id'),
    });
}

export function cleanStudentUpdate(input: any) {
    const body = defined({
        first_name: text(input?.first_name, 'first_name', 80), last_name: text(input?.last_name, 'last_name', 80),
        gender: input?.gender === undefined || input?.gender === '' ? undefined : (['male', 'female'].includes(String(input.gender).toLowerCase()) ? String(input.gender).toLowerCase() : (() => { throw invalid('gender must be male or female.'); })()),
        date_of_birth: date(input?.date_of_birth, 'date_of_birth'), admission_number: text(input?.admission_number, 'admission_number', 60),
        grade: text(input?.grade, 'grade', 60),
        year: input?.year === undefined || input?.year === '' ? undefined : (Number.isInteger(Number(input.year)) ? Number(input.year) : (() => { throw invalid('year must be a year like 2026.'); })()),
    });
    if (!Object.keys(body).length) throw invalid('Nothing to change: give at least one of first_name, last_name, gender, date_of_birth, admission_number, grade, year.');
    return body;
}

export function cleanInvoice(input: any) {
    const items = Array.isArray(input?.items) ? input.items : [];
    if (items.length < 1 || items.length > 50) throw invalid('An invoice needs 1 to 50 items.');
    const term = Number(input?.term);
    if (!Number.isInteger(term) || term < 1 || term > 3) throw invalid('term must be 1, 2 or 3.');
    const year = Number(input?.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw invalid('year must be a year like 2026.');
    return {
        external_reference: reference(input?.external_reference),
        student_id: uuid(input?.student_id, 'student_id', true),
        term, year,
        due_date: date(input?.due_date, 'due_date') ?? (() => { throw invalid('due_date is required.'); })(),
        items: items.map((it: any, i: number) => defined({
            description: text(it?.description, `items[${i}].description`, 200, true),
            amount: money(it?.amount, `items[${i}].amount`),
            category: text(it?.category, `items[${i}].category`, 60),
        })),
    };
}

export const cleanVoid = (input: any) => ({ reason: text(input?.reason, 'reason', 300, true) as string });
export const cleanId = (v: unknown, label: string): string => uuid(v, label, true) as string;

/* ───────────── Sending ───────────── */

export interface WriteResult<T = any> { status: number; idempotent: boolean; data: T }
export interface SendOptions { idempotencyKey?: string; http?: (cfg: any) => Promise<any> }

/** Where the write API lives for this school: the same school address as the data feed, without its trailing /data. */
export function writeBase(config: Pick<MasterFeesConfig, 'schoolId' | 'baseUrl'>): string {
    const root = process.env.MASTERFEES_API_ROOT || 'https://dashboard.master-fees.com/api/v1';
    return (config.baseUrl || `${root}/school/${config.schoolId}/data`).replace(/\/$/, '').replace(/\/data$/, '');
}

/**
 * One change, sent. Success is a 2xx. Anything else is a MasterFeesWriteError carrying Master Fees' own `code` and `details`, and `retryable` is
 * true only where sending the same request again is the right answer (no answer, a 5xx, "slow down"): safe because creating is idempotent.
 */
export async function sendWrite<T = any>(config: Pick<MasterFeesConfig, 'schoolId' | 'publicKey' | 'baseUrl'>, method: 'POST' | 'PATCH', path: string, body: Record<string, unknown>, opts: SendOptions = {}): Promise<WriteResult<T>> {
    const http = opts.http ?? axios.request;
    let res: any;
    try {
        res = await http({
            method, url: `${writeBase(config)}${path}`, data: body, timeout: 20_000, validateStatus: () => true,
            headers: {
                'X-MF-Public-Key': config.publicKey, 'Content-Type': 'application/json',
                ...(opts.idempotencyKey ? { 'Idempotency-Key': String(opts.idempotencyKey).slice(0, 60) } : {}),
            },
        });
    } catch (e: any) {
        throw new MasterFeesWriteError(`Master Fees didn’t answer (${e?.code || e?.message || 'network error'}). Nothing was confirmed: try the same request again.`, 0, 'no_answer', null, true);
    }
    const data = res?.data;
    if (res.status >= 200 && res.status < 300) return { status: res.status, idempotent: data?.idempotent === true, data };
    const retryAfter = Number(res?.headers?.['retry-after']);
    const message = data?.message || data?.error || `Master Fees refused the change (HTTP ${res.status}).`;
    throw new MasterFeesWriteError(
        message, res.status, data?.code ?? null,
        { ...(data?.details && typeof data.details === 'object' ? data.details : {}), ...(Number.isFinite(retryAfter) ? { retry_after_seconds: retryAfter } : {}) },
        res.status >= 500 || res.status === 408 || res.status === 429,
    );
}

/** The key that makes a repeat of one request harmless: the caller's own reference, which Master Fees also uses to recognise it. */
const keyFor = (body: { external_reference?: string }) => body.external_reference;

export const masterFeesWrites = {
    recordPayment: (config: MasterFeesConfig, input: unknown, opts: SendOptions = {}) => { const body = cleanPayment(input); return sendWrite(config, 'POST', '/payments', body, { ...opts, idempotencyKey: opts.idempotencyKey ?? keyFor(body) }); },
    createStudent: (config: MasterFeesConfig, input: unknown, opts: SendOptions = {}) => sendWrite(config, 'POST', '/students', cleanStudentCreate(input), opts),
    updateStudent: (config: MasterFeesConfig, id: unknown, input: unknown, opts: SendOptions = {}) => sendWrite(config, 'PATCH', `/students/${cleanId(id, 'student id')}`, cleanStudentUpdate(input), opts),
    createInvoice: (config: MasterFeesConfig, input: unknown, opts: SendOptions = {}) => { const body = cleanInvoice(input); return sendWrite(config, 'POST', '/invoices', body, { ...opts, idempotencyKey: opts.idempotencyKey ?? keyFor(body) }); },
    voidInvoice: (config: MasterFeesConfig, id: unknown, input: unknown, opts: SendOptions = {}) => sendWrite(config, 'POST', `/invoices/${cleanId(id, 'invoice id')}/void`, cleanVoid(input), opts),
    voidPayment: (config: MasterFeesConfig, id: unknown, input: unknown, opts: SendOptions = {}) => sendWrite(config, 'POST', `/payments/${cleanId(id, 'payment id')}/void`, cleanVoid(input), opts),
};

/* ───────────── Editing: void the old one, record the corrected one ───────────── */

/**
 * Master Fees has no "edit" (it refuses to change a payment, or an invoice's lines or total, once made), so an edit here is what accounting does:
 * the old record is voided (kept, marked void, its ledger effect reversed) and the corrected one is created under a NEW reference. Nothing is
 * deleted, and both stay on record with the reason.
 *
 * Safe to press twice. The corrected record is checked in full BEFORE anything is voided, so a mistake in the form changes nothing. Voiding
 * something already void answers 200 "idempotent", and creating with the same reference returns the first result, so sending the same edit again
 * after a failure finishes it instead of doing it twice. The one state to watch is "old voided, new not recorded yet": the error then says so
 * (`details.old_voided`) and the same edit sent again completes it.
 */
export interface ReplaceResult { voided: WriteResult; created: WriteResult }

const editReason = (input: any): string => `Edited: ${cleanVoid({ reason: input?.edit_reason }).reason}`.slice(0, 300);
const stripEdit = (input: any) => { const { edit_reason: _drop, ...rest } = input ?? {}; return rest; };

async function replaceWith(voidFirst: () => Promise<WriteResult>, create: () => Promise<WriteResult>, what: string): Promise<ReplaceResult> {
    const voided = await voidFirst(); // refused (for example an invoice that has payments): nothing has changed
    try {
        return { voided, created: await create() };
    } catch (e: any) {
        if (e instanceof MasterFeesWriteError) {
            throw new MasterFeesWriteError(
                `The old ${what} was voided, but the corrected one was not recorded: ${e.message} Send the same edit again to finish it.`,
                e.status, e.code, { ...(e.details as object | null), old_voided: true }, e.retryable,
            );
        }
        throw e;
    }
}

export function replacePayment(config: MasterFeesConfig, id: unknown, input: any, opts: SendOptions = {}): Promise<ReplaceResult> {
    const oldId = cleanId(id, 'payment id');
    const body = cleanPayment(stripEdit(input));          // checked first, in full
    const reason = editReason(input);
    return replaceWith(
        () => sendWrite(config, 'POST', `/payments/${oldId}/void`, { reason }, opts),
        () => sendWrite(config, 'POST', '/payments', body, { ...opts, idempotencyKey: opts.idempotencyKey ?? keyFor(body) }),
        'payment',
    );
}

export function replaceInvoice(config: MasterFeesConfig, id: unknown, input: any, opts: SendOptions = {}): Promise<ReplaceResult> {
    const oldId = cleanId(id, 'invoice id');
    const body = cleanInvoice(stripEdit(input));
    const reason = editReason(input);
    return replaceWith(
        () => sendWrite(config, 'POST', `/invoices/${oldId}/void`, { reason }, opts),
        () => sendWrite(config, 'POST', '/invoices', body, { ...opts, idempotencyKey: opts.idempotencyKey ?? keyFor(body) }),
        'invoice',
    );
}
