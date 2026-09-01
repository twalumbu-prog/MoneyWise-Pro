import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { formatKwacha } from 'core';
import type { Widget } from 'core';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * Renders the assistant's generated widgets natively.
 *
 * Charts are a hand-rolled SVG bar chart rather than a charting library: the
 * assistant's charts are simple category comparisons (spend by account, income
 * by month), and pulling in a full charting dependency for that would mean
 * another native rebuild for a shape react-native-svg — already in the bundle
 * for icons — draws perfectly well on its own. Line/area/pie/donut specs fall
 * back to the same bar rendering; a request for those kinds is rare in
 * practice and the fallback is still a correct, readable comparison.
 */
export const WidgetView: React.FC<{ widget: Widget }> = ({ widget }) => {
    if (widget.type === 'kpi') return <KpiWidget spec={widget.spec} />;
    if (widget.type === 'table') return <TableWidget spec={widget.spec} />;
    if (widget.type === 'chart') return <ChartWidget spec={widget.spec} />;
    if (widget.type === 'file') return <FileWidget spec={widget.spec} />;
    return null;
};

const formatValue = (v: string | number, fmt?: string) => {
    if (fmt === 'currency') return formatKwacha(Number(v));
    if (typeof v === 'number') return v.toLocaleString();
    return String(v);
};

const KpiWidget: React.FC<{ spec: Widget extends { type: 'kpi' } ? never : any }> = ({ spec }) => (
    <View style={styles.card}>
        {!!spec.title && <Text style={styles.title}>{spec.title}</Text>}
        <View style={styles.kpiGrid}>
            {spec.items.map((item: any, i: number) => (
                <View key={i} style={styles.kpiItem}>
                    <Text style={styles.kpiLabel}>{item.label}</Text>
                    <Text style={styles.kpiValue}>{item.value}</Text>
                    {item.delta != null && (
                        <Text style={[styles.kpiDelta, item.delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
                            {item.delta >= 0 ? '▲' : '▼'} {Math.abs(item.delta).toFixed(1)}%
                        </Text>
                    )}
                </View>
            ))}
        </View>
    </View>
);

const TableWidget: React.FC<{ spec: any }> = ({ spec }) => (
    <View style={styles.card}>
        <Text style={styles.title}>{spec.title}</Text>
        {spec.rows.slice(0, 20).map((row: any, i: number) => (
            <View key={i} style={[styles.tableRow, i > 0 && styles.rowBorder]}>
                {spec.columns.map((col: any) => (
                    <Text
                        key={col.key}
                        style={[styles.tableCell, col.align === 'right' && styles.tableCellRight]}
                        numberOfLines={2}
                    >
                        {formatValue(row[col.key], col.format)}
                    </Text>
                ))}
            </View>
        ))}
        {spec.rows.length > 20 && (
            <Text style={styles.more}>…and {spec.rows.length - 20} more rows</Text>
        )}
        {spec.total && (
            <View style={[styles.tableRow, styles.totalRow]}>
                {spec.columns.map((col: any, i: number) => (
                    <Text key={col.key} style={[styles.tableCell, styles.totalCell, col.align === 'right' && styles.tableCellRight]}>
                        {i === 0 ? 'Total' : formatValue(spec.total![col.key] ?? '', col.format)}
                    </Text>
                ))}
            </View>
        )}
    </View>
);

const CHART_HEIGHT = 140;

const ChartWidget: React.FC<{ spec: any }> = ({ spec }) => {
    const width = 280;
    const key = spec.series[0]?.key ?? spec.xKey;
    const values = spec.data.map((d: any) => Number(d[key]) || 0);
    const max = Math.max(...values, 1);
    const barW = Math.min(36, (width - 16) / Math.max(spec.data.length, 1) - 8);
    const gap = spec.data.length > 1 ? (width - barW * spec.data.length) / (spec.data.length - 1 || 1) : 0;

    return (
        <View style={styles.card}>
            <Text style={styles.title}>{spec.title}</Text>
            {!!spec.subtitle && <Text style={styles.subtitle}>{spec.subtitle}</Text>}
            <Svg width={width} height={CHART_HEIGHT + 24} style={{ marginTop: 8 }}>
                <Line x1={0} y1={CHART_HEIGHT} x2={width} y2={CHART_HEIGHT} stroke={colors.border} strokeWidth={1} />
                {spec.data.map((d: any, i: number) => {
                    const v = Number(d[key]) || 0;
                    const h = max > 0 ? (v / max) * (CHART_HEIGHT - 8) : 0;
                    const x = i * (barW + gap);
                    return (
                        <React.Fragment key={i}>
                            <Rect
                                x={x} y={CHART_HEIGHT - h} width={barW} height={Math.max(h, 1)}
                                rx={4} fill={colors.blue}
                            />
                            <SvgText
                                x={x + barW / 2} y={CHART_HEIGHT + 16}
                                fontSize={9} fill={colors.textFaint} textAnchor="middle"
                            >
                                {String(d[spec.xKey] ?? '').slice(0, 6)}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
            </Svg>
        </View>
    );
};

const FileWidget: React.FC<{ spec: any }> = ({ spec }) => (
    <View style={[styles.card, styles.fileCard]}>
        <View style={styles.fileMain}>
            <Text style={styles.title}>{spec.name}</Text>
            <Text style={styles.subtitle}>{spec.kind.toUpperCase()}{spec.sizeLabel ? ` · ${spec.sizeLabel}` : ''}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 16,
        borderWidth: 1, borderColor: colors.border, marginTop: 8, maxWidth: 300,
    },
    title: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    subtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
    kpiItem: { minWidth: 90 },
    kpiLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },
    kpiValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.navy, marginTop: 2 },
    kpiDelta: { fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 2 },
    deltaUp: { color: colors.positiveInk },
    deltaDown: { color: colors.danger },
    tableRow: { flexDirection: 'row', gap: 8, paddingVertical: 7 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    tableCell: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.text },
    tableCellRight: { textAlign: 'right' },
    totalRow: { borderTopWidth: 1, borderTopColor: colors.borderStrong, marginTop: 4 },
    totalCell: { fontFamily: fonts.bodyBold },
    more: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 6 },
    fileCard: { flexDirection: 'row', alignItems: 'center' },
    fileMain: { flex: 1 },
});
