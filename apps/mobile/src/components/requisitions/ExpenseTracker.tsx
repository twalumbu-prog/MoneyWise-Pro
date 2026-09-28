import { useState } from 'react';
import {
    View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
    Alert, Image, Modal,
} from 'react-native';
import {
    FileText, ChevronDown, Check, Camera, ImagePlus, Plus, Trash2,
    RefreshCw, Sparkles, AlertTriangle, X,
} from 'lucide-react-native';
import { formatKwacha, requisitionService, requireCapability } from 'core';
import { captureImage } from '../../platform/files';
import { uploadReceipts } from '../../lib/uploads';
import { colors, fonts, radius } from '../../theme/tokens';

export const ExpenseTracker: React.FC<{
    requisitionData: any;
    onRefresh: () => void;
}> = ({ requisitionData, onRefresh }) => {
    const status = requisitionData?.status;
    const isExpensed = ['EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED', 'CLOSED'].includes(status) || (Number(requisitionData?.actual_total) > 0);

    const [expenseMode, setExpenseMode] = useState<'NONE' | 'MANUAL'>('NONE');
    const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
    const [expenseItems, setExpenseItems] = useState<any[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isSavingExpenses, setIsSavingExpenses] = useState(false);
    const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    const initManualEntry = () => {
        setExpenseItems(
            requisitionData?.items?.map((item: any) => ({
                ...item,
                actual_amount: item.actual_amount != null ? String(item.actual_amount) : String(item.unit_price * item.quantity),
            })) || []
        );
        setExpenseMode('MANUAL');
    };

    const handleUploadAndScan = async (source: 'camera' | 'library') => {
        setIsScanning(true);
        try {
            const files =
                source === 'camera'
                    ? await (async () => {
                          const one = await captureImage();
                          return one ? [one] : [];
                      })()
                    : await requireCapability('files').pick({ kind: 'image', multiple: true });

            if (files.length === 0) return;

            const paths = await uploadReceipts(requisitionData.id, files);
            await requisitionService.scanReceipts(requisitionData.id, paths);

            onRefresh();
            initManualEntry();
        } catch (err: any) {
            Alert.alert('Receipt Upload / OCR Failed', err?.message ?? 'Please try again.');
        } finally {
            setIsScanning(false);
        }
    };

    const handleDeleteReceipt = async (receiptId: string) => {
        Alert.alert('Delete Receipt', 'Are you sure you want to delete this receipt?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        await requisitionService.deleteReceipt(requisitionData.id, receiptId);
                        onRefresh();
                    } catch (err: any) {
                        Alert.alert('Could not delete receipt', err?.message ?? 'Please try again.');
                    }
                },
            },
        ]);
    };

    const handleReprocessReceipts = async () => {
        setIsScanning(true);
        try {
            const receiptUrls = requisitionData?.receipts?.map((r: any) => r.file_url) || [];
            if (receiptUrls.length > 0) {
                await requisitionService.scanReceipts(requisitionData.id, receiptUrls);
                onRefresh();
            }
        } catch (err: any) {
            Alert.alert('Reprocess failed', err?.message ?? 'Please try again.');
        } finally {
            setIsScanning(false);
        }
    };

    const handleConfirmExpenses = async () => {
        setIsSavingExpenses(true);
        try {
            const formattedItems = expenseItems.map((i: any) => ({
                id: i.id,
                actual_amount: parseFloat(i.actual_amount) || 0,
                receipt_url: i.receipt_url,
            }));

            await requisitionService.updateExpenses(requisitionData.id, formattedItems);

            const totalActual = formattedItems.reduce((sum, item) => sum + item.actual_amount, 0);
            const estTotal = requisitionData?.estimated_total || 0;

            if (Math.abs(totalActual - estTotal) < 0.01) {
                await requisitionService.updateStatus(requisitionData.id, 'CHANGE_SUBMITTED');
            }

            onRefresh();
            setExpenseMode('NONE');
        } catch (err: any) {
            Alert.alert('Failed to save expenses', err?.message ?? 'Please try again.');
        } finally {
            setIsSavingExpenses(false);
        }
    };

    const calcActualTotal = () => expenseItems.reduce((sum, i) => sum + (parseFloat(i.actual_amount) || 0), 0);
    const estTotal = requisitionData?.estimated_total || 0;
    const currentActualTotal = calcActualTotal();
    const changeToSubmit = Math.max(0, estTotal - currentActualTotal);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <View style={styles.iconCircle}>
                        <FileText size={14} color={colors.blue} />
                    </View>
                    <Text style={styles.headerTitle}>Finance System</Text>
                </View>
                {isExpensed && (
                    <View style={styles.expensedBadge}>
                        <Check size={10} color="#059669" />
                        <Text style={styles.expensedBadgeText}>EXPENSED</Text>
                    </View>
                )}
            </View>

            <Text style={styles.subtitleText}>
                {isExpensed ? 'Transaction expenditure recorded.' : 'This transaction needs to be expensed.'}
            </Text>

            {/* Expensed View */}
            {isExpensed ? (
                <View style={styles.expensedBlock}>
                    <Pressable style={styles.toggleDetailsBtn} onPress={() => setIsExpenseExpanded((e) => !e)}>
                        <Text style={styles.toggleDetailsText}>{isExpenseExpanded ? 'Hide Details' : 'View Expenditure Details'}</Text>
                        <ChevronDown size={16} color={colors.textMuted} style={isExpenseExpanded ? styles.chevronUp : undefined} />
                    </Pressable>

                    {isExpenseExpanded && (
                        <View style={styles.expandedExpensedBody}>
                            <View style={styles.itemsTable}>
                                {requisitionData?.items?.map((item: any, idx: number) => (
                                    <View key={item.id ?? idx} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
                                        <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                                        <View style={styles.itemRight}>
                                            <Text style={styles.itemEst}>Est: {formatKwacha(item.unit_price * item.quantity)}</Text>
                                            <Text style={styles.itemActual}>Actual: {formatKwacha(item.actual_amount)}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <View style={styles.totalsBox}>
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
                                    <Text style={styles.totalValueMuted}>{formatKwacha(requisitionData?.estimated_total)}</Text>
                                </View>
                                <View style={styles.totalRow}>
                                    <Text style={styles.totalLabel}>ACTUAL EXPENDITURE</Text>
                                    <Text style={styles.totalValueBold}>{formatKwacha(requisitionData?.actual_total)}</Text>
                                </View>
                                {requisitionData?.estimated_total > requisitionData?.actual_total && (
                                    <View style={[styles.totalRow, styles.changeRow]}>
                                        <Text style={styles.changeLabel}>CHANGE BALANCE</Text>
                                        <Text style={styles.changeValue}>{formatKwacha(requisitionData.estimated_total - requisitionData.actual_total)}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                </View>
            ) : expenseMode === 'NONE' ? (
                /* Mode = NONE: Action Selection */
                <View style={styles.actionGrid}>
                    <Pressable
                        style={styles.actionGridBtn}
                        onPress={initManualEntry}
                        disabled={isScanning}
                    >
                        <Text style={styles.actionGridBtnText}>Manual Entry</Text>
                    </Pressable>
                    <Pressable
                        style={styles.actionGridBtn}
                        onPress={() => {
                            Alert.alert('Scan Receipts', 'Choose receipt photo source', [
                                { text: 'Camera', onPress: () => handleUploadAndScan('camera') },
                                { text: 'Photo Library', onPress: () => handleUploadAndScan('library') },
                                { text: 'Cancel', style: 'cancel' },
                            ]);
                        }}
                        disabled={isScanning}
                    >
                        {isScanning ? (
                            <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                            <>
                                <Camera size={16} color={colors.text} />
                                <Text style={styles.actionGridBtnText}>Scan Receipts</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            ) : (
                /* Mode = MANUAL: Record Expenditures Form */
                <View style={styles.manualForm}>
                    <View style={styles.formHeaderRow}>
                        <Text style={styles.formTitle}>RECORD EXPENDITURES</Text>
                        <Pressable onPress={() => setExpenseMode('NONE')} hitSlop={8}>
                            <Text style={styles.cancelLinkText}>Cancel</Text>
                        </Pressable>
                    </View>

                    {/* Item List with Actual Amount Inputs */}
                    <View style={styles.itemsInputTable}>
                        {expenseItems.map((item: any, idx: number) => {
                            const actualAmt = parseFloat(item.actual_amount) || 0;
                            const aiAmt = item.ai_extracted_amount != null ? item.ai_extracted_amount : null;
                            const hasDiscrepancy = aiAmt != null && actualAmt > 0 && Math.abs(actualAmt - aiAmt) / actualAmt > 0.01;

                            return (
                                <View key={item.id ?? idx} style={[styles.inputRow, idx > 0 && styles.itemRowBorder]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                                        <Text style={styles.itemQty}>Qty {item.quantity}</Text>
                                    </View>

                                    <View style={styles.inputCellCol}>
                                        <Text style={styles.inputLabel}>ACTUAL (K)</Text>
                                        <TextInput
                                            style={[styles.amountInput, hasDiscrepancy && styles.amountInputError]}
                                            keyboardType="decimal-pad"
                                            value={String(item.actual_amount ?? '')}
                                            onChangeText={(val) => {
                                                const newItems = [...expenseItems];
                                                newItems[idx].actual_amount = val;
                                                setExpenseItems(newItems);
                                            }}
                                        />
                                        {hasDiscrepancy && (
                                            <Text style={styles.auditWarningText}>Manual Audit Req</Text>
                                        )}
                                    </View>

                                    <View style={styles.aiCellCol}>
                                        <Text style={styles.inputLabel}>AI FOUND</Text>
                                        <View style={[styles.aiPill, aiAmt != null ? styles.aiPillActive : styles.aiPillMuted]}>
                                            <Text style={[styles.aiPillText, aiAmt != null ? styles.aiPillTextActive : styles.aiPillTextMuted]}>
                                                {aiAmt != null ? formatKwacha(aiAmt) : 'Not Found'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    {/* Expenditure Summary */}
                    <View style={styles.totalsBox}>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
                            <Text style={styles.totalValueMuted}>{formatKwacha(estTotal)}</Text>
                        </View>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>ACTUAL TOTAL</Text>
                            <Text style={styles.totalValueBold}>{formatKwacha(currentActualTotal)}</Text>
                        </View>
                        {estTotal > currentActualTotal && (
                            <View style={[styles.totalRow, styles.changeRow]}>
                                <Text style={styles.changeLabel}>CHANGE TO SUBMIT</Text>
                                <Text style={styles.changeValue}>{formatKwacha(changeToSubmit)}</Text>
                            </View>
                        )}
                    </View>

                    {/* Confirm Expenses Button */}
                    <Pressable
                        style={styles.confirmExpensesBtn}
                        onPress={handleConfirmExpenses}
                        disabled={isSavingExpenses || isScanning}
                    >
                        {isSavingExpenses ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.confirmExpensesBtnText}>Confirm Expenses</Text>
                        )}
                    </Pressable>

                    {/* Attached Receipts Section */}
                    <View style={styles.attachedReceiptsSection}>
                        <View style={styles.attachedHeaderRow}>
                            <Text style={styles.attachedTitle}>ATTACHED RECEIPTS</Text>
                            {isScanning && (
                                <View style={styles.scanningIndicator}>
                                    <ActivityIndicator size="small" color={colors.blue} />
                                    <Text style={styles.scanningText}>AI Checking…</Text>
                                </View>
                            )}
                        </View>

                        {/* List of Receipt Cards */}
                        {requisitionData?.receipts?.map((receipt: any) => {
                            const isExpanded = expandedReceiptId === receipt.id;
                            const ocr = receipt.ocr_data;

                            return (
                                <View key={receipt.id} style={styles.receiptCard}>
                                    <View style={styles.receiptCardMain}>
                                        <Pressable
                                            style={styles.receiptThumbWrap}
                                            onPress={() => setPreviewImageUrl(receipt.file_url)}
                                        >
                                            <Image source={{ uri: receipt.file_url }} style={styles.receiptThumb} />
                                        </Pressable>

                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.receiptVendor} numberOfLines={1}>
                                                {ocr?.vendor || 'Receipt Uploaded'}
                                            </Text>
                                            <View style={styles.receiptMetaRow}>
                                                {ocr?.total_amount != null ? (
                                                    <View style={styles.ocrTotalTag}>
                                                        <Text style={styles.ocrTotalTagText}>
                                                            {ocr.currency && ocr.currency.toUpperCase() !== 'ZMW'
                                                                ? `${ocr.currency} ${ocr.total_amount}`
                                                                : formatKwacha(ocr.total_amount)}
                                                        </Text>
                                                    </View>
                                                ) : (
                                                    <Text style={styles.noOcrText}>No total found</Text>
                                                )}
                                                {ocr?.date && <Text style={styles.ocrDateText}>{ocr.date}</Text>}
                                            </View>
                                        </View>

                                        <View style={styles.receiptActionsRight}>
                                            <Pressable
                                                style={[styles.viewDataBtn, isExpanded && styles.viewDataBtnActive]}
                                                onPress={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                                            >
                                                <Text style={[styles.viewDataBtnText, isExpanded && styles.viewDataBtnTextActive]}>
                                                    {isExpanded ? 'Hide' : 'Data'}
                                                </Text>
                                                <ChevronDown size={12} color={isExpanded ? colors.blue : colors.textMuted} style={isExpanded ? styles.chevronUp : undefined} />
                                            </Pressable>
                                            <Pressable
                                                style={styles.deleteReceiptBtn}
                                                onPress={() => handleDeleteReceipt(receipt.id)}
                                                hitSlop={8}
                                            >
                                                <Trash2 size={14} color={colors.danger} />
                                            </Pressable>
                                        </View>
                                    </View>

                                    {/* Expanded OCR details */}
                                    {isExpanded && (
                                        <View style={styles.ocrExpandedBody}>
                                            {ocr?.error ? (
                                                <View style={styles.ocrErrorBox}>
                                                    <AlertTriangle size={14} color={colors.danger} />
                                                    <Text style={styles.ocrErrorText}>{ocr.error}</Text>
                                                </View>
                                            ) : ocr ? (
                                                <View style={{ gap: 10 }}>
                                                    <View style={styles.aiExtractionHeader}>
                                                        <Sparkles size={12} color={colors.blue} />
                                                        <Text style={styles.aiExtractionTitle}>AI EXTRACTION</Text>
                                                    </View>
                                                    <View style={styles.ocrGrid}>
                                                        <View style={styles.ocrGridCell}>
                                                            <Text style={styles.ocrCellLabel}>VENDOR</Text>
                                                            <Text style={styles.ocrCellValue}>{ocr.vendor || '-'}</Text>
                                                        </View>
                                                        <View style={styles.ocrGridCell}>
                                                            <Text style={styles.ocrCellLabel}>TOTAL AMOUNT</Text>
                                                            <Text style={[styles.ocrCellValue, { color: colors.blue }]}>
                                                                {ocr.total_amount != null ? formatKwacha(ocr.total_amount) : '-'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            ) : (
                                                <Text style={styles.noOcrText}>No AI data available for this receipt yet.</Text>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}

                        {/* Upload Receipts & Reprocess buttons */}
                        <View style={styles.uploadRowBtns}>
                            <Pressable
                                style={styles.uploadDashedBtn}
                                onPress={() => {
                                    Alert.alert('Upload Receipts', 'Choose receipt photo source', [
                                        { text: 'Camera', onPress: () => handleUploadAndScan('camera') },
                                        { text: 'Photo Library', onPress: () => handleUploadAndScan('library') },
                                        { text: 'Cancel', style: 'cancel' },
                                    ]);
                                }}
                                disabled={isScanning}
                            >
                                <ImagePlus size={14} color={colors.textMuted} />
                                <Text style={styles.uploadDashedBtnText}>UPLOAD RECEIPTS</Text>
                                <Plus size={14} color={colors.textMuted} />
                            </Pressable>

                            {requisitionData?.receipts?.length > 0 && (
                                <Pressable
                                    style={styles.reprocessBtn}
                                    onPress={handleReprocessReceipts}
                                    disabled={isScanning}
                                >
                                    <RefreshCw size={14} color={colors.textMuted} />
                                </Pressable>
                            )}
                        </View>
                    </View>
                </View>
            )}

            {/* Receipt Full Image Preview Modal */}
            <Modal visible={!!previewImageUrl} transparent animationType="fade">
                <View style={styles.modalBg}>
                    <Pressable style={styles.modalCloseBtn} onPress={() => setPreviewImageUrl(null)}>
                        <X size={24} color="#FFFFFF" />
                    </Pressable>
                    {previewImageUrl && (
                        <Image source={{ uri: previewImageUrl }} style={styles.modalImage} resizeMode="contain" />
                    )}
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { gap: 12, paddingTop: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    expensedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: '#D1FAE5', backgroundColor: '#ECFDF5' },
    expensedBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#059669', letterSpacing: 0.5 },
    subtitleText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, lineHeight: 18 },
    expensedBlock: { gap: 10 },
    toggleDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.canvasAlt, height: 44, borderRadius: radius.pill, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
    toggleDetailsText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    chevronUp: { transform: [{ rotate: '180deg' }] },
    expandedExpensedBody: { gap: 10 },
    itemsTable: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    itemDesc: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.text },
    itemRight: { alignItems: 'flex-end' },
    itemEst: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    itemActual: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, marginTop: 1 },
    totalsBox: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },
    totalValueMuted: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    totalValueBold: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    changeRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
    changeLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.blue, letterSpacing: 0.5 },
    changeValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
    actionGrid: { flexDirection: 'row', gap: 10, marginTop: 6 },
    actionGridBtn: { flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionGridBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    manualForm: { gap: 14, marginTop: 6 },
    formHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    formTitle: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8 },
    cancelLinkText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    itemsInputTable: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surface },
    inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    itemQty: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 2 },
    inputCellCol: { alignItems: 'flex-end', width: 90 },
    inputLabel: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.textFaint, letterSpacing: 0.5, marginBottom: 3 },
    amountInput: { width: 84, height: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, textAlign: 'right', paddingHorizontal: 8 },
    amountInputError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
    auditWarningText: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.danger, marginTop: 2 },
    aiCellCol: { alignItems: 'flex-end', width: 80 },
    aiPill: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1 },
    aiPillActive: { backgroundColor: colors.tabActiveBg, borderColor: 'rgba(0,106,255,0.2)' },
    aiPillMuted: { backgroundColor: colors.canvasAlt, borderColor: colors.border },
    aiPillText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    aiPillTextActive: { color: colors.blue },
    aiPillTextMuted: { color: colors.textFaint, fontStyle: 'italic' },
    confirmExpensesBtn: { height: 46, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    confirmExpensesBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    attachedReceiptsSection: { gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    attachedHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    attachedTitle: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8 },
    scanningIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scanningText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue },
    receiptCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
    receiptCardMain: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
    receiptThumbWrap: { width: 44, height: 44, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border },
    receiptThumb: { width: '100%', height: '100%' },
    receiptVendor: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    receiptMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    ocrTotalTag: { backgroundColor: colors.tabActiveBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
    ocrTotalTagText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.blue },
    noOcrText: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, fontStyle: 'italic' },
    ocrDateText: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    receiptActionsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    viewDataBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.md, backgroundColor: colors.canvasAlt, borderWidth: 1, borderColor: colors.border },
    viewDataBtnActive: { backgroundColor: colors.tabActiveBg, borderColor: 'rgba(0,106,255,0.2)' },
    viewDataBtnText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted },
    viewDataBtnTextActive: { color: colors.blue },
    deleteReceiptBtn: { padding: 6 },
    ocrExpandedBody: { padding: 12, backgroundColor: colors.canvasAlt, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    ocrErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', padding: 8, borderRadius: radius.md },
    ocrErrorText: { fontFamily: fonts.body, fontSize: 10, color: colors.danger, flex: 1 },
    aiExtractionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    aiExtractionTitle: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, letterSpacing: 0.8 },
    ocrGrid: { flexDirection: 'row', gap: 10 },
    ocrGridCell: { flex: 1, backgroundColor: colors.surface, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    ocrCellLabel: { fontFamily: fonts.bodyBold, fontSize: 8, color: colors.textFaint, letterSpacing: 0.5 },
    ocrCellValue: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.text, marginTop: 2 },
    uploadRowBtns: { flexDirection: 'row', gap: 10 },
    uploadDashedBtn: { flex: 1, height: 42, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface },
    uploadDashedBtnText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
    reprocessBtn: { width: 42, height: 42, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
    modalCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
    modalImage: { width: '90%', height: '80%' },
});
