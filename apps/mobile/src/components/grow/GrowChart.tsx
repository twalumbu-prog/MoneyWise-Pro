import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
    useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, useAnimatedProps, useAnimatedRef, useAnimatedReaction,
    scrollTo as reanimatedScrollTo, interpolate, Extrapolation, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G, Mask, Rect, ClipPath } from 'react-native-svg';
import { monthName, monthRange } from 'core';
import type { GrowMonthResult, GrowProjection } from 'core';
import { colors, fonts } from '../../theme/tokens';
import { CheckCircle2, Clock3, XCircle, CalendarClock } from 'lucide-react-native';
import { GROW_COLORS, formatK } from './growUi';

const PLOT_BOTTOM = 34;
const PAD_LEFT = 0; // the line starts flush with the screen's left edge
const PAD_RIGHT = 36;
const VISIBLE_MONTHS = 2;
const CALLOUT_W = 132, CALLOUT_H = 66;
const STEM = 18;
const FADE_H = 90;
/** Highest point sits this far below the top, so every card has room above its point. */
const TOP_ROOM = CALLOUT_H + STEM + 14;
const FLOOR_GAP = 14;
/** Most the content is ever slid down to keep the visible cards from riding too high. */
const MAX_DROP = 140;
/** Where the highest visible card's top edge is kept (px from the chart's top). */
const CARD_TOP_TARGET = 104;
/** Opening animation: the line draws left → current month, then the markers and cards fade in. */
export const DRAW_MS = 1900;
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

type Pt = { x: number; y: number };

/** Smooth line through points that never overshoots (monotone cubic, Fritsch–Carlson). */
function smoothPath(pts: Pt[]): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
    const n = pts.length;
    const dx: number[] = [], m: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        dx.push(pts[i + 1].x - pts[i].x);
        m.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
    }
    const t: number[] = [m[0]];
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    t.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
        if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
        d += ` C${(pts[i].x + dx[i] / 3).toFixed(2)},${(pts[i].y + (t[i] * dx[i]) / 3).toFixed(2)} ${(pts[i + 1].x - dx[i] / 3).toFixed(2)},${(pts[i + 1].y - (t[i + 1] * dx[i]) / 3).toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
    }
    return d;
}
const areaOf = (line: string, pts: Pt[], baseY: number) =>
    pts.length < 2 ? '' : `${line} L${pts[pts.length - 1].x.toFixed(2)},${baseY} L${pts[0].x.toFixed(2)},${baseY} Z`;

export interface GrowChartProps {
    width: number;
    height: number;
    projection: GrowProjection;
    results: GrowMonthResult[];
    baseline: number;
    selected: number;
    /** Rendered in the chart's top-left corner (current net worth + goal). */
    header?: React.ReactNode;
    onSelect: (index: number) => void;
}

/**
 * Every month is on the chart with its own card. The scale is fixed (not window-dependent), so the lines are
 * drawn once and scrolling is pure translation. The whole drawing eases down a little as the line climbs so
 * the cards in view never ride too high.
 */
export function GrowChart({ width, height, header, projection, results, baseline, selected, onSelect }: GrowChartProps) {
    const n = results.length;
    const colW = Math.max(CALLOUT_W + 12, (width - PAD_LEFT - PAD_RIGHT) / Math.min(VISIBLE_MONTHS, n));
    const contentW = Math.max(width, PAD_LEFT + colW * n + PAD_RIGHT);
    const baseY = height - PLOT_BOTTOM;
    const top = TOP_ROOM;
    const bottom = baseY - FLOOR_GAP;

    const geo = useMemo(() => {
        const xAt = (i: number) => PAD_LEFT + colW * (i + 1); // end of month i (i = -1 → start of Month 1)
        const today = new Date();

        const markers: { i: number; x: number; v: number }[] = [];
        results.forEach((r, i) => {
            if (!r.actuals) return;
            let frac = 1;
            if (r.status === 'IN_PROGRESS') frac = Math.min(1, Math.max(0.12, today.getDate() / monthRange(r.plan.key).days));
            markers.push({ i, x: xAt(i - 1) + colW * frac, v: r.actuals.netWorth });
        });

        const values = [baseline, projection.goal, ...projection.months.map((m) => m.targetNetWorth), ...markers.map((m) => m.v)];
        let lo = Math.min(...values), hi = Math.max(...values);
        if (hi - lo < 1) { hi += 1; lo -= 1; }
        const yOf = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (bottom - top);

        const planPts: Pt[] = [{ x: xAt(-1), y: yOf(baseline) }, ...projection.months.map((m, i) => ({ x: xAt(i), y: yOf(m.targetNetWorth) }))];
        const actualPts: Pt[] = [{ x: xAt(-1), y: yOf(baseline) }, ...markers.map((m) => ({ x: m.x, y: yOf(m.v) }))];
        const planLine = smoothPath(planPts);
        const actualLine = smoothPath(actualPts);

        const last = markers[markers.length - 1];
        function interpPlan(x: number) {
            for (let i = 0; i < planPts.length - 1; i++) {
                if (x <= planPts[i + 1].x) {
                    const f = (x - planPts[i].x) / (planPts[i + 1].x - planPts[i].x || 1);
                    const v0 = i === 0 ? baseline : projection.months[i - 1].targetNetWorth;
                    return v0 + (projection.months[i].targetNetWorth - v0) * f;
                }
            }
            return projection.months[projection.months.length - 1].targetNetWorth;
        }
        const ahead = !last || last.v + 0.005 >= (last ? interpPlan(last.x) : baseline);

        // One card per month, anchored on its point; kept clear of the previous card.
        let prevRight = -Infinity;
        const cards = results.map((r, i) => {
            const m = markers.find((k) => k.i === i);
            const px = m ? m.x : xAt(i);
            const py = yOf(m ? m.v : r.plan.targetNetWorth);
            const left = Math.max(px - CALLOUT_W / 2, prevRight + 8, 4);
            prevRight = left + CALLOUT_W;
            return { i, r, px, py, left, planX: xAt(i), planY: yOf(r.plan.targetNetWorth) };
        });

        return {
            xAt, markers, cards, ahead, actualPts,
            planLine, actualLine,
            planArea: areaOf(planLine, planPts, height + MAX_DROP),
            actualArea: areaOf(actualLine, actualPts, height + MAX_DROP),
            lastX: last ? last.x : xAt(-1),
            goalY: yOf(projection.goal),
        };
    }, [results, projection, baseline, colW, top, bottom, height]);

    const lineColor = geo.ahead ? GROW_COLORS.success : GROW_COLORS.danger;

    // Centre the selected month's card.
    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const maxShift = Math.max(0, contentW - width);
    const offsetFor = (i: number) => {
        const c = geo.cards[i];
        return Math.min(maxShift, Math.max(0, (c ? c.left + CALLOUT_W / 2 : 0) - width / 2));
    };
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        scrollRef.current?.scrollTo({ x: offsetFor(selected), animated: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    // The content eases down as the line climbs: a plain vertical translate keyed to the scroll position.
    const scrollX = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { scrollX.value = e.contentOffset.x; } });
    const { dropX, dropY } = useMemo(() => {
        const xs: number[] = [], ys: number[] = [];
        geo.cards.forEach((_c, i) => {
            const win = geo.cards.slice(Math.max(0, i - 1), i + 2);
            const minTop = Math.min(...win.map((k) => k.py)) - 6 - STEM - CALLOUT_H;
            const maxPy = Math.max(...win.map((k) => k.py));
            const drop = Math.max(0, Math.min(MAX_DROP, CARD_TOP_TARGET - minTop, bottom - maxPy));
            const x = offsetFor(i);
            if (xs.length && x <= xs[xs.length - 1]) { ys[ys.length - 1] = Math.max(ys[ys.length - 1], drop); return; }
            xs.push(x); ys.push(drop);
        });
        if (xs.length === 0) { xs.push(0, 1); ys.push(0, 0); }
        else if (xs.length === 1) { xs.push(xs[0] + 1); ys.push(ys[0]); }
        return { dropX: xs, dropY: ys };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geo, contentW, width]);
    const dropStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: interpolate(scrollX.value, dropX, dropY, Extrapolation.CLAMP) }],
    }));

    // ── Opening animation ──
    const reveal = useSharedValue(0);
    const cardsO = useSharedValue(0);
    const [ready, setReady] = useState(false);
    const startOffset = offsetFor(selected);
    useEffect(() => {
        reveal.value = withTiming(1, { duration: DRAW_MS, easing: Easing.inOut(Easing.cubic) });
        cardsO.value = withDelay(DRAW_MS - 100, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
        const t = setTimeout(() => setReady(true), DRAW_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // The camera travels with the pen: from the far left to the current month.
    useAnimatedReaction(
        () => reveal.value,
        (v) => { if (v < 1) reanimatedScrollTo(scrollRef, startOffset * v, 0, false); },
        [startOffset],
    );
    const clipProps = useAnimatedProps(() => ({ width: reveal.value * (geo.lastX + 24) }));
    const fadeProps = useAnimatedProps(() => ({ opacity: cardsO.value }));
    const cardsStyle = useAnimatedStyle(() => ({ opacity: cardsO.value }));

    return (
        <View style={{ width, height, overflow: 'hidden' }}>
            <Animated.ScrollView
                ref={scrollRef}
                horizontal
                onScroll={onScroll}
                bounces={false}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                style={StyleSheet.absoluteFill}
                contentContainerStyle={{ width: contentW, height }}
            >
                <View style={{ width: contentW, height }}>
                  <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: contentW, height: height + MAX_DROP }, dropStyle]}>
                    <Svg width={contentW} height={height + MAX_DROP}>
                        <Defs>
                            <LinearGradient id="growPlanFill" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={GROW_COLORS.plan} stopOpacity={0.14} />
                                <Stop offset="1" stopColor={GROW_COLORS.plan} stopOpacity={0} />
                            </LinearGradient>
                            <LinearGradient id="growActualFill" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={lineColor} stopOpacity={0.26} />
                                <Stop offset="0.7" stopColor={lineColor} stopOpacity={0.06} />
                                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
                            </LinearGradient>
                            {/* The green wash fades out toward the latest point instead of ending in a cliff */}
                            <LinearGradient id="growFadeX" gradientUnits="userSpaceOnUse" x1={Math.max(0, geo.lastX - 60)} y1="0" x2={geo.lastX} y2="0">
                                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                            </LinearGradient>
                            <Mask id="growFadeMask" x="0" y="0" width={contentW} height={height + MAX_DROP} maskUnits="userSpaceOnUse">
                                <Rect x="0" y="0" width={contentW} height={height + MAX_DROP} fill="url(#growFadeX)" />
                            </Mask>
                            <ClipPath id="growReveal">
                                <AnimatedRect x="0" y="0" height={height + MAX_DROP} animatedProps={clipProps} />
                            </ClipPath>
                        </Defs>

                        <Path d={geo.planArea} fill="url(#growPlanFill)" />
                        <Path d={geo.planLine} fill="none" stroke={GROW_COLORS.plan} strokeWidth={1.25} strokeDasharray="5,6" strokeLinecap="round" />
                        <AnimatedG animatedProps={fadeProps}>
                            {geo.cards.map((c) => (
                                <Circle key={`p${c.i}`} cx={c.planX} cy={c.planY} r={c.i === selected ? 4.5 : 3.5} fill="#FFFFFF" stroke={GROW_COLORS.planInk} strokeWidth={2} />
                            ))}
                        </AnimatedG>

                        {geo.actualPts.length > 1 && (
                            <G clipPath="url(#growReveal)">
                                <Path d={geo.actualArea} fill="url(#growActualFill)" mask="url(#growFadeMask)" />
                                <Path d={geo.actualLine} fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                            </G>
                        )}
                        <AnimatedG animatedProps={fadeProps}>
                            {geo.markers.map((a) => {
                                const r = results[a.i];
                                const c = r.status === 'OFF_TRACK' ? GROW_COLORS.danger : r.status === 'IN_PROGRESS' ? lineColor : GROW_COLORS.success;
                                const card = geo.cards[a.i];
                                const isSel = a.i === selected;
                                return (
                                    <G key={`a${a.i}`}>
                                        {isSel && <Circle cx={card.px} cy={card.py} r={11} fill={c} fillOpacity={0.15} />}
                                        <Circle cx={card.px} cy={card.py} r={isSel ? 6 : 4.5} fill={GROW_COLORS.successBg} stroke={c} strokeWidth={isSel ? 3 : 2.5} />
                                    </G>
                                );
                            })}
                        </AnimatedG>
                    </Svg>

                    <Animated.Text style={[cardsStyle, styles.trophy, { left: geo.xAt(n - 1) + 8, top: geo.goalY - 14 }]}>🏆</Animated.Text>

                    {/* Every month's card sits above its point; tap one to jump to that month */}
                    <Animated.View pointerEvents={ready ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, cardsStyle]}>
                        {geo.cards.map((c) => {
                            const active = c.i === selected;
                            const stem = c.r.status === 'OFF_TRACK' ? GROW_COLORS.danger : c.r.status === 'UPCOMING' ? GROW_COLORS.plan : lineColor;
                            return (
                                <View key={c.r.plan.key} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                                    <View pointerEvents="none" style={[styles.stem, { left: c.px - 1, top: c.py - 6 - STEM, opacity: active ? 1 : 0.45, backgroundColor: stem }]} />
                                    <Pressable
                                        onPress={() => onSelect(c.i)}
                                        accessibilityLabel={`Show ${monthName(c.r.plan.key)}`}
                                        style={[styles.calloutWrap, { left: c.left, top: c.py - 6 - STEM - CALLOUT_H, opacity: active ? 1 : 0.62, zIndex: active ? 2 : 1 }]}
                                    >
                                        <Callout result={c.r} active={active} />
                                    </Pressable>
                                </View>
                            );
                        })}
                    </Animated.View>
                  </Animated.View>

                    {/* Soft fade so the grey wash melts into the page instead of ending on a hard edge */}
                    <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: contentW, bottom: 0, height: FADE_H + PLOT_BOTTOM }}>
                        <Svg width={contentW} height={FADE_H + PLOT_BOTTOM}>
                            <Defs>
                                <LinearGradient id="growBottomFade" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                                    <Stop offset={(FADE_H * 0.55) / (FADE_H + PLOT_BOTTOM)} stopColor="#FFFFFF" stopOpacity={0.55} />
                                    <Stop offset={FADE_H / (FADE_H + PLOT_BOTTOM)} stopColor="#FFFFFF" stopOpacity={1} />
                                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity={1} />
                                </LinearGradient>
                            </Defs>
                            <Rect x="0" y="0" width={contentW} height={FADE_H + PLOT_BOTTOM} fill="url(#growBottomFade)" />
                        </Svg>
                    </View>

                    {results.map((r, i) => (
                        <Pressable
                            key={r.plan.key}
                            onPress={() => onSelect(i)}
                            style={[styles.col, { left: geo.xAt(i - 1), width: colW }]}
                            accessibilityLabel={`Month ${i + 1}, ${monthName(r.plan.key)}`}
                        >
                            <Text style={[styles.monthLabel, i === selected && styles.monthLabelActive]}>{monthName(r.plan.key, 'short')}</Text>
                        </Pressable>
                    ))}
                </View>
            </Animated.ScrollView>

            {header && <View pointerEvents="box-none" style={styles.header}>{header}</View>}
        </View>
    );
}

function Callout({ result, active }: { result: GrowMonthResult; active: boolean }) {
    const { status, plan, actuals } = result;
    const dot = status === 'OFF_TRACK' ? 'danger' : status === 'UPCOMING' ? 'plan' : 'success';
    const Icon = status === 'ON_TRACK' ? CheckCircle2 : status === 'OFF_TRACK' ? XCircle : status === 'IN_PROGRESS' ? Clock3 : CalendarClock;
    return (
        <View style={[styles.callout, !active && styles.calloutIdle]}>
            <View style={styles.calloutHead}>
                <View style={[styles.dot, dot === 'danger' ? styles.dotDanger : dot === 'plan' ? styles.dotPlan : styles.dotSuccess]} />
                <Text style={styles.calloutMonth} numberOfLines={1}>{monthName(plan.key)}</Text>
                <Icon size={13} color={colors.text} />
            </View>
            {actuals ? (
                <Text style={styles.calloutValue} numberOfLines={1}>
                    {formatK(actuals.netWorth)} <Text style={styles.calloutSub}>{status === 'IN_PROGRESS' ? 'so far' : 'closed'}</Text>
                </Text>
            ) : (
                <Text style={styles.calloutValue} numberOfLines={1}>{formatK(plan.targetNetWorth)}</Text>
            )}
            <Text style={styles.calloutSub} numberOfLines={1}>
                {actuals ? `– – ${formatK(plan.targetNetWorth)} target` : 'planned net worth'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    col: { position: 'absolute', bottom: 0, height: PLOT_BOTTOM + 6, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
    monthLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
    monthLabelActive: { fontFamily: fonts.bodyBold, color: colors.text },
    trophy: { position: 'absolute', fontSize: 22 },
    header: { position: 'absolute', top: 6, left: 20, right: 20 },
    stem: { position: 'absolute', width: 2, height: STEM, borderRadius: 1 },
    calloutWrap: { position: 'absolute', width: 132 },
    calloutIdle: { shadowOpacity: 0.04, elevation: 0 },
    callout: {
        backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderColor: '#E4E4E7',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    calloutHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    calloutMonth: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: '#27272A' },
    calloutValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#27272A' },
    calloutSub: { fontFamily: fonts.bodyMedium, fontSize: 10, color: '#52525B' },
    dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
    dotSuccess: { backgroundColor: GROW_COLORS.successBg, borderColor: GROW_COLORS.success },
    dotDanger: { backgroundColor: GROW_COLORS.dangerBg, borderColor: GROW_COLORS.danger },
    dotPlan: { backgroundColor: GROW_COLORS.planBg, borderColor: GROW_COLORS.planInk },
});
