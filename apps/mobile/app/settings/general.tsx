import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView, StyleSheet,
    ActivityIndicator, Alert, Switch, Image,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react-native';
import { organizationService, departmentService, requireCapability, getCore } from 'core';
import type { Organization, Department } from 'core';
import { uploadToBucket } from '../../src/lib/uploads';
import { useAuth } from '../../src/context/AuthContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../src/theme/tokens';

/**
 * Organisation profile, logo, and department management. ADMIN only — same
 * gate as the web General Settings tab.
 */
export default function GeneralSettingsScreen() {
    const qc = useQueryClient();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const { data: org, isLoading: orgLoading } = useQuery({
        queryKey: ['organization'],
        queryFn: () => organizationService.getOrganization(),
        enabled: isAdmin,
    });
    const { data: deptConfig, isLoading: deptLoading } = useQuery({
        queryKey: ['departments'],
        queryFn: () => departmentService.list(),
        enabled: isAdmin,
    });

    const [form, setForm] = useState<Partial<Organization>>({});
    const [dirty, setDirty] = useState(false);
    const [newDept, setNewDept] = useState('');
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => { if (org) setForm(org); }, [org]);

    const set = (patch: Partial<Organization>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

    const save = useMutation({
        mutationFn: () => organizationService.updateOrganization(form),
        onSuccess: () => {
            setDirty(false);
            qc.invalidateQueries({ queryKey: ['organization'] });
            Alert.alert('Saved', 'Organisation details updated.');
        },
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    const toggleDepartments = useMutation({
        mutationFn: (enabled: boolean) => organizationService.updateOrganization({ use_departments: enabled }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
        onError: (e: Error) => Alert.alert('Could not update', e.message),
    });

    const addDept = useMutation({
        mutationFn: () => departmentService.create(newDept.trim()),
        onSuccess: () => { setNewDept(''); qc.invalidateQueries({ queryKey: ['departments'] }); },
        onError: (e: Error) => Alert.alert('Could not add department', e.message),
    });

    const removeDept = useMutation({
        mutationFn: (id: string) => departmentService.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
        onError: (e: Error) => Alert.alert('Could not remove department', e.message),
    });

    const changeLogo = async () => {
        try {
            const [file] = await requireCapability('files').pick({ kind: 'image' });
            if (!file) return;
            setUploadingLogo(true);
            const compressed = await requireCapability('files').compressImage(file, 1 * 1024 * 1024);
            const ext = compressed.name.split('.').pop() || 'jpg';
            const path = `${org?.id ?? 'org'}/logo_${Date.now()}.${ext}`;
            await uploadToBucket('organization-logos', path, compressed);
            const { data } = getCore().supabase.storage.from('organization-logos').getPublicUrl(path);
            await organizationService.updateOrganization({ logo_url: data.publicUrl });
            qc.invalidateQueries({ queryKey: ['organization'] });
        } catch (e: any) {
            Alert.alert('Could not update logo', e?.message ?? 'Please try again.');
        } finally {
            setUploadingLogo(false);
        }
    };

    if (!isAdmin) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="General Settings" />
                <View style={styles.centre}>
                    <Text style={styles.deniedText}>Only an admin can change organisation settings.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="General Settings" />

            {(orgLoading || deptLoading) ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Logo</Text>
                        <Pressable onPress={changeLogo} style={styles.logoRow} disabled={uploadingLogo}>
                            {org?.logo_url ? (
                                <Image source={{ uri: org.logo_url }} style={styles.logo} />
                            ) : (
                                <View style={[styles.logo, styles.logoPlaceholder]}>
                                    <Text style={styles.logoPlaceholderText}>Logo</Text>
                                </View>
                            )}
                            <Text style={styles.logoCta}>
                                {uploadingLogo ? 'Uploading…' : 'Change logo'}
                            </Text>
                        </Pressable>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Organisation</Text>
                        <Field label="Name" value={form.name} onChange={(v) => set({ name: v })} />
                        <Field label="Email" value={form.email} onChange={(v) => set({ email: v })} keyboardType="email-address" />
                        <Field label="Phone" value={form.phone} onChange={(v) => set({ phone: v })} keyboardType="phone-pad" />
                        <Field label="Address" value={form.address} onChange={(v) => set({ address: v })} />
                        <Field label="Tax ID" value={form.tax_id} onChange={(v) => set({ tax_id: v })} />
                        <Field label="Website" value={form.website} onChange={(v) => set({ website: v })} keyboardType="url" last />
                        <Pressable
                            style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
                            onPress={() => save.mutate()}
                            disabled={!dirty || save.isPending}
                        >
                            {save.isPending
                                ? <ActivityIndicator color="#FFFFFF" />
                                : <Text style={styles.saveBtnText}>Save changes</Text>}
                        </Pressable>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.deptHeader}>
                            <Text style={styles.sectionTitle}>Departments</Text>
                            <Switch
                                value={!!deptConfig?.use_departments}
                                onValueChange={(v) => toggleDepartments.mutate(v)}
                                trackColor={{ true: colors.blue, false: colors.borderStrong }}
                            />
                        </View>

                        {deptConfig?.use_departments && (
                            <>
                                {(deptConfig.departments ?? []).map((d: Department) => (
                                    <View key={d.id} style={styles.deptRow}>
                                        <Text style={styles.deptName} numberOfLines={1}>{d.name}</Text>
                                        <Pressable onPress={() => removeDept.mutate(d.id)} hitSlop={8}>
                                            <Trash2 size={16} color={colors.danger} />
                                        </Pressable>
                                    </View>
                                ))}
                                <View style={styles.addDeptRow}>
                                    <TextInput
                                        style={styles.addDeptInput}
                                        value={newDept}
                                        onChangeText={setNewDept}
                                        placeholder="New department"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                    <Pressable
                                        onPress={() => newDept.trim() && addDept.mutate()}
                                        style={styles.addDeptBtn}
                                        disabled={!newDept.trim() || addDept.isPending}
                                    >
                                        <Plus size={16} color="#FFFFFF" />
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const Field: React.FC<{
    label: string; value?: string; onChange: (v: string) => void;
    keyboardType?: any; last?: boolean;
}> = ({ label, value, onChange, keyboardType, last }) => (
    <View style={!last ? styles.fieldSpaced : undefined}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
            style={styles.input}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType={keyboardType}
            autoCapitalize="none"
            placeholderTextColor={colors.textFaint}
        />
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { paddingVertical: 64, alignItems: 'center', paddingHorizontal: 32 },
    deniedText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
    scroll: { padding: 20, gap: 14, paddingBottom: 48 },
    card: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20,
        borderWidth: 1, borderColor: colors.border,
    },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
    logo: { width: 56, height: 56, borderRadius: 14 },
    logoPlaceholder: { backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    logoPlaceholderText: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    logoCta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 7 },
    fieldSpaced: { marginBottom: 14 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 11,
    },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 14,
        alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    deptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    deptRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 10,
    },
    deptName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, marginRight: 12 },
    addDeptRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    addDeptInput: {
        flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    addDeptBtn: {
        width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
});
