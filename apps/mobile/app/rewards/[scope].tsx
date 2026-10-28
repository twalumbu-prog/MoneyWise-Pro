import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, ActionSheetIOS, Alert, Platform } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trophy, Award, Gift, Star, Medal } from 'lucide-react-native';
import { rewardsService, type RewardDetail } from 'core';
import { useGoBack } from '../../src/hooks/useGoBack';
import { AnimatedTabContent } from '../../src/components/AnimatedTabs';
import { SegmentedToggle, RewardsActionBar, ProgrammeLogo, ProgressBar, fmtPoints } from '../../src/components/rewards/RewardsUI';
import { InviteSheet, RedeemSheet, ReferralCodeSheet } from '../../src/components/rewards/RewardsSheets';
import { colors, fonts, radius } from '../../src/theme/tokens';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** One programme: how the points have built up, and the rewards and milestones earned along the way. */
export default function RewardDetailScreen() {
    const { scope } = useLocalSearchParams<{ scope: string }>();
    const safeBack = useGoBack();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState<'points' | 'achievements'>('points');
    const [sheet, setSheet] = useState<'redeem' | 'invite' | 'code' | null>(null);

    const { data, isLoading, isError, refetch, isRefetching } = useQuery<RewardDetail>({
        queryKey: ['rewards', 'detail', scope], queryFn: () => rewardsService.detail(String(scope)), enabled: !!scope, staleTime: 15_000,
    });

    const plus = () => {
        const options = ['Invite a friend', 'Enter a referral code', 'Cancel'];
        const pick = (i: number) => { if (i === 0) setSheet('invite'); else if (i === 1) setSheet('code'); };
        if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, pick);
        else Alert.alert('Rewards', undefined, [{ text: options[0], onPress: () => pick(0) }, { text: options[1], onPress: () => pick(1) }, { text: 'Cancel', style: 'cancel' }]);
    };

    const card = data?.card;

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
                <Pressable onPress={safeBack} hitSlop={12} style={styles.headerSide} accessibilityLabel="Back"><ArrowLeft size={22} color={colors.text} /></Pressable>
                <Text style={styles.headerTitle}>Rewards</Text>
                <Pressable onPress={plus} hitSlop={12} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="More"><Plus size={26} color="#2563EB" /></Pressable>
            </View>

            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}>
                {isLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : isError || !data || !card ? (
                    <View style={styles.centre}>
                        <Text style={styles.muted}>We couldn’t load these rewards.</Text>
                        <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                    </View>
                ) : (
                    <>
                        <View style={styles.profileCard}>
                            <ProgrammeLogo card={card} size={56} />
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
                                <Text style={styles.status}>{card.status.toUpperCase()}</Text>
                                <Text style={styles.balance}>{fmtPoints(card.balance)} points</Text>
                            </View>
                        </View>

                        {card.threshold ? (
                            <View style={{ gap: 6 }}>
                                <ProgressBar progress={card.progress} />
                                <View style={styles.foot}>
                                    <Text style={styles.footText}>{card.rewardReady ? `${card.rewardTitle} is ready` : `${fmtPoints(card.pointsToNext ?? 0)} points to ${card.rewardTitle}`}</Text>
                                    <Text style={styles.footText}>{Math.round(card.progress * 100)}%</Text>
                                </View>
                            </View>
                        ) : null}

                        <SegmentedToggle
                            value={tab} onChange={setTab}
                            options={[{ value: 'points', label: 'Points', icon: Trophy }, { value: 'achievements', label: 'Achievements', icon: Award }]}
                        />
                        <RewardsActionBar onRedeem={() => setSheet('redeem')} onInvite={() => setSheet('invite')} />

                        <AnimatedTabContent tabKey={tab} index={tab === 'achievements' ? 1 : 0}>
                        {tab === 'points' ? (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>{card.isPlatform ? 'Points activity' : 'Reward balance'}</Text>
                                {data.program && (
                                    <Text style={styles.rule}>
                                        Earn {data.program.pointsPerKwacha} point{data.program.pointsPerKwacha === 1 ? '' : 's'} for every K1 you spend · {fmtPoints(data.program.threshold)} points for {data.program.rewardTitle}
                                    </Text>
                                )}
                                {card.isPlatform && <Text style={styles.rule}>Earn points when a friend you invite joins MoneyWise and makes their first purchase.</Text>}
                                {data.points.length === 0 ? (
                                    <Text style={styles.empty}>{card.isPlatform ? 'Invite a friend to start earning.' : `Make a purchase at ${card.name} to start earning points.`}</Text>
                                ) : data.points.map((p) => (
                                    <View key={p.id} style={styles.line}>
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text style={styles.lineTitle} numberOfLines={2}>{p.description ?? (p.kind === 'PURCHASE' ? 'Purchase' : 'Points')}</Text>
                                            <Text style={styles.lineSub}>{day(p.at)}{p.amount ? ` · K${p.amount.toLocaleString('en-US')}` : ''}</Text>
                                        </View>
                                        <Text style={[styles.points, p.points < 0 && { color: colors.danger }]}>{p.points > 0 ? '+' : ''}{fmtPoints(p.points)}</Text>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Achievements</Text>
                                {data.achievements.length === 0 ? (
                                    <Text style={styles.empty}>Rewards you earn and redeem, and milestones you reach, will appear here.</Text>
                                ) : data.achievements.map((a) => {
                                    const Icon = a.kind === 'reward' ? Gift : a.kind === 'tier' ? Medal : Star;
                                    return (
                                        <View key={a.id} style={styles.line}>
                                            <View style={styles.badge}><Icon size={18} color={colors.blue} /></View>
                                            <View style={{ flex: 1, gap: 2 }}>
                                                <Text style={styles.lineTitle} numberOfLines={2}>{a.title}</Text>
                                                <Text style={styles.lineSub}>{a.description} · {day(a.at)}</Text>
                                                {!!a.code && <Text style={styles.code} selectable>{a.code}</Text>}
                                            </View>
                                            {a.kind === 'reward' && <Text style={[styles.pill, a.status === 'USED' && { color: colors.textMuted }]}>{a.status === 'USED' ? 'Redeemed' : a.status === 'ISSUED' ? 'Ready' : 'Cancelled'}</Text>}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                        </AnimatedTabContent>
                    </>
                )}
            </ScrollView>

            <InviteSheet visible={sheet === 'invite'} scope={String(scope)} onClose={() => setSheet(null)} />
            <RedeemSheet visible={sheet === 'redeem'} scope={String(scope)} onClose={() => { setSheet(null); void refetch(); }} />
            <ReferralCodeSheet visible={sheet === 'code'} onClose={() => { setSheet(null); void refetch(); }} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
    headerSide: { width: 44 },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 24, color: '#000000' },
    scroll: { paddingHorizontal: 20, gap: 14 },
    centre: { alignItems: 'center', gap: 12, paddingVertical: 60 },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    profileCard: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border },
    name: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#000000' },
    status: { fontFamily: fonts.body, fontSize: 12, color: '#71717A', letterSpacing: 0.4 },
    balance: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.blue },
    foot: { flexDirection: 'row', justifyContent: 'space-between' },
    footText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#737373' },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, minHeight: 200 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#171717', marginBottom: 8 },
    rule: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 10 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, lineHeight: 19, marginTop: 8 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    lineTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: '#000000' },
    lineSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    points: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.positiveInk },
    badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    code: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue, letterSpacing: 2, marginTop: 2 },
    pill: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
});
