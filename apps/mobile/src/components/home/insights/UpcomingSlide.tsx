import { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { scheduleService, formatKwacha, type ScheduledItem } from 'core';
import { useAuth } from '../../../context/AuthContext';
import { colors, fonts } from '../../../theme/tokens';
import { slideStyles } from './shared';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function when(due: string, today: string): string {
    const days = Math.round((Date.parse(`${due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000);
    if (days < 0) return `${-days}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `In ${days} days`;
    return new Date(`${due}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Slide 4 — Coming up: a week strip with a dot on each day something is due, then the next scheduled payments. */
export const UpcomingSlide: React.FC = () => {
    const { organizationId } = useAuth();
    const { data, isLoading, isError } = useQuery({ queryKey: ['schedules', organizationId, 'ALL'], queryFn: () => scheduleService.getAll('ALL'), enabled: !!organizationId });

    const { week, upcoming, today } = useMemo(() => {
        const now = new Date();
        const todayStr = ymd(now);
        const items: ScheduledItem[] = (Array.isArray(data) ? data : []).filter((i) => i.status === 'ACTIVE').sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
        const dueOn = new Set(items.map((i) => i.next_due_date));
        const days = Array.from({ length: 7 }, (_, n) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return { key: ymd(d), letter: DAY[d.getDay()], num: d.getDate(), has: dueOn.has(ymd(d)), isToday: n === 0 }; });
        return { week: days, upcoming: items.slice(0, 2), today: todayStr };
    }, [data]);

    if (isLoading) return <View style={slideStyles.centre}><ActivityIndicator color={colors.blue} /></View>;
    if (isError) return <View style={slideStyles.centre}><Text style={slideStyles.empty}>Couldn’t load your schedule.</Text></View>;
    if (upcoming.length === 0) {
        return (
            <View style={slideStyles.centre}>
                <Text style={slideStyles.emptyTitle}>Nothing scheduled</Text>
                <Text style={slideStyles.empty}>Add bills, subscriptions or repayments and they’ll show up here before they’re due.</Text>
            </View>
        );
    }

    return (
        <View style={{ gap: 12 }}>
            <View style={styles.week}>
                {week.map((d) => (
                    <View key={d.key} style={[styles.day, d.isToday && styles.dayToday]}>
                        <Text style={[styles.dayLetter, d.isToday && { color: '#FFFFFF' }]}>{d.letter}</Text>
                        <Text style={[styles.dayNum, d.isToday && { color: '#FFFFFF' }]}>{d.num}</Text>
                        <View style={[styles.dot, d.has && (d.isToday ? { backgroundColor: '#FFFFFF' } : { backgroundColor: colors.blue })]} />
                    </View>
                ))}
            </View>
            {upcoming.map((i) => (
                <View key={i.id} style={styles.row}>
                    <Text style={styles.title} numberOfLines={1}>{i.title}</Text>
                    <Text style={[styles.when, i.next_due_date < today && { color: colors.danger }]}>{when(i.next_due_date, today)}</Text>
                    <Text style={styles.amount} numberOfLines={1}>{formatKwacha(Number(i.amount))}</Text>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    week: { flexDirection: 'row', justifyContent: 'space-between' },
    day: { width: 36, alignItems: 'center', paddingVertical: 6, borderRadius: 14, gap: 2 },
    dayToday: { backgroundColor: colors.blue },
    dayLetter: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    dayNum: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#000000' },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000' },
    when: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    amount: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#000000', minWidth: 70, textAlign: 'right' },
});
