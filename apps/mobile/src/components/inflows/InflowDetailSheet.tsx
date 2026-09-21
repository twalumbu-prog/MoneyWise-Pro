import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator, Image, StyleSheet } from 'react-native';
import {
    X, Package, MapPin, Truck, ShoppingBag, Receipt, AlertCircle, CheckCircle2, Clock, RotateCcw, AlertTriangle,
} from 'lucide-react-native';
import { productService, formatKwacha, isApiError } from 'core';
import type { ProductSale } from 'core';
import { inflowTitle, type InflowRow } from './inflowUtils';
import { colors, fonts, radius } from '../../theme/tokens';

const STATUS_MAP: Record<string, { label: string; icon: any; color: string }> = {
    COMPLETED: { label: 'Completed', icon: CheckCircle2, color: '#059669' },
    PENDING: { label: 'Pending', icon: Clock, color: colors.blue },
    FAILED: { label: 'Failed', icon: AlertTriangle, color: colors.danger },
    PROCESSING: { label: 'Processing', icon: RotateCcw, color: colors.textFaint },
};
const statusCfg = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.PENDING;

/** Native port of apps/web/src/components/InflowDetailDrawer.tsx as a bottom sheet. */
export const InflowDetailSheet: React.FC<{ inflow: InflowRow | null; onClose: () => void }> = ({ inflow, onClose }) => {
    const [sales, setSales] = useState<ProductSale[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!inflow?.reference_number) { setSales([]); return; }
        setSales([]);
        setError(null);
        setLoading(true);
        productService.getSalesByReference(inflow.reference_number)
            .then((data) => setSales(Array.isArray(data) ? data : []))
            .catch((e) => { if (!isApiError(e) || e.status !== 404) setError('Could not load order details.'); })
            .finally(() => setLoading(false));
    }, [inflow?.id, inflow?.reference_number]);

    if (!inflow) return null;

    const title = inflowTitle(inflow.description);
    const amount = inflow.debit || 0;
    const dateStr = new Date(inflow.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const cfg = statusCfg(inflow.status || 'COMPLETED');
    const StatusIcon = cfg.icon;
    const deliverySale = sales.find((s) => s.order_details);
    const delivery = deliverySale?.order_details;

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

                <ScrollView contentContainerStyle={styles.body}>
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

                    {inflow.reference_number && (
                        <View style={styles.infoRow}>
                            <View style={styles.infoLabel}><Receipt size={13} color={colors.textFaint} /><Text style={styles.infoLabelText}>Reference</Text></View>
                            <Text style={styles.infoValueMono}>{inflow.reference_number}</Text>
                        </View>
                    )}
                    {inflow.account_type && (
                        <View style={styles.infoRow}>
                            <View style={styles.infoLabel}><Package size={13} color={colors.textFaint} /><Text style={styles.infoLabelText}>Channel</Text></View>
                            <Text style={styles.infoValue}>{inflow.account_type.replace(/_/g, ' ').toLowerCase()}</Text>
                        </View>
                    )}

                    {loading && (
                        <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.loadingText}>Loading order details…</Text></View>
                    )}
                    {error && (
                        <View style={styles.errorRow}><AlertCircle size={14} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
                    )}

                    {!loading && sales.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Items Ordered</Text>
                            {sales.map((sale) => (
                                <View key={sale.id} style={styles.saleRow}>
                                    <View style={styles.saleImageWrap}>
                                        {sale.products?.image_url
                                            ? <Image source={{ uri: sale.products.image_url }} style={styles.saleImage} />
                                            : <ShoppingBag size={16} color={colors.blue} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.saleName} numberOfLines={1}>{sale.products?.name ?? 'Unknown product'}</Text>
                                        <Text style={styles.saleMeta}>Qty {sale.quantity} · {formatKwacha(sale.amount_paid)}</Text>
                                    </View>
                                    <View style={[styles.saleStatusPill, sale.status === 'COMPLETED' && styles.saleStatusPillDone]}>
                                        <Text style={[styles.saleStatusText, sale.status === 'COMPLETED' && styles.saleStatusTextDone]}>{sale.status}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {!loading && sales.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Customer</Text>
                            <View style={styles.customerCard}>
                                <Text style={styles.customerName}>{sales[0].customer_name}</Text>
                                <Text style={styles.customerPhone}>{sales[0].customer_phone}</Text>
                            </View>
                        </View>
                    )}

                    {!loading && delivery && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{delivery.mode === 'pickup' ? 'Pick-Up Order' : 'Delivery Details'}</Text>
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

                    {!loading && !error && sales.length === 0 && inflow.reference_number && (
                        <Text style={styles.noItemsText}>No product line items found for this transaction.</Text>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
};

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
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoLabelText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
    infoValue: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
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
    noItemsText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 12 },
});
