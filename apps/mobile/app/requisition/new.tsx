import { useState, useMemo } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import { requisitionService, departmentService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../src/theme/tokens';

interface DraftItem {
    key: string;
    description: string;
    quantity: string;
    unitPrice: string;
}

const blankItem = (): DraftItem => ({
    key: Math.random().toString(36).slice(2),
    description: '',
    quantity: '1',
    unitPrice: '',
});

/**
 * New request. Same three beats as the web MobileRequisitionWizard — what it is,
 * what it costs, confirm — but as one scrolling form rather than paged steps:
 * on a phone the whole thing fits, and paging it only adds taps.
 */
export default function NewRequisitionScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [items, setItems] = useState<DraftItem[]>([blankItem()]);

    const { data: deptConfig } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentService.list(),
    });
    const useDepartments = deptConfig?.use_departments ?? false;
    const departments = deptConfig?.departments ?? [];

    const total = useMemo(
        () => items.reduce((sum, it) => {
            const q = Number(it.quantity) || 0;
            const p = Number(it.unitPrice) || 0;
            return sum + q * p;
        }, 0),
        [items],
    );

    const valid =
        description.trim().length > 0 &&
        total > 0 &&
        items.some((it) => it.description.trim().length > 0) &&
        (!useDepartments || department.length > 0);

    const create = useMutation({
        mutationFn: () =>
            requisitionService.create({
                description: description.trim(),
                estimated_total: total,
                department: department || 'General',
                items: items
                    .filter((it) => it.description.trim())
                    .map((it) => ({
                        description: it.description.trim(),
                        quantity: Number(it.quantity) || 1,
                        unit_price: Number(it.unitPrice) || 0,
                        estimated_amount: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
                    })),
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            router.back();
        },
        onError: (e: any) => {
            // The API blocks a second open request per user and returns the id of
            // the one already in flight; surfacing that is more useful than the
            // raw message, which just says "failed".
            if (e?.activeRequisitionId) {
                Alert.alert(
                    'You already have an open request',
                    'Finish or cancel it before raising another.',
                    [
                        { text: 'OK', style: 'cancel' },
                        { text: 'Open it', onPress: () => router.replace(`/requisition/${e.activeRequisitionId}`) },
                    ],
                );
                return;
            }
            Alert.alert('Could not submit', e?.message ?? 'Please try again.');
        },
    });

    const setItem = (key: string, patch: Partial<DraftItem>) =>
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back">
                    <ChevronLeft size={24} color={colors.textMuted} />
                </Pressable>
                <Text style={styles.headerTitle}>New Request</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Text style={styles.label}>What is this for?</Text>
                    <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="e.g. Fuel for the Lusaka delivery run"
                        placeholderTextColor={colors.textFaint}
                        multiline
                    />

                    {useDepartments && (
                        <>
                            <Text style={[styles.label, styles.labelSpaced]}>Department</Text>
                            <View style={styles.chips}>
                                {departments.map((d) => (
                                    <Pressable
                                        key={d.id}
                                        onPress={() => setDepartment(d.name)}
                                        style={[styles.chip, department === d.name && styles.chipActive]}
                                    >
                                        <Text style={[styles.chipText, department === d.name && styles.chipTextActive]}>
                                            {d.name}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Items</Text>
                    {items.map((it, idx) => (
                        <View key={it.key} style={styles.itemBlock}>
                            <View style={styles.itemHeader}>
                                <Text style={styles.itemIndex}>Item {idx + 1}</Text>
                                {items.length > 1 && (
                                    <Pressable
                                        onPress={() => setItems((p) => p.filter((x) => x.key !== it.key))}
                                        hitSlop={8}
                                        accessibilityLabel={`Remove item ${idx + 1}`}
                                    >
                                        <Trash2 size={16} color={colors.danger} />
                                    </Pressable>
                                )}
                            </View>
                            <TextInput
                                style={styles.input}
                                value={it.description}
                                onChangeText={(v) => setItem(it.key, { description: v })}
                                placeholder="Description"
                                placeholderTextColor={colors.textFaint}
                            />
                            <View style={styles.itemRow}>
                                <View style={styles.qtyCol}>
                                    <Text style={styles.miniLabel}>Qty</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={it.quantity}
                                        onChangeText={(v) => setItem(it.key, { quantity: v.replace(/[^0-9.]/g, '') })}
                                        keyboardType="decimal-pad"
                                        placeholder="1"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                                <View style={styles.priceCol}>
                                    <Text style={styles.miniLabel}>Unit price (K)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={it.unitPrice}
                                        onChangeText={(v) => setItem(it.key, { unitPrice: v.replace(/[^0-9.]/g, '') })}
                                        keyboardType="decimal-pad"
                                        placeholder="0.00"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                            </View>
                        </View>
                    ))}

                    <Pressable style={styles.addItem} onPress={() => setItems((p) => [...p, blankItem()])}>
                        <Plus size={16} color={colors.blue} />
                        <Text style={styles.addItemText}>Add another item</Text>
                    </Pressable>
                </View>

                <View style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Estimated total</Text>
                    <Text style={styles.totalValue}>{formatKwacha(total)}</Text>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <Pressable
                    style={({ pressed }) => [
                        styles.submit, !valid && styles.submitDisabled, pressed && valid && styles.pressed,
                    ]}
                    onPress={() => create.mutate()}
                    disabled={!valid || create.isPending}
                >
                    {create.isPending
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.submitText}>Submit request</Text>}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingBottom: 12,
    },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    scroll: { padding: 20, gap: 14, paddingBottom: 32 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 12 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    labelSpaced: { marginTop: 18 },
    miniLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginBottom: 5 },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    inputMultiline: { minHeight: 76, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    itemBlock: {
        gap: 10, paddingBottom: 16, marginBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    itemIndex: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textFaint },
    itemRow: { flexDirection: 'row', gap: 12 },
    qtyCol: { width: 90 },
    priceCol: { flex: 1 },
    addItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    addItemText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    totalCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    totalLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
    totalValue: { fontFamily: fonts.display, fontSize: 24, color: colors.navy },
    footer: {
        paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface,
        borderTopWidth: 1, borderTopColor: colors.border,
    },
    submit: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 16,
        alignItems: 'center', justifyContent: 'center', minHeight: 52,
    },
    submitDisabled: { opacity: 0.4 },
    submitText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    pressed: { opacity: 0.85 },
});
