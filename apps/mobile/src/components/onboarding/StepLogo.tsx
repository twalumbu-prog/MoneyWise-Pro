import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { organizationService } from 'core';
import { StepFooter, ErrorBanner, GhostButton } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    organizationId: string;
    organizationName: string;
    logoUrl: string | null;
    onLogoChanged: (url: string | null) => void;
    onBack: () => void;
    onContinue: () => void;
    saving: boolean;
}

export const StepLogo: React.FC<Props> = ({
    organizationId,
    organizationName,
    logoUrl,
    onLogoChanged,
    onBack,
    onContinue,
    saving,
}) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pickAndUploadImage = async () => {
        setError(null);
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                setError('Permission to access photos is required.');
                return;
            }

            const pickerResult = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (pickerResult.canceled || !pickerResult.assets?.[0]) return;

            const asset = pickerResult.assets[0];
            setUploading(true);

            // Fetch image as blob for Supabase upload
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const ext = asset.mimeType?.split('/')[1] || 'jpg';
            const path = `${organizationId}/logo-${Date.now()}.${ext}`;

            const { data, error: uploadError } = await supabase.storage
                .from('organization-logos')
                .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: asset.mimeType || 'image/jpeg' });

            if (uploadError) throw uploadError;

            const publicUrl = supabase.storage
                .from('organization-logos')
                .getPublicUrl(data.path).data.publicUrl;

            await organizationService.updateOrganization({ logo_url: publicUrl });
            onLogoChanged(publicUrl);
        } catch (err: any) {
            setError(err.message || 'Failed to upload the logo. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        try {
            setUploading(true);
            setError(null);
            await organizationService.updateOrganization({ logo_url: null as any });
            onLogoChanged(null);
        } catch (err: any) {
            setError(err.message || 'Failed to remove logo.');
        } finally {
            setUploading(false);
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
                    onPress={pickAndUploadImage}
                    disabled={uploading}
                    style={({ pressed }) => [
                        styles.logoBox,
                        { opacity: pressed ? 0.85 : 1 },
                    ]}
                >
                    {uploading ? (
                        <ActivityIndicator size="large" color={colors.blue} />
                    ) : logoUrl ? (
                        <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
                    ) : (
                        <View style={styles.placeholderBox}>
                            <ImagePlus size={36} color={colors.textFaint} />
                            <Text style={styles.placeholderText}>Tap to add logo</Text>
                        </View>
                    )}
                </Pressable>

                {logoUrl && !uploading && (
                    <View style={styles.controlsRow}>
                        <GhostButton onPress={pickAndUploadImage}>
                            <View style={styles.iconRow}>
                                <RefreshCw size={14} color={colors.navy} />
                                <Text style={styles.ghostText}>Replace</Text>
                            </View>
                        </GhostButton>
                        <GhostButton onPress={handleRemove}>
                            <View style={styles.iconRow}>
                                <Trash2 size={14} color={colors.danger} />
                                <Text style={[styles.ghostText, { color: colors.danger }]}>Remove</Text>
                            </View>
                        </GhostButton>
                    </View>
                )}

                <Text style={styles.orgName}>{organizationName}</Text>
                <Text style={styles.subtext}>
                    You can always add or edit your logo later in settings.
                </Text>
            </ScrollView>

            <StepFooter
                onBack={onBack}
                loading={saving || uploading}
                continueLabel={logoUrl ? 'Continue' : 'Skip for now'}
                onContinue={onContinue}
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
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
    },
    logoBox: {
        width: 220,
        height: 220,
        borderRadius: radius.xl,
        borderWidth: 2,
        borderColor: colors.blue,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginBottom: 16,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    placeholderBox: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    placeholderText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.textMuted,
    },
    controlsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    ghostText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    orgName: {
        fontFamily: fonts.bodyBold,
        fontSize: 18,
        color: colors.navy,
        textAlign: 'center',
        marginTop: 8,
    },
    subtext: {
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 16,
    },
});
