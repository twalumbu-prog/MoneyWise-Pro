import { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, RefreshCw, Trash2 } from 'lucide-react-native';
import { userService } from 'core';
import type { UserProfile, UserRole } from 'core';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

const ROLES: UserRole[] = ['REQUESTOR', 'AUTHORISER', 'ACCOUNTANT', 'CASHIER', 'MANAGER', 'ADMIN'];

export default function TeamMembersScreen() {
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';
    const [addOpen, setAddOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<UserRole>('REQUESTOR');

    const { data, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => userService.getAll(),
        enabled: isAdmin,
    });
    const users: UserProfile[] = data ?? [];

    const invite = useMutation({
        mutationFn: () => userService.create({ email: email.trim(), name: name.trim(), role }),
        onSuccess: (res) => {
            setAddOpen(false); setEmail(''); setName(''); setRole('REQUESTOR');
            qc.invalidateQueries({ queryKey: ['users'] });
            Alert.alert(res.status === 'ACTIVE' ? 'Added' : 'Invited', res.message);
        },
        onError: (e: Error) => Alert.alert('Could not add', e.message),
    });

    const changeRole = useMutation({
        mutationFn: ({ id, role }: { id: string; role: UserRole }) => userService.update(id, { role }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
        onError: (e: Error) => Alert.alert('Could not update role', e.message),
    });

    const remove = useMutation({
        mutationFn: (id: string) => userService.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
        onError: (e: Error) => Alert.alert('Could not remove', e.message),
    });

    const resend = useMutation({
        mutationFn: (id: string) => userService.resendInvite(id),
        onSuccess: (res) => Alert.alert('Invite resent', res.message),
        onError: (e: Error) => Alert.alert('Could not resend', e.message),
    });

    if (!isAdmin) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="Team Members" />
                <View style={styles.centre}>
                    <Text style={styles.deniedText}>Only an admin can manage team access.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Team Members" right={
                <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityLabel="Add team member">
                    <Plus size={22} color={colors.blue} />
                </Pressable>
            } />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    {users.map((u) => (
                        <View key={u.id} style={styles.card}>
                            <View style={styles.cardTop}>
                                <View style={styles.cardMain}>
                                    <Text style={styles.name} numberOfLines={1}>{u.name || u.email}</Text>
                                    <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                                </View>
                                <View style={[styles.statusPill, u.status === 'ACTIVE' && styles.statusActive]}>
                                    <Text style={[styles.statusText, u.status === 'ACTIVE' && styles.statusTextActive]}>
                                        {u.status}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.roleRow}>
                                {ROLES.map((r) => (
                                    <Pressable
                                        key={r}
                                        onPress={() => changeRole.mutate({ id: u.id, role: r })}
                                        style={[styles.roleChip, u.role === r && styles.roleChipActive]}
                                    >
                                        <Text style={[styles.roleChipText, u.role === r && styles.roleChipTextActive]}>{r}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            <View style={styles.actions}>
                                {u.status === 'INVITED' && (
                                    <Pressable style={styles.actionBtn} onPress={() => resend.mutate(u.id)}>
                                        <RefreshCw size={13} color={colors.blue} />
                                        <Text style={styles.actionBtnText}>Resend invite</Text>
                                    </Pressable>
                                )}
                                <Pressable
                                    style={styles.actionBtn}
                                    onPress={() => Alert.alert('Remove access?', `${u.name || u.email} will lose access immediately.`, [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(u.id) },
                                    ])}
                                >
                                    <Trash2 size={13} color={colors.danger} />
                                    <Text style={[styles.actionBtnText, { color: colors.danger }]}>Remove</Text>
                                </Pressable>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}

            <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
                <View style={styles.modalRoot}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add team member</Text>
                        <Pressable onPress={() => setAddOpen(false)} hitSlop={8}>
                            <X size={22} color={colors.textMuted} />
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={styles.modalScroll}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input} value={email} onChangeText={setEmail}
                            autoCapitalize="none" keyboardType="email-address" placeholder="them@example.com"
                            placeholderTextColor={colors.textFaint}
                        />
                        <Text style={[styles.label, styles.spaced]}>Name</Text>
                        <TextInput
                            style={styles.input} value={name} onChangeText={setName}
                            placeholder="Full name" placeholderTextColor={colors.textFaint}
                        />
                        <Text style={[styles.label, styles.spaced]}>Role</Text>
                        <View style={styles.roleRow}>
                            {ROLES.map((r) => (
                                <Pressable
                                    key={r} onPress={() => setRole(r)}
                                    style={[styles.roleChip, role === r && styles.roleChipActive]}
                                >
                                    <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>{r}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <Pressable
                            style={[styles.saveBtn, (!email.trim() || !name.trim()) && styles.saveBtnDisabled]}
                            onPress={() => invite.mutate()}
                            disabled={!email.trim() || !name.trim() || invite.isPending}
                        >
                            {invite.isPending
                                ? <ActivityIndicator color="#FFFFFF" />
                                : <Text style={styles.saveBtnText}>Add member</Text>}
                        </Pressable>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center', paddingHorizontal: 32 },
    deniedText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
    scroll: { padding: 20, gap: 12, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border, gap: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardMain: { flex: 1 },
    name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    email: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.canvasAlt },
    statusActive: { backgroundColor: '#E4FAF1' },
    statusText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.5, color: colors.textMuted },
    statusTextActive: { color: colors.positiveInk },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    roleChipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    roleChipText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textMuted },
    roleChipTextActive: { color: colors.blue },
    actions: { flexDirection: 'row', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    modalRoot: { flex: 1, backgroundColor: colors.canvas },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    modalScroll: { padding: 20, gap: 6, paddingBottom: 48 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 7 },
    spaced: { marginTop: 14 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 20,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
