import { useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, FlatList, Pressable, TextInput,
    ActivityIndicator, RefreshControl, NativeSyntheticEvent, NativeScrollEvent, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Search, ArrowUpDown, X, ArrowDownToLine, ArrowLeftRight, Link2, FileSpreadsheet, AlertCircle, Mail,
} from 'lucide-react-native';
import { cashbookService, lencoService, groupByDate, isRequestorRole, isPersonalOrgName, onboardingService } from 'core';
import type { CashbookEntry } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import {
    WalletCard, AddWalletCard, useCardWidth, CARD_GAP, CARD_HEIGHT,
} from '../../src/components/wallet/WalletCard';
import { TransactionRow } from '../../src/components/wallet/TransactionRow';
import { OfflineNotice } from '../../src/components/OfflineNotice';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { PiggyBankIcon } from '../../src/components/icons/PiggyBankIcon';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Group = 'MONEYWISE' | 'EXTERNAL';

export default function WalletScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { userRole, organizationName, organizationId, userName } = useAuth();
    // Personal workspaces are one person's money, so the card names the person ("Stephen Kapambwe"),
    // not the auto-generated "Stephen's Workspace"; business cards keep the organisation's name.
    const cardHolder = isPersonalOrgName(organizationName)
        ? (userName?.trim() || (organizationName || '').replace(/['’]s\s+(workspace|personal.*)$/i, '').trim() || organizationName)
        : organizationName;
    const isRequestor = isRequestorRole(userRole);
    const cardWidth = useCardWidth();

    const [group, setGroup] = useState<Group>('MONEYWISE');
    const [slide, setSlide] = useState(0);
    const [search, setSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const carousel = useRef<ScrollView>(null);

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['cashbook-entries', 'overview', organizationId],
        queryFn: () => cashbookService.getOverview(),
        enabled: !!organizationId,
    });

    // Pull-to-refresh pulls from Lenco, not just our cache: first book any paid-but-PENDING
    // deposits straight from Lenco (fast, by reference), then run this org's full Lenco sync
    // in the background (it can take a while) and refresh again when it lands.
    const qc = useQueryClient();
    const [syncing, setSyncing] = useState(false);
    const syncWithLenco = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            await cashbookService.settlePending().catch(() => undefined);
            await refetch();
        } finally {
            setSyncing(false);
        }
        lencoService.syncNow()
            .then(() => { void refetch(); qc.invalidateQueries({ queryKey: ['cashbook-entries'] }); })
            .catch(() => undefined);
    };

    const { data: walletStatus } = useQuery({
        queryKey: ['wallet-status', organizationId],
        queryFn: () => onboardingService.getWalletStatus(),
        enabled: !!organizationId,
    });

    const wallets: any[] = data?.wallets ?? [];
    const externalBalances: Record<string, number> = data?.externalBalances ?? {};
    const externalAccounts = data?.additionalExternalAccounts ?? [];
    const entries: CashbookEntry[] = data?.entries ?? [];

    const cards = useMemo(() => {
        if (group === 'MONEYWISE') {
            if (wallets.length === 0) {
                // Requestors never create wallets, so they see the org's single
                // main wallet as a zeroed card rather than an empty rail.
                return isRequestor
                    ? [{ id: 'main', name: 'Main Wallet', balance: data?.balance ?? 0 }]
                    : [];
            }
            return wallets.map((w: any) => ({
                id: String(w.id),
                name: w.name ?? 'Wallet',
                balance: Number(w.balance ?? 0),
            }));
        }
        return externalAccounts.map((a) => ({
            id: a.id,
            name: a.name,
            balance: externalBalances[a.id] ?? 0,
        }));
    }, [group, wallets, externalAccounts, externalBalances, isRequestor, data?.balance]);

    // The trailing add-card is a slide too, in whichever group it appears.
    const slideCount = cards.length + (isRequestor ? 0 : 1);

    const sections = useMemo(() => {
        const q = search.trim().toLowerCase();
        // Each card shows only ITS OWN transactions, like the web wallet page (which asks the
        // server for one wallet / account at a time). Without this every wallet's activity —
        // including savings pots — piled into the main wallet's list and the totals didn't add up.
        const card = cards[Math.min(slide, Math.max(cards.length - 1, 0))];
        const inCard = (e: CashbookEntry) => {
            if (group === 'MONEYWISE') {
                if (e.account_type !== 'MONEYWISE_WALLET') return false;
                return !card || card.id === 'main' || String((e as any).wallet_id ?? '') === card.id;
            }
            return !card || e.account_type === card.id;
        };
        const filtered = entries.filter((e) =>
            inCard(e) && (
                !q ||
                e.description?.toLowerCase().includes(q) ||
                e.reference_number?.toLowerCase().includes(q)),
        );
        return groupByDate(filtered, (e) => e.date, sortOrder);
    }, [entries, cards, slide, group, search, sortOrder]);

    const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP));
        if (i !== slide) setSlide(i);
    };

    const goToSlide = (i: number) => {
        carousel.current?.scrollTo({ x: i * (cardWidth + CARD_GAP), animated: true });
        setSlide(i);
    };

    const isInactiveWallet = group === 'MONEYWISE' && walletStatus && !walletStatus.activated;

    return (
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
            <FlatList
                data={sections}
                keyExtractor={(s) => s.dateKey}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={syncing || isRefetching}
                        onRefresh={() => { void syncWithLenco(); }}
                        tintColor={colors.blue}
                    />
                }
                ListHeaderComponent={
                    <View>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, { paddingHorizontal: 0, marginBottom: 0 }]}>Wallet</Text>
                            <Pressable style={({ pressed }) => [styles.savingsBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('/savings')} accessibilityLabel="Savings">
                                <PiggyBankIcon size={19} color={colors.blue} />
                                <Text style={styles.savingsText}>Savings</Text>
                            </Pressable>
                        </View>

                        <AnimatedSegmented
                            value={group}
                            onChange={(v) => { const g = v as Group; setGroup(g); setSlide(0); goToSlide(0); }}
                            trackStyle={styles.segment}
                            indicatorStyle={styles.segmentIndicator}
                            itemStyle={styles.segmentBtn}
                            items={(['MONEYWISE', 'EXTERNAL'] as Group[]).map((g) => ({
                                value: g,
                                content: (
                                    <Text style={[styles.segmentText, group === g && styles.segmentTextActive]}>
                                        {g === 'MONEYWISE' ? 'Main Wallets' : 'External Accounts'}
                                    </Text>
                                ),
                            }))}
                        />

                        <AnimatedTabContent tabKey={group} index={group === 'EXTERNAL' ? 1 : 0}>
                                {isLoading ? (
                                    <View style={[styles.cardSkeleton, { width: cardWidth }]}>
                                        <ActivityIndicator color={colors.blue} />
                                    </View>
                                ) : (
                                    <ScrollView
                                        ref={carousel}
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        snapToInterval={cardWidth + CARD_GAP}
                                        decelerationRate="fast"
                                        onScroll={onCarouselScroll}
                                        scrollEventThrottle={16}
                                        contentContainerStyle={styles.carousel}
                                    >
                                        {cards.map((c) => (
                                            <WalletCard
                                                key={c.id}
                                                name={c.name}
                                                balance={c.balance}
                                                organizationName={cardHolder}
                                                dots={slideCount > 1 ? { count: slideCount, active: slide, onSelect: goToSlide } : undefined}
                                            />
                                        ))}
                                        {group === 'MONEYWISE' && !isRequestor && (
                                            <AddWalletCard
                                                label={wallets.length === 0 ? 'Add Wallet' : 'Add Subwallet'}
                                                onPress={() => router.push('/wallet/new?kind=MONEYWISE')}
                                            />
                                        )}
                                        {group === 'EXTERNAL' && !isRequestor && (
                                            <AddWalletCard label="Add External Account" onPress={() => router.push('/wallet/new?kind=EXTERNAL')} />
                                        )}
                                    </ScrollView>
                                )}

                                {!isRequestor && group === 'MONEYWISE' && (
                                    <View style={styles.actionBar}>
                                        <Action icon={ArrowDownToLine} label="Deposit" onPress={() => router.push('/wallet/deposit')} />
                                        <View style={styles.actionDivider} />
                                        <Action icon={ArrowLeftRight} label="Transfer" onPress={() => router.push('/wallet/transfer')} />
                                        <View style={styles.actionDivider} />
                                        <Action
                                            icon={Link2}
                                            label="Pay Link"
                                            onPress={() => {
                                                const card = cards[Math.min(slide, cards.length - 1)];
                                                router.push({
                                                    pathname: '/wallet/pay-link',
                                                    params: { walletId: card?.id ?? '', walletName: card?.name ?? '' },
                                                });
                                            }}
                                        />
                                    </View>
                                )}

                                {!isRequestor && group === 'EXTERNAL' && cards.length > 0 && (
                                    <View style={styles.actionBar}>
                                        <Action
                                            icon={ArrowLeftRight}
                                            label="Transfer"
                                            onPress={() => router.push('/wallet/lenco-transfer')}
                                        />
                                        <View style={styles.actionDivider} />
                                        <Action
                                            icon={FileSpreadsheet}
                                            label="Import statement"
                                            onPress={() => {
                                                const card = cards[Math.min(slide, cards.length - 1)];
                                                router.push({
                                                    pathname: '/wallet/import',
                                                    params: { walletId: card.id, walletName: card.name },
                                                });
                                            }}
                                        />
                                    </View>
                                )}
                            </AnimatedTabContent>

                        <View style={styles.txHeader}>
                            {searchOpen ? (
                                <View style={styles.searchRow}>
                                    <Pressable onPress={() => { setSearchOpen(false); setSearch(''); }} hitSlop={10}>
                                        <X size={19} color={colors.textMuted} />
                                    </Pressable>
                                    <TextInput
                                        autoFocus
                                        style={styles.searchInput}
                                        value={search}
                                        onChangeText={setSearch}
                                        placeholder="Search transactions…"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.txTitle}>Transactions</Text>
                                    <View style={styles.txActions}>
                                        <Pressable onPress={() => setSearchOpen(true)} hitSlop={8} accessibilityLabel="Search transactions">
                                            <Search size={19} color={colors.textMuted} />
                                        </Pressable>
                                        <Pressable
                                            onPress={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                                            hitSlop={8}
                                            accessibilityLabel="Toggle sort order"
                                        >
                                            <ArrowUpDown size={19} color={sortOrder === 'asc' ? colors.blue : colors.textMuted} />
                                        </Pressable>
                                    </View>
                                </>
                            )}
                        </View>

                        {isError && !!data && <OfflineNotice style={{ marginHorizontal: 0 }} />}
                        {isError && !data && (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorTitle}>Couldn’t load the ledger</Text>
                                <Text style={styles.errorBody}>{(error as Error)?.message}</Text>
                            </View>
                        )}
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.dayBlock}>
                        <Text style={styles.dayLabel}>{item.dateLabel}</Text>
                        <View style={styles.dayCard}>
                            {item.items.map((e, i) => (
                                <View key={e.id}>
                                    <TransactionRow entry={e} onPress={() => router.push(`/wallet/entry/${e.id}`)} />
                                    {i < item.items.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    !isLoading && (!isError || !!data) ? (
                        isInactiveWallet ? (
                            <View style={styles.inactiveCard}>
                                <View style={styles.inactiveIconBox}>
                                    <AlertCircle size={24} color="#D97706" />
                                </View>
                                <View style={styles.inactiveInfo}>
                                    <Text style={styles.inactiveTitle}>Your Wallet is Inactive</Text>
                                    <Text style={styles.inactiveSub}>
                                        {walletStatus?.poolAvailable || walletStatus?.linked
                                            ? 'You skipped wallet activation during setup. Activate your wallet now to complete account setup and start receiving payments.'
                                            : 'An account has not been provisioned for your organization yet. Contact our team to have your wallet provisioned.'}
                                    </Text>
                                </View>
                                {walletStatus?.poolAvailable || walletStatus?.linked ? (
                                    <Pressable
                                        style={({ pressed }) => [styles.activateBtn, { opacity: pressed ? 0.85 : 1 }]}
                                        onPress={() => router.push('/onboarding')}
                                    >
                                        <Text style={styles.activateBtnText}>Activate Now →</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        style={({ pressed }) => [styles.contactBtn, { opacity: pressed ? 0.85 : 1 }]}
                                        onPress={() => Linking.openURL(`mailto:masterfees101@gmail.com?subject=Wallet%20Activation%20Request%20-%20${encodeURIComponent(organizationName || 'My Business')}`)}
                                    >
                                        <Mail size={14} color="#FFFFFF" />
                                        <Text style={styles.contactBtnText}>Contact Team</Text>
                                    </Pressable>
                                )}
                            </View>
                        ) : (
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>
                                    {search ? 'No transactions match that search.' : 'No transactions yet.'}
                                </Text>
                            </View>
                        )
                    ) : undefined
                }
            />
        </View>
    );
}

const Action: React.FC<{ icon: any; label: string; onPress: () => void }> = ({ icon: Icon, label, onPress }) => (
    <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
    >
        <Icon size={16} color="#000000" strokeWidth={1.5} />
        <Text style={styles.actionText}>{label}</Text>
    </Pressable>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    list: { paddingBottom: 120 },
    title: { fontFamily: fonts.display, fontSize: 30, color: '#000000', paddingHorizontal: 20, marginBottom: 14 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
    savingsBtn: {
        height: 40, paddingLeft: 12, paddingRight: 16, borderRadius: 20, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 7,
    },
    savingsText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#000000' },
    segment: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 18, padding: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    carousel: { paddingHorizontal: 20, gap: CARD_GAP },
    cardSkeleton: {
        height: CARD_HEIGHT, marginHorizontal: 20, borderRadius: 18,
        backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    actionBar: {
        flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 18,
        backgroundColor: colors.surface, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 15, paddingHorizontal: 10,
    },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    actionText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    actionDivider: { width: 1, height: 20, backgroundColor: colors.borderStrong },
    txHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8, minHeight: 62,
    },
    txTitle: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.text },
    txActions: { flexDirection: 'row', gap: 18 },
    searchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    searchInput: {
        flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text,
        backgroundColor: colors.surface, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 9,
        borderWidth: 1, borderColor: colors.border,
    },
    dayBlock: { paddingHorizontal: 20, marginBottom: 12 },
    dayLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#000000', paddingHorizontal: 6, marginBottom: 8 },
    dayCard: {
        backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 16,
        borderWidth: 1, borderColor: colors.border,
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    empty: { paddingVertical: 56, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    errorCard: {
        marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: radius.md,
        padding: 16, borderWidth: 1, borderColor: colors.danger,
    },
    errorTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
    errorBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
    inactiveCard: {
        marginHorizontal: 20,
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#FFFBEB',
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: '#FDE68A',
        gap: 12,
    },
    inactiveIconBox: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inactiveInfo: {
        gap: 4,
    },
    inactiveTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: colors.navy,
    },
    inactiveSub: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
    },
    activateBtn: {
        backgroundColor: colors.blue,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },
    activateBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: '#FFFFFF',
    },
    contactBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.navy,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        alignSelf: 'flex-start',
    },
    contactBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: '#FFFFFF',
    },
});
