import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Plus, CreditCard, Share2, Target, Gift, Users } from 'lucide-react-native';
import { savingsService } from 'core';
import type { SavingsItem, SavingsKind } from 'core';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { SavingsBalanceCard, SavingsProgress, MemberAvatars, SectionTitle } from '../../src/components/savings/SavingsUI';
import { CreateSavingsSheet, AddMoneySheet, TransferOutSheet, JoinGroupSheet, shareInvite } from '../../src/components/savings/SavingsSheets';
import { PiggyBankIcon } from '../../src/components/icons/PiggyBankIcon';
import { colors, fonts, radius } from '../../src/theme/tokens';

type Tab = 'WISHLIST' | 'GOAL' | 'GROUP';
const TABS: { id: Tab; label: string; card: string; section: string }[] = [
    { id: 'WISHLIST', label: 'Wishlist', card: 'Wishlist', section: 'My Wishlist' },
    { id: 'GOAL', label: 'Savings', card: 'Savings', section: 'My Savings' },
    { id: 'GROUP', label: 'Group Savings', card: 'Group savings total', section: 'Group Savings' },
];


/**
 * Savings: Wishlist (things you're saving up for, with a picture), Savings (open goals) and
 * Group Savings (a shared pot others join and contribute to). Each item is its own wallet and
 * savings account, so the money is real and shows in Reporting.
 */
export default function SavingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState<Tab>('WISHLIST');
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [addFor, setAddFor] = useState<SavingsItem | null>(null);
    const [transferFor, setTransferFor] = useState<SavingsItem | null>(null);

    const { data, isPending, refetch, isRefetching } = useQuery({ queryKey: ['savings'], queryFn: () => savingsService.list() });

    const current = TABS.find((t) => t.id === tab)!;
    const items = tab === 'WISHLIST' ? data?.wishlist ?? [] : tab === 'GOAL' ? data?.goals ?? [] : data?.groups ?? [];
    const total = tab === 'WISHLIST' ? data?.totals.wishlist ?? 0 : tab === 'GOAL' ? data?.totals.goals ?? 0 : data?.totals.groups ?? 0;
    const open = (item: SavingsItem) => router.push(`/savings/${item.id}`);

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" style={styles.headerSide}>
                    <ChevronLeft size={24} color="#000000" />
                </Pressable>
                <Text style={styles.headerTitle}>Savings</Text>
                <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
                    <Pressable onPress={() => setCreateOpen(true)} hitSlop={12} accessibilityLabel={`Add ${current.label}`}>
                        <Plus size={26} color={colors.blue} strokeWidth={2.5} />
                    </Pressable>
                </View>
            </View>

            <AnimatedSegmented
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                trackStyle={styles.tabs}
                indicatorStyle={styles.tabIndicator}
                itemStyle={styles.tabItem}
                items={TABS.map((t) => ({
                    value: t.id,
                    content: <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]} numberOfLines={1}>{t.label}</Text>,
                }))}
            />

            <ScrollView
                // flexGrow lets the white list card stretch down to just above the bottom edge on every tab,
                // and still scroll when there are more items than fit.
                contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 12) + 4 }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.blue} />}
            >
                <AnimatedTabContent tabKey={tab} index={TABS.findIndex((t) => t.id === tab)} style={{ flexGrow: 1 }}>
                    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
                        <SavingsBalanceCard label={current.card} amount={total} />
                    </View>

                    <View style={styles.sectionRow}>
                        <SectionTitle title={current.section} />
                        {tab === 'GROUP' && (
                            <Pressable onPress={() => setJoinOpen(true)} hitSlop={8} style={styles.joinLink}>
                                <Text style={styles.joinLinkText}>Join with code</Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={styles.listCard}>
                        {isPending ? (
                            <ActivityIndicator color={colors.blue} style={{ marginVertical: 40 }} />
                        ) : items.length === 0 ? (
                            <EmptyState kind={tab} onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
                        ) : (
                            items.map((item, i) => (
                                <View key={item.id} style={i > 0 && styles.divider}>
                                    {tab === 'GROUP'
                                        ? <GroupRow item={item} onOpen={() => open(item)} onAdd={() => setAddFor(item)} onTransfer={() => setTransferFor(item)} />
                                        : <ItemRow item={item} onOpen={() => open(item)} onAdd={() => setAddFor(item)} />}
                                </View>
                            ))
                        )}
                    </View>
                </AnimatedTabContent>
            </ScrollView>

            <CreateSavingsSheet visible={createOpen} kind={tab as SavingsKind} onClose={() => setCreateOpen(false)} onCreated={() => setCreateOpen(false)} />
            <JoinGroupSheet visible={joinOpen} onClose={() => setJoinOpen(false)} onJoined={(id) => { setJoinOpen(false); router.push(`/savings/${id}`); }} />
            <AddMoneySheet visible={!!addFor} item={addFor} onClose={() => setAddFor(null)} onDone={() => setAddFor(null)} />
            <TransferOutSheet visible={!!transferFor} item={transferFor} onClose={() => setTransferFor(null)} onDone={() => setTransferFor(null)} />
        </View>
    );
}

/** Wishlist and savings-goal row: picture (or piggy bank), name, target, progress, "+". */
const ItemRow: React.FC<{ item: SavingsItem; onOpen: () => void; onAdd: () => void }> = ({ item, onOpen, onAdd }) => (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}>
        <View style={styles.thumb}>
            {item.imageUrl
                ? <Image source={{ uri: item.imageUrl }} style={styles.thumbImg} resizeMode="contain" />
                : item.kind === 'WISHLIST' ? <Gift size={28} color={colors.blue} /> : <PiggyBankIcon size={30} color={colors.blue} />}
        </View>
        <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemTarget}>{item.targetAmount ? `K ${item.targetAmount.toLocaleString('en-ZM', { minimumFractionDigits: 2 })}` : 'No target'}</Text>
            <SavingsProgress balance={item.balance} target={item.targetAmount} />
        </View>
        <Pressable onPress={onAdd} hitSlop={10} style={styles.addBtn} accessibilityLabel={`Add money to ${item.name}`}>
            <Plus size={22} color="#27272A" />
        </Pressable>
    </Pressable>
);

/** Group row: name + member avatars, progress, and the Add Money · Transfer · Invite bar. */
const GroupRow: React.FC<{ item: SavingsItem; onOpen: () => void; onAdd: () => void; onTransfer: () => void }> = ({ item, onOpen, onAdd, onTransfer }) => {
    const owner = item.role === 'OWNER';
    return (
        <View style={{ gap: 10 }}>
            <Pressable onPress={onOpen} style={({ pressed }) => [{ gap: 8 }, pressed && { opacity: 0.7 }]}>
                <View style={styles.groupHead}>
                    <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
                    <MemberAvatars count={Math.max(1, item.members.length)} />
                </View>
                <SavingsProgress balance={item.balance} target={item.targetAmount} />
            </Pressable>
            <View style={styles.actionBar}>
                <Action icon={<Plus size={16} color="#000" />} label="Add Money" onPress={onAdd} />
                <View style={styles.actionDivider} />
                <Action icon={<CreditCard size={14} color={owner ? '#000' : colors.textFaint} />} label="Transfer" onPress={onTransfer} disabled={!owner} />
                <View style={styles.actionDivider} />
                <Action icon={<Share2 size={14} color={owner ? '#000' : colors.textFaint} />} label="Invite" onPress={() => shareInvite(item)} disabled={!owner} />
            </View>
        </View>
    );
};

const Action: React.FC<{ icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }> = ({ icon, label, onPress, disabled }) => (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} accessibilityLabel={label}>
        {icon}
        <Text style={[styles.actionText, disabled && { color: colors.textFaint }]}>{label}</Text>
    </Pressable>
);

const EmptyState: React.FC<{ kind: Tab; onCreate: () => void; onJoin: () => void }> = ({ kind, onCreate, onJoin }) => {
    const copy = kind === 'WISHLIST'
        ? { icon: <Gift size={28} color={colors.blue} />, title: 'Nothing on your wishlist yet', text: 'Add something you want, with a picture, and save towards it bit by bit.', cta: 'Add an item' }
        : kind === 'GOAL'
            ? { icon: <Target size={28} color={colors.blue} />, title: 'No savings goals yet', text: 'Create a goal — an emergency fund, school fees — and move money into it.', cta: 'Create a goal' }
            : { icon: <Users size={28} color={colors.blue} />, title: 'No group savings yet', text: 'Start a shared pot and invite others to contribute, or join one with a code.', cta: 'Start a group' };
    return (
        <View style={styles.empty}>
            <View style={styles.emptyIcon}>{copy.icon}</View>
            <Text style={styles.emptyTitle}>{copy.title}</Text>
            <Text style={styles.emptyText}>{copy.text}</Text>
            <Pressable onPress={onCreate} style={[styles.emptyBtn, kind === 'GROUP' && styles.emptyBtnDark]}><Plus size={16} color="#FFFFFF" /><Text style={styles.emptyBtnText}>{copy.cta}</Text></Pressable>
            {kind === 'GROUP' && <Pressable onPress={onJoin} style={{ paddingVertical: 10 }}><Text style={styles.joinLinkText}>I have an invite code</Text></Pressable>}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 16, paddingVertical: 14 },
    headerSide: { flex: 1 },
    headerTitle: { fontFamily: fonts.display, fontSize: 24, color: '#000000', textAlign: 'center' },
    tabs: { flexDirection: 'row', marginHorizontal: 16, padding: 2, backgroundColor: '#F5F5F5', borderRadius: 80 },
    tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 10 },
    tabIndicator: {
        borderRadius: 80, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    tabText: { fontFamily: fonts.body, fontSize: 12, color: '#404040' },
    tabTextActive: { fontFamily: fonts.bodyBold, color: '#27272A' },
    sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: 24 },
    joinLink: { marginBottom: 8 },
    joinLinkText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    listCard: {
        marginHorizontal: 20, padding: 20, minHeight: 320, flexGrow: 1, backgroundColor: colors.surface, borderRadius: 20,
        borderWidth: 1, borderColor: colors.borderStrong,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 4 }, elevation: 2,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, marginTop: 18, paddingTop: 18 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    thumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    thumbImg: { width: 68, height: 68 },
    itemName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    itemTarget: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    addBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    groupName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
    actionBar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAF9', borderRadius: 10, borderWidth: 1, borderColor: colors.border,
        paddingVertical: 8, paddingHorizontal: 6,
    },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
    actionText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#000000' },
    actionDivider: { width: 1, height: 20, backgroundColor: '#D4D4D4' },
    empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 12, gap: 8 },
    emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, textAlign: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 20, height: 42, marginTop: 8 },
    emptyBtnDark: { backgroundColor: '#000000' },
    emptyBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
});
