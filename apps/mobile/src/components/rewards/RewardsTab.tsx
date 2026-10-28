import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { rewardsService, type RewardsOverview } from 'core';
import { RewardsActionBar, RewardCardRow } from './RewardsUI';
import { InviteSheet, RedeemSheet } from './RewardsSheets';
import { colors, fonts, radius } from '../../theme/tokens';

export const REWARDS_OVERVIEW_KEY = ['rewards', 'overview'] as const;

/** Menu → Rewards: Redeem / Invite, then every programme the person is in (MoneyWise first, then each business). */
export const RewardsTab: React.FC = () => {
    const router = useRouter();
    const [sheet, setSheet] = useState<'redeem' | 'invite' | null>(null);
    const { data, isLoading, isError, refetch } = useQuery<RewardsOverview>({ queryKey: REWARDS_OVERVIEW_KEY, queryFn: () => rewardsService.overview(), staleTime: 30_000 });

    const open = (scope: string) => router.push({ pathname: '/rewards/[scope]', params: { scope } });
    const cards = data ? [data.platform, ...data.businesses] : [];

    return (
        <View style={{ gap: 14 }}>
            <RewardsActionBar onRedeem={() => setSheet('redeem')} onInvite={() => setSheet('invite')} />

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Rewards</Text>
                {isLoading ? (
                    <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
                ) : isError ? (
                    <View style={styles.centre}>
                        <Text style={styles.muted}>We couldn’t load your rewards.</Text>
                        <Pressable onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
                    </View>
                ) : (
                    <View style={{ gap: 14 }}>
                        {cards.map((c) => <RewardCardRow key={c.id} card={c} onPress={() => open(c.id)} />)}
                        {data && data.businesses.length === 0 && (
                            <Text style={styles.hint}>Buy from businesses on MoneyWise and they’ll appear here, each with its own points and rewards.</Text>
                        )}
                    </View>
                )}
            </View>

            <InviteSheet visible={sheet === 'invite'} scope="moneywise" onClose={() => setSheet(null)} />
            <RedeemSheet visible={sheet === 'redeem'} onClose={() => setSheet(null)} />
        </View>
    );
};

const styles = StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, minHeight: 160 },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#171717', marginBottom: 14 },
    centre: { alignItems: 'center', gap: 12, paddingVertical: 28 },
    muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textFaint, lineHeight: 18, marginTop: 4 },
    retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.blue },
    retryText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
