import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { CheckCircle2, Circle, FileText, ShieldCheck, IdCard, BookUser, CarFront, ChevronRight } from 'lucide-react-native';
import { PersonalStepError, ID_TYPES, idNeedsBack, type KycProfile, type IdType } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import type { StepContext } from './stepContext';
import { hapticTick, hapticImpact } from '../../../lib/haptics';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "kyc": the person's identity documents, kept in the same KYC profile investments and loans use (so nothing is
 * uploaded twice).
 *
 * First the ID itself, in two screens: here they tap which document they have (NRC, passport or driver's licence;
 * the Animate UI checkbox ticks in with a haptic), then Continue opens /kyc-capture to photograph or choose it, front
 * and back. Once the ID is in, the step shows what's done and what's left: the selfie and proof of residence are
 * still added on Settings → KYC profile (a bank statement found in Gmail can be used as proof in one tap). The ID is
 * what this step needs to continue. Re-read when the person comes back from either screen.
 */
const DOCS: { type: IdType; label: string; hint: string; Icon: typeof IdCard }[] = [
    { type: 'NRC', label: 'NRC', hint: 'National Registration Card', Icon: IdCard },
    { type: "Driver's Licence", label: 'Driver’s Licence', hint: 'Zambian driving licence', Icon: CarFront },
    { type: 'Passport', label: 'Passport', hint: 'The photo page', Icon: BookUser },
];

const OTHER_ROWS: { key: string; label: string; hint: string }[] = [
    { key: 'photo', label: 'Selfie', hint: 'A clear photo of your face' },
    { key: 'proof_of_residence', label: 'Proof of residence', hint: 'A recent bank statement, utility bill or lease' },
];

function DocOption({ doc, selected, index, onPress }: { doc: typeof DOCS[number]; selected: boolean; index: number; onPress: () => void }) {
    const scale = useSharedValue(1);
    const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <Animated.View entering={FadeInDown.delay(60 * index).springify().damping(16)} style={press}>
            <Pressable
                onPress={onPress}
                onPressIn={() => { scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }); }}
                onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 300 }); }}
                style={[styles.option, selected && styles.optionOn]}
                accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={doc.label}
            >
                <View style={[styles.optionIcon, selected && styles.optionIconOn]}>
                    <doc.Icon size={18} color={selected ? colors.blue : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{doc.label}</Text>
                    <Text style={styles.optionHint}>{doc.hint}</Text>
                </View>
                <AnimatedCheckbox checked={selected} />
            </Pressable>
        </Animated.View>
    );
}

export function StepKyc({ ctx }: { ctx: StepContext }) {
    const router = useRouter();
    const [kyc, setKyc] = useState<KycProfile | null>(null);
    const [choice, setChoice] = useState<IdType | null>(null);
    const [changing, setChanging] = useState(false);
    const [attaching, setAttaching] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [previewId, setPreviewId] = useState(false);

    const load = useCallback(async () => {
        try { setKyc(await ctx.service.getKyc()); setChanging(false); }
        catch { setKyc({ exists: false, complete: false, missing: [], applicant: null, idType: null, documents: {}, documentUrls: {}, updatedAt: null }); }
    }, [ctx.service]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const docs = kyc?.documents ?? {};
    const savedType = (ID_TYPES as string[]).includes(String(kyc?.idType)) ? (kyc!.idType as IdType) : null;
    const idDone = (ctx.preview && previewId) || (!!docs.id_front && (!savedType || !idNeedsBack(savedType) || !!docs.id_back));
    const choosing = !idDone || changing;
    const statement = ctx.drafts.gmail?.statement;
    const statementBank = statement?.provider ? ctx.money?.providers.find((p) => p.code === statement.provider)?.name ?? statement.provider : null;

    const select = (t: IdType) => { hapticTick(); setChoice(t); };
    const openCapture = () => {
        if (!choice) return;
        hapticImpact('Light');
        if (ctx.preview) setPreviewId(true);
        router.push({ pathname: '/kyc-capture', params: { idType: choice, ...(ctx.preview ? { preview: '1' } : {}) } });
    };
    const attachStatement = async () => {
        if (!statement?.emailId) return;
        setAttaching(true); setErr(null);
        try { await ctx.service.attachGmailStatement(statement.emailId); await load(); }
        catch (e: any) { setErr(e instanceof PersonalStepError ? e.message : 'Couldn’t use that statement. Upload it instead.'); }
        finally { setAttaching(false); }
    };

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={changing ? () => setChanging(false) : ctx.onBack} onSkip={ctx.skip}
            onContinue={choosing ? openCapture : () => ctx.done({ complete: !!kyc?.complete })}
            continueDisabled={choosing ? !choice : !idDone}
            saving={ctx.saving} error={ctx.error ?? err}
            continueLabel={choosing ? 'Continue' : ctx.single ? 'Done' : 'Continue'}
        >
            {!kyc ? <ActivityIndicator color={colors.blue} /> : choosing ? (
                <Animated.View key="choose" entering={FadeIn.duration(200)}>
                    <Text style={styles.lead}>Which document will you use?</Text>
                    <View style={styles.options} accessibilityRole="radiogroup">
                        {DOCS.map((d, i) => <DocOption key={d.type} doc={d} index={i} selected={choice === d.type} onPress={() => select(d.type)} />)}
                    </View>
                    <Text style={styles.small}>The document you upload must be valid, not expired, and issued in your name.</Text>
                </Animated.View>
            ) : (
                <Animated.View key="summary" entering={FadeIn.duration(200)}>
                    <View style={styles.rows}>
                        <Pressable onPress={() => { hapticTick(); setChoice(savedType); setChanging(true); }} style={styles.row} accessibilityRole="button" accessibilityLabel="Change ID document">
                            <CheckCircle2 size={22} color={colors.positive} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>{savedType ? DOCS.find((d) => d.type === savedType)?.label : 'ID document'}</Text>
                                <Text style={styles.hint}>Photos added · tap to change</Text>
                            </View>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                        {OTHER_ROWS.map((r) => (
                            <View key={r.key} style={styles.row}>
                                {docs[r.key] ? <CheckCircle2 size={22} color={colors.positive} /> : <Circle size={22} color={colors.textFaint} />}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>{r.label}</Text>
                                    <Text style={styles.hint}>{r.hint}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {!!statement?.emailId && !docs.proof_of_residence && (
                        <Pressable onPress={() => void attachStatement()} disabled={attaching} style={styles.statement} accessibilityRole="button">
                            <FileText size={20} color={colors.blue} />
                            <Text style={styles.statementText}>
                                Use your {statementBank} statement from {new Date(statement.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} as proof of residence
                            </Text>
                            {attaching && <ActivityIndicator color={colors.blue} />}
                        </Pressable>
                    )}

                    {kyc.complete ? (
                        <View style={styles.done}>
                            <ShieldCheck size={20} color={colors.positiveInk} />
                            <Text style={styles.doneText}>Your documents are in. We’ll let you know if anything needs another look.</Text>
                        </View>
                    ) : !ctx.preview && (
                        <Pressable onPress={() => { hapticTick(); router.push('/settings/kyc-profile'); }} style={({ pressed }) => [styles.upload, pressed && { opacity: 0.9 }]} accessibilityRole="button">
                            <Text style={styles.uploadText}>Add your selfie and proof of residence</Text>
                        </Pressable>
                    )}
                    <Text style={styles.small}>Your documents are stored privately and only shared with a company when you apply to it.</Text>
                </Animated.View>
            )}
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    lead: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted, marginBottom: 14 },
    options: { gap: 12 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    optionOn: { borderColor: colors.blue, backgroundColor: '#F4F8FF' },
    optionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
    optionIconOn: { backgroundColor: '#E6F0FF' },
    optionLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    optionHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1, borderColor: colors.border },
    label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
    statement: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: '#F4F8FF', marginTop: 16 },
    statementText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.blue },
    upload: { marginTop: 18, minHeight: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    uploadText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: '#ECFDF5', marginTop: 18 },
    doneText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text },
    small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 16 },
});
