import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { LocateFixed, Search, Check, ChevronDown } from 'lucide-react-native';
import { BusinessProfile } from 'core';
import { PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY, PhoneCountry, flagEmoji } from './phoneCountryCodes';
import { StepFooter, ErrorBanner, TextField } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    profile: BusinessProfile | null;
    onSave: (patch: Partial<BusinessProfile>) => Promise<void>;
    onBack: () => void;
    saving: boolean;
}

const findCountryByName = (name: string | undefined): PhoneCountry | null => {
    if (!name) return null;
    const q = name.trim().toLowerCase();
    return PHONE_COUNTRIES.find(c => c.name.toLowerCase() === q) || null;
};

export const StepAddress: React.FC<Props> = ({ profile, onSave, onBack, saving }) => {
    const [country, setCountry] = useState<PhoneCountry>(
        findCountryByName(profile?.country ?? undefined) || DEFAULT_PHONE_COUNTRY
    );
    const [stateProvince, setStateProvince] = useState(profile?.province || profile?.city || '');
    const [street, setStreet] = useState(profile?.street || '');
    const [plotSuite, setPlotSuite] = useState(profile?.plot_number || '');
    const [latitude, setLatitude] = useState<number | null>(profile?.latitude ?? null);
    const [longitude, setLongitude] = useState<number | null>(profile?.longitude ?? null);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [locating, setLocating] = useState(false);
    const [located, setLocated] = useState(false);

    const [countryPickerOpen, setCountryPickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCountries = PHONE_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const useCurrentLocation = async () => {
        setError(null);
        try {
            setLocating(true);
            // Dynamic import or location request fallback
            let Location: any;
            try {
                Location = require('expo-location');
            } catch {
                setError('Location service is unavailable on this device. Please enter your address below.');
                setLocating(false);
                return;
            }

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setError('Permission to access location was denied. Please fill in your address manually.');
                setLocating(false);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({});
            const { latitude: lat, longitude: lon } = loc.coords;
            setLatitude(lat);
            setLongitude(lon);

            const geocoded = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            if (geocoded && geocoded[0]) {
                const addr = geocoded[0];
                if (addr.country) {
                    const matched = findCountryByName(addr.country);
                    if (matched) setCountry(matched);
                }
                if (addr.region || addr.city) setStateProvince(addr.region || addr.city || stateProvince);
                if (addr.street || addr.name) setStreet(addr.street || addr.name || street);
                if (addr.streetNumber) setPlotSuite(addr.streetNumber || plotSuite);
            }

            setLocated(true);
            setTimeout(() => setLocated(false), 3000);
        } catch (err: any) {
            setError('Could not retrieve precise location. You can enter details manually.');
        } finally {
            setLocating(false);
        }
    };

    const handleSubmit = async () => {
        const next: Record<string, string> = {};
        if (!stateProvince.trim()) next.stateProvince = 'State/Province is required';
        if (!street.trim()) next.street = 'Street address is required';
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            setError(null);
            await onSave({
                country: country.name,
                province: stateProvince.trim(),
                street: street.trim(),
                plot_number: plotSuite.trim() || null,
                latitude,
                longitude,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to save address details.');
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

                <Pressable
                    onPress={useCurrentLocation}
                    disabled={locating}
                    style={({ pressed }) => [
                        styles.locationBtn,
                        located ? styles.locatedBtn : null,
                        { opacity: pressed ? 0.8 : 1 },
                    ]}
                >
                    {locating ? (
                        <ActivityIndicator size="small" color={colors.blue} />
                    ) : (
                        <LocateFixed size={18} color={located ? '#15803D' : colors.blue} />
                    )}
                    <Text style={[styles.locationBtnText, located ? styles.locatedBtnText : null]}>
                        {located ? 'Location set!' : 'Use Current Location'}
                    </Text>
                </Pressable>

                {/* Country Selector */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Country</Text>
                    <Pressable onPress={() => setCountryPickerOpen(true)} style={styles.selectBox}>
                        <Text style={styles.flagText}>{flagEmoji(country.iso2)}</Text>
                        <Text style={styles.selectBoxText}>{country.name}</Text>
                        <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                </View>

                {/* State / Province */}
                <TextField
                    label="State / Province"
                    value={stateProvince}
                    onChangeText={(t) => { setStateProvince(t); setErrors(prev => ({ ...prev, stateProvince: '' })); }}
                    placeholder="e.g. Lusaka Province"
                    error={errors.stateProvince}
                />

                {/* Street Address */}
                <TextField
                    label="Street Address"
                    value={street}
                    onChangeText={(t) => { setStreet(t); setErrors(prev => ({ ...prev, street: '' })); }}
                    placeholder="e.g. Great East Road"
                    error={errors.street}
                />

                {/* Plot / Suite */}
                <TextField
                    label="Apartment / Suite or House / Plot No."
                    value={plotSuite}
                    onChangeText={setPlotSuite}
                    placeholder="e.g. Plot 254"
                    optional
                />

                {/* Country Picker Modal */}
                <Modal visible={countryPickerOpen} animationType="slide" presentationStyle="pageSheet">
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Country</Text>
                            <Pressable onPress={() => setCountryPickerOpen(false)} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>Done</Text>
                            </Pressable>
                        </View>

                        <View style={styles.searchBar}>
                            <Search size={16} color={colors.textMuted} />
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search country..."
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
                                        onPress={() => { setCountry(item); setCountryPickerOpen(false); setSearchQuery(''); }}
                                        style={({ pressed }) => [styles.countryRow, { opacity: pressed ? 0.7 : 1 }]}
                                    >
                                        <Text style={styles.countryFlag}>{flagEmoji(item.iso2)}</Text>
                                        <Text style={styles.countryName}>{item.name}</Text>
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
    locationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.blue,
        backgroundColor: '#EFF6FF',
        marginBottom: 20,
        gap: 8,
    },
    locatedBtn: {
        backgroundColor: '#F0FDF4',
        borderColor: '#86EFAC',
    },
    locationBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.blue,
    },
    locatedBtnText: {
        color: '#15803D',
    },
    fieldGroup: {
        marginBottom: 16,
    },
    label: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
        marginBottom: 6,
    },
    selectBox: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        paddingHorizontal: 16,
    },
    flagText: {
        fontSize: 20,
        marginRight: 10,
    },
    selectBoxText: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.text,
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
});
