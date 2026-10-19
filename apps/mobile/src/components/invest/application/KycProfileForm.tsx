import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import {
    investmentService, userService, GENDERS, ID_TYPES, OCCUPATIONS, INCOME_SOURCES, RELATIONSHIPS, NATIONALITIES, EMPTY_APPLICANT,
    idNeedsBack, flagFromIso2, validateApplicantStep, validateDocumentStep,
} from 'core';
import type { InvestorApplicant, IdType, FieldErrors, ApplicationStepId } from 'core';
import { useAuth } from '../../../context/AuthContext';
import { ErrorBanner, TextField } from '../../onboarding/ui';
import { ScreenHeader } from '../../ScreenHeader';
import { SelectField, DateField, DocUploadCard, type UploadedDoc, type SelectOption } from './formFields';
import { BankAccountFields } from './BankAccountFields';
import { DocIllustration, type DocIllustrationKind } from './DocIllustrations';
import { colors, fonts, radius } from '../../../theme/tokens';

const opt = (list: string[]): SelectOption[] => list.map((v) => ({ value: v, label: v }));
type DocSlots = Partial<Record<'id_front' | 'id_back' | 'photo' | 'proof_of_residence', UploadedDoc>>;

const illustrationFor = (type: IdType, side: 'front' | 'back'): DocIllustrationKind =>
    type === 'Passport' ? 'passport' : type === 'NRC' ? (side === 'front' ? 'nrc-front' : 'nrc-back') : (side === 'front' ? 'licence-front' : 'licence-back');

const Section: React.FC<{ title: string; hint?: string; complete: boolean; children: React.ReactNode }> = ({ title, hint, complete, children }) => (
    <View style={styles.section}>
        <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={[styles.badge, complete ? styles.badgeDone : styles.badgeTodo]}>
                {complete && <CheckCircle2 size={11} color={colors.positiveInk} />}
                <Text style={[styles.badgeText, complete ? { color: colors.positiveInk } : { color: colors.textMuted }]}>{complete ? 'Complete' : 'Incomplete'}</Text>
            </View>
        </View>
        {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
        <View style={{ marginTop: 14 }}>{children}</View>
    </View>
);

/**
 * Settings → KYC profile. One page with every detail and document an investment company asks for, already
 * filled in from what the person has submitted before, all editable in place. Saving keeps it for every future
 * company (opening an account then needs a single tap).
 */
export const KycProfileForm: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
    const qc = useQueryClient();
    const { user } = useAuth();
    const uid = user?.id ?? '';
    const { data: kyc, isLoading } = useQuery({ queryKey: ['kyc-profile'], queryFn: () => investmentService.getKycProfile().catch(() => null), staleTime: 0 });
    const { data: me } = useQuery({ queryKey: ['users', 'me'], queryFn: () => userService.getMyProfile(), staleTime: 60_000 });

    const [ready, setReady] = useState(false);
    const [a, setA] = useState<InvestorApplicant>({ ...EMPTY_APPLICANT });
    const [idType, setIdType] = useState<IdType>('NRC');
    const [docs, setDocs] = useState<DocSlots>({});
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [read, setRead] = useState<'idle' | 'reading' | 'done' | 'failed' | 'not_id'>('idle');
    const readRun = useRef(0);

    // Load the saved profile once; fall back to what we know about the person if they have none yet.
    useEffect(() => {
        if (ready || isLoading) return;
        if (kyc?.exists && kyc.applicant) {
            setA({ ...EMPTY_APPLICANT, ...(kyc.applicant as any) });
            if (kyc.idType && (ID_TYPES as string[]).includes(kyc.idType)) setIdType(kyc.idType as IdType);
            const slots: DocSlots = {};
            (Object.entries(kyc.documents ?? {}) as [keyof DocSlots, string][]).forEach(([k, path]) => {
                const url = kyc.documentUrls?.[k as string];
                slots[k] = { path, name: path.split('/').pop() || String(k), uri: url && !/\.pdf$/i.test(path) ? url : undefined };
            });
            setDocs(slots);
            setReady(true);
        } else if (me) {
            const parts = (me.name || '').trim().split(/\s+/).filter(Boolean);
            setA((p) => ({
                ...p, first_name: parts[0] || '', last_name: parts.length > 1 ? parts[parts.length - 1] : '',
                middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : '', email: user?.email || '', phone: user?.phone || '',
            }));
            setReady(true);
        }
    }, [kyc, isLoading, me, ready, user?.email, user?.phone]);

    const set = <K extends keyof InvestorApplicant>(key: K, value: InvestorApplicant[K]) => {
        setA((prev) => ({ ...prev, [key]: value }));
        setErrors((e) => { const { [key as string]: _d, ...rest } = e; return rest; });
    };
    const patch = (p: Partial<InvestorApplicant>) => {
        setA((prev) => ({ ...prev, ...p }));
        setErrors((e) => { const next = { ...e }; Object.keys(p).forEach((k) => { delete next[k]; }); delete next.bank_account_number; return next; });
    };
    const setDoc = (key: keyof DocSlots, doc: UploadedDoc | undefined) => {
        setDocs((d) => ({ ...d, [key]: doc }));
        setErrors((e) => { const { [key as string]: _d, ...rest } = e; return rest; });
    };

    const onIdFront = async (doc: UploadedDoc | undefined) => {
        setDoc('id_front', doc);
        if (!doc) { readRun.current++; setRead('idle'); return; }
        const run = ++readRun.current;
        setRead('reading');
        try {
            const x = await investmentService.extractIdDetails(doc.path, idType);
            if (run !== readRun.current) return;
            if (x.looks_like_id === false) { setRead('not_id'); return; }
            if (!(x.first_name || x.last_name || x.date_of_birth || x.id_number)) { setRead('failed'); return; }
            const nat = x.nationality ? NATIONALITIES.find((n) => n.value.toLowerCase() === x.nationality!.toLowerCase())?.value : undefined;
            setA((prev) => ({
                ...prev, first_name: x.first_name || prev.first_name, middle_name: x.middle_name ?? prev.middle_name, last_name: x.last_name || prev.last_name,
                date_of_birth: x.date_of_birth || prev.date_of_birth, gender: (x.gender as any) || prev.gender, nationality: nat || prev.nationality,
                id_number: x.id_number || prev.id_number,
            }));
            setRead('done');
        } catch { if (run === readRun.current) setRead('failed'); }
    };

    const changeIdType = (t: IdType) => {
        if (t === idType) return;
        readRun.current++;
        setIdType(t);
        setDocs((d) => ({ ...d, id_front: undefined, id_back: undefined }));
        setRead('idle');
    };

    const save = async () => {
        const docPaths = { id_front: docs.id_front?.path, id_back: idNeedsBack(idType) ? docs.id_back?.path : undefined, photo: docs.photo?.path, proof_of_residence: docs.proof_of_residence?.path };
        let e: FieldErrors = {};
        for (const id of ['personal', 'contact', 'work', 'banking', 'kin'] as ApplicationStepId[]) e = { ...e, ...validateApplicantStep(id, a) };
        for (const id of ['id', 'photo', 'residence'] as const) e = { ...e, ...validateDocumentStep(id, idType, docPaths) };
        setErrors(e);
        if (Object.keys(e).length) { setBanner(`Please fix the highlighted fields (${Object.keys(e).length}).`); return; }

        setSaving(true);
        setBanner(null);
        try {
            const { sales_person: _s, ...applicant } = a;
            const documents: Record<string, string> = {};
            (Object.entries(docPaths) as [string, string | undefined][]).forEach(([k, v]) => { if (v) documents[k] = v; });
            const saved = await investmentService.saveKycProfile({ applicant: { ...applicant, id_type: idType } as any, idType, documents });
            qc.setQueryData(['kyc-profile'], saved);
            onSaved();
        } catch (err: any) {
            setBanner(err?.message || 'We could not save your KYC profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const nationalityOptions: SelectOption[] = NATIONALITIES.map((n) => ({ value: n.value, label: n.value, leading: <Text style={{ fontSize: 22 }}>{n.iso2 ? flagFromIso2(n.iso2) : '🌍'}</Text> }));
    const idNumberLabel = idType === 'Passport' ? 'Passport number' : idType === "Driver's Licence" ? 'Licence number' : 'NRC number';
    const reading = read === 'reading';

    // Completion: every required detail and document, counted live as the page is edited.
    const REQUIRED: (keyof InvestorApplicant)[] = [
        'first_name', 'last_name', 'date_of_birth', 'gender', 'nationality', 'id_number', 'email', 'phone', 'physical_address',
        'occupation', 'source_of_income', 'bank_name', 'bank_account_number', 'bank_account_name',
        'nok_full_name', 'nok_id_number', 'nok_date_of_birth', 'nok_phone', 'nok_relationship',
    ];
    const docKeys: (keyof DocSlots)[] = ['id_front', ...(idNeedsBack(idType) ? ['id_back' as const] : []), 'photo', 'proof_of_residence'];
    const total = REQUIRED.length + docKeys.length;
    const done = REQUIRED.filter((k) => String(a[k] ?? '').trim()).length + docKeys.filter((k) => !!docs[k]).length;
    const pct = Math.round((done / total) * 100);
    const filled = (keys: (keyof InvestorApplicant)[]) => keys.every((k) => String(a[k] ?? '').trim());
    const done_ = {
        id: !!docs.id_front && (!idNeedsBack(idType) || !!docs.id_back),
        personal: filled(['first_name', 'last_name', 'date_of_birth', 'gender', 'nationality', 'id_number']),
        contact: filled(['email', 'phone', 'physical_address']),
        work: filled(['occupation', 'source_of_income']),
        bank: filled(['bank_name', 'bank_account_number', 'bank_account_name']),
        kin: filled(['nok_full_name', 'nok_id_number', 'nok_date_of_birth', 'nok_phone', 'nok_relationship']),
        photo: !!docs.photo,
        residence: !!docs.proof_of_residence,
    };

    return (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
            <ScreenHeader
                title="KYC Profile"
                right={
                    <Pressable onPress={save} disabled={saving || reading || !ready} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save KYC profile">
                        {saving ? <ActivityIndicator size="small" color={colors.blue} /> : <Text style={[styles.saveText, (reading || !ready) && { opacity: 0.4 }]}>Save</Text>}
                    </Pressable>
                }
            />
            {!ready ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <>
                    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <View style={styles.completion}>
                            <View style={styles.completionHead}>
                                <Text style={styles.completionTitle}>Profile completion</Text>
                                {pct === 100
                                    ? <View style={styles.completeBadge}><CheckCircle2 size={14} color={colors.positiveInk} /><Text style={styles.completeBadgeText}>Ready for one-click</Text></View>
                                    : <Text style={styles.completionPct}>{pct}%</Text>}
                            </View>
                            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }, pct === 100 && { backgroundColor: colors.positive }]} /></View>
                            <Text style={styles.completionSub}>
                                {pct === 100 ? 'Everything an investment company asks for is on file.' : `${done} of ${total} items done — complete them to open accounts in one tap.`}
                            </Text>
                        </View>
                        <ErrorBanner message={banner} />

                        <Section complete={done_.id} title="Identity document" hint="Upload a clear photo. Replacing the front re-reads your details.">
                            <View style={styles.segment}>
                                {ID_TYPES.map((t) => (
                                    <Pressable key={t} onPress={() => changeIdType(t)} style={[styles.segItem, idType === t && styles.segItemActive]}>
                                        <Text style={[styles.segText, idType === t && styles.segTextActive]} numberOfLines={1}>{t}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <DocUploadCard
                                label={idType === 'Passport' ? 'Passport photo page' : `${idType} · front`} hint="The side with your photo and details."
                                illustration={<DocIllustration kind={illustrationFor(idType, 'front')} width={240} />}
                                userId={uid} folder="kyc-profile" slot="id_front" value={docs.id_front} onChange={onIdFront} error={errors.id_front || errors.id_type}
                            />
                            {idNeedsBack(idType) && (
                                <DocUploadCard
                                    label={`${idType} · back`} hint="The reverse side."
                                    illustration={<DocIllustration kind={illustrationFor(idType, 'back')} width={240} />}
                                    userId={uid} folder="kyc-profile" slot="id_back" value={docs.id_back} onChange={(d) => setDoc('id_back', d)} error={errors.id_back}
                                />
                            )}
                            {read !== 'idle' && (
                                <View style={[styles.note, read === 'done' ? styles.noteOk : read === 'reading' ? styles.noteBlue : styles.noteWarn]}>
                                    {read === 'reading' ? <ActivityIndicator size="small" color={colors.blue} /> : read === 'done' ? <Sparkles size={18} color={colors.positiveInk} /> : <AlertCircle size={18} color={colors.warn} />}
                                    <Text style={styles.noteText}>
                                        {read === 'reading' ? 'Reading your ID…' : read === 'done' ? 'Details updated from your ID. Check them below.'
                                            : read === 'not_id' ? `That doesn’t look like a ${idType}. Try a clearer photo.` : 'We couldn’t read it clearly. You can edit the details below.'}
                                    </Text>
                                </View>
                            )}
                        </Section>

                        <Section complete={done_.personal} title="Personal details">
                            <TextField label="First name" value={a.first_name} onChangeText={(t) => set('first_name', t)} error={errors.first_name} autoCapitalize="words" />
                            <TextField label="Middle name" value={a.middle_name} onChangeText={(t) => set('middle_name', t)} optional autoCapitalize="words" />
                            <TextField label="Last name" value={a.last_name} onChangeText={(t) => set('last_name', t)} error={errors.last_name} autoCapitalize="words" />
                            <DateField key={`dob-${a.date_of_birth}`} label="Date of birth" value={a.date_of_birth} onChange={(v) => set('date_of_birth', v)} error={errors.date_of_birth} />
                            <SelectField label="Gender" value={a.gender} options={GENDERS} onChange={(v) => set('gender', v as any)} error={errors.gender} />
                            <SelectField label="Nationality" value={a.nationality} options={nationalityOptions} onChange={(v) => set('nationality', v)} error={errors.nationality} searchable />
                            <TextField label={idNumberLabel} value={a.id_number} onChangeText={(t) => set('id_number', t)} error={errors.id_number} autoCapitalize="characters" />
                        </Section>

                        <Section complete={done_.contact} title="Contact details">
                            <TextField label="Email address" value={a.email} onChangeText={(t) => set('email', t)} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
                            <TextField label="Phone number" value={a.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} keyboardType="phone-pad" placeholder="+260 97…" />
                            <TextField label="Physical address" value={a.physical_address} onChangeText={(t) => set('physical_address', t)} error={errors.physical_address} multiline numberOfLines={3} />
                        </Section>

                        <Section complete={done_.work} title="Occupation & income">
                            <SelectField label="Occupation" value={a.occupation} options={opt(OCCUPATIONS)} onChange={(v) => set('occupation', v)} error={errors.occupation} searchable />
                            <SelectField label="Source of income" value={a.source_of_income} options={opt(INCOME_SOURCES)} onChange={(v) => set('source_of_income', v)} error={errors.source_of_income} />
                        </Section>

                        <Section complete={done_.bank} title="Bank account" hint="Where your returns are paid.">
                            <BankAccountFields bankName={a.bank_name} accountNumber={a.bank_account_number} accountName={a.bank_account_name} onChange={patch} bankError={errors.bank_name} numberError={errors.bank_account_number} />
                        </Section>

                        <Section complete={done_.kin} title="Next of kin">
                            <TextField label="Full name" value={a.nok_full_name} onChangeText={(t) => set('nok_full_name', t)} error={errors.nok_full_name} autoCapitalize="words" />
                            <TextField label="ID / NRC / passport number" value={a.nok_id_number} onChangeText={(t) => set('nok_id_number', t)} error={errors.nok_id_number} autoCapitalize="characters" />
                            <DateField key={`nokdob-${a.nok_date_of_birth}`} label="Date of birth" value={a.nok_date_of_birth} onChange={(v) => set('nok_date_of_birth', v)} error={errors.nok_date_of_birth} />
                            <TextField label="Contact number" value={a.nok_phone} onChangeText={(t) => set('nok_phone', t)} error={errors.nok_phone} keyboardType="phone-pad" placeholder="+260 97…" />
                            <SelectField label="Relationship" value={a.nok_relationship} options={opt(RELATIONSHIPS)} onChange={(v) => set('nok_relationship', v)} error={errors.nok_relationship} />
                        </Section>

                        <Section complete={done_.photo} title="Passport-size photo" hint="Face the camera in good light, with a plain background.">
                            <DocUploadCard
                                label="Photo" kind="photo" illustration={<DocIllustration kind="photo" width={220} />}
                                userId={uid} folder="kyc-profile" slot="photo" value={docs.photo} onChange={(d) => setDoc('photo', d)} error={errors.photo}
                            />
                        </Section>

                        <Section complete={done_.residence} title="Proof of residence" hint="A recent utility bill, bank statement or tenancy agreement with your name and address.">
                            <DocUploadCard
                                label="Proof of residence" illustration={<DocIllustration kind="residence" width={220} />}
                                userId={uid} folder="kyc-profile" slot="proof_of_residence" value={docs.proof_of_residence} onChange={(d) => setDoc('proof_of_residence', d)} error={errors.proof_of_residence}
                            />
                        </Section>
                    </ScrollView>
                </>
            )}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 20, paddingBottom: 48 },
    saveText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    completion: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 16 },
    completionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    completionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    completionPct: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    completeBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.positiveInk },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.chipActiveBg, marginTop: 12, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
    completionSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
    section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 16 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
    badgeDone: { backgroundColor: '#ECFDF5' }, badgeTodo: { backgroundColor: colors.canvasAlt },
    badgeText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
    sectionTitle: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.navy },
    sectionHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 18 },
    note: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, marginBottom: 16 },
    noteBlue: { backgroundColor: colors.tabActiveBg }, noteOk: { backgroundColor: '#ECFDF5' }, noteWarn: { backgroundColor: '#FFFBEB' },
    noteText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.navy, lineHeight: 18 },
    segment: { flexDirection: 'row', backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, padding: 4, marginBottom: 20 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.pill },
    segItemActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    segTextActive: { color: colors.text, fontFamily: fonts.bodyBold },
});
