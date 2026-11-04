import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, FileText, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import {
    DOC_LIMITS, EMPTY_APPLICANT, GENDERS, ID_TYPES, INCOME_SOURCES, NATIONALITIES, OCCUPATIONS, RELATIONSHIPS,
    idNeedsBack, investmentService, lencoService, validateApplicantStep, validateDocumentStep,
} from 'core';
import type { IdType, InvestorApplicant, InvestorDocKey, InvestorDocuments } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, fieldClass, labelClass } from '../components/ui/Dialog';
import BankSelect from '../components/BankSelect';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { apiJson } from 'core';
import { assessImage } from '../lib/imageQuality';
import type { QualityResult } from '../lib/imageQuality';

/** What the server's check of an uploaded document says. */
/** Compares the selfie with the photo on the ID. Only shows once the service is switched on and both pictures are saved. */
function FaceMatchCard({ ready }: { ready: boolean }) {
    const [s, setS] = useState<{ state: string; message: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const load = () => apiJson<{ state: string; message: string }>('/investments/kyc-profile/face-match').then(setS).catch(() => setS(null));
    useEffect(() => { if (ready) load(); }, [ready]);
    useEffect(() => { if (s?.state !== 'PENDING') return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [s?.state]);
    if (!ready || !s || s.state === 'OFF') return null;
    const start = async () => {
        setBusy(true);
        try { setS(await apiJson('/investments/kyc-profile/face-match', { method: 'POST', body: '{}' })); }
        catch (e: any) { setS({ state: 'ERROR', message: e?.message || 'Could not start the face check.' }); }
        finally { setBusy(false); }
    };
    const tone = s.state === 'PASSED' ? 'text-[#137333]' : s.state === 'PENDING' ? 'text-[#5F6368]' : 'text-[#B06000]';
    return (
        <div className="rounded-xl border border-[#E0E0E0] p-3 text-sm">
            <p className={tone}>{s.message}</p>
            {(s.state === 'NOT_STARTED' || s.state === 'ERROR' || s.state === 'REVIEW') && (
                <button type="button" onClick={start} disabled={busy} className="mt-2 text-xs font-medium text-[#0059D8] disabled:opacity-50">
                    {busy ? 'Starting…' : s.state === 'NOT_STARTED' ? 'Compare my selfie with my ID' : 'Try again'}
                </button>
            )}
            {s.state === 'NOT_STARTED' && <p className="mt-1 text-[11px] text-[#5F6368]">Your photos are sent securely to our identity partner, Smile ID, for this one check.</p>}
        </div>
    );
}

interface DocCheck { score: number; level: 'good' | 'ok' | 'poor'; usable: boolean; issues: string[]; note?: string | null; needsReview?: boolean; flags?: string[] }

type Errors = Record<string, string>;

const extOf = (name: string) => (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

/** One upload slot: choose a file (an image or a PDF) and it goes straight to the private bucket under the person's own folder. */
const DocSlot: React.FC<{
    label: string;
    hint: string;
    slot: InvestorDocKey;
    userId: string;
    value?: string;
    previewUrl?: string | null;
    error?: string;
    onChange: (path: string | undefined) => void;
    onUploaded?: (path: string) => void;
}> = ({ label, hint, slot, userId, value, previewUrl, error, onChange, onUploaded }) => {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [local, setLocal] = useState<string | null>(null);
    const [name, setName] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [quality, setQuality] = useState<QualityResult | null>(null);
    const [check, setCheck] = useState<DocCheck | null>(null);
    const [checking, setChecking] = useState(false);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setLocal(null);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImage = file.type.startsWith('image/');
        if (!isPdf && !isImage) { setLocal('Choose a PDF or an image (JPG, PNG or WebP).'); return; }
        if (isImage && file.size > DOC_LIMITS.imageBytesAfterCompression) { setLocal('That image is over 5MB. Choose a smaller one.'); return; }
        if (isPdf && file.size > DOC_LIMITS.pdfBytes) { setLocal('PDFs must be 10MB or smaller.'); return; }
        // A photo that is blurry, dark or full of glare is turned away now, while the person still has the document in their hand.
        setQuality(null); setCheck(null);
        if (isImage) {
            try {
                const q = await assessImage(file);
                if (q.level === 'poor') { setLocal(`${q.issues[0] ?? 'This photo is hard to read.'} Please retake it.`); if (input.current) input.current.value = ''; return; }
                setQuality(q);
            } catch { /* if the photo can't be measured here, the server still checks it */ }
        }
        setBusy(true);
        try {
            const path = `${userId}/kyc-profile/${slot}_${Date.now()}.${isPdf ? 'pdf' : extOf(file.name)}`;
            const { error: upErr } = await supabase.storage.from('investor-kyc').upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw new Error(upErr.message);
            setName(file.name);
            setPreview(isImage ? URL.createObjectURL(file) : null);
            onChange(path);
            onUploaded?.(path);
            // Then the server reads it: the right document, every corner showing, legible, not expired.
            setChecking(true);
            apiJson<DocCheck>('/investments/kyc-profile/check-document', { method: 'POST', body: JSON.stringify({ slot, path, clientScore: quality?.score }) })
                .then((r) => setCheck(r)).catch(() => undefined).finally(() => setChecking(false));
        } catch (e: any) {
            setLocal(e?.message || 'The upload failed. Check your connection and try again.');
        } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };

    const shown = local || error;
    const thumb = preview || previewUrl;
    return (
        <div>
            <p className={labelClass}>{label}</p>
            <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
                aria-label={value ? `${label} uploaded. Replace` : `Upload ${label}`}
                className={`flex w-full items-center gap-4 rounded-2xl border border-dashed p-4 text-left transition hover:bg-[#F8FAFD] ${shown ? 'border-[#D93025]' : value ? 'border-[#34A853] bg-[#E6F4EA]/40' : 'border-[#C4C7C5]'}`}
            >
                <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#E8F0FE] text-[#0B57D0]">
                    {busy ? <Loader2 size={22} className="animate-spin" /> : thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : value ? <FileText size={24} /> : <UploadCloud size={24} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#1F1F1F]">{busy ? 'Uploading…' : value ? 'Uploaded' : 'Upload a file'}</span>
                    <span className="block truncate text-xs text-[#5F6368]">{name || hint}</span>
                </span>
                {value && !busy && <CheckCircle size={18} className="flex-shrink-0 text-[#1E8E3E]" />}
            </button>
            <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {shown && <p className="mt-1 text-xs text-[#B31412]">{shown}</p>}
            {!shown && checking && <p className="mt-1 flex items-center gap-1.5 text-xs text-[#5F6368]"><Loader2 size={12} className="animate-spin" /> Checking the document…</p>}
            {!shown && !checking && check && (
                <p className={`mt-1 text-xs ${check.usable ? (check.level === 'good' ? 'text-[#137333]' : 'text-[#B06000]') : 'text-[#B31412]'}`}>
                    {check.usable ? (check.level === 'good' ? `Document check: good (${check.score}/100).` : `Document check: acceptable (${check.score}/100). ${check.issues[0] ?? ''}`) : `This may be rejected: ${check.issues[0] ?? 'it couldn’t be read'} Please upload a clearer one.`}
                </p>
            )}
            {!shown && !checking && check?.needsReview && (check.flags ?? []).length > 0 && (
                <p className="mt-1 text-xs text-[#B06000]">{check.flags![0]} A person may look at this before it’s accepted.</p>
            )}
            {!shown && !checking && !check && quality && quality.level === 'ok' && <p className="mt-1 text-xs text-[#B06000]">{quality.issues[0]} A clearer photo is safer.</p>}
        </div>
    );
};

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5 md:p-6">
        <h2 className="text-sm font-bold text-[#1F1F1F]">{title}</h2>
        {subtitle && <p className="mb-4 mt-0.5 text-xs text-[#5F6368]">{subtitle}</p>}
        {!subtitle && <div className="mb-4" />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
);

const Text: React.FC<{ label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string; wide?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }> = ({ label, value, onChange, error, type = 'text', placeholder, wide, inputMode }) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
        <label className={labelClass}>{label}</label>
        <input type={type} inputMode={inputMode} className={`${fieldClass} ${error ? 'border-[#D93025] focus:border-[#D93025] focus:ring-[#D93025]' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {error && <p className="mt-1 text-xs text-[#B31412]">{error}</p>}
    </div>
);

const Select: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; error?: string; placeholder?: string }> = ({ label, value, options, onChange, error, placeholder = 'Select' }) => (
    <div>
        <label className={labelClass}>{label}</label>
        <select className={`${fieldClass} appearance-none ${error ? 'border-[#D93025]' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {error && <p className="mt-1 text-xs text-[#B31412]">{error}</p>}
    </div>
);

/**
 * KYC profile: the investor details a person saves once, so opening an account with any investment company is one tap.
 * ID first (we read it and fill in the personal details), then the rest. The web twin of the Expo KYC profile screen.
 */
export const KycProfile: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { user, organizationId } = useAuth();
    const uid = user?.id ?? '';

    const { data: profile, isPending } = useQuery({ queryKey: ['kyc-profile'], queryFn: () => investmentService.getKycProfile() });
    const { data: banksRaw } = useQuery({ queryKey: ['lenco-banks'], queryFn: () => lencoService.getBanks(), staleTime: 60 * 60_000 });
    const banks: any[] = Array.isArray(banksRaw) ? banksRaw : (banksRaw?.data || []);

    const [applicant, setApplicant] = useState<InvestorApplicant>({ ...EMPTY_APPLICANT });
    const [idType, setIdType] = useState<IdType | ''>('');
    const [docs, setDocs] = useState<InvestorDocuments>({});
    const [errors, setErrors] = useState<Errors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [reading, setReading] = useState(false);
    const [readNote, setReadNote] = useState<string | null>(null);
    const [bankChecking, setBankChecking] = useState(false);

    useEffect(() => {
        if (!profile?.exists) return;
        setApplicant({ ...EMPTY_APPLICANT, ...(profile.applicant ?? {}) } as InvestorApplicant);
        setIdType((profile.idType as IdType) ?? '');
        setDocs(profile.documents as InvestorDocuments);
    }, [profile]);

    const set = <K extends keyof InvestorApplicant>(key: K, value: InvestorApplicant[K]) => {
        setSaved(false);
        setApplicant((a) => ({ ...a, [key]: value }));
        setErrors((e) => ({ ...e, [key]: '' }));
    };
    const setDoc = (key: InvestorDocKey, path: string | undefined) => { setSaved(false); setDocs((d) => ({ ...d, [key]: path })); setErrors((e) => ({ ...e, [key]: '' })); };

    const bankId = useMemo(() => {
        const b = banks.find((x) => String(x.name) === applicant.bank_name);
        return b ? String(b.id || b.code) : '';
    }, [banks, applicant.bank_name]);

    // Who owns the bank account, so a typo is caught before the application is sent.
    useEffect(() => {
        if (!bankId || applicant.bank_account_number.trim().length < 5) { return; }
        let cancelled = false;
        setBankChecking(true);
        const t = setTimeout(() => {
            lencoService.resolveBankAccount(applicant.bank_account_number.trim(), bankId, organizationId ?? undefined)
                .then((res: any) => { if (!cancelled) setApplicant((a) => ({ ...a, bank_account_name: res.accountName || res.account_name || res.name || '' })); })
                .catch(() => { if (!cancelled) setApplicant((a) => ({ ...a, bank_account_name: '' })); })
                .finally(() => { if (!cancelled) setBankChecking(false); });
        }, 500);
        return () => { cancelled = true; clearTimeout(t); };
    }, [bankId, applicant.bank_account_number, organizationId]);

    // AI reads the ID as soon as its front page is uploaded and fills in what it can.
    const readId = async (path: string) => {
        if (!idType) return;
        setReading(true); setReadNote(null);
        try {
            const x = await investmentService.extractIdDetails(path, idType);
            if (x.looks_like_id === false) { setReadNote('That doesn’t look like the ID you chose. Check it, or type your details below.'); return; }
            setApplicant((a) => ({
                ...a,
                first_name: x.first_name || a.first_name, middle_name: x.middle_name || a.middle_name, last_name: x.last_name || a.last_name,
                date_of_birth: x.date_of_birth || a.date_of_birth, gender: x.gender || a.gender,
                nationality: x.nationality || a.nationality, id_number: x.id_number || a.id_number,
            }));
            setReadNote('We filled in what we could read. Please check it below.');
        } catch {
            setReadNote('We couldn’t read it clearly. You can type your details below.');
        } finally {
            setReading(false);
        }
    };

    const validate = (): Errors => {
        const a = { ...applicant, id_type: idType };
        return {
            ...validateDocumentStep('id', idType, docs),
            ...validateApplicantStep('personal', a), ...validateApplicantStep('contact', a), ...validateApplicantStep('work', a),
            ...validateApplicantStep('banking', a), ...validateApplicantStep('kin', a),
            ...validateDocumentStep('photo', idType, docs), ...validateDocumentStep('residence', idType, docs),
        };
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length) { setBanner('Please fix the highlighted fields.'); window.scrollTo?.({ top: 0 }); return; }
        setBanner(null); setSaving(true);
        try {
            await investmentService.saveKycProfile({
                applicant: { ...applicant, id_type: idType } as unknown as Record<string, string>,
                idType,
                documents: docs as Record<string, string>,
            });
            qc.invalidateQueries({ queryKey: ['kyc-profile'] });
            setSaved(true);
        } catch (err: any) {
            setBanner(err?.message || 'Could not save your KYC profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const previews = profile?.documentUrls ?? {};

    return (
        <PagePanel
            title="KYC profile"
            subtitle="Save your details once and open investment accounts in one tap"
            back="/invest"
            maxWidth="max-w-3xl"
            actions={<PrimaryButton onClick={save} busy={saving} className="h-10 px-6">{saved ? 'Saved' : 'Save profile'}</PrimaryButton>}
        >
            <ErrorNote text={banner} />
            {saved && (
                <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]"><CheckCircle size={16} /> KYC profile saved. Next time you open an account, you can submit these details in one tap.</p>
            )}
            {isPending ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : (
                <div className="flex flex-col gap-5">
                    {profile?.exists && !profile.complete && profile.missing.length > 0 && (
                        <p className="flex items-start gap-2 rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#B06000]"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> Still needed: {profile.missing.join(', ')}.</p>
                    )}

                    <Section title="Your ID" subtitle="Upload your ID and we’ll fill in your details">
                        <Select label="Kind of ID" value={idType} onChange={(v) => { setIdType(v as IdType); setErrors((e) => ({ ...e, id_type: '' })); setSaved(false); }} options={ID_TYPES.map((t) => ({ value: t, label: t }))} error={errors.id_type} placeholder="Choose the kind of ID" />
                        <div />
                        <DocSlot label={idType === 'Passport' ? 'Passport photo page' : 'Front of ID'} hint="A clear photo or PDF" slot="id_front" userId={uid} value={docs.id_front} previewUrl={previews.id_front} error={errors.id_front} onChange={(p) => setDoc('id_front', p)} onUploaded={readId} />
                        {idNeedsBack(idType) && <DocSlot label="Back of ID" hint="A clear photo or PDF" slot="id_back" userId={uid} value={docs.id_back} previewUrl={previews.id_back} error={errors.id_back} onChange={(p) => setDoc('id_back', p)} />}
                        {(reading || readNote) && (
                            <p className="flex items-center gap-2 rounded-xl bg-[#E8F0FE] px-4 py-3 text-xs text-[#1967D2] sm:col-span-2">
                                {reading ? <><Loader2 size={14} className="animate-spin" /> Reading your ID…</> : <><Sparkles size={14} /> {readNote}</>}
                            </p>
                        )}
                    </Section>

                    <Section title="Personal details" subtitle="Check what we read from your ID">
                        <Text label="First name" value={applicant.first_name} onChange={(v) => set('first_name', v)} error={errors.first_name} />
                        <Text label="Middle name (optional)" value={applicant.middle_name} onChange={(v) => set('middle_name', v)} />
                        <Text label="Last name" value={applicant.last_name} onChange={(v) => set('last_name', v)} error={errors.last_name} />
                        <Text label="Date of birth" type="date" value={applicant.date_of_birth} onChange={(v) => set('date_of_birth', v)} error={errors.date_of_birth} />
                        <Select label="Gender" value={applicant.gender} onChange={(v) => set('gender', v as InvestorApplicant['gender'])} options={GENDERS.map((g) => ({ value: g.value, label: g.label }))} error={errors.gender} />
                        <Select label="Nationality" value={applicant.nationality} onChange={(v) => set('nationality', v)} options={NATIONALITIES.map((n) => ({ value: n.value, label: n.value }))} error={errors.nationality} />
                        <Text label="ID number" value={applicant.id_number} onChange={(v) => set('id_number', v)} error={errors.id_number} wide />
                    </Section>

                    <Section title="Contact details" subtitle="How the company can reach you">
                        <Text label="Email" type="email" value={applicant.email} onChange={(v) => set('email', v)} error={errors.email} />
                        <Text label="Phone" inputMode="tel" value={applicant.phone} onChange={(v) => set('phone', v)} error={errors.phone} placeholder="+260…" />
                        <Text label="Physical address" value={applicant.physical_address} onChange={(v) => set('physical_address', v)} error={errors.physical_address} wide />
                    </Section>

                    <Section title="Occupation and income" subtitle="What you do and where your money comes from">
                        <Select label="Occupation" value={applicant.occupation} onChange={(v) => set('occupation', v)} options={OCCUPATIONS.map((o) => ({ value: o, label: o }))} error={errors.occupation} />
                        <Select label="Source of income" value={applicant.source_of_income} onChange={(v) => set('source_of_income', v)} options={INCOME_SOURCES.map((o) => ({ value: o, label: o }))} error={errors.source_of_income} />
                    </Section>

                    <Section title="Bank account" subtitle="Where your returns are paid">
                        <div>
                            <label className={labelClass}>Bank</label>
                            <BankSelect banks={banks.map((b) => ({ ...b, id: String(b.id || b.code) }))} value={bankId} onChange={(id) => { const b = banks.find((x) => String(x.id || x.code) === id); set('bank_name', b ? String(b.name) : ''); set('bank_account_name', ''); }} className={`${fieldClass} flex items-center justify-between`} placeholder="Select bank" />
                            {errors.bank_name && <p className="mt-1 text-xs text-[#B31412]">{errors.bank_name}</p>}
                        </div>
                        <Text label="Account number" inputMode="numeric" value={applicant.bank_account_number} onChange={(v) => { set('bank_account_number', v.replace(/[^0-9A-Za-z-]/g, '')); set('bank_account_name', ''); }} error={errors.bank_account_number} />
                        {(bankChecking || applicant.bank_account_name) && (
                            <p className="flex items-center gap-2 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333] sm:col-span-2">
                                {bankChecking ? <><Loader2 size={14} className="animate-spin" /> Checking the account…</> : <><CheckCircle size={14} /> <span className="font-semibold">{applicant.bank_account_name}</span></>}
                            </p>
                        )}
                    </Section>

                    <Section title="Next of kin" subtitle="Who to contact on your behalf">
                        <Text label="Full name" value={applicant.nok_full_name} onChange={(v) => set('nok_full_name', v)} error={errors.nok_full_name} />
                        <Select label="Relationship" value={applicant.nok_relationship} onChange={(v) => set('nok_relationship', v)} options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))} error={errors.nok_relationship} />
                        <Text label="ID / NRC / passport number" value={applicant.nok_id_number} onChange={(v) => set('nok_id_number', v)} error={errors.nok_id_number} />
                        <Text label="Date of birth" type="date" value={applicant.nok_date_of_birth} onChange={(v) => set('nok_date_of_birth', v)} error={errors.nok_date_of_birth} />
                        <Text label="Contact number" inputMode="tel" value={applicant.nok_phone} onChange={(v) => set('nok_phone', v)} error={errors.nok_phone} wide />
                    </Section>

                    <Section title="Photo and proof of residence" subtitle="A clear, recent photo of your face, and a utility bill or similar showing your address">
                        <DocSlot label="Passport-size photo" hint="A clear, recent photo of your face" slot="photo" userId={uid} value={docs.photo} previewUrl={previews.photo} error={errors.photo} onChange={(p) => setDoc('photo', p)} />
                        <FaceMatchCard ready={!!docs.photo && !!docs.id_front} />
                        <DocSlot label="Proof of residence" hint="A utility bill, bank statement or similar" slot="proof_of_residence" userId={uid} value={docs.proof_of_residence} previewUrl={previews.proof_of_residence} error={errors.proof_of_residence} onChange={(p) => setDoc('proof_of_residence', p)} />
                    </Section>

                    <div className="flex items-center justify-between">
                        <button type="button" onClick={() => navigate('/invest/accounts')} className="text-sm font-semibold text-[#0B57D0] hover:underline">Go to my investor accounts</button>
                        <PrimaryButton onClick={save} busy={saving} className="px-8">{saved ? 'Saved' : 'Save profile'}</PrimaryButton>
                    </div>
                </div>
            )}
        </PagePanel>
    );
};
