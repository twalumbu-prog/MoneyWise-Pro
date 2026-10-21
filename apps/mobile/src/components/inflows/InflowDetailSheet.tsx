import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator, Image, StyleSheet, Share, Alert, Linking } from 'react-native';
import {
    X, Package, MapPin, Truck, ShoppingBag, AlertCircle, CheckCircle2, Clock, RotateCcw, AlertTriangle,
    Download, User, Phone, CreditCard, BookOpen, PackageCheck,
} from 'lucide-react-native';
import {
    productService, formatKwacha, buildInflowReceipt, renderReceiptHtml, channelLabel, paymentMethodLabel, isDeliverable, formatReceiptDate,
} from 'core';
import type { ProductSale, InflowDetail } from 'core';
import { inflowTitle, type InflowRow } from './inflowUtils';
import { colors, fonts, radius } from '../../theme/tokens';

const STATUS_MAP: Record<string, { label: string; icon: any; color: string }> = {
    COMPLETED: { label: 'Completed', icon: CheckCircle2, color: '#059669' },
    ACCOUNTED: { label: 'Accounted', icon: CheckCircle2, color: '#059669' },
    PENDING: { label: 'Pending', icon: Clock, color: colors.blue },
    FAILED: { label: 'Failed', icon: AlertTriangle, color: colors.danger },
    PROCESSING: { label: 'Processing', icon: RotateCcw, color: colors.textFaint },
};
const statusCfg = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.COMPLETED;

/** Native port of apps/web/src/components/InflowDetailDrawer.tsx as a bottom sheet. */
export const InflowDetailSheet: React.FC<{ inflow: InflowRow | null; onClose: () => void }> = ({ inflow, onClose }) => {
    const [detail, setDetail] = useState<InflowDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        setDetail(null);
        setError(null);
        if (!inflow) return;
        let cancelled = false;
        setLoading(true);
        productService.getInflowDetail(inflow.id, inflow.reference_number)
            .then((d) => { if (!cancelled) setDetail(d); })
            .catch(() => { if (!cancelled) setError('Could not load the full details for this inflow.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [inflow?.id]);

    if (!inflow) return null;

    const title = inflowTitle(inflow.description);
    const sales: ProductSale[] = detail?.sales ?? [];
    const receipt = detail ? buildInflowReceipt(detail, inflow) : null;
    const amount = receipt?.amount ?? (inflow.debit || 0);
    const dateStr = new Date(inflow.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const cfg = statusCfg(inflow.status || 'COMPLETED');
    const StatusIcon = cfg.icon;
    const deliverySale = sales.find((s) => s.order_details);
    const delivery = deliverySale?.order_details;
    const deliverable = sales.filter(isDeliverable);
    const deliveredCount = deliverable.filter((x) => x.delivery_status === 'DELIVERED').length;

    const toggleDelivered = async (sale: ProductSale) => {
        const next = sale.delivery_status !== 'DELIVERED';
        setTogglingId(sale.id);
        try {
            const res = await productService.setSaleDelivery(sale.id, next);
            setDetail((d) => d && ({
                ...d,
                sales: d.sales.map((x) => x.id === sale.id ? { ...x, delivery_status: res.delivery_status as any, delivered_at: res.delivered_at } : x),
            }));
        } catch {
            setError('Could not update the delivery status. Please try again.');
        } finally {
            setTogglingId(null);
        }
    };

    const downloadReceipt = async () => {
        if (!receipt) return;
        setExporting(true);
        try {
            // Loaded lazily: builds made before these native modules shipped fall back to a text share instead of crashing.
            const Print = require('expo-print');
            const Sharing = require('expo-sharing');
            const { uri } = await Print.printToFileAsync({ html: renderReceiptHtml(receipt) });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Receipt ${receipt.receiptNo}` });
            } else {
                Alert.alert('Receipt saved', uri);
            }
        } catch {
            const lines = [
                `${receipt.organizationName} — Receipt #${receipt.receiptNo}`,
                `Date: ${formatReceiptDate(receipt.date)}`,
                `Amount: ${formatKwacha(receipt.amount)}`,
                `Payment method: ${receipt.paymentMethod}`,
                receipt.payer.name ? `Customer: ${receipt.payer.name}${receipt.payer.phone ? ` (${receipt.payer.phone})` : ''}` : '',
                ...receipt.items.map((i) => `• ${i.name} x${i.quantity} — ${formatKwacha(i.total)}${i.responses.map((r) => ` [${r.label}: ${r.value}]`).join('')}${i.delivery ? (i.delivery.delivered ? ' (Delivered)' : ' (Awaiting delivery)') : ''}`),
                `Accounting: ${receipt.accounting.summary}`,
            ].filter(Boolean);
            await Share.share({ message: lines.join('\n') }).catch(() => {});
        } finally {
            setExporting(false);
        }
    };

    return (
        <Modal visible={!!inflow} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.sheet}>
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        <Text style={styles.date}>{dateStr}</Text>
                    </View>
                    <Pressable onPress={onClose} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                </View>

                <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body}>
                    <View style={styles.amountCard}>
                        <View>
                            <Text style={styles.amountLabel}>Amount received</Text>
                            <Text style={styles.amountValue}>{formatKwacha(amount)}</Text>
                        </View>
                        <View style={styles.statusPill}>
                            <StatusIcon size={13} color={cfg.color} />
                            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>

                    {loading && (
                        <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.loadingText}>Loading details…</Text></View>
                    )}
                    {error && (
                        <View style={styles.errorRow}><AlertCircle size={14} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
                    )}

                    <View style={styles.section}>
                        <View style={styles.sectionHead}><CreditCard size={12} color={colors.textFaint} /><Text style={styles.sectionTitle}>Payment</Text></View>
                        <View style={styles.card}>
                            <KV label="Reference" value={inflow.reference_number} mono />
                            <KV label="Payment method" value={receipt?.paymentMethod ?? paymentMethodLabel(inflow.account_type)} />
                            <KV label="Channel" value={receipt?.channel ?? channelLabel(inflow.account_type)} />
                            <KV label="Received into" value={receipt?.wallet} />
                        </View>
                    </View>

                    {receipt && (receipt.payer.name || receipt.payer.phone) && (
                        <View style={styles.section}>
                            <View style={styles.sectionHead}><User size={12} color={colors.textFaint} /><Text style={styles.sectionTitle}>Customer</Text></View>
                            <View style={styles.card}>
                                {receipt.payer.name && <Text style={styles.customerName}>{receipt.payer.name}</Text>}
                                {receipt.payer.phone && (
                                    <Pressable style={styles.phoneRow} onPress={() => Linking.openURL(`tel:${receipt.payer.phone}`)}>
                                        <Phone size={12} color={colors.textFaint} /><Text style={styles.customerPhone}>{receipt.payer.phone}</Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    )}

                    {sales.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHead}><ShoppingBag size={12} color={colors.textFaint} /><Text style={styles.sectionTitle}>Items Ordered</Text></View>
                            {sales.map((sale) => {
                                const canDeliver = isDeliverable(sale);
                                const done = sale.delivery_status === 'DELIVERED';
                                return (
                                    <View key={sale.id} style={styles.itemCard}>
                                        <View style={styles.saleRow}>
                                            <View style={styles.saleImageWrap}>
                                                {sale.products?.image_url
                                                    ? <Image source={{ uri: sale.products.image_url }} style={styles.saleImage} />
                                                    : <ShoppingBag size={16} color={colors.blue} />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.saleName} numberOfLines={1}>{sale.products?.name ?? 'Unknown product'}</Text>
                                                <Text style={styles.saleMeta}>Qty {sale.quantity} · {formatKwacha(sale.amount_paid)}</Text>
                                            </View>
                                        </View>

                                        {sale.customer_responses && sale.customer_responses.length > 0 && (
                                            <View style={styles.responses}>
                                                {sale.customer_responses.map((r, i) => (
                                                    <View key={r.id} style={[styles.responseRow, i > 0 && styles.responseDivider]}>
                                                        <Text style={styles.responseLabel}>{r.label}</Text>
                                                        <Text style={styles.responseValue}>{r.value}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {canDeliver && (
                                            <View style={[styles.deliveryBar, done ? styles.deliveryBarDone : styles.deliveryBarPending]}>
                                                {done ? <PackageCheck size={15} color="#059669" /> : <Package size={15} color="#B45309" />}
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.deliveryBarTitle, { color: done ? '#047857' : '#B45309' }]}>{done ? 'Delivered' : 'Not yet delivered'}</Text>
                                                    {done && sale.delivered_at && <Text style={styles.deliveryBarSub}>{formatReceiptDate(sale.delivered_at)}</Text>}
                                                </View>
                                                <Pressable
                                                    onPress={() => toggleDelivered(sale)}
                                                    disabled={togglingId === sale.id}
                                                    style={[styles.deliveryBtn, done && styles.deliveryBtnGhost]}
                                                >
                                                    {togglingId === sale.id
                                                        ? <ActivityIndicator size="small" color={done ? colors.textMuted : '#fff'} />
                                                        : <Text style={[styles.deliveryBtnText, done && { color: colors.textMuted }]}>{done ? 'Undo' : 'Mark delivered'}</Text>}
                                                </Pressable>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                            {deliverable.length > 1 && <Text style={styles.noItemsText}>{deliveredCount} of {deliverable.length} items delivered</Text>}
                        </View>
                    )}

                    {delivery && (
                        <View style={styles.section}>
                            <View style={styles.sectionHead}><Truck size={12} color={colors.textFaint} /><Text style={styles.sectionTitle}>{delivery.mode === 'pickup' ? 'Pick-Up Order' : 'Delivery Details'}</Text></View>
                            <View style={styles.deliveryCard}>
                                <View style={styles.deliveryModeRow}>
                                    {delivery.mode === 'pickup' ? <ShoppingBag size={15} color={colors.blue} /> : <Truck size={15} color={colors.blue} />}
                                    <Text style={styles.deliveryModeText}>{delivery.mode === 'pickup' ? 'Customer will pick up' : 'Deliver to customer'}</Text>
                                </View>
                                {delivery.mode === 'deliver' && delivery.street && (
                                    <View style={styles.deliveryAddressRow}>
                                        <MapPin size={13} color={colors.textFaint} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.deliveryAddressLine}>{delivery.street}</Text>
                                            {delivery.apartment && <Text style={styles.deliveryAddressSub}>{delivery.apartment}</Text>}
                                            {(delivery.state || delivery.country) && (
                                                <Text style={styles.deliveryAddressSub}>{[delivery.state, delivery.country].filter(Boolean).join(', ')}</Text>
                                            )}
                                        </View>
                                    </View>
                                )}
                                {delivery.rider_service_name && (
                                    <View style={styles.deliveryRiderRow}>
                                        <Truck size={13} color={colors.textFaint} />
                                        <Text style={styles.deliveryRiderText}>
                                            {delivery.rider_service_name}
                                            {delivery.delivery_charge != null ? ` · ${formatKwacha(delivery.delivery_charge)}` : ''}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {receipt && (
                        <View style={styles.section}>
                            <View style={styles.sectionHead}><BookOpen size={12} color={colors.textFaint} /><Text style={styles.sectionTitle}>Accounting Treatment</Text></View>
                            <View style={styles.card}>
                                <Text style={styles.accountingSummary}>{receipt.accounting.summary}</Text>
                                {receipt.accounting.lines.length > 0 && (
                                    <View style={styles.ledger}>
                                        <View style={styles.ledgerHead}>
                                            <Text style={[styles.ledgerHeadText, { flex: 1 }]}>Account</Text>
                                            <Text style={[styles.ledgerHeadText, styles.ledgerNum]}>Debit</Text>
                                            <Text style={[styles.ledgerHeadText, styles.ledgerNum]}>Credit</Text>
                                        </View>
                                        {receipt.accounting.lines.map((l, i) => (
                                            <View key={i} style={styles.ledgerRow}>
                                                <Text style={[styles.ledgerAccount, { flex: 1 }]}>{l.account}</Text>
                                                <Text style={[styles.ledgerCell, styles.ledgerNum]}>{l.debit ? formatKwacha(l.debit) : ''}</Text>
                                                <Text style={[styles.ledgerCell, styles.ledgerNum]}>{l.credit ? formatKwacha(l.credit) : ''}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                <KV label="Category" value={receipt.accounting.category} />
                                <KV label="Recorded by" value={receipt.accounting.recordedBy} />
                            </View>
                        </View>
                    )}

                    {!loading && !error && detail && sales.length === 0 && (
                        <Text style={styles.noItemsText}>No product line items for this transaction.</Text>
                    )}
                </ScrollView>
                <View style={styles.footer}>
                    <Pressable style={[styles.receiptBtn, (!receipt || exporting) && { opacity: 0.5 }]} disabled={!receipt || exporting} onPress={downloadReceipt}>
                        {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Download size={16} color="#fff" />}
                        <Text style={styles.receiptBtnText}>Download receipt</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

const KV: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({ label, value, mono }) =>
    value ? (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabelText}>{label}</Text>
            <Text style={[styles.infoValue, mono && styles.infoValueMono]} numberOfLines={2}>{value}</Text>
        </View>
    ) : null;

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%',
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    },
    header: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    date: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    body: { padding: 20, gap: 14, paddingBottom: 40 },
    amountCard: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#ECFDF5', borderRadius: radius.lg, padding: 16,
    },
    amountLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
    amountValue: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.text, marginTop: 2 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statusPillText: { fontFamily: fonts.bodyBold, fontSize: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
    infoLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoLabelText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
    infoValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, flexShrink: 1, textAlign: 'right' },
    infoValueMono: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    loadingText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: radius.md, padding: 10 },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger },
    section: { gap: 8 },
    sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
    saleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 12 },
    saleImageWrap: {
        width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    saleImage: { width: 40, height: 40 },
    saleName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    saleMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    saleStatusPill: { backgroundColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    saleStatusPillDone: { backgroundColor: '#ECFDF5' },
    saleStatusText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase' },
    saleStatusTextDone: { color: '#059669' },
    customerCard: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 12, gap: 3 },
    customerName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    customerPhone: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    deliveryCard: { backgroundColor: colors.tabActiveBg, borderRadius: radius.lg, padding: 14, gap: 10 },
    deliveryModeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deliveryModeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    deliveryAddressRow: { flexDirection: 'row', gap: 8 },
    deliveryAddressLine: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
    deliveryAddressSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    deliveryRiderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,106,255,0.12)' },
    deliveryRiderText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    card: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, padding: 14, gap: 9 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    itemCard: { backgroundColor: colors.canvasAlt, borderRadius: radius.lg, overflow: 'hidden' },
    responses: { marginHorizontal: 12, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    responseRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
    responseDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    responseLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    responseValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text, flexShrink: 1, textAlign: 'right' },
    deliveryBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
    deliveryBarDone: { backgroundColor: '#ECFDF5', borderTopColor: '#D1FAE5' },
    deliveryBarPending: { backgroundColor: '#FFFBEB', borderTopColor: '#FEF3C7' },
    deliveryBarTitle: { fontFamily: fonts.bodyBold, fontSize: 12 },
    deliveryBarSub: { fontFamily: fonts.body, fontSize: 10, color: '#059669', marginTop: 1 },
    deliveryBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, minWidth: 64, alignItems: 'center' },
    deliveryBtnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    deliveryBtnText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#fff' },
    accountingSummary: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textMuted },
    ledger: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    ledgerHead: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.canvasAlt },
    ledgerHeadText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, textTransform: 'uppercase' },
    ledgerRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
    ledgerAccount: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text },
    ledgerCell: { fontFamily: fonts.body, fontSize: 11, color: colors.text },
    ledgerNum: { width: 70, textAlign: 'right' },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border },
    receiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.blue, borderRadius: radius.lg, paddingVertical: 14 },
    receiptBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#fff' },
    noItemsText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 12 },
});
