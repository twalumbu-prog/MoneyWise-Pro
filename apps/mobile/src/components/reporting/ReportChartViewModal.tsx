import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronUp, ArrowUpRight, ArrowDownRight, CalendarDays } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { ReportTrendChart, type ChartTimeframe, type TrendPoint } from './ReportTrendChart';
import { AnimatedSegmented } from '../AnimatedTabs';
import { colors, fonts, radius } from '../../theme/tokens';

const CHART_WIDTH = Dimensions.get('window').width - 40;

interface ReportChartViewModalProps {
    visible: boolean;
    reportView: 'PROFIT_LOSS' | 'NET_WORTH';
    totals: { totalProfit: number; netWorth: number };
    timeframe: ChartTimeframe;
    onTimeframeChange: (tf: ChartTimeframe) => void;
    points: TrendPoint[];
    loading: boolean;
    onClose: () => void;
}

export const ReportChartViewModal: React.FC<ReportChartViewModalProps> = ({
    visible, reportView, totals, timeframe, onTimeframeChange, points, loading, onClose,
}) => {
    const insets = useSafeAreaInsets();
    const title = reportView === 'PROFIT_LOSS' ? 'Total Profit' : 'Net Worth';
    const amount = reportView === 'PROFIT_LOSS' ? totals.totalProfit : totals.netWorth;

    const delta = useMemo(() => {
        if (points.length < 2) return { delta: 0, percentStr: '0', isIncrease: true };
        const startVal = points[0]?.value ?? 0;
        const endVal = points[points.length - 1]?.value ?? 0;
        const diff = endVal - startVal;
        const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : (diff > 0 ? 100 : 0);
        return { delta: diff, percentStr: Math.abs(pct).toFixed(0), isIncrease: diff >= 0 };
    }, [points]);

    const startLabel = points[0]?.shortLabel ?? '';
    const endLabel = points[points.length - 1]?.shortLabel ?? '';

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
            <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
                {/* Header row */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.subTitle}>{title.toUpperCase()}</Text>
                        <Text style={styles.amountText}>{formatKwacha(amount)}</Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                        <ChevronUp size={22} color={colors.text} />
                    </Pressable>
                </View>

                {/* Timeframe pill control */}
                <View style={styles.timeframeWrap}>
                    <AnimatedSegmented
                        value={timeframe}
                        onChange={(v) => onTimeframeChange(v as ChartTimeframe)}
                        trackStyle={styles.tfTrack}
                        indicatorStyle={styles.tfIndicator}
                        itemStyle={styles.tfBtn}
                        items={(['1D', '1W', '1M', '3M', 'YTD'] as ChartTimeframe[]).map((tf) => ({
                            value: tf,
                            content: (
                                <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>
                                    {tf}
                                </Text>
                            ),
                        }))}
                    />
                </View>

                {/* Chart Card */}
                <View style={styles.chartCard}>
                    {loading ? (
                        <View style={styles.center}><ActivityIndicator color={colors.blue} size="large" /></View>
                    ) : (
                        <ReportTrendChart
                            points={points}
                            loading={loading}
                            timeframe={timeframe}
                            onTimeframeChange={onTimeframeChange}
                            width={CHART_WIDTH}
                        />
                    )}
                </View>

                {/* Bottom Delta Card */}
                <LinearGradient
                    colors={['#0F172A', '#172554']}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.deltaCard, { marginBottom: insets.bottom + 20 }]}
                >
                    <View style={styles.deltaCardTop}>
                        <Text style={styles.deltaLabel}>{reportView === 'PROFIT_LOSS' ? 'Net Profit' : 'Net Worth'}</Text>
                        <Pressable onPress={onClose} style={styles.deltaCloseBtn} hitSlop={8}>
                            <ChevronUp size={16} color="rgba(255,255,255,0.7)" />
                        </Pressable>
                    </View>

                    <View style={styles.deltaMainRow}>
                        <Text style={styles.deltaValue}>{formatKwacha(amount)}</Text>
                        <View style={styles.deltaPercentBadge}>
                            <Text style={styles.deltaPercentSign}>{delta.isIncrease ? '+' : '-'}</Text>
                            <Text style={styles.deltaPercentText}>{delta.percentStr}%</Text>
                        </View>
                    </View>

                    <View style={styles.deltaFooterBox}>
                        <View style={styles.deltaFooterLeft}>
                            <CalendarDays size={12} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.deltaFooterText}>{startLabel} → {endLabel}</Text>
                        </View>
                        <View style={styles.deltaFooterRight}>
                            {delta.isIncrease ? (
                                <ArrowUpRight size={14} color="#34D399" />
                            ) : (
                                <ArrowDownRight size={14} color="#F87171" />
                            )}
                            <Text style={[styles.deltaFooterAmount, { color: delta.isIncrease ? '#34D399' : '#F87171' }]}>
                                {delta.isIncrease ? '+' : '-'}{formatKwacha(Math.abs(delta.delta))}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    subTitle: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.8 },
    amountText: { fontFamily: fonts.bodyBold, fontSize: 28, color: colors.text, marginTop: 2 },
    closeBtn: { padding: 6, borderRadius: radius.pill, backgroundColor: colors.chipActiveBg },
    timeframeWrap: { marginBottom: 16 },
    tfTrack: { padding: 3, backgroundColor: colors.chipActiveBg, borderRadius: radius.pill },
    tfBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.pill },
    tfIndicator: { borderRadius: radius.pill, backgroundColor: colors.surface, elevation: 1 },
    tfText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    tfTextActive: { color: colors.text },
    chartCard: {
        flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
        borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: 'hidden',
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    deltaCard: { borderRadius: 20, padding: 20, gap: 8 },
    deltaCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    deltaLabel: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
    deltaCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    deltaMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    deltaValue: { fontFamily: fonts.bodyBold, fontSize: 32, color: '#FFFFFF' },
    deltaPercentBadge: { flexDirection: 'row', alignItems: 'baseline' },
    deltaPercentSign: { fontFamily: fonts.bodyBold, fontSize: 24, color: '#60A5FA' },
    deltaPercentText: { fontFamily: fonts.bodyBold, fontSize: 24, color: '#FFFFFF' },
    deltaFooterBox: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.md, padding: 12, marginTop: 8,
    },
    deltaFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    deltaFooterText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.9)' },
    deltaFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deltaFooterAmount: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
