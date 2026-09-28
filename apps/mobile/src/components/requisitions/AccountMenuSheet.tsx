import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { X, Building2, Check, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    visible: boolean;
    onClose: () => void;
}

function getRoleLabel(role: string | null) {
    if (!role) return 'Member';
    switch (role.toUpperCase()) {
        case 'ADMIN': return 'Administrator';
        case 'ACCOUNTANT': return 'Senior Accountant';
        case 'CASHIER': return 'Financial Cashier';
        case 'REQUESTOR': return 'Staff Member';
        default: return role;
    }
}

const isPersonalOrg = (name?: string | null) => {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual');
};

export const AccountMenuSheet: React.FC<Props> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();
    const {
        user, userName, userRole, organizationId, organizationName,
        userOrganizations, switchOrganization, signOut,
    } = useAuth();

    const [switchingId, setSwitchingId] = useState<string | null>(null);

    const isCurrentPersonal = isPersonalOrg(organizationName);
    const [activeTab, setActiveTab] = useState<'PERSONAL' | 'BUSINESS'>(isCurrentPersonal ? 'PERSONAL' : 'BUSINESS');

    const activeOrgs = userOrganizations.filter((uo) => uo.status === 'ACTIVE' || !uo.status);
    const personalOrgs = activeOrgs.filter((uo) => isPersonalOrg(uo.organization?.name));
    const businessOrgs = activeOrgs.filter((uo) => !isPersonalOrg(uo.organization?.name));

    const currentList = activeTab === 'PERSONAL' ? personalOrgs : businessOrgs;

    const handleSwitch = async (targetOrgId: string) => {
        if (targetOrgId === organizationId || switchingId) return;
        setSwitchingId(targetOrgId);
        try {
            await switchOrganization(targetOrgId);
            await queryClient.invalidateQueries();
            onClose();
            router.replace('/');
        } catch (err: any) {
            Alert.alert('Switch Failed', err?.message || 'Failed to switch organization');
        } finally {
            setSwitchingId(null);
        }
    };

    const handleSignOut = () => {
        onClose();
        Alert.alert('Sign out?', 'You’ll need to sign in again to use MoneyWise.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign out',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await signOut();
                    } finally {
                        router.replace('/(auth)/login');
                    }
                },
            },
        ]);
    };

    const initial = (userName || user?.email || 'U').trim().charAt(0).toUpperCase();

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={styles.handle} />

                <View style={styles.header}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                    <View style={styles.userMain}>
                        <Text style={styles.userName} numberOfLines={1}>
                            {userName || user?.email || 'Account'}
                        </Text>
                        <Text style={styles.userRole}>
                            {getRoleLabel(userRole)} {organizationName ? `• ${organizationName}` : ''}
                        </Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                        <X size={18} color={colors.textFaint} />
                    </Pressable>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.body}
                    showsVerticalScrollIndicator={true}
                    bounces={true}
                >
                    {/* Account Switcher Tab Toggle Bar */}
                    <View style={styles.tabTrack}>
                        <Pressable
                            style={[styles.tabBtn, activeTab === 'PERSONAL' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('PERSONAL')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'PERSONAL' && styles.tabBtnTextActive]}>
                                Personal ({personalOrgs.length})
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabBtn, activeTab === 'BUSINESS' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('BUSINESS')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'BUSINESS' && styles.tabBtnTextActive]}>
                                MoneyWise Pro ({businessOrgs.length})
                            </Text>
                        </Pressable>
                    </View>

                    <Text style={styles.sectionTitle}>
                        {activeTab === 'PERSONAL' ? 'PERSONAL ACCOUNT' : 'MONEYWISE PRO ACCOUNTS'}
                    </Text>

                    {currentList.length > 0 ? (
                        currentList.map((uo) => {
                            const org = uo.organization;
                            if (!org) return null;
                            const isCurrent = org.id === organizationId;
                            const isSwitchingThis = switchingId === org.id;

                            return (
                                <Pressable
                                    key={org.id}
                                    disabled={isCurrent || !!switchingId}
                                    onPress={() => void handleSwitch(org.id)}
                                    style={({ pressed }) => [
                                        styles.orgRow,
                                        isCurrent && styles.orgRowActive,
                                        pressed && !isCurrent && { opacity: 0.7 },
                                    ]}
                                >
                                    <View style={[styles.orgIconWrap, isCurrent && styles.orgIconWrapActive]}>
                                        <Building2 size={18} color={isCurrent ? colors.blue : colors.textMuted} />
                                    </View>
                                    <View style={styles.orgMain}>
                                        <Text style={[styles.orgName, isCurrent && styles.orgNameActive]} numberOfLines={1}>
                                            {org.name}
                                        </Text>
                                        <Text style={styles.orgRoleSub}>
                                            {getRoleLabel(uo.role)}
                                        </Text>
                                    </View>
                                    {isSwitchingThis ? (
                                        <ActivityIndicator size="small" color={colors.blue} />
                                    ) : isCurrent ? (
                                        <View style={styles.activeBadge}>
                                            <Check size={14} color={colors.blue} />
                                            <Text style={styles.activeBadgeText}>Active</Text>
                                        </View>
                                    ) : null}
                                </Pressable>
                            );
                        })
                    ) : (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyText}>
                                {activeTab === 'PERSONAL'
                                    ? 'No Personal Account found.'
                                    : 'No MoneyWise Pro business accounts found.'}
                            </Text>
                        </View>
                    )}

                    <View style={styles.divider} />

                    <Pressable
                        onPress={handleSignOut}
                        style={({ pressed }) => [styles.signOutRow, pressed && { opacity: 0.7 }]}
                    >
                        <View style={styles.signOutIconWrap}>
                            <LogOut size={18} color={colors.danger} />
                        </View>
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </Pressable>
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%',
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
    userMain: { flex: 1, gap: 2 },
    userName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.navy },
    userRole: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    scroll: { flexShrink: 1 },
    body: { padding: 20, gap: 10, paddingBottom: 24 },
    tabTrack: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: radius.pill,
        padding: 4,
        marginBottom: 8,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
    },
    tabBtnActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    tabBtnText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12.5,
        color: '#6B7280',
    },
    tabBtnTextActive: {
        fontFamily: fonts.bodyBold,
        color: colors.navy,
    },
    emptyBox: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.canvasAlt,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
    },
    sectionTitle: {
        fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint,
        letterSpacing: 1.1, marginBottom: 4,
    },
    orgRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
        borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    orgRowActive: {
        borderColor: colors.blue, backgroundColor: colors.canvasAlt,
    },
    orgIconWrap: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: colors.canvasAlt,
        alignItems: 'center', justifyContent: 'center',
    },
    orgIconWrapActive: {
        backgroundColor: '#EBF4FF',
    },
    orgMain: { flex: 1, gap: 2 },
    orgName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    orgNameActive: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    orgRoleSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    activeBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
        backgroundColor: '#EBF4FF',
    },
    activeBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    signOutRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
        borderRadius: radius.md, borderWidth: 1, borderColor: '#FEE2E2',
        backgroundColor: '#FEF2F2',
    },
    signOutIconWrap: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2',
        alignItems: 'center', justifyContent: 'center',
    },
    signOutText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
});
