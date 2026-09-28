import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Sparkles, RefreshCw, FileBarChart2, Plus, Check, Pencil, Trash2, CirclePlus } from 'lucide-react-native';
import { onboardingService, CoaAccount, PlSection, PL_SECTIONS } from 'core';
import { StepFooter, ErrorBanner, SkeletonRow, GhostButton, PrimaryButton } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    onBack: () => void;
    onSaved: () => Promise<void>;
    saving: boolean;
}

const SECTION_TYPE: Record<PlSection, 'INCOME' | 'EXPENSE'> = {
    'Revenue': 'INCOME',
    'Cost of Sales': 'EXPENSE',
    'Operating Expenses': 'EXPENSE',
    'Other Income': 'INCOME',
    'Other Expenses': 'EXPENSE',
};

const SECTION_CODE_BASE: Record<PlSection, number> = {
    'Revenue': 4000, 'Cost of Sales': 5000, 'Operating Expenses': 6000,
    'Other Income': 7000, 'Other Expenses': 8000,
};

const SECTION_LABEL: Record<PlSection, string> = {
    'Revenue': 'Income / Revenue',
    'Cost of Sales': 'Cost of Sales',
    'Operating Expenses': 'Operating Expenses',
    'Other Income': 'Other Income',
    'Other Expenses': 'Other Expenses',
};

const illustrativeAmount = (name: string, section: PlSection): number => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const unit = (h % 90) + 10;
    switch (section) {
        case 'Revenue': return unit * 450;
        case 'Cost of Sales': return unit * 180;
        case 'Operating Expenses': return unit * 60;
        case 'Other Income': return unit * 15;
        case 'Other Expenses': return unit * 10;
    }
};

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const StepChartOfAccounts: React.FC<Props> = ({ onBack, onSaved, saving }) => {
    const [accounts, setAccounts] = useState<CoaAccount[] | null>(null);
    const [method, setMethod] = useState<'AI' | 'TEMPLATE' | null>(null);
    const [generating, setGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingCoa, setSavingCoa] = useState(false);

    const [editingAccount, setEditingAccount] = useState<CoaAccount | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const generate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const result = await onboardingService.generateChartOfAccounts();
            setAccounts(result.accounts.map(a => ({ ...a, is_active: true })));
            setMethod(result.method);
        } catch (err: any) {
            setError(err.message || 'Failed to generate chart of accounts.');
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => { generate(); }, []);

    const updateAccount = (code: string, patch: Partial<CoaAccount>) => {
        setAccounts(prev => prev ? prev.map(a => a.code === code ? { ...a, ...patch } : a) : prev);
    };

    const removeAccount = (code: string) => {
        setAccounts(prev => prev ? prev.filter(a => a.code !== code) : prev);
    };

    const addAccount = (section: PlSection) => {
        const existing = accounts || [];
        const sectionCodes = existing
            .filter(a => a.subtype === section)
            .map(a => parseInt(a.code, 10))
            .filter(n => !isNaN(n));
        const nextCode = (sectionCodes.length ? Math.max(...sectionCodes) : SECTION_CODE_BASE[section]) + 10;
        const newAccount: CoaAccount = {
            code: String(nextCode),
            name: '',
            type: SECTION_TYPE[section],
            subtype: section,
            description: '',
            is_active: true,
        };
        setAccounts(prev => [...(prev || []), newAccount]);
        setEditingAccount(newAccount);
        setEditDraft('');
    };

    const pl = useMemo(() => {
        if (!accounts) return null;
        const active = accounts.filter(a => a.is_active !== false && a.name.trim());
        const sum = (section: PlSection) =>
            active.filter(a => a.subtype === section)
                .reduce((t, a) => t + illustrativeAmount(a.name, section), 0);
        const revenue = sum('Revenue');
        const cos = sum('Cost of Sales');
        const opex = sum('Operating Expenses');
        const otherIncome = sum('Other Income');
        const otherExpenses = sum('Other Expenses');
        return {
            revenue, cos, opex, otherIncome, otherExpenses,
            grossProfit: revenue - cos,
            netProfit: revenue - cos - opex + otherIncome - otherExpenses,
        };
    }, [accounts]);

    const handleSave = async () => {
        if (!accounts) return;
        const named = accounts.filter(a => a.name.trim());
        if (named.length === 0) {
            setError('Keep at least one account.');
            return;
        }
        if (!named.some(a => a.subtype === 'Revenue' && a.is_active !== false)) {
            setError('You need at least one active Revenue account.');
            return;
        }
        setSavingCoa(true);
        setError(null);
        try {
            await onboardingService.saveChartOfAccounts(named);
            await onSaved();
        } catch (err: any) {
            setError(err.message || 'Failed to save chart of accounts.');
        } finally {
            setSavingCoa(false);
        }
    };

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <ErrorBanner message={error} />

                {generating ? (
                    <View style={styles.loadingBox}>
                        <View style={styles.aiBadge}>
                            <Sparkles size={16} color={colors.blue} />
                            <Text style={styles.aiBadgeText}>Analysing your business profile...</Text>
                        </View>
                        <SkeletonRow height={48} style={{ marginBottom: 12 }} />
                        <SkeletonRow height={48} style={{ marginBottom: 12 }} />
                        <SkeletonRow height={48} style={{ marginBottom: 12 }} />
                    </View>
                ) : accounts ? (
                    <View>
                        <View style={styles.badgeRow}>
                            <View style={styles.aiTag}>
                                <Sparkles size={14} color={colors.blue} />
                                <Text style={styles.aiTagText}>
                                    {method === 'AI' ? 'AI Generated' : 'Industry Template'}
                                </Text>
                            </View>
                            <Pressable onPress={generate} style={styles.regenBtn}>
                                <RefreshCw size={14} color={colors.navy} />
                                <Text style={styles.regenBtnText}>Regenerate</Text>
                            </Pressable>
                        </View>

                        {PL_SECTIONS.map(section => {
                            const rows = accounts.filter(a => a.subtype === section);
                            return (
                                <View key={section} style={styles.sectionCard}>
                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.sectionTitle}>{SECTION_LABEL[section]}</Text>
                                        <Text style={styles.sectionCount}>{rows.length} items</Text>
                                    </View>

                                    {rows.map(account => {
                                        const disabled = account.is_active === false;
                                        return (
                                            <View key={account.code} style={styles.accountRow}>
                                                <Pressable
                                                    onPress={() => updateAccount(account.code, { is_active: disabled })}
                                                    style={styles.checkBtn}
                                                >
                                                    {disabled ? (
                                                        <CirclePlus size={20} color={colors.textFaint} />
                                                    ) : (
                                                        <View style={styles.checkedBox}>
                                                            <Check size={12} color="#FFFFFF" />
                                                        </View>
                                                    )}
                                                </Pressable>

                                                <Text style={[styles.accountName, disabled ? styles.accountDisabled : null]}>
                                                    {account.name || 'Untitled Account'}
                                                </Text>

                                                <Pressable
                                                    onPress={() => { setEditingAccount(account); setEditDraft(account.name); }}
                                                    style={styles.editAccountBtn}
                                                >
                                                    <Pencil size={14} color={colors.textMuted} />
                                                </Pressable>
                                            </View>
                                        );
                                    })}

                                    <Pressable onPress={() => addAccount(section)} style={styles.addAccountBtn}>
                                        <Plus size={14} color={colors.navy} />
                                        <Text style={styles.addAccountBtnText}>Add Category</Text>
                                    </Pressable>
                                </View>
                            );
                        })}

                        {/* Sample P&L preview card */}
                        {pl ? (
                            <View style={styles.plCard}>
                                <View style={styles.plHeader}>
                                    <FileBarChart2 size={16} color="#FFFFFF" />
                                    <Text style={styles.plHeaderTitle}>Sample Profit & Loss</Text>
                                </View>
                                <View style={styles.plBody}>
                                    <View style={styles.plRow}>
                                        <Text style={styles.plLabel}>Revenue</Text>
                                        <Text style={styles.plValue}>K {fmt(pl.revenue)}</Text>
                                    </View>
                                    <View style={styles.plRow}>
                                        <Text style={styles.plLabel}>Cost of Sales</Text>
                                        <Text style={styles.plValue}>(K {fmt(pl.cos)})</Text>
                                    </View>
                                    <View style={[styles.plRow, styles.plTotalRow]}>
                                        <Text style={styles.plTotalLabel}>Gross Profit</Text>
                                        <Text style={styles.plTotalValue}>K {fmt(pl.grossProfit)}</Text>
                                    </View>
                                    <View style={styles.plRow}>
                                        <Text style={styles.plLabel}>Operating Expenses</Text>
                                        <Text style={styles.plValue}>(K {fmt(pl.opex)})</Text>
                                    </View>
                                    <View style={[styles.plRow, styles.plNetRow]}>
                                        <Text style={styles.plNetLabel}>Net Profit</Text>
                                        <Text style={[styles.plNetValue, { color: pl.netProfit >= 0 ? colors.positive : colors.danger }]}>
                                            K {fmt(pl.netProfit)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : null}
                    </View>
                ) : null}
            </ScrollView>

            {/* Edit Account Modal */}
            <Modal visible={editingAccount !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Edit Account Name</Text>
                        <TextInput
                            value={editDraft}
                            onChangeText={setEditDraft}
                            autoFocus
                            style={styles.modalInput}
                            placeholder="Account name"
                            placeholderTextColor={colors.textFaint}
                        />
                        <View style={styles.modalActions}>
                            <Pressable
                                onPress={() => {
                                    if (editingAccount) removeAccount(editingAccount.code);
                                    setEditingAccount(null);
                                }}
                                style={styles.deleteModalBtn}
                            >
                                <Trash2 size={16} color={colors.danger} />
                            </Pressable>
                            <GhostButton onPress={() => setEditingAccount(null)}>
                                Cancel
                            </GhostButton>
                            <PrimaryButton
                                onPress={() => {
                                    if (editingAccount && editDraft.trim()) {
                                        updateAccount(editingAccount.code, { name: editDraft.trim() });
                                    }
                                    setEditingAccount(null);
                                }}
                            >
                                Save
                            </PrimaryButton>
                        </View>
                    </View>
                </View>
            </Modal>

            {accounts ? (
                <StepFooter
                    onBack={onBack}
                    loading={savingCoa || saving}
                    continueLabel="Save Accounts"
                    onContinue={handleSave}
                />
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    loadingBox: {
        paddingVertical: 20,
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EFF6FF',
        padding: 12,
        borderRadius: radius.md,
        marginBottom: 16,
    },
    aiBadgeText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.blue,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    aiTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
    },
    aiTagText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.blue,
    },
    regenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 6,
    },
    regenBtnText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.navy,
    },
    sectionCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        padding: 16,
        marginBottom: 12,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    sectionCount: {
        fontFamily: fonts.bodyMedium,
        fontSize: 11,
        color: colors.textFaint,
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 12,
    },
    checkBtn: {
        padding: 2,
    },
    checkedBox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: colors.navy,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accountName: {
        flex: 1,
        fontFamily: fonts.bodyMedium,
        fontSize: 14,
        color: colors.text,
    },
    accountDisabled: {
        color: colors.textFaint,
        textDecorationLine: 'line-through',
    },
    editAccountBtn: {
        padding: 6,
    },
    addAccountBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
        backgroundColor: colors.canvas,
        borderRadius: radius.pill,
        marginTop: 12,
        gap: 6,
    },
    addAccountBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.navy,
    },
    plCard: {
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        marginTop: 16,
        marginBottom: 16,
        overflow: 'hidden',
    },
    plHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.navy,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    plHeaderTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: '#FFFFFF',
    },
    plBody: {
        padding: 16,
    },
    plRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    plLabel: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.textMuted,
    },
    plValue: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.navy,
    },
    plTotalRow: {
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingTop: 8,
        marginTop: 4,
    },
    plTotalLabel: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    plTotalValue: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    plNetRow: {
        borderTopWidth: 2,
        borderColor: colors.borderStrong,
        paddingTop: 10,
        marginTop: 6,
    },
    plNetLabel: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: colors.navy,
    },
    plNetValue: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: 24,
    },
    modalTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
        marginBottom: 16,
    },
    modalInput: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.md,
        paddingHorizontal: 16,
        fontFamily: fonts.body,
        fontSize: 16,
        color: colors.text,
        marginBottom: 20,
    },
    modalActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
    },
    deleteModalBtn: {
        padding: 10,
        borderRadius: radius.md,
        backgroundColor: '#FEF2F2',
        marginRight: 'auto',
    },
});
