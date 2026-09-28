import { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
    TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, X, Plus, Trash2 } from 'lucide-react-native';
import { payrollService, formatKwacha, formatShortDate } from 'core';
import type { StaffAllowance, StaffDeduction } from 'core';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { colors, fonts, radius } from '../../../../src/theme/tokens';

type DetailTab = 'history' | 'profile' | 'changelog';

/** Staff profile, payroll history and the edit form. Matches StaffMemberDetail.tsx. */
export default function StaffMemberDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const qc = useQueryClient();
    const [tab, setTab] = useState<DetailTab>('history');
    const [editing, setEditing] = useState(false);

    const { data: member, isLoading } = useQuery({
        queryKey: ['staff-member', id],
        queryFn: () => payrollService.getStaffMember(String(id)),
    });
    const { data: history, isLoading: historyLoading } = useQuery({
        queryKey: ['staff-history', id],
        queryFn: () => payrollService.getStaffPayrollHistory(String(id)),
        enabled: tab === 'history',
    });

    const fullName = member ? [member.first_name, member.last_name].filter(Boolean).join(' ') : '—';

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title={fullName} right={
                member ? (
                    <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityLabel="Edit profile">
                        <Pencil size={18} color={colors.textMuted} />
                    </Pressable>
                ) : undefined
            } />

            {isLoading ? (
                <View style={styles.centre}><ActivityIndicator color={colors.blue} /></View>
            ) : member ? (
                <>
                    <View style={styles.bioStrip}>
                        <BioField label="Contact" value={member.phone} />
                        <BioField label="Email" value={member.email} />
                        <BioField label="Status" value={member.status} />
                    </View>

                    <View style={styles.tabRow}>
                        {(['history', 'profile', 'changelog'] as DetailTab[]).map((t) => (
                            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabPill, tab === t && styles.tabPillActive]}>
                                <Text style={[styles.tabPillText, tab === t && styles.tabPillTextActive]}>
                                    {t === 'history' ? 'Payroll History' : t === 'profile' ? 'Profile' : 'Work history'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {tab === 'history' && (
                        <ScrollView contentContainerStyle={styles.scroll}>
                            {historyLoading ? (
                                <ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} />
                            ) : (history ?? []).length === 0 ? (
                                <Text style={styles.emptyText}>No payroll history yet.</Text>
                            ) : (history ?? []).map((item) => (
                                <View key={item.id} style={styles.historyRow}>
                                    <Text style={styles.historyPeriod}>{item.payroll_runs.period_label}</Text>
                                    <Text style={styles.historyAmounts}>
                                        Net {formatKwacha(item.net_pay)} · Gross {formatKwacha(item.gross_pay)}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    {tab === 'profile' && (
                        <ScrollView contentContainerStyle={styles.scroll}>
                            <View style={styles.profileGrid}>
                                <ProfileField label="Employee #" value={member.employee_number} />
                                <ProfileField label="Department" value={member.department} />
                                <ProfileField label="Position" value={member.position} />
                                <ProfileField label="Gender" value={member.gender} />
                                <ProfileField label="Date of Birth" value={member.date_of_birth ? formatShortDate(member.date_of_birth) : undefined} />
                                <ProfileField label="ID Type" value={member.id_type} />
                                <ProfileField label="ID Number" value={member.id_number} />
                                <ProfileField label="NAPSA Number" value={member.napsa_number} />
                                <ProfileField label="NHIMA Number" value={member.nhima_number} />
                                <ProfileField label="ZRA TPIN" value={member.zra_tpin} />
                                <ProfileField label="Basic Pay" value={formatKwacha(member.basic_pay)} />
                                <ProfileField label="Payment Method" value={member.payment_method} />
                                <ProfileField label="Bank" value={member.bank_name} />
                                <ProfileField label="Account Number" value={member.bank_account_number} />
                                <ProfileField label="Mobile Money" value={member.mobile_money_number} />
                            </View>

                            {member.allowances?.length > 0 && (
                                <View style={styles.breakdownCard}>
                                    <Text style={styles.breakdownTitle}>Allowances</Text>
                                    {member.allowances.map((a, i) => (
                                        <View key={i} style={styles.breakdownRow}>
                                            <Text style={styles.breakdownName}>{a.name}</Text>
                                            <Text style={styles.breakdownAmount}>{formatKwacha(a.amount)}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                            {member.deductions?.length > 0 && (
                                <View style={styles.breakdownCard}>
                                    <Text style={styles.breakdownTitle}>Deductions</Text>
                                    {member.deductions.map((d, i) => (
                                        <View key={i} style={styles.breakdownRow}>
                                            <Text style={styles.breakdownName}>{d.name} ({d.type})</Text>
                                            <Text style={styles.breakdownAmount}>{formatKwacha(d.amount)}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {tab === 'changelog' && (
                        <View style={styles.centre}><Text style={styles.emptyText}>Work history coming soon</Text></View>
                    )}
                </>
            ) : (
                <View style={styles.centre}><Text style={styles.emptyText}>Staff member not found.</Text></View>
            )}

            {member && (
                <EditStaffModal
                    visible={editing}
                    onClose={() => setEditing(false)}
                    member={member}
                    onSaved={() => {
                        setEditing(false);
                        qc.invalidateQueries({ queryKey: ['staff-member', id] });
                        qc.invalidateQueries({ queryKey: ['payroll-staff'] });
                    }}
                />
            )}
        </View>
    );
}

const BioField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <View style={styles.bioField}>
        <Text style={styles.bioLabel}>{label}</Text>
        <Text style={styles.bioValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
);
const ProfileField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <View style={styles.profileField}>
        <Text style={styles.profileLabel}>{label}</Text>
        <Text style={styles.profileValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
);

const ID_TYPES = ['NRC', 'Passport', 'Driver’s Licence'];

const EditStaffModal: React.FC<{
    visible: boolean; onClose: () => void; member: any; onSaved: () => void;
}> = ({ visible, onClose, member, onSaved }) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [idType, setIdType] = useState('NRC');
    const [idNumber, setIdNumber] = useState('');
    const [napsaNumber, setNapsaNumber] = useState('');
    const [nhimaNumber, setNhimaNumber] = useState('');
    const [zraTpin, setZraTpin] = useState('');
    const [basicPay, setBasicPay] = useState('');
    const [allowances, setAllowances] = useState<StaffAllowance[]>([]);
    const [deductions, setDeductions] = useState<StaffDeduction[]>([]);

    useEffect(() => {
        if (visible && member) {
            setFirstName(member.first_name ?? '');
            setLastName(member.last_name ?? '');
            setDepartment(member.department ?? '');
            setPosition(member.position ?? '');
            setPhone(member.phone ?? '');
            setEmail(member.email ?? '');
            setIdType(member.id_type ?? 'NRC');
            setIdNumber(member.id_number ?? '');
            setNapsaNumber(member.napsa_number ?? '');
            setNhimaNumber(member.nhima_number ?? '');
            setZraTpin(member.zra_tpin ?? '');
            setBasicPay(String(member.basic_pay ?? ''));
            setAllowances(member.allowances ? [...member.allowances] : []);
            setDeductions(member.deductions ? [...member.deductions] : []);
        }
    }, [visible, member]);

    const save = useMutation({
        mutationFn: () => payrollService.updateStaffMember(member.id, {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            department: department.trim() || undefined,
            position: position.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            id_type: idType || undefined,
            id_number: idNumber.trim() || undefined,
            napsa_number: napsaNumber.trim() || undefined,
            nhima_number: nhimaNumber.trim() || undefined,
            zra_tpin: zraTpin.trim() || undefined,
            basic_pay: parseFloat(basicPay) || undefined,
            allowances,
            deductions,
        }),
        onSuccess: onSaved,
        onError: (e: Error) => Alert.alert('Could not save', e.message),
    });

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Edit Profile</Text>
                    <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.textMuted} /></Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                    <Row2>
                        <Field label="First name" value={firstName} onChange={setFirstName} />
                        <Field label="Last name" value={lastName} onChange={setLastName} />
                    </Row2>
                    <Row2>
                        <Field label="Department" value={department} onChange={setDepartment} />
                        <Field label="Position" value={position} onChange={setPosition} />
                    </Row2>
                    <Row2>
                        <Field label="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" />
                        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
                    </Row2>

                    <Text style={styles.modalSectionTitle}>Statutory</Text>
                    <Text style={styles.label}>ID Type</Text>
                    <View style={styles.chips}>
                        {ID_TYPES.map((t) => (
                            <Pressable key={t} onPress={() => setIdType(t)} style={[styles.chip, idType === t && styles.chipActive]}>
                                <Text style={[styles.chipText, idType === t && styles.chipTextActive]}>{t}</Text>
                            </Pressable>
                        ))}
                    </View>
                    <Row2>
                        <Field label="ID Number" value={idNumber} onChange={setIdNumber} />
                        <Field label="ZRA TPIN" value={zraTpin} onChange={setZraTpin} />
                    </Row2>
                    <Row2>
                        <Field label="NAPSA Number" value={napsaNumber} onChange={setNapsaNumber} />
                        <Field label="NHIMA Number" value={nhimaNumber} onChange={setNhimaNumber} />
                    </Row2>

                    <Text style={styles.modalSectionTitle}>Compensation</Text>
                    <Field label="Basic pay (K)" value={basicPay} onChange={(v) => setBasicPay(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />

                    <BreakdownEditor
                        title="Allowances" items={allowances}
                        onAdd={() => setAllowances((p) => [...p, { name: '', amount: 0 }])}
                        onRemove={(i) => setAllowances((p) => p.filter((_, j) => j !== i))}
                        onChangeName={(i, v) => setAllowances((p) => p.map((a, j) => j === i ? { ...a, name: v } : a))}
                        onChangeAmount={(i, v) => setAllowances((p) => p.map((a, j) => j === i ? { ...a, amount: Number(v) || 0 } : a))}
                    />
                    <DeductionEditor
                        items={deductions}
                        onAdd={() => setDeductions((p) => [...p, { name: '', amount: 0, type: 'FIXED' }])}
                        onRemove={(i) => setDeductions((p) => p.filter((_, j) => j !== i))}
                        onChangeName={(i, v) => setDeductions((p) => p.map((d, j) => j === i ? { ...d, name: v } : d))}
                        onChangeAmount={(i, v) => setDeductions((p) => p.map((d, j) => j === i ? { ...d, amount: Number(v) || 0 } : d))}
                        onChangeType={(i, v) => setDeductions((p) => p.map((d, j) => j === i ? { ...d, type: v } : d))}
                    />

                    <Pressable style={styles.saveBtn} onPress={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const Row2: React.FC<{ children: React.ReactNode }> = ({ children }) => <View style={styles.row2}>{children}</View>;

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; keyboardType?: any }> = ({ label, value, onChange, keyboardType }) => (
    <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={colors.textFaint} />
    </View>
);

const BreakdownEditor: React.FC<{
    title: string; items: StaffAllowance[]; onAdd: () => void; onRemove: (i: number) => void;
    onChangeName: (i: number, v: string) => void; onChangeAmount: (i: number, v: string) => void;
}> = ({ title, items, onAdd, onRemove, onChangeName, onChangeAmount }) => (
    <View style={{ marginTop: 6 }}>
        <View style={styles.sectionHeader}>
            <Text style={styles.modalSectionTitle}>{title}</Text>
            <Pressable onPress={onAdd} hitSlop={8}><Plus size={18} color={colors.blue} /></Pressable>
        </View>
        {items.map((a, i) => (
            <View key={i} style={styles.breakdownEditRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={a.name} onChangeText={(v) => onChangeName(i, v)} placeholder="Name" placeholderTextColor={colors.textFaint} />
                <TextInput style={[styles.input, { width: 90 }]} value={String(a.amount || '')} onChangeText={(v) => onChangeAmount(i, v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                <Pressable onPress={() => onRemove(i)} hitSlop={8}><Trash2 size={16} color={colors.danger} /></Pressable>
            </View>
        ))}
    </View>
);

const DEDUCTION_TYPES: StaffDeduction['type'][] = ['FIXED', 'LOAN', 'ADVANCE'];

const DeductionEditor: React.FC<{
    items: StaffDeduction[]; onAdd: () => void; onRemove: (i: number) => void;
    onChangeName: (i: number, v: string) => void; onChangeAmount: (i: number, v: string) => void;
    onChangeType: (i: number, v: StaffDeduction['type']) => void;
}> = ({ items, onAdd, onRemove, onChangeName, onChangeAmount, onChangeType }) => (
    <View style={{ marginTop: 6 }}>
        <View style={styles.sectionHeader}>
            <Text style={styles.modalSectionTitle}>Deductions</Text>
            <Pressable onPress={onAdd} hitSlop={8}><Plus size={18} color={colors.blue} /></Pressable>
        </View>
        {items.map((d, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
                <View style={styles.breakdownEditRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} value={d.name} onChangeText={(v) => onChangeName(i, v)} placeholder="Name" placeholderTextColor={colors.textFaint} />
                    <TextInput style={[styles.input, { width: 90 }]} value={String(d.amount || '')} onChangeText={(v) => onChangeAmount(i, v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                    <Pressable onPress={() => onRemove(i)} hitSlop={8}><Trash2 size={16} color={colors.danger} /></Pressable>
                </View>
                <View style={[styles.chips, { marginTop: 6 }]}>
                    {DEDUCTION_TYPES.map((t) => (
                        <Pressable key={t} onPress={() => onChangeType(i, t)} style={[styles.chip, d.type === t && styles.chipActive]}>
                            <Text style={[styles.chipText, d.type === t && styles.chipTextActive]}>{t}</Text>
                        </Pressable>
                    ))}
                </View>
            </View>
        ))}
    </View>
);

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
    bioStrip: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14,
    },
    bioField: { flex: 1, alignItems: 'center' },
    bioLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase' },
    bioValue: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text, marginTop: 3 },
    tabRow: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 10, padding: 4,
        backgroundColor: colors.canvasAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    },
    tabPill: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    tabPillActive: { backgroundColor: colors.surface },
    tabPillText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint },
    tabPillTextActive: { color: colors.navy },
    scroll: { paddingHorizontal: 20, paddingBottom: 48, gap: 10 },
    historyRow: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    historyPeriod: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    historyAmounts: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 3 },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    profileField: { width: '46%' },
    profileLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase' },
    profileValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginTop: 2 },
    breakdownCard: {
        marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border,
    },
    breakdownTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, marginBottom: 6 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    breakdownName: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    breakdownAmount: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    modalRoot: { flex: 1, backgroundColor: colors.canvas },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    modalScroll: { padding: 20, gap: 12, paddingBottom: 48 },
    modalSectionTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, textTransform: 'uppercase', marginTop: 6 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    row2: { flexDirection: 'row', gap: 10 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, marginBottom: 6 },
    input: {
        fontFamily: fonts.body, fontSize: 13, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipActive: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    chipTextActive: { color: colors.blue },
    breakdownEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 15,
        alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 10,
    },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
