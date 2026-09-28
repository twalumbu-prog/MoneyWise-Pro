import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView,
    ActivityIndicator, Dimensions, GestureResponderEvent, LayoutChangeEvent,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { ChevronUp, ArrowUpRight, ArrowDownRight, CalendarDays } from 'lucide-react-native';
import { formatKwacha } from 'core';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../../theme/tokens';

export type ChartTimeframe = '1D' | '1W' | '1M' | '3M' | 'YTD';
export interface TrendPoint {
    label: string;
    shortLabel: string;
    value: number;
    startDate?: string;
    endDate?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIMEFRAMES: ChartTimeframe[] = ['1D', '1W', '1M', '3M', 'YTD'];
const Y_AXIS_W = 50;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 20;

function formatCompactAmount(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e6) {
        return `${(val / 1e6).toFixed(1)}M`;
    }
    if (abs >= 1e3) {
        return `${(val / 1e3).toFixed(0)}k`;
    }
    return Math.round(val).toLocaleString();
}

/**
 * Builds a smooth Catmull-Rom cubic Bezier path with light tension (K = 0.12)
 * to produce slightly rounded curves at plotted points without sharp corners.
 */
function buildSmoothPath(pts: { x: number; y: number }[], K = 0.12): string {
    if (pts.length < 2) return '';
    let path = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
        const p0 = pts[i === 0 ? 0 : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 >= n ? n - 1 : i + 2];

        const cp1x = p1.x + (p2.x - p0.x) * K;
        const cp1y = p1.y + (p2.y - p0.y) * K;
        const cp2x = p2.x - (p3.x - p1.x) * K;
        const cp2y = p2.y - (p3.y - p1.y) * K;

        path += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    }
    return path;
}

interface ReportChartViewProps {
    reportView: 'PROFIT_LOSS' | 'NET_WORTH';
    timeframe: ChartTimeframe;
    onTimeframeChange: (tf: ChartTimeframe) => void;
    points: TrendPoint[];
    loading: boolean;
    onClose: () => void;
}

export const ReportChartView: React.FC<ReportChartViewProps> = ({
    reportView,
    timeframe,
    onTimeframeChange,
    points,
    loading,
    onClose,
}) => {
    const [startIdx, setStartIdx] = useState(0);
    const [endIdx, setEndIdx] = useState(0);
    const [cardHeight, setCardHeight] = useState(240);
    const scrollRef = useRef<ScrollView>(null);

    // Compute column scale width (COL_W) based on timeframe & points count to show high data density like stock charts
    const colWidth = useMemo(() => {
        if (!points.length) return 36;
        const availW = SCREEN_WIDTH - Y_AXIS_W - 32;
        if (timeframe === '1D') return Math.max(26, Math.floor(availW / 14));
        if (timeframe === '1W') return Math.max(30, Math.floor(availW / 10));
        if (timeframe === '1M') return Math.max(34, Math.floor(availW / 12));
        return Math.max(32, Math.floor(availW / Math.min(points.length, 12)));
    }, [points.length, timeframe]);

    // Reset slider indices whenever points array length or timeframe changes
    useEffect(() => {
        if (points.length > 0) {
            setStartIdx(0);
            setEndIdx(points.length - 1);
        } else {
            setStartIdx(0);
            setEndIdx(0);
        }
    }, [points, timeframe]);

    // Auto-scroll to end (most recent data point) when loaded
    useEffect(() => {
        if (points.length > 0 && scrollRef.current) {
            setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [points.length, timeframe]);

    const svgH = Math.max(160, cardHeight - 64);
    const chartDrawH = Math.max(80, svgH - PADDING_TOP - PADDING_BOTTOM);

    const chartRenderData = useMemo(() => {
        if (points.length < 2) return null;

        const values = points.map((p) => p.value);
        let minVal = Math.min(...values);
        let maxVal = Math.max(...values);
        if (minVal === maxVal) {
            minVal = minVal > 0 ? 0 : minVal - 100;
            maxVal = maxVal < 0 ? 0 : maxVal + 100;
        }

        const range = maxVal - minVal || 1;
        const svgWidth = Math.max(colWidth * points.length, SCREEN_WIDTH - Y_AXIS_W - 32);

        const pts = points.map((p, i) => {
            const x = (i / (points.length - 1)) * (svgWidth - colWidth) + colWidth / 2;
            const y = PADDING_TOP + chartDrawH - ((p.value - minVal) / range) * chartDrawH;
            return { ...p, x, y };
        });

        // Find peak index for trophy icon
        let peakIdx = 0;
        let peakVal = pts[0].value;
        pts.forEach((pt, i) => {
            if (pt.value > peakVal) {
                peakVal = pt.value;
                peakIdx = i;
            }
        });

        // Build smooth SVG path with light curve rounding
        const linePath = buildSmoothPath(pts, 0.12);

        // Generate Y-axis tick marks
        const yLabels = [
            { y: PADDING_TOP, value: maxVal },
            { y: PADDING_TOP + chartDrawH * 0.33, value: maxVal - range * 0.33 },
            { y: PADDING_TOP + chartDrawH * 0.66, value: maxVal - range * 0.66 },
            { y: PADDING_TOP + chartDrawH, value: minVal },
        ];

        return { pts, svgWidth, linePath, peakIdx, yLabels, minVal, maxVal };
    }, [points, colWidth, chartDrawH]);

    // Calculate Delta values between startIdx and endIdx
    const deltaInfo = useMemo(() => {
        if (!points.length) {
            return { endValue: 0, delta: 0, percentStr: '0.0', isIncrease: true };
        }
        const safeStart = Math.min(Math.max(0, startIdx), points.length - 1);
        const safeEnd = Math.min(Math.max(safeStart, endIdx), points.length - 1);

        const startVal = points[safeStart]?.value ?? 0;
        const endVal = points[safeEnd]?.value ?? 0;
        const diff = endVal - startVal;
        const pct = startVal !== 0 ? (diff / Math.abs(startVal)) * 100 : diff > 0 ? 100 : 0;

        return {
            startValue: startVal,
            endValue: endVal,
            delta: diff,
            percentStr: Math.abs(pct).toFixed(1),
            isIncrease: diff >= 0,
            startLabel: points[safeStart]?.shortLabel ?? '',
            endLabel: points[safeEnd]?.shortLabel ?? '',
        };
    }, [points, startIdx, endIdx]);

    // Handle pin touch/drag
    const handleSliderTouch = (evt: GestureResponderEvent) => {
        if (!chartRenderData || points.length < 2) return;
        const touchX = evt.nativeEvent.locationX;
        const totalW = chartRenderData.svgWidth;

        // Map touch position to closest point index
        let closestIdx = 0;
        let minDiff = Infinity;
        chartRenderData.pts.forEach((pt, i) => {
            const diff = Math.abs(pt.x - touchX);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        });

        // Determine whether to move start or end pin based on proximity
        const startX = chartRenderData.pts[startIdx]?.x ?? 0;
        const endX = chartRenderData.pts[endIdx]?.x ?? totalW;

        if (Math.abs(touchX - startX) < Math.abs(touchX - endX)) {
            setStartIdx(Math.min(closestIdx, endIdx - 1));
        } else {
            setEndIdx(Math.max(closestIdx, startIdx + 1));
        }
    };

    return (
        <View style={styles.container}>
            {/* Timeframe pill filter bar (styled like Inbox stage filter pills) */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tfScroll}
                contentContainerStyle={styles.tfContainer}
            >
                {TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf;
                    return (
                        <Pressable
                            key={tf}
                            onPress={() => onTimeframeChange(tf)}
                            style={[styles.tfPill, active && styles.tfPillActive]}
                        >
                            <Text style={[styles.tfPillText, active && styles.tfPillTextActive]}>
                                {tf}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Clean White Chart Card — Fills vertical remaining space */}
            <View
                style={styles.chartCard}
                onLayout={(e: LayoutChangeEvent) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0) setCardHeight(h);
                }}
            >
                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator color={colors.blue} size="large" />
                        <Text style={styles.loadingText}>Loading chart data…</Text>
                    </View>
                ) : !chartRenderData ? (
                    <View style={styles.centerBox}>
                        <Text style={styles.emptyText}>No chart data available for this timeframe</Text>
                    </View>
                ) : (
                    <View style={styles.chartBody}>
                        {/* Fixed Y-Axis column with floating value pill */}
                        <View style={styles.yAxisCol}>
                            {(() => {
                                const endPt = chartRenderData.pts[endIdx];
                                if (!endPt) return null;
                                return (
                                    <View style={[styles.floatingPill, { top: Math.max(4, endPt.y - 10)} ]}>
                                        <Text style={styles.floatingPillText}>
                                            {formatCompactAmount(endPt.value)}
                                        </Text>
                                    </View>
                                );
                            })()}
                            <Svg width={Y_AXIS_W - 8} height={svgH}>
                                {chartRenderData.yLabels.map((lbl, i) => (
                                    <SvgText
                                        key={i}
                                        x={Y_AXIS_W - 14}
                                        y={lbl.y + 3}
                                        textAnchor="end"
                                        fill="#9CA3AF"
                                        fontSize="9"
                                        fontWeight="600"
                                    >
                                        {formatCompactAmount(lbl.value)}
                                    </SvgText>
                                ))}
                            </Svg>
                        </View>

                        {/* Scrollable Chart SVG + Slider + Axis */}
                        <ScrollView
                            ref={scrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ width: chartRenderData.svgWidth }}
                            style={styles.scrollArea}
                        >
                            <View>
                                <Svg width={chartRenderData.svgWidth} height={svgH}>
                                    <Defs>
                                        <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
                                            <Stop offset="80%" stopColor="#3B82F6" stopOpacity="0.04" />
                                            <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                                        </LinearGradient>
                                    </Defs>

                                    {/* Shaded Area fill under selected range */}
                                    {(() => {
                                        const seg = chartRenderData.pts.slice(startIdx, endIdx + 1);
                                        if (seg.length < 2) return null;
                                        const segPath = buildSmoothPath(seg, 0.12);
                                        const areaD = `${segPath} L ${seg[seg.length - 1].x.toFixed(2)},${svgH - PADDING_BOTTOM} L ${seg[0].x.toFixed(2)},${svgH - PADDING_BOTTOM} Z`;
                                        return <Path d={areaD} fill="url(#chartGrad)" />;
                                    })()}

                                    {/* Dashed Horizontal reference lines at start & end marker heights */}
                                    {[startIdx, endIdx].map((idx, i) => {
                                        const p = chartRenderData.pts[idx];
                                        if (!p) return null;
                                        return (
                                            <Line
                                                key={`h-${i}`}
                                                x1={0}
                                                y1={p.y}
                                                x2={chartRenderData.svgWidth}
                                                y2={p.y}
                                                stroke="#CBD5E1"
                                                strokeWidth={1}
                                                strokeDasharray="5,5"
                                            />
                                        );
                                    })}

                                    {/* Dashed Vertical reference lines through start & end markers */}
                                    {[startIdx, endIdx].map((idx, i) => {
                                        const p = chartRenderData.pts[idx];
                                        if (!p) return null;
                                        return (
                                            <Line
                                                key={`v-${i}`}
                                                x1={p.x}
                                                y1={PADDING_TOP}
                                                x2={p.x}
                                                y2={svgH - PADDING_BOTTOM}
                                                stroke="#CBD5E1"
                                                strokeWidth={1}
                                                strokeDasharray="5,5"
                                            />
                                        );
                                    })}

                                    {/* Main Smooth Line path */}
                                    <Path
                                        d={chartRenderData.linePath}
                                        fill="none"
                                        stroke="#1D4ED8"
                                        strokeWidth={2.8}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />

                                    {/* Marker Rings at startIdx and endIdx */}
                                    {[startIdx, endIdx].map((idx, i) => {
                                        const p = chartRenderData.pts[idx];
                                        if (!p) return null;
                                        return (
                                            <G key={`m-${i}`}>
                                                <Circle cx={p.x} cy={p.y} r={6.5} fill="#FFFFFF" stroke="#2563EB" strokeWidth={2.5} />
                                                <Circle cx={p.x} cy={p.y} r={3} fill="#FACC15" />
                                            </G>
                                        );
                                    })}

                                    {/* Peak Trophy Icon */}
                                    {(() => {
                                        const peakPt = chartRenderData.pts[chartRenderData.peakIdx];
                                        if (!peakPt) return null;
                                        return (
                                            <SvgText
                                                x={peakPt.x}
                                                y={Math.max(14, peakPt.y - 14)}
                                                textAnchor="middle"
                                                fontSize="14"
                                            >
                                                🏆
                                            </SvgText>
                                        );
                                    })()}
                                </Svg>

                                {/* Date Range Slider Progress Bar */}
                                <View
                                    style={[styles.sliderTrackContainer, { width: chartRenderData.svgWidth }]}
                                    onTouchStart={handleSliderTouch}
                                    onTouchMove={handleSliderTouch}
                                >
                                    {/* Full Track */}
                                    <View style={styles.sliderTrackBackground}>
                                        {/* Light Blue Active Window Highlight */}
                                        <View
                                            style={[
                                                styles.sliderTrackHighlight,
                                                {
                                                    left: chartRenderData.pts[startIdx]?.x ?? 0,
                                                    width: Math.max(0, (chartRenderData.pts[endIdx]?.x ?? 0) - (chartRenderData.pts[startIdx]?.x ?? 0)),
                                                },
                                            ]}
                                        />
                                    </View>

                                    {/* Start Handle Pin */}
                                    <View
                                        style={[
                                            styles.sliderPin,
                                            { left: chartRenderData.pts[startIdx]?.x ?? 0 },
                                        ]}
                                    >
                                        <View style={styles.pinBar} />
                                    </View>

                                    {/* End Handle Pin */}
                                    <View
                                        style={[
                                            styles.sliderPin,
                                            { left: chartRenderData.pts[endIdx]?.x ?? 0 },
                                        ]}
                                    >
                                        <View style={styles.pinBar} />
                                    </View>
                                </View>

                                {/* X-Axis Date Labels Row */}
                                <View style={[styles.xAxisRow, { width: chartRenderData.svgWidth }]}>
                                    {chartRenderData.pts.map((p, i) => (
                                        <Text
                                            key={i}
                                            style={[styles.xAxisLabel, { left: p.x }]}
                                        >
                                            {p.shortLabel}
                                        </Text>
                                    ))}
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                )}
            </View>

            {/* Bottom Delta Card — Anchored at bottom with matching dark blue gradient */}
            <ExpoLinearGradient
                colors={['#0F172A', '#172554']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.deltaCard}
            >
                <View style={styles.deltaCardTop}>
                    <Text style={styles.deltaLabel}>
                        {reportView === 'PROFIT_LOSS' ? 'NET PROFIT' : 'NET WORTH'}
                    </Text>
                    <Pressable onPress={onClose} style={styles.deltaCloseBtn} hitSlop={10}>
                        <ChevronUp size={16} color="rgba(255,255,255,0.7)" />
                    </Pressable>
                </View>

                <View style={styles.deltaMainRow}>
                    <Text style={styles.deltaValue}>
                        {formatKwacha(deltaInfo.endValue)}
                    </Text>
                    <View style={styles.deltaPercentBadge}>
                        <Text style={styles.deltaPercentSign}>{deltaInfo.isIncrease ? '+' : '-'}</Text>
                        <Text style={styles.deltaPercentText}>{deltaInfo.percentStr}%</Text>
                    </View>
                </View>

                <View style={styles.deltaFooterBox}>
                    <View style={styles.deltaFooterLeft}>
                        <CalendarDays size={13} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.deltaFooterText}>
                            {deltaInfo.startLabel} <Text style={{ color: '#60A5FA' }}>→</Text> {deltaInfo.endLabel}
                        </Text>
                    </View>
                    <View style={styles.deltaFooterRight}>
                        {deltaInfo.isIncrease ? (
                            <ArrowUpRight size={14} color="#34D399" />
                        ) : (
                            <ArrowDownRight size={14} color="#F87171" />
                        )}
                        <Text style={[styles.deltaFooterAmount, { color: deltaInfo.isIncrease ? '#34D399' : '#F87171' }]}>
                            {deltaInfo.isIncrease ? '+' : '-'}{formatKwacha(Math.abs(deltaInfo.delta))}
                        </Text>
                    </View>
                </View>
            </ExpoLinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', gap: 10 },
    tfScroll: { flexGrow: 0, height: 38 },
    tfContainer: { gap: 8, alignItems: 'center', paddingHorizontal: 2 },
    tfPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tfPillActive: {
        backgroundColor: colors.chipActiveBg,
        borderColor: colors.chipActiveBg,
    },
    tfPillText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: colors.textMuted,
    },
    tfPillTextActive: {
        color: colors.text,
    },
    chartCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        minHeight: 200,
    },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
    loadingText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    emptyText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    chartBody: { flex: 1, flexDirection: 'row' },
    yAxisCol: { width: Y_AXIS_W, position: 'relative', zIndex: 10 },
    floatingPill: {
        position: 'absolute',
        left: 2,
        backgroundColor: '#0F172A',
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: radius.pill,
        zIndex: 20,
    },
    floatingPillText: { fontFamily: fonts.bodyBold, fontSize: 9, color: '#FFFFFF' },
    scrollArea: { flex: 1 },
    sliderTrackContainer: {
        height: 26,
        position: 'relative',
        justifyContent: 'center',
        marginTop: 2,
    },
    sliderTrackBackground: {
        height: 7,
        backgroundColor: '#0055CC',
        borderRadius: radius.pill,
        overflow: 'hidden',
        position: 'relative',
    },
    sliderTrackHighlight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        backgroundColor: '#D9E9FF',
    },
    sliderPin: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 24,
        marginLeft: -12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    pinBar: {
        width: 3.5,
        height: 18,
        backgroundColor: '#0055CC',
        borderRadius: radius.pill,
        shadowColor: '#0055CC',
        shadowOpacity: 0.4,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 3,
    },
    xAxisRow: {
        height: 18,
        position: 'relative',
        marginTop: 2,
    },
    xAxisLabel: {
        position: 'absolute',
        fontFamily: fonts.body,
        fontSize: 9,
        color: colors.textMuted,
        transform: [{ translateX: -12 }],
    },
    deltaCard: {
        borderRadius: 20,
        padding: 16,
        overflow: 'hidden',
        gap: 6,
    },
    deltaCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    deltaLabel: { fontFamily: fonts.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 },
    deltaCloseBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deltaMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    deltaValue: { fontFamily: fonts.bodyBold, fontSize: 26, color: '#FFFFFF' },
    deltaPercentBadge: { flexDirection: 'row', alignItems: 'baseline' },
    deltaPercentSign: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#60A5FA' },
    deltaPercentText: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#FFFFFF' },
    deltaFooterBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 2,
    },
    deltaFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    deltaFooterText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.9)' },
    deltaFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deltaFooterAmount: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
