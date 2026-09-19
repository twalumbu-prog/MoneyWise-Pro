import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import type { PricePoint, Timeframe } from 'core';
import { formatKwacha } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD'];
const HEIGHT = 200;

function buildPath(points: PricePoint[], width: number, height: number, minP: number, maxP: number): { line: string; area: string } {
    if (points.length < 2) return { line: '', area: '' };
    const range = Math.max(maxP - minP, 0.01);
    const stepX = width / (points.length - 1);
    const coords = points.map((p, i) => {
        const x = i * stepX;
        const y = height - ((p.price - minP) / range) * height;
        return [x, y];
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
    return { line, area };
}

/**
 * Native equivalent of investChart's Recharts <AreaChart>. react-native-svg
 * doesn't have a charting layer, so this draws the same gradient-filled area
 * path by hand from the same core-generated price series.
 */
export const InvestAreaChart: React.FC<{
    points: PricePoint[];
    timeframe: Timeframe;
    onTimeframeChange: (tf: Timeframe) => void;
    width: number;
}> = ({ points, timeframe, onTimeframeChange, width }) => {
    const { line, area, minP, maxP } = useMemo(() => {
        const prices = points.map((p) => p.price);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const { line, area } = buildPath(points, width, HEIGHT, minP, maxP);
        return { line, area, minP, maxP };
    }, [points, width]);

    const first = points[0]?.price ?? 0;
    const last = points[points.length - 1]?.price ?? 0;
    const up = last >= first;

    return (
        <View>
            <View style={{ width, height: HEIGHT }}>
                {points.length >= 2 && (
                    <Svg width={width} height={HEIGHT}>
                        <Defs>
                            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="5%" stopColor={up ? '#10B981' : colors.danger} stopOpacity={0.3} />
                                <Stop offset="95%" stopColor={up ? '#10B981' : colors.danger} stopOpacity={0} />
                            </LinearGradient>
                        </Defs>
                        <Line x1="0" y1={HEIGHT / 2} x2={width} y2={HEIGHT / 2} stroke={colors.border} strokeDasharray="3,3" />
                        <Path d={area} fill="url(#grad)" />
                        <Path d={line} fill="none" stroke={up ? '#10B981' : colors.danger} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                    </Svg>
                )}
            </View>
            <View style={styles.axisRow}>
                <Text style={styles.axisLabel}>{formatKwacha(minP)}</Text>
                <Text style={styles.axisLabel}>{formatKwacha(maxP)}</Text>
            </View>
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
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 },
    axisLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.textFaint },
    tfRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 4 },
    tfBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
    tfBtnActive: { backgroundColor: colors.canvasAlt },
    tfText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint },
    tfTextActive: { color: colors.text },
});
