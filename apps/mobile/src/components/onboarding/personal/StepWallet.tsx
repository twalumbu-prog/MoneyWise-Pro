import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { WalletCards, CheckCircle2, Link2, Send, PiggyBank } from 'lucide-react-native';
import { PersonalStepError, type WalletStatus, type KycProfile } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext } from './stepContext';
import { fmtK } from './moneyUi';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "wallet": the MoneyWise wallet. Needs identity verified and an adult (18+). Activating links a wallet from the
 * pool, then the person deposits the activation amount with the normal Deposit screen (it's their own money, not a
 * fee). Coming back, the server looks for that deposit and marks the wallet active. An empty pool is said plainly and
 * the step goes on the checklist.
 */
const ageOf = (iso: string | null | undefined) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date();
    let a = t.getFullYear() - y;
    if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a -= 1;
    return a;
};

export function StepWallet({ ctx }: { ctx: StepContext }) {
    const router = useRouter();
    const [status, setStatus] = useState<WalletStatus | null>(null);
    const [kyc, setKyc] = useState<KycProfile | null>(null);
    const [activated, setActivated] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (ctx.preview) {
            setStatus((s) => s ?? ({ linked: false, poolAvailable: true, activation: { amount: 50, currency: 'ZMW' }, activated: false } as any));
            setKyc((k) => k ?? ({ complete: true } as any));
            return;
        }
        try {
            const [s, k] = await Promise.all([ctx.service.walletStatus(), ctx.service.getKyc().catch(() => null)]);
            setStatus(s); setKyc(k);
            if (s.activated) { setActivated(true); return; }
            if (s.linked) { const c = await ctx.service.checkWallet().catch(() => null); if (c?.activated) setActivated(true); }
        } catch (e: any) { setErr(e?.message || 'Couldn’t load your wallet.'); }
    }, [ctx.preview, ctx.service]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const age = ageOf(ctx.state.profile.dateOfBirth);
    const minor = age != null && age < 18;
    const amount = status?.activation.amount ?? 0;

    const activate = async () => {
        setBusy(true); setErr(null);
        try {
            if (ctx.preview) { setActivated(true); return; }
            if (!status?.linked) await ctx.service.claimWallet();
            router.push('/wallet/deposit');
        } catch (e: any) {
            setErr(e instanceof PersonalStepError ? e.message : e?.message || 'Couldn’t start activation. Try again.');
        } finally { setBusy(false); }
    };

    const blockedBy = minor ? 'minor' : !kyc?.complete ? 'kyc' : status && !status.linked && !status.poolAvailable ? 'pool' : null;

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={activated ? undefined : ctx.skip}
            onContinue={() => ctx.done({ activated: true })} continueDisabled={!activated}
            saving={ctx.saving} error={ctx.error ?? err} continueLabel={ctx.single ? 'Done' : 'Continue'}
        >
            {!status ? <ActivityIndicator color={colors.blue} /> : (
                <>
                    <View style={styles.perks}>
                        <Perk icon={<Link2 size={18} color={colors.blue} />} text="Receive money with a link or your @username" />
                        <Perk icon={<Send size={18} color={colors.blue} />} text="Pay mobile money and bank accounts" />
                        <Perk icon={<PiggyBank size={18} color={colors.blue} />} text="Save on your own or in a group" />
                    </View>

                    {activated ? (
                        <View style={styles.done}>
                            <CheckCircle2 size={22} color={colors.positive} />
                            <Text style={styles.doneText}>Your MoneyWise wallet is active.</Text>
                        </View>
                    ) : blockedBy === 'minor' ? (
                        <Text style={styles.note}>The MoneyWise wallet is for people aged 18 and over. Everything else in MoneyWise is yours to use.</Text>
                    ) : blockedBy === 'kyc' ? (
                        <View style={{ gap: 12, marginTop: 20 }}>
                            <Text style={styles.note}>First, verify your identity. It takes a couple of minutes.</Text>
                            <Pressable onPress={() => ctx.goTo('kyc')} style={styles.secondary} accessibilityRole="button"><Text style={styles.secondaryText}>Verify my identity</Text></Pressable>
                        </View>
                    ) : blockedBy === 'pool' ? (
                        <Text style={styles.note}>Wallet activation is busy right now. It’s on your “Finish setting up” list, so you can do it in a day or two.</Text>
                    ) : (
                        <View style={styles.card}>
                            <WalletCards size={28} color={colors.blue} />
                            <Text style={styles.cardTitle}>Deposit {fmtK(amount)} to activate</Text>
                            <Text style={styles.cardBody}>It goes straight into your wallet and is yours to spend. Activation isn’t a fee.</Text>
                            <Pressable onPress={() => void activate()} disabled={busy} style={styles.primary} accessibilityRole="button">
                                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{status.linked ? `Deposit ${fmtK(amount)}` : 'Activate my wallet'}</Text>}
                            </Pressable>
                            {status.linked && <Text style={styles.small}>Already deposited? It can take a minute to show. Come back to this screen and it will update.</Text>}
                        </View>
                    )}
                </>
            )}
        </PersonalStepShell>
    );
}

const Perk = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <View style={styles.perk}><View style={styles.perkIcon}>{icon}</View><Text style={styles.perkText}>{text}</Text></View>
);

const styles = StyleSheet.create({
    perks: { gap: 12 },
    perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    perkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    perkText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    card: { marginTop: 24, padding: 18, borderRadius: radius.md, backgroundColor: colors.canvas, gap: 8 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    cardBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.textMuted },
    primary: { marginTop: 8, minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    secondary: { minHeight: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 24 },
    done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.md, backgroundColor: '#ECFDF5', marginTop: 24 },
    doneText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint },
});
