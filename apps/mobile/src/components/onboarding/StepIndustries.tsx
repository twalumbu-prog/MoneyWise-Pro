import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Search, Check, Plus } from 'lucide-react-native';
import { INDUSTRIES } from './constants';
import { StepFooter, ErrorBanner } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    initial: string[];
    onSave: (industries: string[]) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

export const StepIndustries: React.FC<Props> = ({ initial, onSave, onBack, saving }) => {
    const [selected, setSelected] = useState<string[]>(initial);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    const customQuery = query.trim();
    const exactMatch = useMemo(() => {
        if (!customQuery) return true;
        const q = customQuery.toLowerCase();
        return INDUSTRIES.some(i => i.toLowerCase() === q) || selected.some(s => s.toLowerCase() === q);
    }, [customQuery, selected]);

    const canAddCustom = customQuery.length > 0 && !exactMatch;

    const visibleIndustries = useMemo(() => {
        const q = query.trim().toLowerCase();
        const presetMatches = INDUSTRIES.filter(i => !q || i.toLowerCase().includes(q));
        const customSelectedMatches = selected.filter(
            s => !(INDUSTRIES as readonly string[]).includes(s) && (!q || s.toLowerCase().includes(q))
        );
        return Array.from(new Set([...presetMatches, ...customSelectedMatches]));
    }, [query, selected]);

    const toggle = (industry: string) => {
        setError(null);
        setSelected(prev =>
            prev.includes(industry) ? prev.filter(i => i !== industry) : [...prev, industry]
        );
    };

    const addCustomIndustry = (customName: string) => {
        const trimmed = customName.trim();
        if (!trimmed) return;
        setError(null);
        if (!selected.includes(trimmed)) {
            setSelected(prev => [...prev, trimmed]);
        }
        setQuery('');
    };

    const handleContinue = async () => {
        if (selected.length === 0) {
            setError('Select at least one industry so we can tailor your setup.');
            return;
        }
        await onSave(selected);
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

                <View style={styles.searchBar}>
                    <Search size={16} color={colors.textMuted} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search industries..."
                        placeholderTextColor={colors.textFaint}
                        style={styles.searchInput}
                    />
                </View>

                <View style={styles.chipContainer}>
                    {canAddCustom ? (
                        <Pressable
                            onPress={() => addCustomIndustry(customQuery)}
                            style={({ pressed }) => [styles.addChip, { opacity: pressed ? 0.8 : 1 }]}
                        >
                            <Plus size={14} color={colors.blue} />
                            <Text style={styles.addChipText}>Add "{customQuery}"</Text>
                        </Pressable>
                    ) : null}

                    {visibleIndustries.map(industry => {
                        const isSelected = selected.includes(industry);
                        return (
                            <Pressable
                                key={industry}
                                onPress={() => toggle(industry)}
                                style={({ pressed }) => [
                                    styles.chip,
                                    isSelected ? styles.chipSelected : null,
                                    { opacity: pressed ? 0.85 : 1 },
                                ]}
                            >
                                {isSelected ? (
                                    <Check size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                                ) : null}
                                <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
                                    {industry}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Text style={styles.countText}>
                    {selected.length === 0 ? 'Nothing selected yet' : `${selected.length} selected — tap as many as apply`}
                </Text>
            </ScrollView>

            <StepFooter
                onBack={onBack}
                loading={saving}
                onContinue={handleContinue}
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
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        paddingHorizontal: 14,
        marginBottom: 16,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.text,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
    },
    chipSelected: {
        backgroundColor: colors.blue,
        borderColor: colors.blue,
    },
    chipText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    chipTextSelected: {
        color: '#FFFFFF',
    },
    addChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: radius.pill,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: colors.blue,
        gap: 6,
    },
    addChipText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.blue,
    },
    countText: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textFaint,
        marginTop: 4,
        marginBottom: 12,
    },
});
