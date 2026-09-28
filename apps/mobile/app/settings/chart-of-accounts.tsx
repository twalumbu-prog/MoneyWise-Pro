import { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
    Modal, TextInput, Alert, Switch, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Edit2, Trash2, X } from 'lucide-react-native';
import { accountService } from 'core';
import type { Account } from 'core';
import { AnimatedSegmented } from '../../src/components/AnimatedTabs';
import { useAuth } from '../../src/context/AuthContext';
import { PRESET_EMOJIS, extractEmojiAndName, getAccountEmoji } from '../../src/utils/emoji';
import { colors, fonts, radius } from '../../src/theme/tokens';

type ManagementTab = 'NET_WORTH' | 'PROFIT_LOSS';

export default function ChartOfAccountsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { organizationId } = useAuth();

    const [activeTab, setActiveTab] = useState<ManagementTab>('NET_WORTH');

    // Modal state for Add/Edit Account
    const [modalVisible, setModalVisible] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [type, setType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'>('EXPENSE');
    const [subtype, setSubtype] = useState('');
    const [description, setDescription] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('📁');
    const [formError, setFormError] = useState('');

    const { data: accounts = [], isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['accounts-management', organizationId],
        queryFn: () => accountService.getAll(true),
    });

    const onRefresh = useCallback(async () => {
        await refetch();
        queryClient.invalidateQueries({ queryKey: ['report'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }, [refetch, queryClient]);

    const netWorthAccounts = useMemo(() => {
        return accounts.filter((a) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(a.type));
    }, [accounts]);

    const profitLossAccounts = useMemo(() => {
        return accounts.filter((a) => ['INCOME', 'EXPENSE'].includes(a.type));
    }, [accounts]);

    const displayedAccounts = activeTab === 'NET_WORTH' ? netWorthAccounts : profitLossAccounts;

    const openCreateModal = () => {
        setEditingAccount(null);
        setCode('');
        setName('');
        setType(activeTab === 'NET_WORTH' ? 'ASSET' : 'EXPENSE');
        setSubtype('');
        setDescription('');
        setSelectedEmoji('🛒');
        setFormError('');
        setModalVisible(true);
    };

    const openEditModal = (acc: Account) => {
        setEditingAccount(acc);
        const { emoji, cleanName } = extractEmojiAndName(acc.name);
        setCode(acc.code);
        setName(cleanName);
        setType(acc.type);
        setSubtype(acc.subtype || '');
        setDescription(acc.description || '');
        setSelectedEmoji(emoji || getAccountEmoji(acc.name, acc.type));
        setFormError('');
        setModalVisible(true);
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!code.trim()) throw new Error('Account code is required.');
            if (!name.trim()) throw new Error('Account name is required.');

            const fullName = `${selectedEmoji} ${name.trim()}`;

            if (editingAccount) {
                await accountService.update(editingAccount.id, {
                    code: code.trim(),
                    name: fullName,
                    type,
                    subtype: subtype.trim() || undefined,
                    description: description.trim() || undefined,
                });
            } else {
                await accountService.create({
                    code: code.trim(),
                    name: fullName,
                    type,
                    subtype: subtype.trim() || undefined,
                    description: description.trim() || undefined,
                    is_active: true,
                });
            }
        },
        onSuccess: async () => {
            setModalVisible(false);
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['report'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
        },
        onError: (err: any) => {
            setFormError(err.message || 'Failed to save account.');
        },
    });

    const toggleActiveMutation = useMutation({
        mutationFn: async ({ account, active }: { account: Account; active: boolean }) => {
            await accountService.update(account.id, {
                ...account,
                is_active: active,
            });
        },
        onSuccess: async () => {
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['report'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Could not update account status.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await accountService.delete(id);
        },
        onSuccess: async () => {
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['report'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
        },
        onError: (err: any) => {
            Alert.alert('Error', err.message || 'Failed to delete account.');
        },
    });

    const handleDelete = (acc: Account) => {
        Alert.alert(
            'Delete Account?',
            `Are you sure you want to delete "${acc.name}" (${acc.code})? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteMutation.mutate(acc.id),
                },
            ]
        );
    };

    return (
        <View style={styles.root}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>Chart of Accounts</Text>
                <Pressable onPress={openCreateModal} style={styles.addHeaderBtn}>
                    <Plus size={20} color={colors.blue} />
                </Pressable>
            </View>

            {/* Top Tab Toggle Switch */}
            <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
                <AnimatedSegmented
                    value={activeTab}
                    onChange={(v) => setActiveTab(v as ManagementTab)}
                    trackStyle={styles.segment}
                    indicatorStyle={styles.segmentIndicator}
                    itemStyle={styles.segmentBtn}
                    items={([
                        { value: 'NET_WORTH', label: 'Net Worth (Assets/Liab)' },
                        { value: 'PROFIT_LOSS', label: 'Profit / Loss (Inc/Exp)' },
                    ] as const).map((item) => ({
                        value: item.value,
                        content: (
                            <Text style={[styles.segmentText, activeTab === item.value && styles.segmentTextActive]}>
                                {item.label}
                            </Text>
                        ),
                    }))}
                />
            </View>

            {/* Main Accounts List */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10, gap: 10 }}
                refreshControl={
                    <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.blue} />
                }
            >
                {isLoading ? (
                    <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
                ) : displayedAccounts.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No accounts found in this section.</Text>
                        <Pressable style={styles.emptyAddBtn} onPress={openCreateModal}>
                            <Text style={styles.emptyAddBtnText}>+ Add New Account</Text>
                        </Pressable>
                    </View>
                ) : (
                    displayedAccounts.map((acc) => {
                        const { emoji, cleanName } = extractEmojiAndName(acc.name);
                        const displayEmoji = emoji || getAccountEmoji(acc.name, acc.type);

                        return (
                            <View key={acc.id} style={[styles.accCard, !acc.is_active && styles.accCardInactive]}>
                                <View style={styles.accLeft}>
                                    <Text style={{ fontSize: 20 }}>{displayEmoji}</Text>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.accName} numberOfLines={1}>{cleanName}</Text>
                                            <View style={[styles.typeBadge, { backgroundColor: acc.type === 'EXPENSE' || acc.type === 'LIABILITY' ? '#FEE2E2' : '#DCFCE7' }]}>
                                                <Text style={[styles.typeBadgeText, { color: acc.type === 'EXPENSE' || acc.type === 'LIABILITY' ? colors.danger : colors.positive }]}>
                                                    {acc.type}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.accCode}>
                                            Code: {acc.code} {acc.subtype ? `• ${acc.subtype}` : ''}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.accRight}>
                                    <Switch
                                        value={acc.is_active}
                                        onValueChange={(active) => toggleActiveMutation.mutate({ account: acc, active })}
                                        trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                                        thumbColor={acc.is_active ? colors.blue : '#9CA3AF'}
                                    />
                                    <Pressable onPress={() => openEditModal(acc)} style={styles.iconBtn}>
                                        <Edit2 size={16} color={colors.textMuted} />
                                    </Pressable>
                                    <Pressable onPress={() => handleDelete(acc)} style={styles.iconBtn}>
                                        <Trash2 size={16} color={colors.danger} />
                                    </Pressable>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* Add / Edit Modal */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {editingAccount ? 'Edit Account' : 'Add New Account'}
                            </Text>
                            <Pressable onPress={() => setModalVisible(false)}>
                                <X size={20} color={colors.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
                            {!!formError && (
                                <View style={styles.errorBox}>
                                    <Text style={styles.errorText}>{formError}</Text>
                                </View>
                            )}

                            {/* Emoji Picker */}
                            <Text style={styles.fieldLabel}>Account Emoji (Icon)</Text>
                            <View style={styles.emojiGrid}>
                                {PRESET_EMOJIS.map((em) => (
                                    <Pressable
                                        key={em}
                                        onPress={() => setSelectedEmoji(em)}
                                        style={[styles.emojiPill, selectedEmoji === em && styles.emojiPillSelected]}
                                    >
                                        <Text style={{ fontSize: 18 }}>{em}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            <View>
                                <Text style={styles.fieldLabel}>Account Code</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. EXP-209"
                                    placeholderTextColor={colors.textFaint}
                                    value={code}
                                    onChangeText={setCode}
                                    autoCapitalize="characters"
                                />
                            </View>

                            <View>
                                <Text style={styles.fieldLabel}>Account Name</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Subscriptions & Software"
                                    placeholderTextColor={colors.textFaint}
                                    value={name}
                                    onChangeText={setName}
                                />
                            </View>

                            <View>
                                <Text style={styles.fieldLabel}>Account Type</Text>
                                <View style={styles.typeSelectorRow}>
                                    {(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const).map((t) => (
                                        <Pressable
                                            key={t}
                                            onPress={() => setType(t)}
                                            style={[styles.typeBtn, type === t && styles.typeBtnSelected]}
                                        >
                                            <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextSelected]}>
                                                {t}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>

                            <View>
                                <Text style={styles.fieldLabel}>Category / Subtype (Optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Operating Expenses"
                                    placeholderTextColor={colors.textFaint}
                                    value={subtype}
                                    onChangeText={setSubtype}
                                />
                            </View>

                            <View>
                                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Brief description of this account"
                                    placeholderTextColor={colors.textFaint}
                                    value={description}
                                    onChangeText={setDescription}
                                />
                            </View>
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Pressable style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={styles.saveBtn}
                                onPress={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending}
                            >
                                {saveMutation.isPending ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Save Account</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvasAlt },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    addHeaderBtn: { padding: 4 },

    segment: {
        flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg,
        borderRadius: radius.pill,
    },
    segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill, backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    segmentTextActive: { color: colors.text },

    accCard: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    accCardInactive: { opacity: 0.5 },
    accLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 },
    accName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    accCode: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },

    typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    typeBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9 },

    accRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { padding: 4 },

    emptyCard: { padding: 32, alignItems: 'center', gap: 12 },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    emptyAddBtn: { backgroundColor: colors.blue, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md },
    emptyAddBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, gap: 12,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },

    fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface,
    },
    errorBox: { backgroundColor: '#FEE2E2', padding: 8, borderRadius: radius.md },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger },

    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    emojiPill: {
        width: 36, height: 36, borderRadius: radius.md,
        alignItems: 'center', justifyContent: 'center',
    },
    emojiPillSelected: { backgroundColor: colors.tabActiveBg },

    typeSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    typeBtn: {
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    typeBtnSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
    typeBtnText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    typeBtnTextSelected: { fontFamily: fonts.bodyBold, color: '#FFFFFF' },

    modalFooter: { flexDirection: 'row', gap: 10, marginTop: 12 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center' },
    cancelBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.blue, alignItems: 'center' },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
