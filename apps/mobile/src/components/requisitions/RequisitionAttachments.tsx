import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, Modal, Linking } from 'react-native';
import { Lock, X } from 'lucide-react-native';
import { requisitionService, formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

interface Doc { id: string; title: string; isAvailable: boolean; isCompleted: boolean; summary: (req: any) => string[] }

/**
 * Native port of apps/web/src/components/requisitions/RequisitionAttachments.tsx.
 * Web's "View"/"Download" both open the same client-rendered, print-styled HTML
 * form (RequisitionDocumentPreview) — there is no server-generated file behind
 * either button. This shows the same underlying facts as a plain summary sheet
 * instead of trying to replicate a print layout React Native has no equivalent
 * for, and drops the redundant second button since both did the same thing.
 */
export const RequisitionAttachments: React.FC<{ requisition: any }> = ({ requisition }) => {
    const [preview, setPreview] = useState<Doc | null>(null);
    const status = requisition.status || 'DRAFT';
    const isLoan = requisition.type === 'LOAN';
    const past = (...statuses: string[]) => !statuses.includes(status);

    const docs: Doc[] = [
        {
            id: 'pr_form',
            title: isLoan ? 'Loan Request Application' : 'Purchase Requisition Signed and Authorized',
            isAvailable: past('DRAFT', 'PENDING_APPROVAL'),
            isCompleted: past('DRAFT', 'PENDING_APPROVAL'),
            summary: (req) => [
                `Description: ${req.description}`,
                `Amount: ${formatKwacha(req.estimated_total)}`,
                `Requestor: ${req.requestor_name || 'System User'}`,
                `Status: ${req.status}`,
            ],
        },
        {
            id: 'pop_proof',
            title: `Proof of Payment${requisition.disbursements?.length ? ' — disbursed by ' + (requisition.disbursements[0].processed_by_name || 'Finance') : ''}`,
            isAvailable: past('DRAFT', 'PENDING_APPROVAL', 'AUTHORISED'),
            isCompleted: past('DRAFT', 'PENDING_APPROVAL', 'AUTHORISED'),
            summary: (req) => [
                `Amount disbursed: ${formatKwacha(req.disbursements?.[0]?.total_prepared ?? req.estimated_total)}`,
                `Method: ${req.disbursements?.[0]?.method ?? req.payment_method ?? 'N/A'}`,
                `Reference: ${req.disbursements?.[0]?.external_reference ?? req.reference_number ?? 'N/A'}`,
            ],
        },
        {
            id: 'expense_summary',
            title: 'Transactions Have been expensed with receipts',
            isAvailable: past('DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED'),
            isCompleted: past('DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED'),
            summary: (req) => (req.items ?? []).map((it: any) => `${it.description}: ${formatKwacha(it.actual_amount ?? it.estimated_amount)}`),
        },
        {
            id: 'accounting_treatment',
            title: 'Transactions Classified according to IFRSs',
            isAvailable: past('DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'DISBURSED', 'EXPENSED', 'RECEIVED', 'CATEGORIZING'),
            isCompleted: ['CATEGORIZED', 'ACCOUNTED', 'COMPLETED'].includes(status),
            summary: (req) => (req.items ?? []).map((it: any) => `${it.description} → ${it.qb_account_name ?? 'Uncategorized'}`),
        },
        {
            id: 'qb_sync',
            title: 'Successfully logged in QuickBooks Accounting',
            isAvailable: status === 'ACCOUNTED' || status === 'COMPLETED',
            isCompleted: status === 'ACCOUNTED' || status === 'COMPLETED',
            summary: (req) => [`QuickBooks expense ID: ${req.qb_expense_id ?? 'N/A'}`],
        },
    ];

    const receipts = (requisition.items ?? []).filter((it: any) => !!it.receipt_url);

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>Audit Trail</Text>
            <Text style={styles.sectionSub}>SYSTEM GENERATED DOCUMENTS</Text>

            <View style={styles.timelineCard}>
                {docs.map((doc, i) => (
                    <View key={doc.id} style={styles.timelineRow}>
                        <View style={styles.timelineLeft}>
                            <View style={[styles.dot, doc.isCompleted ? styles.dotDone : doc.isAvailable ? styles.dotActive : styles.dotLocked]}>
                                {doc.isCompleted && <View style={styles.dotCheck} />}
                            </View>
                            {i < docs.length - 1 && <View style={styles.connector} />}
                        </View>
                        <View style={[styles.timelineRight, !doc.isAvailable && styles.timelineRightLocked]}>
                            <Text style={[styles.docTitle, !doc.isAvailable && styles.docTitleLocked]}>{doc.title}</Text>
                            {doc.isAvailable ? (
                                <Pressable style={styles.viewBtn} onPress={() => setPreview(doc)}>
                                    <Text style={styles.viewBtnText}>View</Text>
                                </Pressable>
                            ) : (
                                <Lock size={13} color={colors.textFaint} />
                            )}
                        </View>
                    </View>
                ))}
            </View>

            {receipts.length > 0 && (
                <>
                    <Text style={[styles.sectionTitle, styles.spaced]}>Expense Receipts</Text>
                    <Text style={styles.sectionSub}>UPLOADED DURING EXPENSING</Text>
                    <View style={styles.receiptGrid}>
                        {receipts.map((it: any, idx: number) => {
                            const url = requisitionService.getFileUrl(it.receipt_url);
                            return (
                                <Pressable key={it.id ?? idx} style={styles.receiptCard} onPress={() => url && Linking.openURL(url)}>
                                    {url && <Image source={{ uri: url }} style={styles.receiptImage} />}
                                    <View style={styles.receiptFooter}>
                                        <Text style={styles.receiptLabel}>Receipt #{idx + 1}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </>
            )}

            <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
                <Pressable style={styles.backdrop} onPress={() => setPreview(null)}>
                    <Pressable style={styles.previewCard} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.previewHeader}>
                            <Text style={styles.previewTitle} numberOfLines={2}>{preview?.title}</Text>
                            <Pressable onPress={() => setPreview(null)} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                        </View>
                        {preview?.summary(requisition).map((line, i) => (
                            <Text key={i} style={styles.previewLine}>{line}</Text>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#E6F2FE' },
    scroll: { padding: 20, paddingBottom: 40 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    sectionSub: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5, marginTop: 2, marginBottom: 14 },
    spaced: { marginTop: 28 },
    timelineCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 0 },
    timelineRow: { flexDirection: 'row' },
    timelineLeft: { alignItems: 'center', width: 28, marginRight: 14 },
    dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    dotDone: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    dotActive: { backgroundColor: colors.surface, borderColor: colors.blue },
    dotLocked: { backgroundColor: colors.surface, borderColor: colors.border },
    dotCheck: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },
    connector: { width: 2, flex: 1, minHeight: 30, backgroundColor: colors.border, marginTop: 4 },
    timelineRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, gap: 10 },
    timelineRightLocked: { opacity: 0.5 },
    docTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, lineHeight: 18 },
    docTitleLocked: { color: colors.textFaint },
    viewBtn: { backgroundColor: colors.canvasAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
    viewBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text },
    receiptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    receiptCard: { width: '31%', backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    receiptImage: { width: '100%', aspectRatio: 0.75, backgroundColor: colors.canvasAlt },
    receiptFooter: { padding: 8 },
    receiptLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.text },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    previewCard: { width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 8 },
    previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 },
    previewTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    previewLine: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
