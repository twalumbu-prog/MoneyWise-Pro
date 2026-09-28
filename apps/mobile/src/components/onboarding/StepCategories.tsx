import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Search, Check, Sparkles, Plus, Tag, type LucideIcon } from 'lucide-react-native';
import { STORE_CATEGORIES, StoreCategoryDef } from './constants';
import { StepFooter, ErrorBanner } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    initial: string[];
    industries?: string[];
    onSave: (categories: string[]) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

function getRecommendedCategoryNames(industries: string[] = []): Set<string> {
    if (!industries || industries.length === 0) return new Set();

    const recommended = new Set<string>();
    const combinedText = industries.join(' ').toLowerCase();

    const rules: { keywords: string[]; categories: string[] }[] = [
        {
            keywords: ['food', 'restaurant', 'cafe', 'dining', 'bakery', 'bar', 'beverage', 'catering', 'eatery', 'hospitality', 'kitchen'],
            categories: ['Restaurant', 'Grocery'],
        },
        {
            keywords: ['retail', 'shop', 'store', 'boutique', 'fashion', 'clothing', 'apparel', 'shoes', 'wear', 'supermarket', 'grocery', 'mart'],
            categories: ['Clothing & Shoes', 'Grocery'],
        },
        {
            keywords: ['tech', 'technology', 'digital', 'software', 'it', 'telecom', 'online', 'computer', 'gadget', 'app', 'mobile', 'phone'],
            categories: ['Digital Products', 'Electronics', 'Mobile Phones'],
        },
        {
            keywords: ['school', 'education', 'academy', 'tuition', 'training', 'learning', 'college', 'university', 'kindergarten', 'kids', 'nursery', 'masterfees', 'teacher'],
            categories: ['Education', 'Stationery', 'Printing', 'Services'],
        },
        {
            keywords: ['farm', 'farming', 'agriculture', 'produce', 'crop', 'livestock', 'poultry', 'agro'],
            categories: ['Agriculture', 'Grocery'],
        },
        {
            keywords: ['salon', 'beauty', 'barber', 'spa', 'health', 'wellness', 'clinic', 'medical', 'dental', 'pharmacy', 'fitness', 'gym', 'cosmetics'],
            categories: ['Beauty', 'Pharmacy'],
        },
        {
            keywords: ['hardware', 'construct', 'contruct', 'constuct', 'building', 'plumbing', 'electrical', 'repair', 'tools', 'materials', 'carpentry', 'civil', 'engineer'],
            categories: ['Hardware', 'Repairs', 'Services'],
        },
        {
            keywords: ['auto', 'automotive', 'car', 'vehicle', 'transport', 'logistics', 'mechanic', 'garage', 'parts', 'drive'],
            categories: ['Repairs', 'Services'],
        },
        {
            keywords: ['hotel', 'lodging', 'accommodation', 'guesthouse', 'motel', 'stay'],
            categories: ['Hotel', 'Services'],
        },
        {
            keywords: ['print', 'printing', 'paper', 'stationery', 'office', 'book', 'copy', 'publish'],
            categories: ['Printing', 'Stationery'],
        },
        {
            keywords: ['furniture', 'decor', 'interior', 'home', 'appliance', 'furnishing'],
            categories: ['Furniture', 'Home Appliances'],
        },
        {
            keywords: ['event', 'party', 'wedding', 'celebration', 'planner', 'entertainment'],
            categories: ['Events', 'Services'],
        },
        {
            keywords: ['service', 'consulting', 'agency', 'freelance', 'cleaning', 'laundry', 'financial', 'legal', 'accounting', 'professional', 'advisor'],
            categories: ['Services', 'Consulting'],
        },
    ];

    for (const rule of rules) {
        if (rule.keywords.some(kw => combinedText.includes(kw))) {
            rule.categories.forEach(cat => recommended.add(cat));
        }
    }

    return recommended;
}

export const StepCategories: React.FC<Props> = ({ initial, industries = [], onSave, onBack, saving }) => {
    const [selected, setSelected] = useState<string[]>(initial);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    const customQuery = query.trim();
    const exactMatch = useMemo(() => {
        if (!customQuery) return true;
        const q = customQuery.toLowerCase();
        return STORE_CATEGORIES.some(c => c.name.toLowerCase() === q) || selected.some(s => s.toLowerCase() === q);
    }, [customQuery, selected]);

    const canAddCustom = customQuery.length > 0 && !exactMatch;
    const recommendedNames = useMemo(() => getRecommendedCategoryNames(industries), [industries]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return STORE_CATEGORIES.filter(c => !q || c.name.toLowerCase().includes(q));
    }, [query]);

    const customSelectedItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        return selected
            .filter(s => !STORE_CATEGORIES.some(c => c.name === s) && (!q || s.toLowerCase().includes(q)))
            .map(name => ({ name, icon: Tag as LucideIcon }));
    }, [selected, query]);

    const { recommendedList, otherList } = useMemo(() => {
        if (recommendedNames.size === 0) {
            return { recommendedList: [], otherList: [...filtered, ...customSelectedItems] };
        }
        const rec: StoreCategoryDef[] = [];
        const oth: StoreCategoryDef[] = [];
        filtered.forEach(c => {
            if (recommendedNames.has(c.name)) rec.push(c);
            else oth.push(c);
        });
        return { recommendedList: rec, otherList: [...oth, ...customSelectedItems] };
    }, [filtered, recommendedNames, customSelectedItems]);

    const toggle = (name: string) => {
        setError(null);
        setSelected(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    };

    const addCustomCategory = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setError(null);
        if (!selected.includes(trimmed)) {
            setSelected(prev => [...prev, trimmed]);
        }
        setQuery('');
    };

    const handleContinue = async () => {
        if (selected.length === 0) {
            setError('Pick at least one category — it organises your store for customers.');
            return;
        }
        await onSave(selected);
    };

    const renderCard = (name: string, Icon: LucideIcon) => {
        const isSelected = selected.includes(name);
        return (
            <Pressable
                key={name}
                onPress={() => toggle(name)}
                style={({ pressed }) => [
                    styles.card,
                    isSelected ? styles.cardSelected : null,
                    { opacity: pressed ? 0.85 : 1 },
                ]}
            >
                <View style={[styles.iconBox, isSelected ? styles.iconBoxSelected : null]}>
                    <Icon size={24} color={isSelected ? colors.blue : colors.textMuted} />
                    {isSelected ? (
                        <View style={styles.badgeCheck}>
                            <Check size={12} color="#FFFFFF" />
                        </View>
                    ) : null}
                </View>
                <Text style={[styles.cardTitle, isSelected ? styles.cardTitleSelected : null]} numberOfLines={2}>
                    {name}
                </Text>
            </Pressable>
        );
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
                        placeholder="Search store categories..."
                        placeholderTextColor={colors.textFaint}
                        style={styles.searchInput}
                    />
                </View>

                {recommendedList.length > 0 ? (
                    <View style={styles.sectionHeader}>
                        <Sparkles size={14} color={colors.blue} />
                        <Text style={styles.sectionHeaderText}>RECOMMENDED FOR YOUR BUSINESS</Text>
                    </View>
                ) : null}

                <View style={styles.grid}>
                    {recommendedList.map(({ name, icon }) => renderCard(name, icon))}

                    {canAddCustom ? (
                        <Pressable
                            onPress={() => addCustomCategory(customQuery)}
                            style={({ pressed }) => [styles.addCard, { opacity: pressed ? 0.85 : 1 }]}
                        >
                            <Plus size={24} color={colors.blue} />
                            <Text style={styles.addCardText}>+ Add "{customQuery}"</Text>
                        </Pressable>
                    ) : null}

                    {otherList.map(({ name, icon }) => renderCard(name, icon))}
                </View>

                <Text style={styles.countText}>
                    {selected.length === 0 ? 'Nothing selected yet' : `${selected.length} selected`}
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
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    sectionHeaderText: {
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        color: colors.blue,
        letterSpacing: 1,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
    },
    card: {
        width: '30%',
        alignItems: 'center',
        padding: 12,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
    },
    cardSelected: {
        borderColor: colors.blue,
        backgroundColor: '#EFF6FF',
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        backgroundColor: colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        position: 'relative',
    },
    iconBoxSelected: {
        backgroundColor: '#DBEAFE',
    },
    badgeCheck: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.blue,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.navy,
        textAlign: 'center',
    },
    cardTitleSelected: {
        fontFamily: fonts.bodyBold,
        color: colors.blue,
    },
    addCard: {
        width: '30%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: radius.lg,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: colors.blue,
        borderStyle: 'dashed',
        minHeight: 88,
    },
    addCardText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.blue,
        textAlign: 'center',
        marginTop: 4,
    },
    countText: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textFaint,
        marginTop: 4,
        marginBottom: 12,
    },
});
