import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * A month grid for picking a date by tapping it (weeks start on Monday). Past days can't be picked. Values are
 * 'YYYY-MM-DD' in the phone's local calendar, never UTC, so a date never shifts by a day.
 */
export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarPicker({ value, onChange, minDate }: { value: string | null; onChange: (iso: string) => void; minDate?: Date }) {
    const today = useMemo(() => { const t = minDate ?? new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }, [minDate]);
    const [view, setView] = useState(() => { const b = value ? fromIso(value) : today; return new Date(b.getFullYear(), b.getMonth(), 1); });

    const first = view;
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
    while (cells.length % 7) cells.push(null);

    const canPrev = first > new Date(today.getFullYear(), today.getMonth(), 1);
    const shift = (n: number) => setView(new Date(first.getFullYear(), first.getMonth() + n, 1));

    return (
        <View accessibilityLabel="Calendar">
            <View style={styles.head}>
                <Pressable onPress={() => shift(-1)} disabled={!canPrev} hitSlop={10} style={[styles.nav, !canPrev && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Previous month">
                    <ChevronLeft size={20} color={colors.text} />
                </Pressable>
                <Text style={styles.month} accessibilityRole="header">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
                <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.nav} accessibilityRole="button" accessibilityLabel="Next month">
                    <ChevronRight size={20} color={colors.text} />
                </Pressable>
            </View>
            <View style={styles.row}>{DOW.map((d, i) => <Text key={i} style={styles.dow}>{d}</Text>)}</View>
            <View style={styles.grid}>
                {cells.map((d, i) => {
                    if (!d) return <View key={i} style={styles.cell} />;
                    const iso = toIso(d);
                    const past = d < today;
                    const on = iso === value;
                    const isToday = iso === toIso(today);
                    return (
                        <Pressable
                            key={i} disabled={past} onPress={() => onChange(iso)} style={styles.cell}
                            accessibilityRole="button" accessibilityState={{ selected: on, disabled: past }}
                            accessibilityLabel={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                        >
                            <View style={[styles.day, on && styles.dayOn, !on && isToday && styles.dayToday]}>
                                <Text style={[styles.dayText, past && { color: colors.borderStrong }, on && { color: '#FFFFFF', fontFamily: fonts.bodyBold }]}>{d.getDate()}</Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chipActiveBg },
    month: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    row: { flexDirection: 'row' },
    dow: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint, paddingVertical: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
    day: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    dayOn: { backgroundColor: colors.blue },
    dayToday: { borderWidth: 1.5, borderColor: colors.blue },
    dayText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
