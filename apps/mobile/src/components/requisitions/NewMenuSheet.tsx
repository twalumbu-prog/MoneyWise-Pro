import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { X, ShoppingBag, FileText, History, Plus, TrendingUp } from 'lucide-react-native';
import { canDisburse, isRequestorRole } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

interface Props {
    visible: boolean;
    onClose: () => void;
    mode: 'outflows' | 'inflows';
    userRole: string | null;
    onNewSale: () => void;
    onNewRequisition: () => void;
    onSalaryAdvance: () => void;
    onStaffLoan: () => void;
    onInvest: () => void;
    onPayroll: () => void;
}

/**
 * Native port of the mobile "New" bottom sheet inline in
 * apps/web/src/pages/RequisitionList.tsx (~L1126-1260): Inflows mode offers
 * just New Sale (cash handlers only); Outflows mode offers the full request
 * menu. New Sale itself isn't ported yet (web's version is a 1,283-line POS
 * flow — cart, product browse, checkout — its own follow-up phase), so that
 * row explains that rather than opening a screen that doesn't exist.
 */
export const NewMenuSheet: React.FC<Props> = ({
    visible, onClose, mode, userRole, onNewSale, onNewRequisition, onSalaryAdvance, onStaffLoan, onInvest, onPayroll,
}) => {
    const isCashHandler = canDisburse(userRole);
    const isRequestor = isRequestorRole(userRole);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.sheet}>
                <View style={styles.handle} />
                <View style={styles.header}>
                    <Text style={styles.title}>{mode === 'inflows' ? 'New Sale' : 'New Requisition'}</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                        <X size={18} color={colors.textFaint} />
                    </Pressable>
                </View>

                <View style={styles.body}>
                    {mode === 'inflows' ? (
                        isCashHandler ? (
                            <Row icon={ShoppingBag} iconColor="#059669" title="New Sale" subtitle="Ring up products & take payment" onPress={onNewSale} />
                        ) : (
                            <Text style={styles.noPermission}>You don't have permission to record sales.</Text>
                        )
                    ) : (
                        <>
                            <Row icon={FileText} iconColor={colors.navy} title="New Requisition" subtitle="Office items, services, or equipment" onPress={onNewRequisition} />
                            <Row icon={History} iconColor={colors.navy} title="New Salary Advance" subtitle="Quick funds from your next payroll" onPress={onSalaryAdvance} />
                            <Row icon={Plus} iconColor={colors.navy} title="New Staff Loan" subtitle="Long-term loan with fixed 15% interest" onPress={onStaffLoan} />
                            <Row icon={TrendingUp} iconColor={colors.navy} title="Invest" subtitle="Grow your money with our partners" onPress={onInvest} />
                            {!isRequestor && (
                                <Row icon={FileText} iconColor={colors.navy} title="New Payroll Requisition" subtitle="Batch payroll processing" onPress={onPayroll} />
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const Row: React.FC<{ icon: any; iconColor: string; title: string; subtitle: string; onPress: () => void }> = ({ icon: Icon, iconColor, title, subtitle, onPress }) => (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={onPress}>
        <View style={styles.rowIcon}><Icon size={22} color={iconColor} /></View>
        <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
    </Pressable>
);

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%',
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt,
    },
    title: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    body: { padding: 20, gap: 10, paddingBottom: 36 },
    noPermission: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: radius.lg },
    rowIcon: {
        width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    rowSubtitle: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint, marginTop: 2 },
});
