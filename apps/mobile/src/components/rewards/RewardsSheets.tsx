import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, Share, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { X, Copy, Check, Share2, Gift } from 'lucide-react-native';
import { rewardsService, type RewardCard } from 'core';
import { ProgrammeLogo, ProgressBar, fmtPoints } from './RewardsUI';
import { colors, fonts, radius } from '../../theme/tokens';

const Sheet: React.FC<{ visible: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ visible, title, onClose, children }) => {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} pointerEvents="box-none">
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                    </View>
                    {children}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

/**
 * Invite friends. From the main Rewards page the invite brings people to MoneyWise; from a business it sends them to that
 * business's page, and the inviter is rewarded when the friend takes their first action there.
 */
export const InviteSheet: React.FC<{ visible: boolean; scope: string; onClose: () => void }> = ({ visible, scope, onClose }) => {
    const [copied, setCopied] = useState<'code' | 'link' | null>(null);
    const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['rewards', 'invite', scope], queryFn: () => rewardsService.invite(scope), enabled: visible, staleTime: 5 * 60_000 });
    useEffect(() => { if (!visible) setCopied(null); }, [visible]);

    const copy = async (what: 'code' | 'link') => {
        if (!data) return;
        await Clipboard.setStringAsync(what === 'code' ? data.code : data.link);
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <Sheet visible={visible} title="Invite friends" onClose={onClose}>
            <View style={styles.body}>
                {isLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : isError || !data ? (
                    <View style={styles.centre}>
                        <Text style={styles.muted}>We couldn’t create your invite.</Text>
                        <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                    </View>
                ) : (
                    <>
                        <Text style={styles.lead}>{data.reward}</Text>
                        <View style={styles.qrWrap}><QRCode value={data.link} size={156} color="#020617" backgroundColor="#FFFFFF" /></View>
                        <Pressable onPress={() => copy('code')} style={styles.codeBox} accessibilityLabel="Copy your referral code">
                            <Text style={styles.codeLabel}>Your referral code</Text>
                            <View style={styles.codeRow}>
                                <Text style={styles.code} selectable>{data.code}</Text>
                                {copied === 'code' ? <Check size={16} color={colors.positiveInk} /> : <Copy size={16} color={colors.textMuted} />}
                            </View>
                        </Pressable>
                        {data.businessPage === false && <Text style={styles.note}>This business hasn’t set up its pay page yet, so friends will join MoneyWise with your code.</Text>}
                        <View style={styles.actions}>
                            <Pressable onPress={() => copy('link')} style={({ pressed }) => [styles.btn, styles.btnLight, pressed && { opacity: 0.8 }]}>
                                {copied === 'link' ? <Check size={16} color={colors.positiveInk} /> : <Copy size={16} color={colors.navy} />}
                                <Text style={styles.btnLightText}>{copied === 'link' ? 'Copied' : 'Copy link'}</Text>
                            </Pressable>
                            <Pressable onPress={() => { void Share.share({ message: `${data.title}: ${data.link}\nUse my code ${data.code}`, url: data.link }); }} style={({ pressed }) => [styles.btn, styles.btnDark, pressed && { opacity: 0.85 }]}>
                                <Share2 size={16} color="#FFFFFF" />
                                <Text style={styles.btnDarkText}>Share</Text>
                            </Pressable>
                        </View>
                    </>
                )}
            </View>
        </Sheet>
    );
};

/** Redeem: each business where a reward is ready (one tap to redeem), and the vouchers waiting to be shown at a business. */
export const RedeemSheet: React.FC<{ visible: boolean; scope?: string; onClose: () => void }> = ({ visible, scope, onClose }) => {
    const qc = useQueryClient();
    const [busy, setBusy] = useState<string | null>(null);
    const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['rewards', 'redeemables'], queryFn: () => rewardsService.redeemables(), enabled: visible });
    const { data: overview } = useQuery({ queryKey: ['rewards', 'overview'], queryFn: () => rewardsService.overview(), enabled: visible });

    const ready = (data?.ready ?? []).filter((c) => !scope || c.id === scope);
    const vouchers = (data?.vouchers ?? []).filter((v) => !scope || v.organizationId === scope);
    const closest: RewardCard[] = (overview?.businesses ?? []).filter((b) => b.threshold && !b.rewardReady && (!scope || b.id === scope)).sort((a, b) => b.progress - a.progress).slice(0, 3);

    const redeem = (card: RewardCard) => {
        Alert.alert(`Redeem ${card.rewardTitle ?? 'reward'}?`, `This uses ${fmtPoints(card.threshold ?? 0)} of your ${card.name} points. You'll get a code to show ${card.name}.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Redeem',
                onPress: async () => {
                    setBusy(card.id);
                    try {
                        const r = await rewardsService.redeem(card.id);
                        await Promise.all([qc.invalidateQueries({ queryKey: ['rewards'] }), refetch()]);
                        Alert.alert('Reward ready', `Show this code to ${r.business}:\n\n${r.code}\n\n${r.title}`);
                    } catch (e: any) {
                        Alert.alert('Couldn’t redeem', e?.message ?? 'Please try again.');
                    } finally { setBusy(null); }
                },
            },
        ]);
    };

    return (
        <Sheet visible={visible} title="Redeem rewards" onClose={onClose}>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.body}>
                {isLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : isError ? (
                    <View style={styles.centre}>
                        <Text style={styles.muted}>We couldn’t load your rewards.</Text>
                        <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                    </View>
                ) : (
                    <>
                        {ready.length > 0 && <Text style={styles.section}>Ready to redeem</Text>}
                        {ready.map((c) => (
                            <View key={c.id} style={styles.redeemRow}>
                                <ProgrammeLogo card={c} size={40} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                                    <Text style={styles.rowSub} numberOfLines={2}>{c.rewardTitle} · {fmtPoints(c.threshold ?? 0)} pts</Text>
                                </View>
                                <Pressable disabled={busy !== null} onPress={() => redeem(c)} style={({ pressed }) => [styles.redeemBtn, pressed && { opacity: 0.85 }, busy !== null && { opacity: 0.5 }]}>
                                    {busy === c.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.redeemBtnText}>Redeem</Text>}
                                </Pressable>
                            </View>
                        ))}
                        {ready.length === 0 && (
                            <View style={styles.empty}>
                                <Gift size={28} color={colors.textFaint} />
                                <Text style={styles.emptyTitle}>No rewards ready yet</Text>
                                <Text style={styles.muted}>Keep buying from the businesses you love — rewards unlock as your points grow.</Text>
                            </View>
                        )}
                        {ready.length === 0 && closest.length > 0 && <Text style={styles.section}>Closest to a reward</Text>}
                        {ready.length === 0 && closest.map((c) => (
                            <View key={c.id} style={{ gap: 6, paddingVertical: 6 }}>
                                <View style={styles.rowTop}><ProgrammeLogo card={c} size={32} /><Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>{c.name}</Text><Text style={styles.rowSub}>{fmtPoints(c.pointsToNext ?? 0)} pts to go</Text></View>
                                <ProgressBar progress={c.progress} />
                            </View>
                        ))}
                        {vouchers.length > 0 && <Text style={[styles.section, { marginTop: 16 }]}>Your vouchers</Text>}
                        {vouchers.map((v) => (
                            <View key={v.id} style={styles.voucher}>
                                <Text style={styles.rowName} numberOfLines={1}>{v.title}</Text>
                                <Text style={styles.rowSub}>{v.business} — show this code</Text>
                                <Text style={styles.voucherCode} selectable>{v.code}</Text>
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>
        </Sheet>
    );
};

/** A friend's code, for someone who has just joined. */
export const ReferralCodeSheet: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
    const qc = useQueryClient();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (!visible) { setCode(''); setError(null); } }, [visible]);

    const submit = async () => {
        if (code.trim().length < 4) { setError('Enter your friend’s referral code.'); return; }
        setBusy(true); setError(null);
        try {
            const r = await rewardsService.claimReferral(code.trim());
            await qc.invalidateQueries({ queryKey: ['rewards'] });
            onClose();
            Alert.alert('Code added', `${r.referrerName} will earn points when you make your first purchase.`);
        } catch (e: any) { setError(e?.message ?? 'Could not add that code.'); } finally { setBusy(false); }
    };

    return (
        <Sheet visible={visible} title="Enter a referral code" onClose={onClose}>
            <View style={styles.body}>
                <Text style={styles.lead}>Did a friend invite you to MoneyWise? Add their code so they earn rewards when you make your first purchase.</Text>
                <TextInput
                    value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={12}
                    placeholder="e.g. 7K3MQ9X" placeholderTextColor={colors.textFaint} style={styles.input} onSubmitEditing={submit} returnKeyType="done"
                />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, styles.btnDark, { alignSelf: 'stretch', marginTop: 14 }, (pressed || busy) && { opacity: 0.8 }]}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnDarkText}>Add code</Text>}
                </Pressable>
            </View>
        </Sheet>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    kav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    title: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 4, alignItems: 'stretch' },
    centre: { alignItems: 'center', gap: 12, paddingVertical: 36 },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    lead: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
    qrWrap: { alignSelf: 'center', padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#FFFFFF' },
    codeBox: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 },
    codeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    code: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy, letterSpacing: 3 },
    note: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
    actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill },
    btnLight: { backgroundColor: colors.chipActiveBg },
    btnLightText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    btnDark: { backgroundColor: colors.blue },
    btnDarkText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    section: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowName: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    redeemBtn: { minWidth: 84, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.blue },
    redeemBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 18 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    voucher: { padding: 14, borderRadius: radius.md, backgroundColor: colors.tabActiveBg, borderWidth: 1, borderColor: colors.border, marginBottom: 8, gap: 2 },
    voucherCode: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.blue, letterSpacing: 2, marginTop: 4 },
    input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, textAlign: 'center', letterSpacing: 3 },
    error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, textAlign: 'center', marginTop: 10 },
});
