import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform, Linking, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check, ExternalLink, Pencil, Info } from 'lucide-react-native';
import {
    investmentService, userService, APPLICATION_STEPS, GENDERS, ID_TYPES, OCCUPATIONS, RELATIONSHIPS, NATIONALITIES,
    ZAMBIA_BANK_NAMES, EMPTY_APPLICANT, validateApplicantStep, validateDocumentsStep,
} from 'core';
import type { InvestorApplicant, NrcMethod, FieldErrors, ApplicationStepId, MyInvestorAccount } from 'core';
import { useAuth } from '../../../context/AuthContext';
import type { InvestProvider } from '../../../data/investCatalog';
import { ErrorBanner, StepFooter, TextField } from '../../onboarding/ui';
import { SelectField, DateField, DocumentField, SectionIntro, type UploadedDoc, type SelectOption } from './formFields';
import { colors, fonts, radius } from '../../../theme/tokens';

const opt = (list: string[]): SelectOption[] => list.map((v) => ({ value: v, label: v }));

type DocSlots = Partial<Record<'nrc_front' | 'nrc_back' | 'nrc_combined' | 'photo' | 'proof_of_residence' | 'reference_letter' | 'proof_of_income', UploadedDoc>>;

const SUMMARY: { step: ApplicationStepId; title: string; rows: [string, keyof InvestorApplicant][] }[] = [
    { step: 'personal', title: 'Personal details', rows: [['First name', 'first_name'], ['Middle name', 'middle_name'], ['Last name', 'last_name'], ['Date of birth', 'date_of_birth'], ['Gender', 'gender'], ['Nationality', 'nationality']] },
    { step: 'contact', title: 'Contact details', rows: [['Email', 'email'], ['Phone', 'phone'], ['Address', 'physical_address']] },
    { step: 'identity', title: 'Identification', rows: [['ID type', 'id_type'], ['ID number', 'id_number']] },
    { step: 'employment', title: 'Employment & funds', rows: [['Employer', 'employer'], ['Employee no.', 'employee_number'], ['Source of income', 'source_of_income'], ['Occupation', 'occupation']] },
    { step: 'banking', title: 'Banking details', rows: [['Bank', 'bank_name'], ['Branch', 'branch_name'], ['Account number', 'bank_account_number'], ['Account name', 'bank_account_name']] },
    { step: 'kin', title: 'Sales & next of kin', rows: [['Sales person', 'sales_person'], ['Full name', 'nok_full_name'], ['ID / NRC / passport', 'nok_id_number'], ['Date of birth', 'nok_date_of_birth'], ['Contact number', 'nok_phone'], ['Relationship', 'nok_relationship']] },
];

const fmtValue = (key: keyof InvestorApplicant, v: string) => {
    if (!v) return '—';
    if (key === 'gender') return GENDERS.find((g) => g.value === v)?.label ?? v;
    if (key === 'date_of_birth' || key === 'nok_date_of_birth') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
    }
    return v;
};

/**
 * The investor account application: eight short steps (the long web form, split so each
 * screen fits a phone), a review screen, and an electronic declaration. Submitting hands
 * everything to the API, which builds the PDF and emails the company.
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

    const [stepIdx, setStepIdx] = useState(0);
    const [a, setA] = useState<InvestorApplicant>({ ...EMPTY_APPLICANT });
    const [nrcMethod, setNrcMethod] = useState<NrcMethod>('SEPARATE');
    const [docs, setDocs] = useState<DocSlots>({});
    const [errors, setErrors] = useState<FieldErrors>({});
    const [declared, setDeclared] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [banner, setBanner] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    const step = APPLICATION_STEPS[stepIdx];
    const isLast = stepIdx === APPLICATION_STEPS.length - 1;

    // Prefill what we already know so the investor isn't retyping their own name and bank.
    const { data: profile } = useQuery({ queryKey: ['users', 'me'], queryFn: () => userService.getMyProfile(), staleTime: 60_000 });
    const prefilled = useRef(false);
    useEffect(() => {
        if (prefilled.current || !profile) return;
        prefilled.current = true;
        const parts = (profile.name || '').trim().split(/\s+/).filter(Boolean);
        const pay = profile.payment_info;
        setA((prev) => ({
            ...prev,
            first_name: prev.first_name || parts[0] || '',
            last_name: prev.last_name || (parts.length > 1 ? parts[parts.length - 1] : ''),
            middle_name: prev.middle_name || (parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
            email: prev.email || user?.email || '',
            bank_name: prev.bank_name || (pay?.bank_name && ZAMBIA_BANK_NAMES.includes(pay.bank_name) ? pay.bank_name : ''),
            bank_account_number: prev.bank_account_number || pay?.bank_account_number || '',
            bank_account_name: prev.bank_account_name || pay?.bank_account_name || '',
        }));
    }, [profile, user?.email]);

    const set = <K extends keyof InvestorApplicant>(key: K, value: InvestorApplicant[K]) => {
        setA((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
        if (errors[key as string]) setErrors((e) => { const { [key as string]: _drop, ...rest } = e; return rest; });
    };
    const setDoc = (key: keyof DocSlots, doc: UploadedDoc | undefined) => {
        setDocs((d) => ({ ...d, [key]: doc }));
        setDirty(true);
        setErrors((e) => { const { [key as string]: _a, residence: _b, ...rest } = e; return rest; });
    };

    const documentsPayload = useMemo(() => {
        const out: Record<string, string> = { nrc_method: nrcMethod };
        (Object.keys(docs) as (keyof DocSlots)[]).forEach((k) => {
            if (!docs[k]) return;
            if (nrcMethod === 'COMBINED' && (k === 'nrc_front' || k === 'nrc_back')) return;
            if (nrcMethod === 'SEPARATE' && k === 'nrc_combined') return;
            out[k] = docs[k]!.path;
        });
        return out;
    }, [docs, nrcMethod]);

    const validateCurrent = (): FieldErrors => {
        if (step.id === 'documents') {
            return validateDocumentsStep({ nrc_method: nrcMethod, ...Object.fromEntries(Object.entries(documentsPayload).filter(([k]) => k !== 'nrc_method')) } as any);
        }
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
        // Re-run every step so a jump-back edit can't slip an invalid value through.
        for (let i = 0; i < APPLICATION_STEPS.length - 2; i++) {
            const id = APPLICATION_STEPS[i].id;
            const e = validateApplicantStep(id, a);
            if (Object.keys(e).length) { setErrors(e); setBanner(`Please review "${APPLICATION_STEPS[i].title}".`); goTo(i); return; }
        }
        const docErr = validateDocumentsStep({ nrc_method: nrcMethod, ...Object.fromEntries(Object.entries(documentsPayload).filter(([k]) => k !== 'nrc_method')) } as any);
        if (Object.keys(docErr).length) { setErrors(docErr); setBanner('Please review your documents.'); goTo(APPLICATION_STEPS.findIndex((s) => s.id === 'documents')); return; }
        if (!declared) { setBanner('Please accept the declaration to submit.'); return; }

        setSubmitting(true);
        setBanner(null);
        try {
            const account = await investmentService.applyForAccount({
                targetId,
                applicant: { ...a } as any,
                documents: documentsPayload,
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
    const uid = user?.id ?? '';

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <Pressable onPress={confirmExit} hitSlop={12} accessibilityLabel="Close application">
                    <X size={22} color={colors.textMuted} />
                </Pressable>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>Open an account · {provider.name}</Text>
                    <Text style={styles.headerSub}>Step {stepIdx + 1} of {APPLICATION_STEPS.length}</Text>
                </View>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <SectionIntro title={step.title} subtitle={step.subtitle} />
                <ErrorBanner message={banner} />

                {step.id === 'personal' && (
                    <>
                        <TextField label="First name" value={a.first_name} onChangeText={(t) => set('first_name', t)} error={errors.first_name} autoCapitalize="words" />
                        <TextField label="Middle name" value={a.middle_name} onChangeText={(t) => set('middle_name', t)} optional autoCapitalize="words" />
                        <TextField label="Last name" value={a.last_name} onChangeText={(t) => set('last_name', t)} error={errors.last_name} autoCapitalize="words" />
                        <DateField label="Date of birth" value={a.date_of_birth} onChange={(v) => set('date_of_birth', v)} error={errors.date_of_birth} />
                        <SelectField label="Gender" value={a.gender} options={GENDERS} onChange={(v) => set('gender', v as any)} error={errors.gender} />
                        <SelectField label="Nationality" value={a.nationality} options={opt(NATIONALITIES)} onChange={(v) => set('nationality', v)} error={errors.nationality} searchable />
                    </>
                )}

                {step.id === 'contact' && (
                    <>
                        <TextField label="Email address" value={a.email} onChangeText={(t) => set('email', t)} error={errors.email} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
                        <TextField label="Phone number" value={a.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} keyboardType="phone-pad" placeholder="+260 97…" />
                        <TextField label="Physical address" value={a.physical_address} onChangeText={(t) => set('physical_address', t)} error={errors.physical_address} multiline numberOfLines={3} placeholder="House number, street, area, town" />
                    </>
                )}

                {step.id === 'identity' && (
                    <>
                        <SelectField label="ID type" value={a.id_type} options={opt(ID_TYPES)} onChange={(v) => set('id_type', v)} error={errors.id_type} />
                        <TextField
                            label="ID number" value={a.id_number} onChangeText={(t) => set('id_number', t)} error={errors.id_number}
                            autoCapitalize="characters" placeholder={a.id_type === 'NRC' || !a.id_type ? 'e.g. 123456/10/1' : 'Enter the number on your ID'}
                        />
                    </>
                )}

                {step.id === 'employment' && (
                    <>
                        <TextField label="Employer" value={a.employer} onChangeText={(t) => set('employer', t)} optional autoCapitalize="words" />
                        <TextField label="Employee number" value={a.employee_number} onChangeText={(t) => set('employee_number', t)} optional autoCapitalize="characters" />
                        <TextField label="Source of income" value={a.source_of_income} onChangeText={(t) => set('source_of_income', t)} error={errors.source_of_income} placeholder="e.g. Salary, Business" autoCapitalize="sentences" />
                        <SelectField label="Occupation" value={a.occupation} options={opt(OCCUPATIONS)} onChange={(v) => set('occupation', v)} error={errors.occupation} searchable />
                    </>
                )}

                {step.id === 'banking' && (
                    <>
                        <SelectField label="Bank name" value={a.bank_name} options={opt(ZAMBIA_BANK_NAMES)} onChange={(v) => set('bank_name', v)} error={errors.bank_name} searchable />
                        <TextField label="Branch name" value={a.branch_name} onChangeText={(t) => set('branch_name', t)} error={errors.branch_name} autoCapitalize="words" />
                        <TextField label="Account number" value={a.bank_account_number} onChangeText={(t) => set('bank_account_number', t)} error={errors.bank_account_number} keyboardType="number-pad" />
                        <TextField label="Account name" value={a.bank_account_name} onChangeText={(t) => set('bank_account_name', t)} error={errors.bank_account_name} autoCapitalize="words" />
                    </>
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

                {step.id === 'documents' && (
                    <>
                        <Text style={styles.groupLabel}>NRC submission method</Text>
                        <View style={styles.segment}>
                            {([['SEPARATE', 'Front and back'], ['COMBINED', 'One file']] as [NrcMethod, string][]).map(([m, label]) => (
                                <Pressable key={m} onPress={() => { setNrcMethod(m); setErrors({}); }} style={[styles.segItem, nrcMethod === m && styles.segItemActive]}>
                                    <Text style={[styles.segText, nrcMethod === m && styles.segTextActive]}>{label}</Text>
                                </Pressable>
                            ))}
                        </View>
                        {nrcMethod === 'SEPARATE' ? (
                            <>
                                <DocumentField label="NRC front" hint="The side with the holder's photograph and identity details." userId={uid} folder={targetId} slot="nrc_front" value={docs.nrc_front} onChange={(d) => setDoc('nrc_front', d)} error={errors.nrc_front} />
                                <DocumentField label="NRC back" hint="The reverse side with the remaining details." userId={uid} folder={targetId} slot="nrc_back" value={docs.nrc_back} onChange={(d) => setDoc('nrc_back', d)} error={errors.nrc_back} />
                            </>
                        ) : (
                            <DocumentField label="NRC (front and back)" hint="One image or PDF showing both sides." userId={uid} folder={targetId} slot="nrc_combined" value={docs.nrc_combined} onChange={(d) => setDoc('nrc_combined', d)} error={errors.nrc_combined} />
                        )}
                        <DocumentField label="Passport-size photo" hint="A clear, recent photo of your face." kind="photo" userId={uid} folder={targetId} slot="photo" value={docs.photo} onChange={(d) => setDoc('photo', d)} error={errors.photo} />

                        <View style={styles.note}>
                            <Info size={16} color={colors.blue} />
                            <Text style={styles.noteText}>Upload at least one of a proof of residence (e.g. a utility bill) or a reference letter. You don't need both.</Text>
                        </View>
                        <DocumentField label="Proof of residence" optional userId={uid} folder={targetId} slot="proof_of_residence" value={docs.proof_of_residence} onChange={(d) => setDoc('proof_of_residence', d)} error={errors.residence} />
                        <DocumentField label="Reference letter" optional userId={uid} folder={targetId} slot="reference_letter" value={docs.reference_letter} onChange={(d) => setDoc('reference_letter', d)} />

                        <DocumentField label="Proof of income" hint="Employment letter, payslip, business registration, TPIN document or other evidence of your income." userId={uid} folder={targetId} slot="proof_of_income" value={docs.proof_of_income} onChange={(d) => setDoc('proof_of_income', d)} error={errors.proof_of_income} />
                        <Text style={styles.limits}>PDF up to 10MB. Photos are compressed automatically.</Text>
                    </>
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
                                        <Text style={styles.summaryValue} numberOfLines={2}>{fmtValue(key, a[key] as string)}</Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                        <View style={styles.summaryCard}>
                            <View style={styles.summaryHead}>
                                <Text style={styles.summaryTitle}>Documents</Text>
                                <Pressable onPress={() => goTo(APPLICATION_STEPS.findIndex((x) => x.id === 'documents'))} hitSlop={8} style={styles.editBtn}>
                                    <Pencil size={13} color={colors.blue} /><Text style={styles.editText}>Edit</Text>
                                </Pressable>
                            </View>
                            {Object.entries({
                                'NRC': nrcMethod === 'COMBINED' ? docs.nrc_combined : (docs.nrc_front && docs.nrc_back ? docs.nrc_front : undefined),
                                'Passport photo': docs.photo,
                                'Proof of residence': docs.proof_of_residence,
                                'Reference letter': docs.reference_letter,
                                'Proof of income': docs.proof_of_income,
                            }).filter(([, v]) => !!v).map(([label]) => (
                                <View key={label} style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>{label}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Check size={14} color={colors.positiveInk} /><Text style={styles.summaryValue}>Uploaded</Text></View>
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
                continueLabel={isLast ? 'Submit application' : 'Continue'}
                loading={submitting}
                disabled={isLast && !declared}
            />
            {submitting && (
                <View style={styles.overlay}><ActivityIndicator color={colors.blue} /></View>
            )}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.canvas },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    headerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    track: { height: 4, backgroundColor: colors.borderStrong },
    fill: { height: 4, backgroundColor: colors.blue },
    scroll: { padding: 20, paddingBottom: 36 },
    divider: { height: 1, backgroundColor: colors.borderStrong, marginVertical: 8, marginBottom: 20 },
    groupLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy, marginBottom: 8 },
    segment: { flexDirection: 'row', backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, padding: 4, marginBottom: 16 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
    segItemActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    segTextActive: { color: colors.text },
    note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.md, backgroundColor: colors.tabActiveBg, marginBottom: 16 },
    noteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.navy, lineHeight: 18 },
    limits: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 4 },

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
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
});
