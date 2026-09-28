import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { onboardingService } from 'core';
import { StepFooter, ErrorBanner, PrimaryButton, GhostButton } from './ui';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    organizationName: string;
    onNameSaved: (name: string) => void;
    onContinue: () => void;
    saving: boolean;
    isPersonal?: boolean;
}

export const StepWelcome: React.FC<Props> = ({ organizationName, onNameSaved, onContinue, saving, isPersonal = false }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(organizationName);
    const [savingName, setSavingName] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveName = async () => {
        const name = draft.trim();
        if (name.length < 2) {
            setError('Please enter a name with at least 2 characters.');
            return;
        }
        if (name === organizationName) {
            setEditing(false);
            return;
        }
        try {
            setSavingName(true);
            setError(null);
            await onboardingService.updateOrganizationName(name);
            onNameSaved(name);
            setEditing(false);
        } catch (err: any) {
            setError(err.message || 'Failed to update name.');
        } finally {
            setSavingName(false);
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
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {organizationName.charAt(0).toUpperCase()}
                    </Text>
                </View>

                <ErrorBanner message={error} />

                <View style={styles.titleRow}>
                    <Text style={styles.title}>Welcome, {organizationName}</Text>
                    <Pressable
                        onPress={() => { setDraft(organizationName); setEditing(true); }}
                        style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                        <Pencil size={18} color={colors.blue} />
                    </Pressable>
                </View>

                <Text style={styles.description}>
                    {isPersonal
                        ? "We'll take a moment to set up your personal budget categories and activate your personal wallet."
                        : "We'll take just a few minutes to set up your business — your brand, your store, your books, and a wallet to get paid into."}
                </Text>

                {/* Edit Name Modal */}
                <Modal visible={editing} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>{isPersonal ? 'Edit Account Name' : 'Edit Business Name'}</Text>
                            <TextInput
                                value={draft}
                                onChangeText={setDraft}
                                autoFocus
                                style={styles.modalInput}
                                placeholder="Account name"
                                placeholderTextColor={colors.textFaint}
                            />
                            <View style={styles.modalActions}>
                                <GhostButton onPress={() => { setDraft(organizationName); setEditing(false); setError(null); }}>
                                    Cancel
                                </GhostButton>
                                <PrimaryButton onPress={saveName} loading={savingName}>
                                    Save Name
                                </PrimaryButton>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>

            <StepFooter
                continueLabel={isPersonal ? "Get Started" : "Let's get started"}
                loading={saving}
                onContinue={onContinue}
                showBack={false}
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
    avatar: {
        width: 80,
        height: 80,
        borderRadius: radius.xl,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    avatarText: {
        fontFamily: fonts.bodyBold,
        fontSize: 36,
        color: colors.blue,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        paddingHorizontal: 16,
    },
    title: {
        fontFamily: fonts.bodyBold,
        fontSize: 26,
        color: colors.navy,
        textAlign: 'center',
    },
    editBtn: {
        marginLeft: 10,
        padding: 6,
        borderRadius: radius.pill,
        backgroundColor: '#EFF6FF',
    },
    description: {
        fontFamily: fonts.body,
        fontSize: 16,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
        maxWidth: 320,
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
        justifyContent: 'flex-end',
        gap: 12,
    },
});
