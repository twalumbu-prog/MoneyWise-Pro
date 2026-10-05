import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Clock, CheckCircle2, AlertCircle, XCircle, Ban, BadgeCheck } from 'lucide-react-native';
import { INVESTOR_STATUS_LABEL } from 'core';
import type { MyInvestorAccount } from 'core';
import { useInvestorAccounts } from '../../../src/hooks/useInvestorAccounts';
import { useInvestProviders } from '../../../src/hooks/useInvestProviders';
import { InvestLogo } from '../../../src/components/invest/InvestLogo';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../src/theme/tokens';

const UI = {
    PENDING_REVIEW: { icon: Clock, tint: colors.tabActiveBg, ink: colors.blue },
    INFO_REQUESTED: { icon: AlertCircle, tint: '#FEF3C7', ink: colors.warn },
    ACTIVE: { icon: CheckCircle2, tint: '#ECFDF5', ink: colors.positiveInk },
    REJECTED: { icon: XCircle, tint: '#FEE2E2', ink: colors.danger },
    SUSPENDED: { icon: Ban, tint: '#FEE2E2', ink: colors.danger },
} as const;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** Every account and application you have with an investment company, with its current status. */
export default function InvestApplicationsScreen() {
    const router = useRouter();
    const providers = useInvestProviders();
    const { accounts, refetch, isPending } = useInvestorAccounts();

    const ordered = [...accounts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="My applications" />
            <FlatList
                data={ordered}
                keyExtractor={(a) => a.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={colors.blue} />}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>{isPending ? 'Loading…' : 'No applications yet'}</Text>
                        {!isPending && <Text style={styles.emptyText}>When you register or connect an account with an investment company, it shows up here.</Text>}
                    </View>
                }
                renderItem={({ item }) => <ApplicationCard account={item} onOpen={(path) => router.push(path as any)} providers={providers} />}
            />
        </View>
    );
}

const ApplicationCard: React.FC<{ account: MyInvestorAccount; providers: ReturnType<typeof useInvestProviders>; onOpen: (path: string) => void }> = ({ account, providers, onOpen }) => {
    const provider = providers.find((p) => p.investmentTargetId === account.targetId);
    const ui = UI[account.status];
    const Icon = ui.icon;
    const active = account.status === 'ACTIVE';

    return (
        <View style={styles.card}>
            <View style={styles.head}>
                {provider && <InvestLogo logo={provider.logo} size={40} />}
                <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{provider?.name ?? 'Investment company'}</Text>
                        {active && <BadgeCheck size={17} color={colors.blue} />}
                    </View>
                    {!!account.accountNumber && <Text style={styles.acct}>Account no. {account.accountNumber}</Text>}
                </View>
            </View>

            <View style={[styles.status, { backgroundColor: ui.tint }]}>
                <Icon size={16} color={ui.ink} />
                <Text style={[styles.statusText, { color: ui.ink }]}>{INVESTOR_STATUS_LABEL[account.status]}</Text>
            </View>

            <Text style={styles.meta}>
                {account.source === 'CONNECTED' ? 'Linked' : 'Applied'} {fmtDate(account.createdAt)}
                {account.updatedAt !== account.createdAt ? ` · Updated ${fmtDate(account.updatedAt)}` : ''}
            </Text>

            {!!account.reviewNote && (account.status === 'INFO_REQUESTED' || account.status === 'REJECTED' || account.status === 'SUSPENDED') && (
                <View style={styles.note}>
                    <Text style={styles.noteLabel}>Message from the company</Text>
                    <Text style={styles.noteText}>{account.reviewNote}</Text>
                </View>
            )}

            {account.status === 'PENDING_REVIEW' && (
                <Text style={styles.hint}>The company is reviewing your application. You'll be notified when it's decided.</Text>
            )}

            {(account.status === 'INFO_REQUESTED' || account.status === 'REJECTED') && (
                <Pressable style={styles.btn} onPress={() => onOpen(`/apps/invest/register/${account.targetId}`)}>
                    <Text style={styles.btnText}>{account.status === 'INFO_REQUESTED' ? 'Update application' : 'Apply again'}</Text>
                </Pressable>
            )}
            {active && provider && (
                <Pressable style={styles.btn} onPress={() => onOpen(`/apps/invest/company/${provider.id}`)}>
                    <Text style={styles.btnText}>Invest</Text>
                </Pressable>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    list: { padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 6 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, flexShrink: 1 },
    acct: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, height: 30, borderRadius: radius.pill },
    statusText: { fontFamily: fonts.bodyBold, fontSize: 12 },
    meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
    note: { padding: 12, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.borderStrong },
    noteLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    noteText: { fontFamily: fonts.body, fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 19 },
    btn: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
});
