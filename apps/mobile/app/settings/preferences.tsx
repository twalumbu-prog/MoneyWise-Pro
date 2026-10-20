import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Smartphone, Mail, Sparkles, Wallet, Landmark, Check } from 'lucide-react-native';
import { userService } from 'core';
import type { NotifyChannel, SalaryDestination, PreferencesResponse } from 'core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { InlineSearchSelect } from '../../src/components/InlineSearchSelect';
import { colors, fonts, radius } from '../../src/theme/tokens';

const DEFAULT_ID = '__default__';

/**
 * Settings → Preferences (personal accounts): where notifications arrive, which AI models do what, and — for people on an
 * employer's payroll — where the salary is paid. Every change saves immediately.
 */
export default function PreferencesScreen() {
    const qc = useQueryClient();
    const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['preferences'], queryFn: () => userService.getMyPreferences() });

    const save = useMutation({
        mutationFn: (patch: Parameters<typeof userService.updateMyPreferences>[0]) => userService.updateMyPreferences(patch),
        onMutate: async (patch) => {
            await qc.cancelQueries({ queryKey: ['preferences'] });
            const prev = qc.getQueryData<PreferencesResponse>(['preferences']);
            if (prev) {
                qc.setQueryData<PreferencesResponse>(['preferences'], {
                    ...prev,
                    preferences: {
                        notifications: { ...prev.preferences.notifications, ...patch.notifications } as any,
                        ai: { ...prev.preferences.ai, ...patch.ai },
                        payroll: { ...prev.preferences.payroll, ...patch.payroll } as any,
                    },
                });
            }
            return { prev };
        },
        onError: (e: Error, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['preferences'], ctx.prev); Alert.alert('Could not save', e.message); },
        onSettled: () => { void qc.invalidateQueries({ queryKey: ['preferences'] }); },
    });

    const p = data?.preferences;
    const channels: { id: NotifyChannel; label: string; sub: string; icon: React.ReactNode }[] = [
        { id: 'BOTH', label: 'App and email', sub: 'Get a push notification and an email', icon: <Bell size={18} color={colors.blue} /> },
        { id: 'APP', label: 'App only', sub: 'Push notifications on your phone, no emails', icon: <Smartphone size={18} color={colors.blue} /> },
        { id: 'EMAIL', label: 'Email only', sub: 'Emails only, no push notifications', icon: <Mail size={18} color={colors.blue} /> },
    ];

    const modelItems = (list: { id: string; label: string }[]) => [{ id: DEFAULT_ID, label: 'Automatic (recommended)' }, ...list.map((m) => ({ id: m.id, label: m.label }))];

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Preferences" />
            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : isError || !data || !p ? (
                <View style={styles.centre}>
                    <Text style={styles.muted}>We couldn’t load your preferences.</Text>
                    <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
                    <View style={styles.card}>
                        {channels.map((c, i) => (
                            <Choice key={c.id} icon={c.icon} label={c.label} sub={c.sub} selected={p.notifications.channel === c.id} border={i > 0}
                                onPress={() => save.mutate({ notifications: { channel: c.id } })} />
                        ))}
                    </View>
                    <Text style={styles.hint}>Applies to updates about your personal account — payments in, money sent and requests.</Text>

                    <Text style={[styles.sectionLabel, { marginTop: 24 }]}>AI MODELS</Text>
                    <View style={[styles.card, { padding: 16 }]}>
                        <View style={styles.aiHead}><Sparkles size={16} color={colors.blue} /><Text style={styles.aiTitle}>Assistant</Text></View>
                        <Text style={styles.aiSub}>The model the Assistant answers with by default.</Text>
                        <InlineSearchSelect
                            items={modelItems(data.options.assistantModels)} selectedId={p.ai.assistant_model ?? DEFAULT_ID}
                            placeholder="Automatic (recommended)" searchPlaceholder="Search models…" maxVisible={8}
                            onSelect={(i) => save.mutate({ ai: { assistant_model: i.id === DEFAULT_ID ? null : i.id } })}
                        />
                        <View style={[styles.aiHead, { marginTop: 18 }]}><Sparkles size={16} color={colors.blue} /><Text style={styles.aiTitle}>Categorising transactions</Text></View>
                        <Text style={styles.aiSub}>The model that sorts your payments into categories.</Text>
                        <InlineSearchSelect
                            items={modelItems(data.options.categorizationModels)} selectedId={p.ai.categorization_model ?? DEFAULT_ID}
                            placeholder="Automatic (recommended)" searchPlaceholder="Search models…" maxVisible={8}
                            onSelect={(i) => save.mutate({ ai: { categorization_model: i.id === DEFAULT_ID ? null : i.id } })}
                        />
                    </View>

                    {data.salary.available && (
                        <>
                            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>SALARY</Text>
                            <View style={styles.card}>
                                <Choice
                                    icon={<Wallet size={18} color={colors.blue} />} label="My MoneyWise personal account"
                                    sub={data.salary.personalAccount ? 'Paid straight into your wallet, instantly and free' : 'You need an active MoneyWise personal account first'}
                                    selected={p.payroll.destination === 'PERSONAL_WALLET'} disabled={!data.salary.personalAccount}
                                    onPress={() => save.mutate({ payroll: { destination: 'PERSONAL_WALLET' as SalaryDestination } })}
                                />
                                <Choice
                                    icon={<Landmark size={18} color={colors.blue} />} label="My bank or mobile money" border
                                    sub={data.salary.bankSummary ?? 'Add your details in My Profile so payroll can pay you'}
                                    selected={p.payroll.destination === 'BANK'}
                                    onPress={() => save.mutate({ payroll: { destination: 'BANK' as SalaryDestination } })}
                                />
                            </View>
                            <Text style={styles.hint}>
                                Where {data.salary.employers.length ? data.salary.employers.join(', ') : 'your employer'} pays your salary. Takes effect from the next payroll.
                            </Text>
                        </>
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const Choice: React.FC<{ icon: React.ReactNode; label: string; sub?: string; selected: boolean; border?: boolean; disabled?: boolean; onPress: () => void }> = ({ icon, label, sub, selected, border, disabled, onPress }) => (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.row, border && styles.rowBorder, disabled && { opacity: 0.45 }, pressed && { opacity: 0.6 }]} accessibilityRole="radio" accessibilityState={{ selected, disabled }}>
        {icon}
        <View style={styles.rowMain}>
            <Text style={styles.rowLabel}>{label}</Text>
            {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}</View>
    </Pressable>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    scroll: { padding: 20, paddingBottom: 48 },
    sectionLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6, color: colors.textMuted, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'visible' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
    rowMain: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    radioOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 8, marginLeft: 4, lineHeight: 17 },
    aiHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    aiTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    aiSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 3, marginBottom: 10 },
});
