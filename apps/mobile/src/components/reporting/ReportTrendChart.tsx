import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

export interface TrendPoint { label: string; shortLabel: string; value: number }
export type ChartTimeframe = '1D' | '1W' | '1M' | '3M' | 'YTD';
const TIMEFRAMES: ChartTimeframe[] = ['1D', '1W', '1M', '3M', 'YTD'];
const HEIGHT = 180;

function buildPath(points: number[], width: number, height: number, min: number, max: number) {
    if (points.length < 2) return { line: '', area: '', zeroY: height };
    const range = Math.max(max - min, 0.01);
    const stepX = width / (points.length - 1);
    const zeroY = height - ((0 - min) / range) * height;
    const coords = points.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
    return { line, area, zeroY };
}

/** Trend chart behind the Net Worth / Total Profit hero card, matching web's
 * Reporting.tsx timeframe chart — reduced to a single native SVG line (no
 * pinch-zoom scroll) and shorter trailing windows for 1D/1W (30 days / 12
 * weeks rather than walking back to Jan 1), since that view fires one API
 * call per plotted point and a full back-to-January daily series is a lot of
 * calls to make over a mobile connection for marginal extra chart width. */
export const ReportTrendChart: React.FC<{
    points: TrendPoint[];
    loading: boolean;
    timeframe: ChartTimeframe;
    onTimeframeChange: (tf: ChartTimeframe) => void;
    width: number;
}> = ({ points, loading, timeframe, onTimeframeChange, width }) => {
    const { line, area, zeroY, min, max } = useMemo(() => {
        const values = points.map((p) => p.value);
        const min = Math.min(0, ...values);
        const max = Math.max(0, ...values);
        const { line, area, zeroY } = buildPath(values, width, HEIGHT, min, max);
        return { line, area, zeroY, min, max };
    }, [points, width]);

    const last = points[points.length - 1]?.value ?? 0;
    const first = points[0]?.value ?? 0;
    const up = last >= first;

    return (
        <View>
            <View style={{ width, height: HEIGHT }}>
                {loading ? (
                    <View style={styles.loadingBox}><Text style={styles.loadingText}>Loading trend…</Text></View>
                ) : points.length >= 2 ? (
                    <Svg width={width} height={HEIGHT}>
                        <Defs>
                            <LinearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="5%" stopColor={up ? '#10B981' : colors.danger} stopOpacity={0.3} />
                                <Stop offset="95%" stopColor={up ? '#10B981' : colors.danger} stopOpacity={0} />
                            </LinearGradient>
                        </Defs>
                        {min < 0 && max > 0 && (
                            <Line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="3,3" />
                        )}
                        <Path d={area} fill="url(#reportGrad)" />
                        <Path d={line} fill="none" stroke={up ? '#10B981' : colors.danger} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                    </Svg>
                ) : (
                    <View style={styles.loadingBox}><Text style={styles.loadingText}>Not enough data yet</Text></View>
                )}
            </View>
            {!loading && points.length >= 2 && (
                <View style={styles.axisRow}>
                    <Text style={styles.axisLabel}>{formatKwacha(min)}</Text>
                    <Text style={styles.axisLabel}>{formatKwacha(max)}</Text>
                </View>
            )}
            <View style={styles.tfRow}>
                {TIMEFRAMES.map((tf) => (
                    <Pressable key={tf} onPress={() => onTimeframeChange(tf)} style={[styles.tfBtn, timeframe === tf && styles.tfBtnActive]}>
                        <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 4 },
    axisLabel: { fontFamily: fonts.body, fontSize: 9, color: 'rgba(255,255,255,0.4)' },
    tfRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    tfBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
    tfBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
    tfText: { fontFamily: fonts.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.5)' },
    tfTextActive: { color: '#FFFFFF' },
});
