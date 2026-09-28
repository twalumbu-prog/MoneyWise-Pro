import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { StepFooter, ErrorBanner } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

export interface CategoryItem {
    id: string;
    label: string;
    type: 'INCOME' | 'EXPENSE';
    selected: boolean;
}

const DEFAULT_INCOME: CategoryItem[] = [
    { id: 'inc_salary', label: 'Salary & Wages', type: 'INCOME', selected: true },
    { id: 'inc_side', label: 'Side Business & Freelancing', type: 'INCOME', selected: true },
    { id: 'inc_invest', label: 'Investments & Dividends', type: 'INCOME', selected: false },
    { id: 'inc_rent', label: 'Rental Income', type: 'INCOME', selected: false },
    { id: 'inc_gifts', label: 'Gifts & Allowances', type: 'INCOME', selected: false },
];

const DEFAULT_EXPENSES: CategoryItem[] = [
    { id: 'exp_rent', label: 'Rent & Housing', type: 'EXPENSE', selected: true },
    { id: 'exp_food', label: 'Groceries & Household', type: 'EXPENSE', selected: true },
    { id: 'exp_utilities', label: 'Utilities (Electricity, Water, Web)', type: 'EXPENSE', selected: true },
    { id: 'exp_transport', label: 'Transport & Fuel', type: 'EXPENSE', selected: true },
    { id: 'exp_dining', label: 'Dining & Entertainment', type: 'EXPENSE', selected: true },
    { id: 'exp_health', label: 'Healthcare & Medical', type: 'EXPENSE', selected: false },
    { id: 'exp_education', label: 'Education & Fees', type: 'EXPENSE', selected: false },
    { id: 'exp_savings', label: 'Savings & Investments', type: 'EXPENSE', selected: true },
];

interface Props {
    onBack: () => void;
    onContinue: (selectedItems: CategoryItem[]) => void;
    saving: boolean;
}

export const StepPersonalCategories: React.FC<Props> = ({ onBack, onContinue, saving }) => {
    const [incomeItems, setIncomeItems] = useState<CategoryItem[]>(DEFAULT_INCOME);
    const [expenseItems, setExpenseItems] = useState<CategoryItem[]>(DEFAULT_EXPENSES);
    const [error, setError] = useState<string | null>(null);

    const toggleItem = (id: string, type: 'INCOME' | 'EXPENSE') => {
        if (type === 'INCOME') {
            setIncomeItems(items => items.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
        } else {
            setExpenseItems(items => items.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
        }
    };

    const handleContinue = () => {
        const selected = [...incomeItems.filter(i => i.selected), ...expenseItems.filter(i => i.selected)];
        if (selected.length === 0) {
            setError('Please select at least one income or expense category.');
            return;
        }
        setError(null);
        onContinue(selected);
    };

    return (
        <View style={styles.root}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <ErrorBanner message={error} />

                <Text style={styles.sectionHeaderTitle}>Income Sources</Text>
                <Text style={styles.sectionHeaderSubtitle}>Select the sources of income you want to track</Text>

                <View style={styles.gridContainer}>
                    {incomeItems.map(item => (
                        <Pressable
                            key={item.id}
                            style={({ pressed }) => [
                                styles.chip,
                                item.selected && styles.chipSelected,
                                pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => toggleItem(item.id, 'INCOME')}
                        >
                            <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                                {item.selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                            </View>
                            <Text style={[styles.chipText, item.selected && styles.chipTextSelected]}>
                                {item.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionHeaderTitle}>Expense Categories</Text>
                <Text style={styles.sectionHeaderSubtitle}>Select the main areas of your personal spending</Text>

                <View style={styles.gridContainer}>
                    {expenseItems.map(item => (
                        <Pressable
                            key={item.id}
                            style={({ pressed }) => [
                                styles.chip,
                                item.selected && styles.chipSelected,
                                pressed && { opacity: 0.8 },
                            ]}
                            onPress={() => toggleItem(item.id, 'EXPENSE')}
                        >
                            <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                                {item.selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                            </View>
                            <Text style={[styles.chipText, item.selected && styles.chipTextSelected]}>
                                {item.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>

            <StepFooter
                continueLabel="Save & Continue"
                loading={saving}
                onContinue={handleContinue}
                onBack={onBack}
                showBack={true}
            />
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
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
    },
    sectionHeaderTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
        marginBottom: 4,
    },
    sectionHeaderSubtitle: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 16,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 12,
        minWidth: '47%',
        flexGrow: 1,
    },
    chipSelected: {
        backgroundColor: '#EFF6FF',
        borderColor: colors.blue,
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.textFaint,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        backgroundColor: colors.surface,
    },
    checkboxSelected: {
        backgroundColor: colors.blue,
        borderColor: colors.blue,
    },
    chipText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 13,
        color: colors.text,
        flex: 1,
    },
    chipTextSelected: {
        fontFamily: fonts.bodyBold,
        color: colors.navy,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 20,
    },
});
