import { useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
    RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Play } from 'lucide-react-native';
import {
    scheduleService, SCHEDULE_CATEGORIES, SCHEDULE_CADENCES,
    scheduleCategoryLabel, scheduleCadenceLabel, formatKwacha, formatShortDate,
} from 'core';
import type { ScheduledItem, ScheduleCategory, ScheduleCadence } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme/tokens';

export default function SchedulesScreen() {
    const qc = useQueryClient();
    const [category, setCategory] = useState<ScheduleCategory | 'ALL'>('ALL');
    const [addOpen, setAddOpen] = useState(false);

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['schedules', category],
        queryFn: () => scheduleService.getAll(category === 'ALL' ? undefined : category),
    });
    const items: ScheduledItem[] = data ?? [];

    const runNow = useMutation({
        mutationFn: (id: string) => scheduleService.runNow(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            Alert.alert('Started', 'A request has been raised for this item.');
        },
        onError: (e: Error) => Alert.alert('Could not run this now', e.message),
    });

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Schedules" right={
                <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityLabel="Add scheduled item">
                    <Plus size={22} color={colors.blue} />
                </Pressable>
            } />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
                {[{ value: 'ALL' as const, label: 'All' }, ...SCHEDULE_CATEGORIES].map((c) => (
                    <Pressable key={c.value} onPress={() => setCategory(c.value)} style={[styles.catChip, category === c.value && styles.catChipActive]}>
                        <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{c.label}</Text>
                    </Pressable>
                ))}
            </ScrollView>

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.blue} />}
                >
                    {items.map((item) => (
                        <View key={item.id} style={styles.card}>
                            <View style={styles.cardMain}>
                                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                                <Text style={styles.meta}>
                                    {scheduleCategoryLabel(item.category)} · {scheduleCadenceLabel(item.cadence)} · next {formatShortDate(item.next_due_date)}
                                </Text>
                            </View>
                            <Text style={styles.amount}>{formatKwacha(item.amount)}</Text>
                            <Pressable
                                style={styles.runBtn}
                                onPress={() => Alert.alert('Run now?', `Raise a request for "${item.title}" today.`, [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Run now', onPress: () => runNow.mutate(item.id) },
                                ])}
                                hitSlop={8}
                            >
                                <Play size={15} color={colors.blue} fill={colors.blue} />
                            </Pressable>
                        </View>
                    ))}
                    {items.length === 0 && (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No scheduled items{category !== 'ALL' ? ' in this category' : ''}.</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
                <NewScheduleForm onClose={() => setAddOpen(false)} />
            </Modal>
        </View>
    );
}

const NewScheduleForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<ScheduleCategory>('BILLS');
    const [cadence, setCadence] = useState<ScheduleCadence>('MONTHLY');
    const [nextDue, setNextDue] = useState(new Date().toISOString().slice(0, 10));

    const numericAmount = Number(amount) || 0;
    const valid = title.trim().length > 0 && numericAmount > 0;

    const create = useMutation({
        mutationFn: () => scheduleService.create({
            title: title.trim(), amount: numericAmount, category, cadence, next_due_date: nextDue,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); onClose(); },
        onError: (e: Error) => Alert.alert('Could not create', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New scheduled item</Text>
                <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Office rent" placeholderTextColor={colors.textFaint} />

                <Text style={[styles.label, styles.spaced]}>Amount (K)</Text>
                <TextInput style={styles.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />

                <Text style={[styles.label, styles.spaced]}>Category</Text>
                <View style={styles.chips}>
                    {SCHEDULE_CATEGORIES.map((c) => (
                        <Pressable key={c.value} onPress={() => setCategory(c.value)} style={[styles.chip, category === c.value && styles.chipActive]}>
                            <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{c.label}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, styles.spaced]}>Repeats</Text>
                <View style={styles.chips}>
                    {SCHEDULE_CADENCES.map((c) => (
                        <Pressable key={c.value} onPress={() => setCadence(c.value)} style={[styles.chip, cadence === c.value && styles.chipActive]}>
                            <Text style={[styles.chipText, cadence === c.value && styles.chipTextActive]}>{c.label}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, styles.spaced]}>Next due (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={nextDue} onChangeText={setNextDue} placeholder="2026-09-01" placeholderTextColor={colors.textFaint} />

                <Pressable
                    style={[styles.saveBtn, !valid && styles.saveBtnDisabled, { marginBottom: insets.bottom + 12 }]}
                    onPress={() => create.mutate()}
                    disabled={!valid || create.isPending}
                >
                    {create.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Create</Text>}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    catScroll: { flexGrow: 0, height: 52 },
    catRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
    catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    catChipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    catChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    catChipTextActive: { color: colors.blue },
    centre: { paddingVertical: 48, alignItems: 'center' },
    list: { padding: 20, gap: 10, paddingBottom: 60 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    cardMain: { flex: 1, gap: 3 },
    title: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    meta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    amount: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    runBtn: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center',
    },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    modalRoot: { flex: 1, backgroundColor: colors.canvas },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    modalScroll: { padding: 20, gap: 4 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 7 },
    spaced: { marginTop: 14 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 20,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
