import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { WalletCards, CheckCircle2, Link2, Send, PiggyBank, Wifi, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MoneywiseMark } from '../../icons/MoneywiseMark';
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

    const holder = [ctx.state.profile.firstName, ctx.state.profile.lastName].filter(Boolean).join(' ') || 'Your name';

    const blockedBy = minor ? 'minor' : !kyc?.complete ? 'kyc' : status && !status.linked && !status.poolAvailable ? 'pool' : null;

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={activated ? undefined : ctx.skip}
            onContinue={() => ctx.done({ activated: true })} continueDisabled={!activated}
            saving={ctx.saving} error={ctx.error ?? err} continueLabel={ctx.single ? 'Done' : 'Continue'}
        >
            {!status ? <ActivityIndicator color={colors.blue} /> : (
                <>
                    {/* A sample of the wallet: a dark card with a made-up balance, so it's clear what you're getting. */}
                    <View style={styles.cardShadow}>
                        <LinearGradient colors={['#1E2A55', '#0B1020', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletCard}>
                            <View style={styles.cardTop}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <MoneywiseMark height={15} color="#FFFFFF" />
                                    <Text style={styles.cardBrand}>MoneyWise</Text>
                                </View>
                                <Wifi size={20} color="rgba(255,255,255,0.7)" style={{ transform: [{ rotate: '90deg' }] }} />
                            </View>
                            <View>
                                <Text style={styles.cardLabel}>Available balance</Text>
                                <Text style={styles.cardAmount}>K12,480.00</Text>
                            </View>
                            <View style={styles.cardBottom}>
                                <Text style={styles.cardHandle} numberOfLines={1}>{holder}</Text>
                                <Text style={styles.cardSample}>SAMPLE</Text>
                            </View>
                        </LinearGradient>
                    </View>

                    <Text style={styles.whyTitle}>Why get a wallet</Text>
                    <View style={styles.perks}>
                        <Perk icon={<Link2 size={17} color={colors.text} />} title="Get paid anywhere" text="Share a payment link or your @username and money lands in your wallet." />
                        <Perk icon={<Send size={17} color={colors.text} />} title="Pay anyone" text="Send to mobile money and bank accounts in a few taps." />
                        <Perk icon={<PiggyBank size={17} color={colors.text} />} title="Save, alone or together" text="Set money aside for goals, or save in a group." />
                        <Perk icon={<TrendingUp size={17} color={colors.text} />} title="Invest" text="Put your money to work and watch it grow from the same wallet." />
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

const Perk = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
    <View style={styles.perk}>
        <View style={styles.perkIcon}>{icon}</View>
        <View style={{ flex: 1 }}><Text style={styles.perkTitle}>{title}</Text><Text style={styles.perkText}>{text}</Text></View>
    </View>
);

const styles = StyleSheet.create({
    cardShadow: { shadowColor: '#0B1020', shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
    walletCard: { height: 168, borderRadius: 20, padding: 18, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBrand: { fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' },
    cardLabel: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.65)' },
    cardAmount: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: '#FFFFFF', marginTop: 2 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardHandle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
    cardSample: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)' },
    whyTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 20, marginBottom: 10 },
    perks: { gap: 11 },
    perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    perkIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#E3E5EB', alignItems: 'center', justifyContent: 'center' },
    perkTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    perkText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 1 },
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
