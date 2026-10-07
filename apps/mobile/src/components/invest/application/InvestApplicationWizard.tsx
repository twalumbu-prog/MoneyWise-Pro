import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Linking, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check, ExternalLink, Pencil, Sparkles, AlertCircle } from 'lucide-react-native';
import {
    investmentService, userService, onboardingService, APPLICATION_STEPS, GENDERS, ID_TYPES, OCCUPATIONS, INCOME_SOURCES,
    RELATIONSHIPS, NATIONALITIES, EMPTY_APPLICANT, idNeedsBack, nationalityFlag, flagFromIso2,
    validateApplicantStep, validateDocumentStep,
} from 'core';
import type { InvestorApplicant, IdType, FieldErrors, ApplicationStepId, MyInvestorAccount, IdExtraction } from 'core';
import { useAuth } from '../../../context/AuthContext';
import type { InvestProvider } from '../../../data/investCatalog';
import { ErrorBanner, StepFooter, TextField } from '../../onboarding/ui';
import { SelectField, DateField, DocUploadCard, SectionIntro, type UploadedDoc, type SelectOption } from './formFields';
import { BankAccountFields } from './BankAccountFields';
import { DocIllustration, type DocIllustrationKind } from './DocIllustrations';
import { SpringProgress } from './SpringProgress';
import { colors, fonts, radius } from '../../../theme/tokens';

const opt = (list: string[]): SelectOption[] => list.map((v) => ({ value: v, label: v }));

type DocSlots = Partial<Record<'id_front' | 'id_back' | 'photo' | 'proof_of_residence', UploadedDoc>>;
type ReadState = 'idle' | 'reading' | 'done' | 'failed' | 'not_id';

const FlagBadge: React.FC<{ iso2: string }> = ({ iso2 }) => (
    <Text style={{ fontSize: 22 }}>{iso2 ? flagFromIso2(iso2) : '🌍'}</Text>
);

const SUMMARY: { step: ApplicationStepId; title: string; rows: [string, keyof InvestorApplicant][] }[] = [
    { step: 'personal', title: 'Personal details', rows: [['First name', 'first_name'], ['Middle name', 'middle_name'], ['Last name', 'last_name'], ['Date of birth', 'date_of_birth'], ['Gender', 'gender'], ['Nationality', 'nationality'], ['ID type', 'id_type'], ['ID number', 'id_number']] },
    { step: 'contact', title: 'Contact details', rows: [['Email', 'email'], ['Phone', 'phone'], ['Address', 'physical_address']] },
    { step: 'work', title: 'Occupation & income', rows: [['Occupation', 'occupation'], ['Source of income', 'source_of_income']] },
    { step: 'banking', title: 'Bank account', rows: [['Bank', 'bank_name'], ['Account number', 'bank_account_number'], ['Account holder', 'bank_account_name']] },
    { step: 'kin', title: 'Sales & next of kin', rows: [['Sales person', 'sales_person'], ['Full name', 'nok_full_name'], ['ID / NRC / passport', 'nok_id_number'], ['Date of birth', 'nok_date_of_birth'], ['Contact number', 'nok_phone'], ['Relationship', 'nok_relationship']] },
];

const fmtValue = (key: keyof InvestorApplicant, v: string) => {
    if (!v) return '—';
    if (key === 'gender') return GENDERS.find((g) => g.value === v)?.label ?? v;
    if (key === 'nationality') return `${nationalityFlag(v) ? nationalityFlag(v) + ' ' : ''}${v}`;
    if (key === 'date_of_birth' || key === 'nok_date_of_birth') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
    }
    return v;
};

const illustrationFor = (type: IdType, side: 'front' | 'back'): DocIllustrationKind =>
    type === 'Passport' ? 'passport' : type === 'NRC' ? (side === 'front' ? 'nrc-front' : 'nrc-back') : (side === 'front' ? 'licence-front' : 'licence-back');

const normalizePhone = (p?: string | null): string => {
    const t = (p || '').trim();
    if (!t) return '';
    return t.startsWith('+') ? t : /^\d{9,15}$/.test(t) ? `+${t}` : t;
};

/**
 * The investor account application: nine short pages. The ID goes first so the AI can read it
 * and pre-fill the personal details; the photo and proof of residence each have a page of their
 * own. Submitting hands everything to the API, which builds the PDF and emails the company.
 */
export const InvestApplicationWizard: React.FC<{
    provider: InvestProvider;
    onClose: () => void;
    onSubmitted: (account: MyInvestorAccount) => void;
}> = ({ provider, onClose, onSubmitted }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { user } = useAuth();
    const scrollRef = useRef<ScrollView>(null);
    const targetId = provider.investmentTargetId!;
    const uid = user?.id ?? '';

    const [stepIdx, setStepIdx] = useState(0);
    const [a, setA] = useState<InvestorApplicant>({ ...EMPTY_APPLICANT });
    const [idType, setIdType] = useState<IdType>('NRC');
    const [docs, setDocs] = useState<DocSlots>({});
    const [read, setRead] = useState<ReadState>('idle');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [declared, setDeclared] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [banner, setBanner] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    const step = APPLICATION_STEPS[stepIdx];
    const isLast = stepIdx === APPLICATION_STEPS.length - 1;

    // ── Prefill from what we already know about this person ──
    const { data: profile } = useQuery({ queryKey: ['users', 'me'], queryFn: () => userService.getMyProfile(), staleTime: 60_000 });
    const { data: onboarding } = useQuery({
        queryKey: ['onboarding-state'],
        queryFn: () => onboardingService.getState().catch(() => null),
        staleTime: 5 * 60_000,
    });
    const prefilled = useRef(false);
    useEffect(() => {
        if (prefilled.current || !profile) return;
        prefilled.current = true;
        const parts = (profile.name || '').trim().split(/\s+/).filter(Boolean);
        const ob: any = onboarding?.profile ?? {};
        const address = [ob.plot_number, ob.street, ob.city, ob.province, ob.country].filter(Boolean).join(', ');
        setA((prev) => ({
            ...prev,
            first_name: prev.first_name || parts[0] || '',
            last_name: prev.last_name || (parts.length > 1 ? parts[parts.length - 1] : ''),
            middle_name: prev.middle_name || (parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
            email: prev.email || user?.email || ob.business_email || '',
            phone: prev.phone || normalizePhone(user?.phone) || normalizePhone(ob.phone),
            physical_address: prev.physical_address || address,
        }));
    }, [profile, onboarding, user?.email, user?.phone]);

    const set = <K extends keyof InvestorApplicant>(key: K, value: InvestorApplicant[K]) => {
        setA((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
        if (errors[key as string]) setErrors((e) => { const { [key as string]: _drop, ...rest } = e; return rest; });
    };
    const patch = (p: Partial<InvestorApplicant>) => {
        setA((prev) => ({ ...prev, ...p }));
        setDirty(true);
        setErrors((e) => { const next = { ...e }; Object.keys(p).forEach((k) => { delete next[k]; }); delete next.bank_account_number; return next; });
    };
    const setDoc = (key: keyof DocSlots, doc: UploadedDoc | undefined) => {
        setDocs((d) => ({ ...d, [key]: doc }));
        setDirty(true);
        setErrors((e) => { const { [key as string]: _a, ...rest } = e; return rest; });
    };

    // ── AI reads the ID the moment its front/data page is uploaded ──
    const readRun = useRef(0);
    const runRead = async (doc: UploadedDoc) => {
        const run = ++readRun.current;
        setRead('reading');
        try {
            const x: IdExtraction = await investmentService.extractIdDetails(doc.path, idType);
            if (run !== readRun.current) return;
            if (x.looks_like_id === false) { setRead('not_id'); return; }
            const got = !!(x.first_name || x.last_name || x.date_of_birth || x.id_number);
            if (!got) { setRead('failed'); return; }
            setA((prev) => ({
                ...prev,
                first_name: x.first_name || prev.first_name,
                middle_name: x.middle_name ?? prev.middle_name,
                last_name: x.last_name || prev.last_name,
                date_of_birth: x.date_of_birth || prev.date_of_birth,
                gender: (x.gender as any) || prev.gender,
                nationality: x.nationality && NATIONALITIES.some((n) => n.value.toLowerCase() === x.nationality!.toLowerCase())
                    ? NATIONALITIES.find((n) => n.value.toLowerCase() === x.nationality!.toLowerCase())!.value
                    : prev.nationality,
                id_number: x.id_number || prev.id_number,
            }));
            setRead('done');
        } catch {
            if (run === readRun.current) setRead('failed');
        }
    };

    const onIdFront = (doc: UploadedDoc | undefined) => {
        setDoc('id_front', doc);
        if (doc) runRead(doc); else { readRun.current++; setRead('idle'); }
    };

    const changeIdType = (t: IdType) => {
        if (t === idType) return;
        readRun.current++;
        setIdType(t);
        setDocs((d) => ({ ...d, id_front: undefined, id_back: undefined }));
        setRead('idle');
        setErrors({});
        setBanner(null);
        setDirty(true);
    };

    const docPaths = useMemo(() => ({
        id_front: docs.id_front?.path, id_back: idNeedsBack(idType) ? docs.id_back?.path : undefined,
        photo: docs.photo?.path, proof_of_residence: docs.proof_of_residence?.path,
    }), [docs, idType]);

    const validateCurrent = (): FieldErrors => {
        if (step.id === 'id' || step.id === 'photo' || step.id === 'residence') return validateDocumentStep(step.id, idType, docPaths);
        return validateApplicantStep(step.id, a);
    };

    const goTo = (idx: number) => {
        setStepIdx(idx);
        setBanner(null);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    const next = () => {
        const e = validateCurrent();
        setErrors(e);
        if (Object.keys(e).length) { setBanner('Please fix the highlighted fields to continue.'); return; }
        goTo(stepIdx + 1);
    };

    const back = () => { if (stepIdx === 0) confirmExit(); else goTo(stepIdx - 1); };

    const confirmExit = () => {
        if (!dirty) { onClose(); return; }
        Alert.alert('Leave this application?', 'What you entered will be lost.', [
            { text: 'Keep editing', style: 'cancel' },
            { text: 'Leave', style: 'destructive', onPress: onClose },
        ]);
    };

    const submit = async () => {
        // Re-run every page so a jump-back edit can't slip an invalid value through.
        for (let i = 0; i < APPLICATION_STEPS.length - 1; i++) {
            const id = APPLICATION_STEPS[i].id;
            const e = (id === 'id' || id === 'photo' || id === 'residence') ? validateDocumentStep(id, idType, docPaths) : validateApplicantStep(id, a);
            if (Object.keys(e).length) { setErrors(e); setBanner(`Please review "${APPLICATION_STEPS[i].title}".`); goTo(i); return; }
        }
        if (!declared) { setBanner('Please accept the declaration to submit.'); return; }

        setSubmitting(true);
        setBanner(null);
        try {
            const documents: Record<string, string> = { id_type: idType };
            (Object.entries(docPaths) as [string, string | undefined][]).forEach(([k, v]) => { if (v) documents[k] = v; });
            const account = await investmentService.applyForAccount({
                targetId,
                applicant: { ...a, id_type: idType } as any,
                documents,
                declaration: true,
            });
            qc.invalidateQueries({ queryKey: ['investor-accounts'] });
            onSubmitted(account);
        } catch (e: any) {
            setBanner(e?.message || 'We could not submit your application. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const pct = ((stepIdx + 1) / APPLICATION_STEPS.length) * 100;
    const nationalityOptions: SelectOption[] = NATIONALITIES.map((n) => ({ value: n.value, label: n.value, leading: <FlagBadge iso2={n.iso2} /> }));
    const idNumberLabel = idType === 'Passport' ? 'Passport number' : idType === "Driver's Licence" ? 'Licence number' : 'NRC number';
    const reading = step.id === 'id' && read === 'reading';

    return (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <Pressable onPress={confirmExit} hitSlop={12} accessibilityLabel="Close application">
                    <X size={22} color={colors.textMuted} />
                </Pressable>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>Open an account · {provider.name}</Text>
                    <Text style={styles.headerSub}>Step {stepIdx + 1} of {APPLICATION_STEPS.length}</Text>
                </View>
            </View>
            <SpringProgress value={pct} height={4} />

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <SectionIntro title={step.title} subtitle={step.subtitle} />
                <ErrorBanner message={banner} />

                {step.id === 'id' && (
                    <>
                        <Text style={styles.groupLabel}>Type of ID</Text>
                        <View style={styles.segment}>
                            {ID_TYPES.map((t) => (
                                <Pressable key={t} onPress={() => changeIdType(t)} style={[styles.segItem, idType === t && styles.segItemActive]}>
                                    <Text style={[styles.segText, idType === t && styles.segTextActive]} numberOfLines={1}>{t}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <DocUploadCard
                            label={idType === 'Passport' ? 'Passport photo page' : `${idType} · front`}
                            hint={idType === 'Passport' ? 'The page with your photo and details.' : 'The side with your photo and details.'}
                            illustration={<DocIllustration kind={illustrationFor(idType, 'front')} width={240} />}
                            userId={uid} folder={targetId} slot="id_front"
                            value={docs.id_front} onChange={onIdFront} error={errors.id_front || errors.id_type}
                        />
                        {idNeedsBack(idType) && (
                            <DocUploadCard
                                label={`${idType} · back`}
                                hint="The reverse side."
                                illustration={<DocIllustration kind={illustrationFor(idType, 'back')} width={240} />}
                                userId={uid} folder={targetId} slot="id_back"
                                value={docs.id_back} onChange={(d) => setDoc('id_back', d)} error={errors.id_back}
                            />
                        )}

                        {read !== 'idle' && (
                            <View style={[styles.readCard, read === 'failed' || read === 'not_id' ? styles.readWarn : read === 'done' ? styles.readOk : null]}>
                                {read === 'reading' ? <ActivityIndicator size="small" color={colors.blue} />
                                    : read === 'done' ? <Sparkles size={18} color={colors.positiveInk} />
                                    : <AlertCircle size={18} color={colors.warn} />}
                                <Text style={styles.readText}>
                                    {read === 'reading' ? 'Reading your ID…'
                                        : read === 'done' ? 'We filled in your details from your ID. You can check and correct them on the next page.'
                                        : read === 'not_id' ? `That doesn’t look like a ${idType}. Try a clearer photo of the right document.`
                                        : 'We couldn’t read it clearly. You can type your details on the next page, or upload a sharper photo.'}
                                </Text>
                            </View>
                        )}
                    </>
                )}

                {step.id === 'personal' && (
                    <>
                        {read === 'done' && (
                            <View style={[styles.readCard, styles.readOk, { marginBottom: 16 }]}>
                                <Sparkles size={18} color={colors.positiveInk} />
                                <Text style={styles.readText}>Filled in from your ID. Please check each field.</Text>
                            </View>
                        )}
                        <TextField label="First name" value={a.first_name} onChangeText={(t) => set('first_name', t)} error={errors.first_name} autoCapitalize="words" />
                        <TextField label="Middle name" value={a.middle_name} onChangeText={(t) => set('middle_name', t)} optional autoCapitalize="words" />
                        <TextField label="Last name" value={a.last_name} onChangeText={(t) => set('last_name', t)} error={errors.last_name} autoCapitalize="words" />
                        <DateField label="Date of birth" value={a.date_of_birth} onChange={(v) => set('date_of_birth', v)} error={errors.date_of_birth} />
                        <SelectField label="Gender" value={a.gender} options={GENDERS} onChange={(v) => set('gender', v as any)} error={errors.gender} />
                        <SelectField label="Nationality" value={a.nationality} options={nationalityOptions} onChange={(v) => set('nationality', v)} error={errors.nationality} searchable />
                        <TextField
                            label={idNumberLabel} value={a.id_number} onChangeText={(t) => set('id_number', t)} error={errors.id_number}
                            autoCapitalize="characters" placeholder={idType === 'NRC' ? 'e.g. 123456/10/1' : 'Enter the number on your ID'}
                        />
                    </>
                )}

                {step.id === 'contact' && (
                    <>
                        <TextField label="Email address" value={a.email} onChangeText={(t) => set('email', t)} error={errors.email} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
                        <TextField label="Phone number" value={a.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} keyboardType="phone-pad" placeholder="+260 97…" />
                        <TextField label="Physical address" value={a.physical_address} onChangeText={(t) => set('physical_address', t)} error={errors.physical_address} multiline numberOfLines={3} placeholder="House number, street, area, town" />
                    </>
                )}

                {step.id === 'work' && (
                    <>
                        <SelectField label="Occupation" value={a.occupation} options={opt(OCCUPATIONS)} onChange={(v) => set('occupation', v)} error={errors.occupation} searchable />
                        <SelectField label="Source of income" value={a.source_of_income} options={opt(INCOME_SOURCES)} onChange={(v) => set('source_of_income', v)} error={errors.source_of_income} />
                    </>
                )}

                {step.id === 'banking' && (
                    <BankAccountFields
                        bankName={a.bank_name}
                        accountNumber={a.bank_account_number}
                        accountName={a.bank_account_name}
                        onChange={patch}
                        bankError={errors.bank_name}
                        numberError={errors.bank_account_number}
                    />
                )}

                {step.id === 'kin' && (
                    <>
                        {(provider.salesPeople?.length ?? 0) > 0 ? (
                            <SelectField label="Sales person" value={a.sales_person} options={opt(provider.salesPeople!)} onChange={(v) => set('sales_person', v)} optional placeholder="Who referred you?" />
                        ) : (
                            <TextField label="Sales person" value={a.sales_person} onChangeText={(t) => set('sales_person', t)} optional autoCapitalize="words" placeholder="Who referred you?" />
                        )}
                        <View style={styles.divider} />
                        <TextField label="Next of kin full name" value={a.nok_full_name} onChangeText={(t) => set('nok_full_name', t)} error={errors.nok_full_name} autoCapitalize="words" />
                        <TextField label="Next of kin ID / NRC / passport number" value={a.nok_id_number} onChangeText={(t) => set('nok_id_number', t)} error={errors.nok_id_number} autoCapitalize="characters" />
                        <DateField label="Next of kin date of birth" value={a.nok_date_of_birth} onChange={(v) => set('nok_date_of_birth', v)} error={errors.nok_date_of_birth} />
                        <TextField label="Next of kin contact number" value={a.nok_phone} onChangeText={(t) => set('nok_phone', t)} error={errors.nok_phone} keyboardType="phone-pad" placeholder="+260 97…" />
                        <SelectField label="Relationship" value={a.nok_relationship} options={opt(RELATIONSHIPS)} onChange={(v) => set('nok_relationship', v)} error={errors.nok_relationship} />
                    </>
                )}

                {step.id === 'photo' && (
                    <DocUploadCard
                        label="Passport-size photo"
                        hint="Face the camera in good light, with a plain background."
                        kind="photo"
                        illustration={<DocIllustration kind="photo" width={220} />}
                        userId={uid} folder={targetId} slot="photo"
                        value={docs.photo} onChange={(d) => setDoc('photo', d)} error={errors.photo}
                    />
                )}

                {step.id === 'residence' && (
                    <DocUploadCard
                        label="Proof of residence"
                        hint="A recent utility bill, bank statement or tenancy agreement with your name and address."
                        illustration={<DocIllustration kind="residence" width={220} />}
                        userId={uid} folder={targetId} slot="proof_of_residence"
                        value={docs.proof_of_residence} onChange={(d) => setDoc('proof_of_residence', d)} error={errors.proof_of_residence}
                    />
                )}

                {step.id === 'review' && (
                    <>
                        {SUMMARY.map((s) => (
                            <View key={s.step} style={styles.summaryCard}>
                                <View style={styles.summaryHead}>
                                    <Text style={styles.summaryTitle}>{s.title}</Text>
                                    <Pressable onPress={() => goTo(APPLICATION_STEPS.findIndex((x) => x.id === s.step))} hitSlop={8} style={styles.editBtn}>
                                        <Pencil size={13} color={colors.blue} /><Text style={styles.editText}>Edit</Text>
                                    </Pressable>
                                </View>
                                {s.rows.map(([label, key]) => (
                                    <View key={key} style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>{label}</Text>
                                        <Text style={styles.summaryValue} numberOfLines={2}>{key === 'id_type' ? idType : fmtValue(key, a[key] as string)}</Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                        <View style={styles.summaryCard}>
                            <Text style={[styles.summaryTitle, { marginBottom: 8 }]}>Documents</Text>
                            {([
                                [idType === 'Passport' ? 'Passport photo page' : `${idType} · front`, docs.id_front, 'id'],
                                ...(idNeedsBack(idType) ? [[`${idType} · back`, docs.id_back, 'id']] : []),
                                ['Passport-size photo', docs.photo, 'photo'],
                                ['Proof of residence', docs.proof_of_residence, 'residence'],
                            ] as [string, UploadedDoc | undefined, ApplicationStepId][]).map(([label, doc, stepId]) => (
                                <View key={label} style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>{label}</Text>
                                    <Pressable onPress={() => goTo(APPLICATION_STEPS.findIndex((x) => x.id === stepId))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        {doc ? <Check size={14} color={colors.positiveInk} /> : null}
                                        <Text style={styles.summaryValue}>{doc ? 'Uploaded' : 'Missing'}</Text>
                                    </Pressable>
                                </View>
                            ))}
                        </View>

                        <Pressable onPress={() => { setDeclared((d) => !d); setBanner(null); }} style={styles.declare} accessibilityRole="checkbox" accessibilityState={{ checked: declared }}>
                            <View style={[styles.checkbox, declared && styles.checkboxOn]}>{declared && <Check size={14} color="#FFFFFF" strokeWidth={3} />}</View>
                            <Text style={styles.declareText}>
                                I declare that all information provided is true and accurate to the best of my knowledge. I understand that providing false information may result in my application being rejected.
                            </Text>
                        </Pressable>
                        {!!provider.factSheetUrl && (
                            <Pressable onPress={() => Linking.openURL(provider.factSheetUrl!)} style={styles.factSheet}>
                                <ExternalLink size={14} color={colors.blue} />
                                <Text style={styles.factSheetText}>Review the fund fact sheet</Text>
                            </Pressable>
                        )}
                        <Text style={styles.sendNote}>Your application goes straight to {provider.name} for review. You'll get an email when it's decided.</Text>
                    </>
                )}
            </ScrollView>

            <StepFooter
                onBack={back}
                onContinue={isLast ? submit : next}
                continueLabel={reading ? 'Reading your ID…' : isLast ? 'Submit application' : 'Continue'}
                loading={submitting}
                disabled={reading || (isLast && !declared)}
            />
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.canvas },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    headerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    scroll: { padding: 20, paddingBottom: 36 },
    divider: { height: 1, backgroundColor: colors.borderStrong, marginVertical: 8, marginBottom: 20 },
    groupLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 8 },
    segment: { flexDirection: 'row', backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, padding: 4, marginBottom: 20 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.pill },
    segItemActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    segTextActive: { color: colors.text, fontFamily: fonts.bodyBold },
    readCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.tabActiveBg },
    readOk: { backgroundColor: '#ECFDF5' },
    readWarn: { backgroundColor: '#FFFBEB' },
    readText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.navy, lineHeight: 18 },

    summaryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
    summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    summaryTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    editText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    summaryLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, flexShrink: 0 },
    summaryValue: { flex: 1, textAlign: 'right', fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },

    declare: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, marginTop: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkboxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    declareText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },
    factSheet: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
    factSheetText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    sendNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
});
