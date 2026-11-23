import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
    useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, Easing, useReducedMotion, interpolate, Extrapolation,
    FadeInUp, FadeOutDown, type SharedValue,
} from 'react-native-reanimated';
import { Mail, Check, CheckCircle2, Clock3, XCircle } from 'lucide-react-native';
import { monthKeyOf, addMonths, monthName, monthLabelWithYear } from 'core';
import { GROW_COLORS, formatK } from '../grow/growUi';
import { MTN_D, AIRTEL_D } from '../onboarding/personal/ProviderLogos';
import { MoneywiseMark } from '../icons/MoneywiseMark';
import { colors, fonts } from '../../theme/tokens';

/**
 * Artwork for the welcome carousel, one calm style: soft white cards on the pale wash, drawn in code.
 *   accounts  the accounts stacked front-on, shuffling: the front card drops away and the next comes forward
 *   capture   an SMS or bank email arrives, MoneyWise types out how it books it, and it flips to "Posted"
 *   grow      the Grow page in miniature: the plan (dashed) and the actual net worth (green) draw month by month while
 *             the figure counts up, the month card fills, and the line ends on a pulsing point at the goal
 * A slide only animates while it is the one on screen (`active`); off screen it rests on its finished picture. Reduced
 * motion shows the finished picture still.
 */
export type WelcomeSlideKey = 'accounts' | 'capture' | 'grow';

/** How long the carousel stays on each slide (ms), so each animation gets to play. */
export const SLIDE_DWELL_MS: Record<WelcomeSlideKey, number> = { accounts: 5000, capture: 11000, grow: 9400 };

const CARD_H = 84;
const PEEK = 58;       // how much of each card further back shows above the one in front of it
const TICK_MS = 3400;  // how long each front card stays
const MOVE_MS = 1000;  // the shuffle itself
const MTN_YELLOW = '#FFCB05';
const AIRTEL_RED = '#F21016';
const CARD_SHADOW = { shadowColor: '#5B5FC7', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } } as const;

const styles = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    stackCard: {
        position: 'absolute', height: CARD_H, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, borderRadius: 24,
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEEFA', ...CARD_SHADOW, elevation: 4,
    },
    tile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    bare: { width: 48, height: 48 },
    cardTitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
    cardValue: { fontFamily: fonts.bodyBold, fontSize: 19, color: colors.text, marginTop: 2 },
    // capture
    msgCard: { position: 'absolute', left: 0, right: 0, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEEFA', padding: 16, ...CARD_SHADOW, elevation: 5 },
    msgHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    msgTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    msgFrom: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    msgMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
    msgText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: '#374151', marginTop: 12 },
    mwBox: { marginTop: 12, borderRadius: 16, backgroundColor: '#F3F5FF', padding: 12 },
    mwHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    mwName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: colors.navy },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 11 },
    mwText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text, minHeight: 38 },
    skel: { position: 'absolute', height: 74, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEEFA' },
    skelDot: { position: 'absolute', left: 16, top: 16, width: 26, height: 26, borderRadius: 13 },
    skelBar: { position: 'absolute', left: 56, height: 7, borderRadius: 4, backgroundColor: '#EEF0F8' },
    // grow (mirrors the Grow page: header, chart, callout, month card)
    gRoot: { flex: 1, paddingTop: 46 },
    gHeader: { paddingHorizontal: 22 },
    gHeroLabel: { fontFamily: fonts.body, fontSize: 14, color: '#000' },
    gHeroValue: { fontFamily: fonts.display, fontSize: 32, color: '#000', letterSpacing: -0.5 },
    gGoal: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    gAbs: { position: 'absolute' },
    gStem: { position: 'absolute', width: 2, height: 14, borderRadius: 1 },
    gCallout: {
        position: 'absolute', width: 132, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderColor: '#E4E4E7', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    gCalloutHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    gCalloutMonth: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 11, color: '#27272A' },
    gCalloutValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#27272A' },
    gCalloutSub: { fontFamily: fonts.bodyMedium, fontSize: 10, color: '#52525B' },
    gDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
    gMonth: { position: 'absolute', bottom: 0, height: 26, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
    gMonthText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
});

type Tile = React.ReactNode;
interface CardDef { tile: Tile; title: string; value: string }

const Square = ({ bg, size = 48, children }: { bg: string; size?: number; children: React.ReactNode }) => (
    <View style={[styles.tile, { backgroundColor: bg, width: size, height: size, borderRadius: size * 0.29 }]}>{children}</View>
);

const MtnTile = (s = 48) => (
    <Square bg={MTN_YELLOW} size={s}>
        <Svg width={s * 0.62} height={s * 0.31} viewBox="0 0 1280 640"><Path d={MTN_D} fill="#000" /></Svg>
    </Square>
);
const AirtelTile = (s = 48) => (
    <Square bg={AIRTEL_RED} size={s}>
        <Svg width={s * 0.58} height={s * 0.58} viewBox="-2.3 -2.3 81.22 81.66">{AIRTEL_D.map((d, i) => <Path key={i} d={d} fill="#FFFFFF" />)}</Svg>
    </Square>
);
/** A bank's own mark with nothing around it: the image is trimmed to the logo's edges (assets/welcome). */
const BareLogo = ({ source, size = 48 }: { source: number; size?: number }) => <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
const ZanacoTile = (s = 48) => <BareLogo source={require('../../../assets/welcome/zanaco-logo.png')} size={s} />;
const FnbTile = (s = 48) => <BareLogo source={require('../../../assets/welcome/fnb-logo.png')} size={s} />;

const Chevron = () => (
    <Svg width={10} height={16} viewBox="0 0 10 16"><Path d="M2 2l6 6-6 6" stroke="#9CA3AF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

// ─────────────────────────────── slide 1: accounts ───────────────────────────────
const ACCOUNTS: CardDef[] = [
    { tile: MtnTile(), title: 'MTN Mobile Money', value: 'K2,450.00' },
    { tile: AirtelTile(), title: 'Airtel Money', value: 'K1,230.00' },
    { tile: ZanacoTile(), title: 'Zanaco Bank', value: 'K5,780.00' },
    { tile: FnbTile(), title: 'FNB', value: 'K3,200.00' },
];
const STACK_N = ACCOUNTS.length;

/**
 * The accounts seen straight on, centred, one behind the other. Each card further back is smaller, sits a little higher
 * and shows its own logo and figure. Every few seconds the front card drops forward and away, the others each come a step
 * forward, and a new card rises into the back. One shared number `t` drives every card (its fractional part is the move).
 */
function StackCard({ i, t, def, w }: { i: number; t: SharedValue<number>; def: CardDef; w: number }) {
    const style = useAnimatedStyle(() => {
        const d = (((i - t.value) % STACK_N) + STACK_N) % STACK_N; // 0 = front … 3 = back, (3,4) = leaving
        const v = d > STACK_N - 1 ? d - STACK_N : d;              // v < 0 while it drops away at the front
        if (v < 0) {
            const s = -v;
            return {
                zIndex: 200,
                opacity: interpolate(s, [0, 0.6], [1, 0], Extrapolation.CLAMP),
                transform: [{ translateY: s * 150 }, { scale: 1 + s * 0.08 }],
            };
        }
        return {
            zIndex: Math.round(100 - v * 10),
            opacity: interpolate(v, [0, 1, 2, 3], [1, 1, 1, 0], Extrapolation.CLAMP),
            transform: [{ translateY: -v * PEEK }, { scale: 1 - v * 0.065 }],
        };
    });
    return (
        <Animated.View style={[styles.stackCard, { width: w, top: (STACK_N - 1) * PEEK }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {def.tile}
            <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{def.title}</Text>
                <Text style={styles.cardValue} numberOfLines={1}>{def.value}</Text>
            </View>
            <Chevron />
        </Animated.View>
    );
}

function AccountsStack({ active }: { active: boolean }) {
    const { width } = useWindowDimensions();
    const reduced = useReducedMotion();
    const t = useSharedValue(0);

    useEffect(() => {
        if (reduced || !active) return;
        const id = setInterval(() => {
            t.value = withTiming(Math.round(t.value) + 1, { duration: MOVE_MS, easing: Easing.bezier(0.45, 0, 0.2, 1) });
        }, TICK_MS);
        return () => clearInterval(id);
    }, [reduced, active, t]);

    const w = Math.min(width * 0.8, 340);
    return (
        <View style={[styles.root, { paddingBottom: 20 }]}>
            <View style={{ width: w, height: CARD_H + (STACK_N - 1) * PEEK }} accessible accessibilityLabel={ACCOUNTS.map((c) => `${c.title} ${c.value}`).join('. ')}>
                {ACCOUNTS.map((c, i) => <StackCard key={c.title} i={i} t={t} def={c} w={w} />)}
            </View>
        </View>
    );
}

// ─────────────────────────────── slide 2: capture ───────────────────────────────
interface Msg {
    tile: Tile; from: string; channel: string; text: string;
    /** What MoneyWise writes about it, typed out. */
    books: string;
}
const MESSAGES: Msg[] = [
    {
        tile: AirtelTile(40), from: 'Airtel Money', channel: 'SMS · just now',
        text: 'Money received. Amt: ZMW 250.00 from JOHN BANDA. Bal: ZMW 1,480.00. TID: PP261121AB',
        books: 'Money in · K250.00 from John Banda\nBooked to Sales, Airtel Money K1,480.00',
    },
    {
        tile: ZanacoTile(40), from: 'Zanaco Bank', channel: 'Email · just now',
        text: 'Debit alert: ZMW 420.00 at SHOPRITE CAIRO RD on card ****4417. Available balance ZMW 5,360.00.',
        books: 'Money out · K420.00 at Shoprite\nBooked to Groceries, Zanaco K5,360.00',
    },
    {
        tile: MtnTile(40), from: 'MTN MoMo', channel: 'SMS · just now',
        text: 'You have paid ZMW 300.00 to ZESCO. Fee ZMW 2.50. Txn ID MP261121.0915. New balance ZMW 2,150.00.',
        books: 'Money out · K300.00 to ZESCO\nBooked to Electricity, MTN K2,150.00',
    },
];
const CYCLE_MS = 5200;   // one message: arrive, type, post, make way
const TYPE_START_MS = 1300;
const TYPE_STEP_MS = 26;

/** One arriving message: its text, then MoneyWise typing how it books it, then the status flips from Capturing to Posted. */
function MessageCard({ msg, still }: { msg: Msg; still: boolean }) {
    const [n, setN] = useState(still ? msg.books.length : 0);
    const posted = n >= msg.books.length;
    const pop = useSharedValue(still ? 1 : 0);

    useEffect(() => {
        if (still) return;
        let iv: ReturnType<typeof setInterval> | undefined;
        const start = setTimeout(() => {
            iv = setInterval(() => setN((x) => { if (x + 1 >= msg.books.length && iv) clearInterval(iv); return Math.min(x + 1, msg.books.length); }), TYPE_STEP_MS);
        }, TYPE_START_MS);
        return () => { clearTimeout(start); if (iv) clearInterval(iv); };
    }, [still, msg]);

    useEffect(() => { if (posted && !still) pop.value = withSpring(1, { damping: 9, stiffness: 180 }); }, [posted, still, pop]);
    const chipPop = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(pop.value, [0, 1], [0.9, 1]) }] }));

    return (
        <>
            <View style={styles.msgHead}>
                <View style={[styles.msgTile, msg.from === 'Zanaco Bank' && { overflow: 'visible' }]}>{msg.tile}</View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.msgFrom}>{msg.from}</Text>
                    <Text style={styles.msgMeta}>{msg.channel}</Text>
                </View>
                {msg.channel.startsWith('Email') && <Mail size={16} color={colors.textFaint} />}
            </View>
            <Text style={styles.msgText}>{msg.text}</Text>
            <View style={styles.mwBox}>
                <View style={styles.mwHead}>
                    <MoneywiseMark height={9} color={colors.navy} />
                    <Text style={styles.mwName}>MoneyWise</Text>
                    <Animated.View style={[styles.chip, { backgroundColor: posted ? '#E8FAF1' : '#FFF4D6' }, chipPop]}>
                        {posted ? <Check size={11} color={colors.positiveInk} strokeWidth={3} /> : null}
                        <Text style={[styles.chipText, { color: posted ? colors.positiveInk : colors.warn }]}>{posted ? 'Posted' : 'Capturing…'}</Text>
                    </Animated.View>
                </View>
                <Text style={styles.mwText}>{msg.books.slice(0, n)}</Text>
            </View>
        </>
    );
}

/** The faint cards stacked behind the message, like the reference: pale lines and a coloured dot, stepping up and narrower. */
const Skeletons = ({ w }: { w: number }) => (
    <>
        {[{ top: 0, k: 0.72, c: '#FCE9C8' }, { top: 22, k: 0.82, c: '#D4EEEE' }, { top: 44, k: 0.92, c: '#FAD7D0' }].map((s, i) => (
            <View key={i} style={[styles.skel, { top: s.top, width: w * s.k, left: (w - w * s.k) / 2 }]}>
                <View style={[styles.skelDot, { backgroundColor: s.c }]} />
                <View style={[styles.skelBar, { top: 18, width: w * s.k * 0.5 }]} />
                <View style={[styles.skelBar, { top: 34, width: w * s.k * 0.3 }]} />
            </View>
        ))}
    </>
);

function CaptureStack({ active }: { active: boolean }) {
    const { width } = useWindowDimensions();
    const reduced = useReducedMotion();
    const [i, setI] = useState(0);
    const w = Math.min(width * 0.86, 350);
    const still = reduced || !active;

    useEffect(() => {
        if (still) { setI(0); return; }
        setI(0);
        const id = setInterval(() => setI((x) => (x + 1) % MESSAGES.length), CYCLE_MS);
        return () => clearInterval(id);
    }, [still]);

    return (
        <View style={styles.root}>
            <View style={{ width: w, height: 340 }} accessible accessibilityLabel={`${MESSAGES[i].from}: ${MESSAGES[i].text}. MoneyWise: ${MESSAGES[i].books.replace('\n', '. ')}. Posted.`}>
                <Skeletons w={w} />
                <Animated.View
                    key={`${still}-${i}`}
                    entering={still ? undefined : FadeInUp.delay(280).duration(600)}
                    exiting={still ? undefined : FadeOutDown.duration(260)}
                    style={[styles.msgCard, { top: 82 }]}
                >
                    <MessageCard msg={MESSAGES[i]} still={still} />
                </Animated.View>
            </View>
        </View>
    );
}

// ─────────────────────────────── slide 3: net worth grows (the Grow page in miniature) ───────────────────────────────
const MONTHS = 6;
/**
 * Net worth at the start and at the end of each month. Both the plan and the actual curve upward (each month adds more
 * than the last, as compounding does), with the actual running a little ahead of the plan the whole way.
 */
const ACTUAL = [12000, 13000, 14700, 16900, 19400, 22100, 25000];
const TARGET = [12000, 12700, 14100, 16000, 18300, 21000, 24000];
const DRAW_MS = 4600;      // the pen crossing six months
const GROW_CYCLE_MS = 9400;
const CH = 252;            // chart height: tall, so the month labels sit low, near the slide's title
const LABEL_H = 26;
const TOP_ROOM = 80;       // room above the highest point for the callout
const CALLOUT_W = 132, CALLOUT_H = 62, STEM = 14;
const PAD_R = 38;          // room on the right (the pulse at the end point spreads this far)

/** Smooth line through the nodes that never overshoots (monotone cubic), evaluated at any x in [0, n]. Same family as Grow's. */
function monotone(ys: number[]) {
    const n = ys.length;
    const m: number[] = [];
    for (let i = 0; i < n - 1; i++) m.push(ys[i + 1] - ys[i]);
    const t: number[] = [m[0]];
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    t.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
        if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    return (x: number) => {
        const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
        const s = x - i, s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * t[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * t[i + 1];
    };
}
const actualAt = monotone(ACTUAL);
const planAt = monotone(TARGET);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function NetWorthGrowth({ active }: { active: boolean }) {
    const { width } = useWindowDimensions();
    const reduced = useReducedMotion();
    const still = reduced || !active;
    const [p, setP] = useState(still ? 1 : 0);
    const startKey = useMemo(() => monthKeyOf(new Date()), []);

    useEffect(() => {
        if (still) { setP(1); return; }
        const t0 = Date.now();
        const id = setInterval(() => {
            const local = (Date.now() - t0) % GROW_CYCLE_MS;
            setP(local >= DRAW_MS ? 1 : easeInOut(local / DRAW_MS));
        }, 33);
        return () => clearInterval(id);
    }, [still]);

    const PW = width - PAD_R;
    const colW = PW / MONTHS;
    const baseY = CH - LABEL_H;
    const plotTop = TOP_ROOM, plotBottom = baseY - 10;
    const lo = 10600, hi = 26200;
    const yOf = (v: number) => plotTop + (1 - (v - lo) / (hi - lo)) * (plotBottom - plotTop);

    const pos = p * MONTHS;
    const done = p >= 0.9995;
    const value = actualAt(pos);
    const m = Math.min(MONTHS - 1, Math.floor(pos));
    const frac = done ? 1 : Math.min(1, pos - m);
    const closed = frac >= 0.999;

    // the green line, up to where the pen is
    const N = 80;
    const pts = Array.from({ length: N + 1 }, (_, k) => {
        const s = (pos * k) / N;
        return { x: s * colW, y: yOf(actualAt(s)) };
    });
    const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
    const tip = pts[pts.length - 1];
    const area = `${line} L${tip.x.toFixed(1)} ${baseY} L0 ${baseY} Z`;
    // the plan: dashed, grey, always there
    const planPts = Array.from({ length: N + 1 }, (_, k) => {
        const q = (MONTHS * k) / N;
        return { x: q * colW, y: yOf(planAt(q)) };
    });
    const planLine = planPts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
    const planArea = `${planLine} L${PW} ${baseY} L0 ${baseY} Z`;

    // header: counts up with the pen, and turns to "reached" when the goal is
    const goal = TARGET[MONTHS];
    const goalText = done ? `Goal ${formatK(goal)} reached` : `${formatK(goal)} by ${monthLabelWithYear(addMonths(startKey, MONTHS - 1))} · ${MONTHS - m} mo to go`;
    const cardKey = addMonths(startKey, m);
    // ahead of or behind the plan where the pen is
    const planNow = planAt(pos);
    const ahead = value + 0.5 >= planNow;
    const tone = ahead ? GROW_COLORS.success : GROW_COLORS.danger;

    // the pulse around the final point
    const pulse = useSharedValue(0);
    useEffect(() => {
        if (!done || reduced) { pulse.value = 0; return; }
        pulse.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false);
    }, [done, reduced, pulse]);
    const ring = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.5, 0]), transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 3]) }] }));

    const calloutLeft = Math.min(width - CALLOUT_W - 6, Math.max(6, tip.x - CALLOUT_W / 2));
    const calloutTop = tip.y - 6 - STEM - CALLOUT_H;
    const Icon = closed ? (ahead ? CheckCircle2 : XCircle) : Clock3;

    return (
        <View style={styles.gRoot} accessible accessibilityLabel={`Net worth grows from ${formatK(ACTUAL[0])} to ${formatK(ACTUAL[MONTHS])} over ${MONTHS} months, ahead of plan`}>
            <View style={styles.gHeader}>
                <Text style={styles.gHeroLabel}>Current Net Worth</Text>
                <Text style={styles.gHeroValue}>{formatK(value)}</Text>
                <Text style={styles.gGoal} numberOfLines={1}>{goalText}</Text>
            </View>

            <View style={{ width, height: CH, marginTop: 34 }}>
                <Svg width={width} height={CH} style={StyleSheet.absoluteFill}>
                    <Defs>
                        <LinearGradient id="gPlanFill" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={GROW_COLORS.plan} stopOpacity={0.14} />
                            <Stop offset="1" stopColor={GROW_COLORS.plan} stopOpacity={0} />
                        </LinearGradient>
                        <LinearGradient id="gActualFill" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={GROW_COLORS.success} stopOpacity={0.26} />
                            <Stop offset="0.7" stopColor={GROW_COLORS.success} stopOpacity={0.06} />
                            <Stop offset="1" stopColor={GROW_COLORS.success} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>
                    <Path d={planArea} fill="url(#gPlanFill)" />
                    <Path d={planLine} stroke={GROW_COLORS.plan} strokeWidth={0.75} strokeDasharray="5,6" strokeLinecap="round" fill="none" />
                    {pos > 0.01 && <Path d={area} fill="url(#gActualFill)" />}
                    {pos > 0.01 && <Path d={line} stroke={GROW_COLORS.success} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
                </Svg>

                {/* the latest point: a halo, and once it has arrived, a pulse */}
                {pos > 0.01 && (
                    <View pointerEvents="none" style={[styles.gAbs, { left: tip.x - 11, top: tip.y - 11, width: 22, height: 22 }]}>
                        {done && <Animated.View style={[{ position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: tone }, ring]} />}
                        <View style={{ position: 'absolute', left: 0, top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: `${tone}26` }} />
                        <View style={{ position: 'absolute', left: 5, top: 5, width: 12, height: 12, borderRadius: 6, backgroundColor: ahead ? GROW_COLORS.successBg : GROW_COLORS.dangerBg, borderWidth: 3, borderColor: tone }} />
                    </View>
                )}


                {/* the callout travels with the pen: month, where net worth is, and the plan's target */}
                {pos > 0.04 && (
                    <>
                        <View pointerEvents="none" style={[styles.gStem, { left: tip.x - 1, top: tip.y - 6 - STEM, backgroundColor: tone }]} />
                        <View style={[styles.gCallout, { left: calloutLeft, top: calloutTop }]}>
                            <View style={styles.gCalloutHead}>
                                <View style={[styles.gDot, { backgroundColor: ahead ? GROW_COLORS.successBg : GROW_COLORS.dangerBg, borderColor: tone }]} />
                                <Text style={styles.gCalloutMonth} numberOfLines={1}>{monthName(cardKey)}</Text>
                                <Icon size={13} color={colors.text} />
                            </View>
                            <Text style={styles.gCalloutValue} numberOfLines={1}>{formatK(value)} <Text style={styles.gCalloutSub}>{closed ? 'closed' : 'so far'}</Text></Text>
                            <Text style={styles.gCalloutSub} numberOfLines={1}>– – {formatK(TARGET[m + 1])} target</Text>
                        </View>
                    </>
                )}

                {Array.from({ length: MONTHS }, (_, i) => (
                    <View key={i} style={[styles.gMonth, { left: i * colW, width: colW }]}>
                        <Text style={[styles.gMonthText, i === m && { fontFamily: fonts.bodyBold, color: colors.text }]}>{monthName(addMonths(startKey, i), 'short')}</Text>
                    </View>
                ))}
            </View>

        </View>
    );
}

const DESIGN_HERO_H = 380; // the height every illustration is drawn for

/** Draws the illustration at its design size and shrinks it, as a whole, to fit short screens, so nothing overlaps. */
function FitHero({ children }: { children: React.ReactNode }) {
    const [h, setH] = useState(0);
    const k = h > 0 ? Math.min(1, h / DESIGN_HERO_H) : 1;
    return (
        <View style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
            {h > 0 && (
                <View style={{ position: 'absolute', left: 0, right: 0, top: (h - DESIGN_HERO_H) / 2, height: DESIGN_HERO_H, transform: [{ scale: k }] }}>
                    {children}
                </View>
            )}
        </View>
    );
}

export function WelcomeHero({ slide, active = true }: { slide: WelcomeSlideKey; active?: boolean }) {
    return (
        <FitHero>
            {slide === 'accounts' ? <AccountsStack active={active} /> : slide === 'capture' ? <CaptureStack active={active} /> : <NetWorthGrowth active={active} />}
        </FitHero>
    );
}
