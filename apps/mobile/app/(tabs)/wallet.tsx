import { useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, FlatList, Pressable, TextInput,
    ActivityIndicator, RefreshControl, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
    Search, ArrowUpDown, X, ArrowDownToLine, ArrowLeftRight, Link2, FileSpreadsheet,
} from 'lucide-react-native';
import { cashbookService, groupByDate, isRequestorRole } from 'core';
import type { CashbookEntry } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import {
    WalletCard, AddWalletCard, useCardWidth, CARD_GAP,
} from '../../src/components/wallet/WalletCard';
import { TransactionRow } from '../../src/components/wallet/TransactionRow';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Group = 'MONEYWISE' | 'EXTERNAL';

export default function WalletScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { userRole, organizationName } = useAuth();
    const isRequestor = isRequestorRole(userRole);
    const cardWidth = useCardWidth();

    const [group, setGroup] = useState<Group>('MONEYWISE');
    const [slide, setSlide] = useState(0);
    const [search, setSearch] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const carousel = useRef<ScrollView>(null);

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['cashbook-entries', 'overview'],
        queryFn: () => cashbookService.getOverview(),
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
        const filtered = entries.filter((e) =>
            !q ||
            e.description?.toLowerCase().includes(q) ||
            e.reference_number?.toLowerCase().includes(q),
        );
        return groupByDate(filtered, (e) => e.date, sortOrder);
    }, [entries, search, sortOrder]);

    const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP));
        if (i !== slide) setSlide(i);
    };

    const goToSlide = (i: number) => {
        carousel.current?.scrollTo({ x: i * (cardWidth + CARD_GAP), animated: true });
        setSlide(i);
    };

    return (
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
            <FlatList
                data={sections}
                keyExtractor={(s) => s.dateKey}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={() => { void refetch(); }}
                        tintColor={colors.blue}
                    />
                }
                ListHeaderComponent={
                    <View>
                        <Text style={styles.title}>Wallet</Text>

                        <View style={styles.segment}>
                            {(['MONEYWISE', 'EXTERNAL'] as Group[]).map((g) => (
                                <Pressable
                                    key={g}
                                    onPress={() => { setGroup(g); setSlide(0); goToSlide(0); }}
                                    style={[styles.segmentBtn, group === g && styles.segmentBtnActive]}
                                >
                                    <Text style={[styles.segmentText, group === g && styles.segmentTextActive]}>
                                        {g === 'MONEYWISE' ? 'Main Wallets' : 'External Accounts'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

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
                                        organizationName={organizationName}
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

                        {slideCount > 1 && (
                            <View style={styles.dots}>
                                {Array.from({ length: slideCount }).map((_, i) => (
                                    <Pressable
                                        key={i}
                                        onPress={() => goToSlide(i)}
                                        hitSlop={6}
                                        accessibilityLabel={`Go to card ${i + 1}`}
                                        style={[styles.dot, i === slide && styles.dotActive]}
                                    />
                                ))}
                            </View>
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

                        {isError && (
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
                    !isLoading && !isError ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>
                                {search ? 'No transactions match that search.' : 'No transactions yet.'}
                            </Text>
                        </View>
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
    segment: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 18, padding: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentBtnActive: {
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    carousel: { paddingHorizontal: 20, gap: CARD_GAP },
    cardSkeleton: {
        height: 176, marginHorizontal: 20, borderRadius: 18,
        backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.15)' },
    dotActive: { backgroundColor: colors.navy, transform: [{ scale: 1.15 }] },
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
});
