import { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, TicketCheck } from 'lucide-react-native';
import { rewardsService, type RewardProgramSettings } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useAuth } from '../../src/context/AuthContext';
import { colors, fonts, radius } from '../../src/theme/tokens';

const KEY = ['rewards', 'program'] as const;
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

/**
 * Settings → Customer rewards, for a business. The rules customers earn and redeem by (admins change them), and a box to
 * mark a customer's voucher code as used when they show it at the counter.
 */
export default function CustomerRewardsScreen() {
    const qc = useQueryClient();
    const { userRole, organizationName } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => rewardsService.getProgram() });

    const [enabled, setEnabled] = useState(true);
    const [perKwacha, setPerKwacha] = useState('1');
    const [threshold, setThreshold] = useState('500');
    const [title, setTitle] = useState('');
    const [value, setValue] = useState('25');
    const [invite, setInvite] = useState('100');
    const [code, setCode] = useState('');
    const [lastUsed, setLastUsed] = useState<string | null>(null);

    useEffect(() => {
        if (!data) return;
        setEnabled(data.enabled); setPerKwacha(String(data.points_per_kwacha)); setThreshold(String(data.reward_threshold));
        setTitle(data.reward_title); setValue(String(data.reward_value)); setInvite(String(data.referral_points));
    }, [data]);

    const dirty = !!data && (enabled !== data.enabled || num(perKwacha) !== data.points_per_kwacha || num(threshold) !== data.reward_threshold
        || title.trim() !== data.reward_title || num(value) !== data.reward_value || num(invite) !== data.referral_points);

    const save = useMutation({
        mutationFn: () => rewardsService.updateProgram({
            enabled, points_per_kwacha: num(perKwacha), reward_threshold: num(threshold), reward_title: title.trim(), reward_value: num(value), referral_points: num(invite),
        } as Partial<RewardProgramSettings>),
        onSuccess: (d) => { qc.setQueryData(KEY, d); Alert.alert('Saved', 'Your rewards rules are updated. They apply to new purchases from now on.'); },
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    const use = useMutation({
        mutationFn: () => rewardsService.useVoucher(code.trim()),
        onSuccess: (r) => { setCode(''); setLastUsed(`${r.title} — ${r.customer}`); Alert.alert('Reward used', `${r.title}\nfor ${r.customer}.\n\nGive them the reward now.`); },
        onError: (e: Error) => { setLastUsed(null); Alert.alert('Can’t use this code', e.message); },
    });

    const confirmUse = () => {
        if (code.trim().length < 4) { Alert.alert('Enter the code', 'Ask the customer for the code that starts with RW-.'); return; }
        Alert.alert('Mark reward as used?', `Code ${code.trim().toUpperCase()}. This can’t be undone.`, [
            { text: 'Cancel', style: 'cancel' }, { text: 'Mark as used', onPress: () => use.mutate() },
        ]);
    };

    const perK = num(perKwacha), thr = num(threshold);
    const preview = Number.isFinite(perK) && Number.isFinite(thr) && perK > 0 ? `A customer spending K${Math.ceil(thr / perK).toLocaleString('en-US')} earns ${thr.toLocaleString('en-US')} points — enough for a reward.` : null;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Customer rewards" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={styles.lead}>Customers of {organizationName || 'your business'} earn points on what they buy and swap them for a reward you choose. It shows up under Menu → Rewards in their app.</Text>

                    <Text style={styles.sectionLabel}>VOUCHERS</Text>
                    <View style={styles.card}>
                        <View style={styles.cardHead}><TicketCheck size={18} color={colors.blue} /><Text style={styles.cardTitle}>A customer shows a reward code</Text></View>
                        <TextInput
                            value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={14}
                            placeholder="RW-XXXXXX" placeholderTextColor={colors.textFaint} style={styles.codeInput} onSubmitEditing={confirmUse} returnKeyType="done"
                        />
                        <Pressable onPress={confirmUse} disabled={use.isPending} style={({ pressed }) => [styles.btn, (pressed || use.isPending) && { opacity: 0.8 }]}>
                            {use.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>Mark as used</Text>}
                        </Pressable>
                        {!!lastUsed && <Text style={styles.ok}>✓ Used: {lastUsed}</Text>}
                    </View>

                    <Text style={[styles.sectionLabel, { marginTop: 24 }]}>REWARD RULES</Text>
                    <View style={styles.card}>
                        {isLoading ? (
                            <ActivityIndicator color={colors.blue} style={{ paddingVertical: 24 }} />
                        ) : isError || !data ? (
                            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 18 }}>
                                <Text style={styles.muted}>We couldn’t load your rules.</Text>
                                <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                            </View>
                        ) : (
                            <>
                                <View style={styles.cardHead}>
                                    <Gift size={18} color={colors.blue} />
                                    <Text style={[styles.cardTitle, { flex: 1 }]}>Run a rewards programme</Text>
                                    <Switch value={enabled} onValueChange={setEnabled} disabled={!isAdmin} trackColor={{ true: colors.blue }} />
                                </View>
                                <Field label="Points earned for every K1 spent" value={perKwacha} onChange={setPerKwacha} keyboard="decimal-pad" editable={isAdmin} />
                                <Field label="Points needed for a reward" value={threshold} onChange={setThreshold} keyboard="number-pad" editable={isAdmin} />
                                <Field label="What the reward is" value={title} onChange={setTitle} editable={isAdmin} placeholder="e.g. K25 off your next purchase" />
                                <Field label="Reward worth (K)" value={value} onChange={setValue} keyboard="decimal-pad" editable={isAdmin} />
                                <Field label="Points when a friend a customer invited pays you" value={invite} onChange={setInvite} keyboard="number-pad" editable={isAdmin} />
                                {!!preview && <Text style={styles.preview}>{preview}</Text>}
                                {isAdmin ? (
                                    <Pressable onPress={() => save.mutate()} disabled={!dirty || save.isPending} style={({ pressed }) => [styles.btn, (!dirty || save.isPending) && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
                                        {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>Save rules</Text>}
                                    </Pressable>
                                ) : (
                                    <Text style={styles.muted}>Only an admin can change the rules.</Text>
                                )}
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; keyboard?: 'decimal-pad' | 'number-pad'; editable: boolean; placeholder?: string }> = ({ label, value, onChange, keyboard, editable, placeholder }) => (
    <View style={{ marginTop: 14 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} editable={editable} placeholder={placeholder} placeholderTextColor={colors.textFaint} style={[styles.input, !editable && { opacity: 0.6 }]} />
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    scroll: { padding: 20, paddingBottom: 80 },
    lead: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 20 },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 1, marginBottom: 8 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.text },
    fieldLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
    codeInput: { marginTop: 14, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, textAlign: 'center', letterSpacing: 3 },
    preview: { fontFamily: fonts.body, fontSize: 12, color: colors.blue, backgroundColor: colors.tabActiveBg, borderRadius: radius.sm, padding: 10, marginTop: 16, lineHeight: 17 },
    btn: { marginTop: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.blue },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: '#FFFFFF' },
    ok: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.positiveInk, marginTop: 12, textAlign: 'center' },
    muted: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, marginTop: 14, textAlign: 'center' },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
