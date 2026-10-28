import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react-native';
import { savingsService, formatKwacha, type SavingsItem } from 'core';
import { colors, fonts } from '../../../theme/tokens';
import { slideStyles } from './shared';

/** Slide 3 — Savings: progress bars for goals, wishlist items and savings groups (the ones with a target, closest to done first). */
export const SavingsSlide: React.FC = () => {
    // Same key as the Savings screen, so saving something there updates this slide.
    const { data, isLoading, isError } = useQuery({ queryKey: ['savings'], queryFn: () => savingsService.list() });

    const items = useMemo(() => {
        const all: SavingsItem[] = [...(data?.groups ?? []), ...(data?.goals ?? []), ...(data?.wishlist ?? [])];
        const withTarget = all.filter((i) => i.targetAmount && i.targetAmount > 0);
        return (withTarget.length ? withTarget : all).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).slice(0, 3);
    }, [data]);

    if (isLoading) return <View style={slideStyles.centre}><ActivityIndicator color={colors.blue} /></View>;
    if (isError) return <View style={slideStyles.centre}><Text style={slideStyles.empty}>Couldn’t load your savings.</Text></View>;
    if (items.length === 0) {
        return (
            <View style={slideStyles.centre}>
                <Text style={slideStyles.emptyTitle}>No savings yet</Text>
                <Text style={slideStyles.empty}>Start a goal or a group with friends and watch it fill up here.</Text>
            </View>
        );
    }

    return (
        <View style={{ gap: 12 }}>
            {items.map((i) => {
                const pct = Math.round((i.progress ?? 0) * 100);
                return (
                    <View key={i.id} style={{ gap: 5 }}>
                        <View style={styles.top}>
                            {i.kind === 'GROUP' && <Users size={13} color={colors.textMuted} />}
                            <Text style={styles.name} numberOfLines={1}>{i.name}</Text>
                            <Text style={styles.pct}>{i.targetAmount ? `${pct}%` : formatKwacha(i.balance)}</Text>
                        </View>
                        <View style={slideStyles.track}><View style={[slideStyles.fill, { width: `${Math.min(100, Math.max(0, pct))}%` }, pct >= 100 && { backgroundColor: colors.positive }]} /></View>
                        {!!i.targetAmount && <Text style={styles.sub}>{formatKwacha(i.balance)} of {formatKwacha(i.targetAmount)}</Text>}
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    pct: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#000000' },
    sub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
});
