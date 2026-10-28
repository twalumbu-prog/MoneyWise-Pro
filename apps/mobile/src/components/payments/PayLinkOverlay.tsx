import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Animated, Easing, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ShieldCheck, Building2, AlertCircle, ChevronDown, Check } from 'lucide-react-native';
import { payLinkService, formatKwacha, type PayTarget } from 'core';
import { useAuth } from '../../context/AuthContext';
import { useGoBack } from '../../hooks/useGoBack';
import { useStrongConfirm } from '../../hooks/useStrongConfirm';
import { usePersonalAccount } from '../../hooks/usePersonalAccount';
import { setPendingPayLink } from '../../lib/pendingPayLink';
import { showSendResult } from '../../lib/sendResult';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { SlideToPay } from './SlideToPay';
import { SuccessMark } from './SuccessMark';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * The "pay with MoneyWise" overlay, opened when a pay link is tapped on a phone that has the app (universal link → /pl/<token> or
 * /pay/<username>). It shows who is being paid and how much, then "Slide to pay"; letting go of the slider asks for the app PIN or
 * Face ID / fingerprint (the same check as signing in), and only then is the money sent from the person's wallet.
 */
export const PayLinkOverlay: React.FC<{ token?: string; username?: string }> = ({ token, username }) => {
    const insets = useSafeAreaInsets();
    const goBack = useGoBack();
    const qc = useQueryClient();
    const { session, loading: authLoading } = useAuth();
    const { isPersonal } = usePersonalAccount();
    const strong = useStrongConfirm();

    const [amountText, setAmountText] = useState('');
    const [note, setNote] = useState('');
    const [walletId, setWalletId] = useState<string | null>(null);
    const [walletOpen, setWalletOpen] = useState(false);
    const [phase, setPhase] = useState<'ready' | 'paying' | 'paid' | 'processing'>('ready');
    const [error, setError] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);

    const fade = useRef(new Animated.Value(0)).current;
    const rise = useRef(new Animated.Value(0)).current;
    const draw = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(rise, { toValue: 1, duration: 380, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }),
        ]).start();
    }, [fade, rise]);

    const close = () => {
        Keyboard.dismiss();
        Animated.parallel([
            Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }),
            Animated.timing(rise, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => goBack());
    };

    const { data: target, isLoading, error: loadError, refetch } = useQuery<PayTarget>({
        queryKey: ['pay-target', token ?? username],
        queryFn: () => payLinkService.resolve(token ? { token } : { username }),
        enabled: !!session && !authLoading,
        retry: false,
        staleTime: 0,
    });

    const wallet = target?.wallets.find((w) => w.id === (walletId ?? target.wallets.find((x) => x.is_main)?.id ?? target.wallets[0]?.id));
    const amount = target ? (target.amountEditable ? Number(amountText.replace(/,/g, '')) || 0 : (target.amount ?? 0)) : 0;
    const short = !!wallet && amount > 0 && wallet.balance + 0.005 < amount;
    const canPay = !!target && target.status === 'READY' && !target.own && amount > 0 && !!wallet && !short && phase === 'ready';

    const pay = async () => {
        if (!target || !wallet) return;
        setError(null);
        const ok = await strong.confirm(`Pay ${formatKwacha(amount)} to ${target.recipient.name}`);
        if (!ok) { setResetKey((k) => k + 1); return; }
        setPhase('paying');
        try {
            const r = await payLinkService.pay({ token, username, amount: target.amountEditable ? amount : undefined, purpose: note.trim() || undefined, walletId: wallet.id });
            qc.invalidateQueries({ queryKey: ['wallets'] });
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            if (r.status === 'paid') {
                hapticSuccess();
                // A personal account gets the "money sent" popup (account it was filed under, budget left) on the screen it returns to.
                if (isPersonal) { showSendResult({ requisitionId: r.requisitionId, amount: r.amount, recipient: r.recipient }); close(); return; }
                setPhase('paid');
                Animated.sequence([Animated.delay(200), Animated.timing(draw, { toValue: 1, duration: 300, easing: Easing.bezier(0, 0, 0.58, 1), useNativeDriver: false })]).start();
            } else {
                setPhase('processing');
            }
        } catch (e: any) {
            hapticError();
            setError(e?.message ?? 'The payment could not be made. Nothing was sent.');
            setPhase('ready');
            setResetKey((k) => k + 1);
            void refetch();
        }
    };

    const signIn = () => { setPendingPayLink(token ? `/pl/${token}` : `/pay/${username}`); router.replace('/(auth)/login'); };

    const initials = (target?.recipient.name ?? '?').trim().slice(0, 1).toUpperCase();

    return (
        <View style={styles.root}>
            <Animated.View style={[styles.backdrop, { opacity: fade }]}><Pressable style={StyleSheet.absoluteFill} onPress={phase === 'paying' ? undefined : close} accessibilityLabel="Close" /></Animated.View>
            {strong.sheet}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} pointerEvents="box-none">
                <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8, opacity: fade, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] }]}>
                    <View style={styles.handle} />
                    {phase !== 'paying' && <Pressable onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>}

                    {!session && !authLoading ? (
                        <View style={styles.centre}>
                            <ShieldCheck size={34} color={colors.blue} />
                            <Text style={styles.stateTitle}>Sign in to pay</Text>
                            <Text style={styles.stateBody}>Sign in to MoneyWise and we'll bring you straight back to this payment.</Text>
                            <Pressable onPress={signIn} style={styles.primary}><Text style={styles.primaryText}>Sign in</Text></Pressable>
                        </View>
                    ) : isLoading || authLoading ? (
                        <View style={styles.centre}><ActivityIndicator color={colors.blue} /><Text style={styles.stateBody}>Opening payment…</Text></View>
                    ) : loadError || !target ? (
                        <View style={styles.centre}>
                            <AlertCircle size={34} color={colors.danger} />
                            <Text style={styles.stateTitle}>Can't open this link</Text>
                            <Text style={styles.stateBody}>{(loadError as any)?.message ?? 'Something went wrong. Please try again.'}</Text>
                            <Pressable onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Close</Text></Pressable>
                        </View>
                    ) : target.status !== 'READY' || target.own ? (
                        <View style={styles.centre}>
                            <AlertCircle size={34} color={colors.textFaint} />
                            <Text style={styles.stateTitle}>{target.own ? 'This is your own link' : target.status === 'PAID' ? 'Already paid' : "Can't pay this here"}</Text>
                            <Text style={styles.stateBody}>{target.own ? "You can't pay yourself." : target.reason}</Text>
                            <Pressable onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Close</Text></Pressable>
                        </View>
                    ) : phase === 'paid' ? (
                        <View style={styles.centre}>
                            <SuccessMark draw={draw} size={72} />
                            <Text style={styles.stateTitle}>Paid</Text>
                            <Text style={styles.stateBody}>{formatKwacha(amount)} sent to {target.recipient.name}.</Text>
                            <Pressable onPress={close} style={styles.primary}><Text style={styles.primaryText}>Done</Text></Pressable>
                        </View>
                    ) : phase === 'processing' ? (
                        <View style={styles.centre}>
                            <ActivityIndicator color={colors.blue} />
                            <Text style={styles.stateTitle}>Payment on its way</Text>
                            <Text style={styles.stateBody}>{formatKwacha(amount)} to {target.recipient.name} is being confirmed. You'll see it in your wallet shortly — don't pay again.</Text>
                            <Pressable onPress={close} style={styles.primary}><Text style={styles.primaryText}>Done</Text></Pressable>
                        </View>
                    ) : (
                        <>
                            <View style={styles.who}>
                                {target.recipient.logoUrl
                                    ? <Image source={{ uri: target.recipient.logoUrl }} style={styles.logo} />
                                    : <View style={[styles.logo, styles.logoFallback]}>{initials === '?' ? <Building2 size={22} color={colors.textMuted} /> : <Text style={styles.initial}>{initials}</Text>}</View>}
                                <Text style={styles.payLabel}>Pay</Text>
                                <Text style={styles.name} numberOfLines={2}>{target.recipient.name}</Text>
                                {!!target.purpose && <Text style={styles.purpose} numberOfLines={2}>{target.purpose}</Text>}
                            </View>

                            {target.amountEditable ? (
                                <View style={styles.amountEdit}>
                                    <Text style={styles.currency}>K</Text>
                                    <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} style={styles.amountInput} autoFocus editable={phase === 'ready'} />
                                </View>
                            ) : (
                                <Text style={styles.amount}>{formatKwacha(amount)}</Text>
                            )}
                            {target.amountEditable && (
                                <TextInput value={note} onChangeText={setNote} placeholder="What is it for? (optional)" placeholderTextColor={colors.textFaint} style={styles.note} maxLength={120} editable={phase === 'ready'} />
                            )}

                            {!!wallet && (
                                <Pressable onPress={() => target.wallets.length > 1 && setWalletOpen((o) => !o)} style={styles.fromRow} accessibilityRole="button">
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.fromLabel}>From</Text>
                                        <Text style={styles.fromName}>{wallet.name}</Text>
                                    </View>
                                    <Text style={[styles.fromBal, short && { color: colors.danger }]}>{formatKwacha(wallet.balance)} available</Text>
                                    {target.wallets.length > 1 && <ChevronDown size={16} color={colors.textFaint} />}
                                </Pressable>
                            )}
                            {walletOpen && target.wallets.map((w) => (
                                <Pressable key={w.id} onPress={() => { setWalletId(w.id); setWalletOpen(false); }} style={styles.walletOpt}>
                                    <Text style={styles.fromName}>{w.name}</Text>
                                    <Text style={styles.fromBal}>{formatKwacha(w.balance)}</Text>
                                    {w.id === wallet?.id && <Check size={15} color={colors.blue} />}
                                </Pressable>
                            ))}

                            {short && (
                                <View style={styles.warn}>
                                    <Text style={styles.warnText}>This wallet doesn't have enough. </Text>
                                    <Pressable onPress={() => { close(); setTimeout(() => router.push('/wallet/deposit'), 250); }} hitSlop={8}><Text style={styles.warnLink}>Add money</Text></Pressable>
                                </View>
                            )}
                            {!!error && <Text style={styles.error}>{error}</Text>}

                            <View style={{ marginTop: 16 }}>
                                <SlideToPay label={amount > 0 ? `Slide to pay ${formatKwacha(amount)}` : 'Enter an amount'} disabled={!canPay} busy={phase === 'paying'} resetKey={resetKey} onComplete={pay} />
                            </View>
                            <View style={styles.secure}><ShieldCheck size={13} color={colors.textFaint} /><Text style={styles.secureText}>You'll confirm with your PIN or Face ID</Text></View>
                        </>
                    )}
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,30,45,0.55)' },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10 },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },
    closeBtn: { position: 'absolute', right: 16, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    centre: { alignItems: 'center', gap: 10, paddingVertical: 34 },
    stateTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, textAlign: 'center' },
    stateBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
    primary: { alignSelf: 'stretch', marginTop: 10, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    secondary: { alignSelf: 'stretch', marginTop: 10, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    who: { alignItems: 'center', gap: 2, paddingTop: 14 },
    logo: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', marginBottom: 8 },
    logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tabActiveBg },
    initial: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.blue },
    payLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    name: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#000000', textAlign: 'center' },
    purpose: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 40, color: colors.navy, textAlign: 'center', marginTop: 14 },
    amountEdit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
    currency: { fontFamily: fonts.bodyBold, fontSize: 30, color: colors.textMuted },
    amountInput: { fontFamily: fonts.bodyBold, fontSize: 40, color: colors.navy, minWidth: 120, textAlign: 'center', padding: 0 },
    note: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontFamily: fonts.body, fontSize: 14, color: colors.text, textAlign: 'center' },
    fromRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border },
    fromLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    fromName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    fromBal: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    walletOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, justifyContent: 'space-between' },
    warn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    warnText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger },
    warnLink: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.blue },
    error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, textAlign: 'center', marginTop: 10, lineHeight: 17 },
    secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
    secureText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textFaint },
});
