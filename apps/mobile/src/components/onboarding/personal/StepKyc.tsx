import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle2, Circle, FileText, ShieldCheck } from 'lucide-react-native';
import { PersonalStepError, type KycProfile } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "kyc": the person's identity documents, kept in the same KYC profile investments and loans use (so nothing is
 * uploaded twice). The upload screens are Settings → KYC profile, which already reads the ID, checks photo quality and
 * flags a name or birth date that doesn't match. A bank statement found in Gmail can be used as proof of residence in
 * one tap. Re-read when the person comes back from the upload screen.
 */
const ROWS: { key: string; label: string; hint: string }[] = [
    { key: 'id_front', label: 'ID document', hint: 'NRC, passport or driver’s licence' },
    { key: 'photo', label: 'Selfie', hint: 'A clear photo of your face' },
    { key: 'proof_of_residence', label: 'Proof of residence', hint: 'A recent bank statement, utility bill or lease' },
];

export function StepKyc({ ctx }: { ctx: StepContext }) {
    const router = useRouter();
    const [kyc, setKyc] = useState<KycProfile | null>(null);
    const [attaching, setAttaching] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [previewUploaded, setPreviewUploaded] = useState(false);

    const load = useCallback(async () => {
        try { setKyc(await ctx.service.getKyc()); }
        catch { setKyc({ exists: false, complete: false, missing: [], applicant: null, idType: null, documents: {}, documentUrls: {}, updatedAt: null }); }
    }, [ctx.service]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const docs = kyc?.documents ?? {};
    const complete = !!kyc?.complete || (ctx.preview && previewUploaded);
    const statement = ctx.drafts.gmail?.statement;
    const statementBank = statement?.provider ? ctx.money?.providers.find((p) => p.code === statement.provider)?.name ?? statement.provider : null;

    const attachStatement = async () => {
        if (!statement?.emailId) return;
        setAttaching(true); setErr(null);
        try { await ctx.service.attachGmailStatement(statement.emailId); await load(); }
        catch (e: any) { setErr(e instanceof PersonalStepError ? e.message : 'Couldn’t use that statement. Upload it instead.'); }
        finally { setAttaching(false); }
    };

    const openUpload = () => {
        if (ctx.preview) { setPreviewUploaded(true); return; }
        router.push('/settings/kyc-profile');
    };

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ complete: true })} continueDisabled={!complete}
            saving={ctx.saving} error={ctx.error ?? err} continueLabel={ctx.single ? 'Done' : 'Continue'}
        >
            {!kyc ? <ActivityIndicator color={colors.blue} /> : (
                <>
                    <View style={styles.rows}>
                        {ROWS.map((r) => {
                            const ok = !!docs[r.key] || (ctx.preview && previewUploaded);
                            return (
                                <View key={r.key} style={styles.row}>
                                    {ok ? <CheckCircle2 size={22} color={colors.positive} /> : <Circle size={22} color={colors.textFaint} />}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>{r.label}</Text>
                                        <Text style={styles.hint}>{r.hint}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    {!!statement?.emailId && !docs.proof_of_residence && !complete && (
                        <Pressable onPress={() => void attachStatement()} disabled={attaching} style={styles.statement} accessibilityRole="button">
                            <FileText size={20} color={colors.blue} />
                            <Text style={styles.statementText}>
                                Use your {statementBank} statement from {new Date(statement.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} as proof of residence
                            </Text>
                            {attaching && <ActivityIndicator color={colors.blue} />}
                        </Pressable>
                    )}

                    {complete ? (
                        <View style={styles.done}>
                            <ShieldCheck size={20} color={colors.positiveInk} />
                            <Text style={styles.doneText}>Your documents are in. We’ll let you know if anything needs another look.</Text>
                        </View>
                    ) : (
                        <Pressable onPress={openUpload} style={({ pressed }) => [styles.upload, pressed && { opacity: 0.9 }]} accessibilityRole="button">
                            <Text style={styles.uploadText}>{kyc.exists ? 'Finish uploading' : 'Upload documents'}</Text>
                        </Pressable>
                    )}
                    <Text style={styles.small}>Your documents are stored privately and only shared with a company when you apply to it.</Text>
                </>
            )}
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    rows: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1, borderColor: colors.border },
    label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
    statement: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: '#F4F8FF', marginTop: 16 },
    statementText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.blue },
    upload: { marginTop: 18, minHeight: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    uploadText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
    done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: '#ECFDF5', marginTop: 18 },
    doneText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text },
    small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 16 },
});
