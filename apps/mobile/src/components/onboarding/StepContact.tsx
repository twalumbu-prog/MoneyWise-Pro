import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, FlatList, ScrollView } from 'react-native';
import { Lock, ChevronDown, Search, Check } from 'lucide-react-native';
import { BusinessProfile } from 'core';
import { PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY, PhoneCountry, flagEmoji } from './phoneCountryCodes';
import { StepFooter, ErrorBanner } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    profile: BusinessProfile | null;
    onSave: (patch: Partial<BusinessProfile>) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

const parseStoredPhone = (phone: string | null): { country: PhoneCountry; national: string } => {
    const trimmed = (phone || '').trim();
    if (trimmed.startsWith('+')) {
        const digits = trimmed.slice(1);
        const match = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
            .find(c => digits.startsWith(c.dial));
        if (match) {
            return { country: match, national: trimmed.slice(1 + match.dial.length).trim() };
        }
    }
    return { country: DEFAULT_PHONE_COUNTRY, national: trimmed };
};

export const StepContact: React.FC<Props> = ({ profile, onSave, onBack, saving }) => {
    const initial = parseStoredPhone(profile?.phone ?? null);
    const [country, setCountry] = useState<PhoneCountry>(initial.country);
    const [national, setNational] = useState(initial.national);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCountries = PHONE_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.dial.includes(searchQuery)
    );

    const handleSubmit = async () => {
        setError(null);
        const digitsOnly = national.replace(/\D/g, '');
        if (digitsOnly.length < 7) {
            setFieldError('Enter a valid phone number with at least 7 digits.');
            return;
        }
        setFieldError(null);

        try {
            await onSave({ phone: `+${country.dial} ${national.trim()}` });
        } catch (err: any) {
            setError(err.message || 'Failed to save your phone number.');
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

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Phone Number</Text>
                    <View style={[styles.phoneInputRow, fieldError ? styles.inputError : null]}>
                        <Pressable onPress={() => setPickerOpen(true)} style={styles.countryTrigger}>
                            <Text style={styles.flagText}>{flagEmoji(country.iso2)}</Text>
                            <Text style={styles.dialText}>+{country.dial}</Text>
                            <ChevronDown size={14} color={colors.textMuted} />
                        </Pressable>

                        <View style={styles.divider} />

                        <TextInput
                            value={national}
                            onChangeText={(t) => { setNational(t); setFieldError(null); }}
                            placeholder="(077) 725-3009"
                            placeholderTextColor={colors.textFaint}
                            keyboardType="phone-pad"
                            style={styles.phoneInput}
                        />
                    </View>
                    {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}
                </View>

                <View style={styles.privacyCard}>
                    <Lock size={20} color={colors.textMuted} />
                    <Text style={styles.privacyText}>
                        Your phone number is kept secure and will never be shared without your permission.
                    </Text>
                </View>

                {/* Country Picker Modal */}
                <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet">
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Country</Text>
                            <Pressable onPress={() => setPickerOpen(false)} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>Done</Text>
                            </Pressable>
                        </View>

                        <View style={styles.searchBar}>
                            <Search size={16} color={colors.textMuted} />
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search country or code..."
                                placeholderTextColor={colors.textFaint}
                                style={styles.searchInput}
                            />
                        </View>

                        <FlatList
                            data={filteredCountries}
                            keyExtractor={(item) => item.iso2}
                            renderItem={({ item }) => {
                                const isSelected = item.iso2 === country.iso2;
                                return (
                                    <Pressable
                                        onPress={() => { setCountry(item); setPickerOpen(false); setSearchQuery(''); }}
                                        style={({ pressed }) => [styles.countryRow, { opacity: pressed ? 0.7 : 1 }]}
                                    >
                                        <Text style={styles.countryFlag}>{flagEmoji(item.iso2)}</Text>
                                        <Text style={styles.countryName}>{item.name}</Text>
                                        <Text style={styles.countryDial}>+{item.dial}</Text>
                                        {isSelected ? <Check size={16} color={colors.blue} /> : null}
                                    </Pressable>
                                );
                            }}
                        />
                    </View>
                </Modal>
            </ScrollView>

            <StepFooter
                onBack={onBack}
                loading={saving}
                onContinue={handleSubmit}
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
        paddingTop: 16,
        paddingBottom: 24,
    },
    formGroup: {
        marginBottom: 24,
    },
    label: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
        marginBottom: 8,
    },
    phoneInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 52,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        paddingHorizontal: 14,
    },
    inputError: {
        borderColor: colors.danger,
    },
    countryTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingRight: 8,
    },
    flagText: {
        fontSize: 20,
    },
    dialText: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: colors.navy,
    },
    divider: {
        width: 1,
        height: 24,
        backgroundColor: colors.borderStrong,
        marginHorizontal: 8,
    },
    phoneInput: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 16,
        color: colors.text,
    },
    fieldError: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.danger,
        marginTop: 6,
    },
    privacyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        gap: 12,
        marginBottom: 20,
    },
    privacyText: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    modalTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
    },
    closeBtn: {
        padding: 4,
    },
    closeBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: colors.blue,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        marginHorizontal: 20,
        marginBottom: 12,
        paddingHorizontal: 12,
        minHeight: 44,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.text,
    },
    countryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    countryFlag: {
        fontSize: 22,
        marginRight: 12,
    },
    countryName: {
        flex: 1,
        fontFamily: fonts.bodyMedium,
        fontSize: 15,
        color: colors.navy,
    },
    countryDial: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.textMuted,
        marginRight: 10,
    },
});
