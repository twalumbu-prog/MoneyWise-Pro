import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardingService } from 'core';
import { useAuth } from '../src/context/AuthContext';
import { socialOrgPickPending, clearSocialOrgPick } from '../src/lib/socialAuth';
import { colors, fonts, radius } from '../src/theme/tokens';

// Orgs whose onboarding is known-finished this session — avoids re-checking on every visit.
const onboardingDoneCache = new Set<string>();

const isPersonalOrg = (name?: string | null) => {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual');
};

/**
 * Mirrors web's HomeRedirect + ProtectedRoute: the gate every signed-in
 * session passes through, deciding between "still pending approval",
 * "belongs to more than one org, pick one", "needs onboarding", and "tabs".
 */
export default function Index() {
    const insets = useSafeAreaInsets();
    const { session, loading, userStatus, userRole, organizationId, userOrganizations, organizationsLoaded, switchOrganization, signOut } = useAuth();
    const [orgPicked, setOrgPicked] = useState(false);
    const [switchingId, setSwitchingId] = useState<string | null>(null);
    const [switchError, setSwitchError] = useState<string | null>(null);

    const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

    const activeOrgs = useMemo(
        () => userOrganizations.filter((uo) => uo.status === 'ACTIVE' || !uo.status),
        [userOrganizations]
    );

    const hasValidActiveOrg = useMemo(
        () => !!organizationId && activeOrgs.some((uo) => uo.organization.id === organizationId),
        [organizationId, activeOrgs]
    );

    const personalOrgs = useMemo(
        () => activeOrgs.filter((uo) => isPersonalOrg(uo.organization?.name)),
        [activeOrgs]
    );
    const businessOrgs = useMemo(
        () => activeOrgs.filter((uo) => !isPersonalOrg(uo.organization?.name)),
        [activeOrgs]
    );

    const [activeTab, setActiveTab] = useState<'PERSONAL' | 'BUSINESS'>(
        personalOrgs.length > 0 ? 'PERSONAL' : 'BUSINESS'
    );

    const currentList = activeTab === 'PERSONAL' ? (personalOrgs.length > 0 ? personalOrgs : businessOrgs) : (businessOrgs.length > 0 ? businessOrgs : personalOrgs);

    const handleSelect = async (orgId: string) => {
        setSwitchingId(orgId);
        setSwitchError(null);
        try {
            await switchOrganization(orgId);
            clearSocialOrgPick();
            setOrgPicked(true);
        } catch (err: any) {
            setSwitchError(err?.message || 'Failed to switch organization');
        } finally {
            setSwitchingId(null);
        }
    };

    // Auto-select if user only has 1 active organization and no active org set yet
    useEffect(() => {
        if (!loading && session && activeOrgs.length === 1 && !hasValidActiveOrg && !switchingId) {
            void handleSelect(activeOrgs[0].organization.id);
        }
    }, [loading, session, activeOrgs, hasValidActiveOrg, switchingId]);

    useEffect(() => {
        if (!session || userStatus === 'PENDING_APPROVAL') return;
        if (!userRole || !organizationId) return; // AuthContext profile fetch has not resolved yet

        if (userRole !== 'ADMIN') {
            setNeedsOnboarding(false);
            return;
        }

        if (onboardingDoneCache.has(organizationId)) {
            setNeedsOnboarding(false);
            return;
        }

        let cancelled = false;
        setNeedsOnboarding(null);

        // Never let a slow or missing connection hold the whole app on a spinner: after 5 s assume
        // onboarding is done (the same fallback as a failed request) and open the app.
        Promise.race([
            onboardingService.getState(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
            .then(s => {
                if (cancelled) return;
                if (s.progress?.status === 'COMPLETED') {
                    onboardingDoneCache.add(organizationId);
                    setNeedsOnboarding(false);
                } else {
                    setNeedsOnboarding(true);
                }
            })
            .catch(() => {
                if (!cancelled) setNeedsOnboarding(false);
            });

        return () => { cancelled = true; };
    }, [session, userStatus, userRole, organizationId, orgPicked]);

    // Signed in through Google/Apple but no organization yet: pick personal or business. This MUST come
    // before the spinner below, which would otherwise wait forever on onboarding state for such a user.
    if (!loading && organizationsLoaded && session && userStatus !== 'PENDING_APPROVAL' && activeOrgs.length === 0) {
        return <Redirect href="/complete-profile" />;
    }

    if (loading || (session && userRole && needsOnboarding === null && userStatus !== 'PENDING_APPROVAL')) {
        return (
            <View style={styles.centre}>
                <ActivityIndicator size="large" color={colors.blue} />
            </View>
        );
    }

    if (!session) return <Redirect href="/(auth)/login" />;

    if (userStatus === 'PENDING_APPROVAL') {
        return (
            <View style={styles.centre}>
                <View style={styles.card}>
                    <View style={styles.pendingIcon}>
                        <ActivityIndicator size="large" color="#CA8A04" />
                    </View>
                    <Text style={styles.title}>Pending Approval</Text>
                    <Text style={styles.body}>
                        Your request to join the organization has been submitted. Please wait for an
                        administrator to approve your account.
                    </Text>
                    <Pressable style={styles.secondaryBtn} onPress={() => signOut()}>
                        <Text style={styles.secondaryBtnText}>Sign Out</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // Only prompt for organization selection if the user does NOT have a valid active organization selected
    if ((!hasValidActiveOrg || socialOrgPickPending()) && activeOrgs.length > 1 && !orgPicked) {
        return (
            <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.card}>
                        <Text style={styles.title}>Welcome back!</Text>
                        <Text style={styles.body}>Select which account you want to access today</Text>

                        {/* Personal vs Business Tab Switcher */}
                        {personalOrgs.length > 0 && businessOrgs.length > 0 && (
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
                                        Business ({businessOrgs.length})
                                    </Text>
                                </Pressable>
                            </View>
                        )}

                        <View style={styles.orgList}>
                            {currentList.map((uo) => (
                                <Pressable
                                    key={uo.organization.id}
                                    style={styles.orgRow}
                                    onPress={() => handleSelect(uo.organization.id)}
                                    disabled={switchingId !== null}
                                >
                                    <View style={styles.orgBadge}>
                                        <Text style={styles.orgBadgeText}>{uo.organization.name.charAt(0).toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.orgRowMain}>
                                        <Text style={styles.orgName}>{uo.organization.name}</Text>
                                        <Text style={styles.orgRole}>Role: {uo.role.toLowerCase()}</Text>
                                    </View>
                                    {switchingId === uo.organization.id
                                        ? <ActivityIndicator size="small" color={colors.blue} />
                                        : <Text style={styles.orgEnter}>Enter →</Text>}
                                </Pressable>
                            ))}
                        </View>

                        {switchError && <Text style={styles.error}>{switchError}</Text>}

                        <Pressable style={styles.secondaryBtn} onPress={() => signOut()}>
                            <Text style={styles.secondaryBtnText}>Log out of account</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </View>
        );
    }

    if (needsOnboarding) return <Redirect href="/onboarding" />;

    return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingVertical: 40, flexGrow: 1, alignItems: 'center' },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, padding: 24 },
    card: {
        width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.xl,
        padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    },
    pendingIcon: {
        width: 72, height: 72, borderRadius: 36, backgroundColor: '#FEF9C3',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    title: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.navy, textAlign: 'center', marginBottom: 8 },
    body: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
    tabTrack: {
        flexDirection: 'row',
        backgroundColor: colors.canvasAlt,
        borderRadius: radius.md,
        padding: 3,
        marginBottom: 16,
        width: '100%',
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
    },
    tabBtnActive: {
        backgroundColor: colors.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
    },
    tabBtnText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 13,
        color: colors.textMuted,
    },
    tabBtnTextActive: {
        fontFamily: fonts.bodyBold,
        color: colors.navy,
    },
    orgList: { width: '100%', gap: 10 },
    orgRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
        backgroundColor: colors.surface,
    },
    orgBadge: {
        width: 40, height: 40, borderRadius: 12, backgroundColor: colors.canvasAlt,
        alignItems: 'center', justifyContent: 'center',
    },
    orgBadgeText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
    orgRowMain: { flex: 1 },
    orgName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    orgRole: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textTransform: 'capitalize', marginTop: 2 },
    orgEnter: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: 14 },
    secondaryBtn: { marginTop: 20, paddingVertical: 10 },
    secondaryBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
});
