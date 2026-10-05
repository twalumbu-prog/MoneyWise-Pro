import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, X, ChevronRight, BadgeCheck } from 'lucide-react-native';
import { useInvestProviders } from '../../src/hooks/useInvestProviders';
import { useInvestorAccounts } from '../../src/hooks/useInvestorAccounts';
import { InvestApplicationsBanner } from '../../src/components/invest/InvestApplicationsBanner';
import { InvestLogo } from '../../src/components/invest/InvestLogo';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Invest from the Inbox "+" menu: choose a partner, then carry on in exactly the same flow as
 * Menu → Invest (company page → product details → Invest, with the account check and the real
 * payment). It lists the same providers as the Invest page — one source (useInvestProviders) —
 * so the two entry points can't drift apart.
 */
export default function NewInvestPartnerScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const providers = useInvestProviders();
    const { accounts, accountFor } = useInvestorAccounts();

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
                <Pressable onPress={() => router.back()} hitSlop={10}><ArrowLeft size={22} color={colors.text} /></Pressable>
                <Text style={styles.headerTitle}>Invest</Text>
                <Pressable onPress={() => router.back()} hitSlop={10}><X size={22} color={colors.textFaint} /></Pressable>
            </View>

            <FlatList
                data={providers}
                keyExtractor={(p) => p.id}
                contentContainerStyle={styles.list}
                ListHeaderComponent={
                    <View style={{ gap: 14, marginBottom: 6 }}>
                        <InvestApplicationsBanner accounts={accounts} />
                        <View>
                            <Text style={styles.title}>Choose a Partner</Text>
                            <Text style={styles.sub}>Select an investment provider to see their products.</Text>
                        </View>
                    </View>
                }
                renderItem={({ item: p }) => {
                    const account = accountFor(p.investmentTargetId);
                    const verified = account?.status === 'ACTIVE';
                    return (
                        <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/apps/invest/company/${p.id}`)}>
                            <InvestLogo logo={p.logo} size={48} />
                            <View style={{ flex: 1 }}>
                                <View style={styles.nameRow}>
                                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                                    {verified && <BadgeCheck size={16} color={colors.blue} accessibilityLabel="Verified account" />}
                                </View>
                                {verified && !!account?.accountNumber
                                    ? <Text style={styles.acct}>Account no. {account.accountNumber}</Text>
                                    : <Text style={styles.desc} numberOfLines={2}>{p.description}</Text>}
                            </View>
                            <ChevronRight size={18} color={colors.textFaint} />
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24,
        paddingBottom: 12,
    },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    list: { padding: 20, gap: 10, paddingBottom: 40 },
    title: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy },
    sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, flexShrink: 1 },
    desc: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
    acct: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
