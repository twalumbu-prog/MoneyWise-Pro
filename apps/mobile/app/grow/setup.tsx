import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInRight, FadeOutLeft, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { X, ChevronLeft, Pencil } from 'lucide-react-native';
import { AstroidIcon } from '../../src/components/icons/AstroidIcon';
import {
    GROW_FREQUENCIES, GROW_FREQUENCY_LABEL, GROW_FREQUENCY_UNIT, monthKeyOf, addMonths, monthRange, monthsBetween,
    monthLabelWithYear, monthName, monthlyEquivalent, projectGrowPlan, summariseGrowMonth, reportService,
} from 'core';
import type { GrowFrequency, GrowPlan, GrowTarget, GrowLedgerRow, GrowTargetKey } from 'core';
import { colors, fonts } from '../../src/theme/tokens';
import { hapticSuccess, hapticTick } from '../../src/lib/haptics';
import { useGrowPlan, useNetWorthToday } from '../../src/components/grow/useGrow';
import { GROW_COLORS, TARGET_META, formatK } from '../../src/components/grow/growUi';

type Step = GrowTargetKey | 'goal' | 'review';
const STEPS: Step[] = ['income', 'expense', 'savings', 'investment', 'goal', 'review'];
const HORIZONS = [
    { months: 6, label: '6 months' },
    { months: 12, label: '1 year' },
    { months: 24, label: '2 years' },
    { months: 36, label: '3 years' },
    { months: 60, label: '5 years' },
];

const COPY: Record<GrowTargetKey, { q: string; help: string }> = {
    income: { q: 'How much do you plan to earn?', help: 'Salary, business, side hustles — everything coming in.' },
    expense: { q: "What's your spending limit?", help: 'Rent, food, transport, fun — everything going out.' },
    savings: { q: 'How much will you save?', help: 'Money you set aside and keep — an emergency fund or a goal.' },
    investment: { q: 'How much will you invest?', help: 'Money put to work — shares, T-bills, a business, a pension.' },
};

const parseAmount = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
const formatInput = (s: string) => {
    const clean = s.replace(/[^0-9.]/g, '');
    const [whole, ...rest] = clean.split('.');
    const dec = rest.length ? `.${rest.join('').slice(0, 2)}` : '';
    return (whole ? Number(whole).toLocaleString('en-US') : '') + dec;
};
const toInput = (n: number) => (n > 0 ? formatInput(String(Math.round(n * 100) / 100)) : '');

export default function GrowSetupScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { edit } = useLocalSearchParams<{ edit?: string }>();
    const { plan: existing, save } = useGrowPlan();
    const editing = edit === '1' && !!existing;
    const { data: netWorthNow, isLoading: nwLoading, isError: nwError } = useNetWorthToday();

    // Last full month from the books → one-tap suggestions.
    const lastMonth = addMonths(monthKeyOf(new Date()), -1);
    const { data: last } = useQuery({
        queryKey: ['grow-last-month', lastMonth],
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const prev = addMonths(lastMonth, -1);
            const [a, b] = await Promise.all([lastMonth, prev].map((k) => {
                const { start, end } = monthRange(k);
                return reportService.getExpenditures(start, end, 'EXPENSE') as Promise<GrowLedgerRow[]>;
            }));
            return summariseGrowMonth(a, b);
        },
    });

    const [step, setStep] = useState(0);
    const [amounts, setAmounts] = useState<Record<GrowTargetKey, string>>(() => ({
        income: toInput(existing && editing ? existing.income.amount : 0),
        expense: toInput(existing && editing ? existing.expense.amount : 0),
        savings: toInput(existing && editing ? existing.savings.amount : 0),
        investment: toInput(existing && editing ? existing.investment.amount : 0),
    }));
    const [freqs, setFreqs] = useState<Record<GrowTargetKey, GrowFrequency>>(() => ({
        income: editing ? existing!.income.frequency : 'MONTHLY',
        expense: editing ? existing!.expense.frequency : 'MONTHLY',
        savings: editing ? existing!.savings.frequency : 'MONTHLY',
        investment: editing ? existing!.investment.frequency : 'MONTHLY',
    }));
    const [returnPct, setReturnPct] = useState(editing ? String(existing!.annualReturnPct) : '10');
    const thisMonth = monthKeyOf(new Date());
    const [startNext, setStartNext] = useState(() => !editing && new Date().getDate() > 20);
    const startMonth = editing ? existing!.startMonth : (startNext ? addMonths(thisMonth, 1) : thisMonth);
    const [horizon, setHorizon] = useState(() => (editing ? monthsBetween(existing!.startMonth, existing!.goalMonth) + 1 : 12));
    const [stretch, setStretch] = useState(editing && existing!.goalAmount ? toInput(existing!.goalAmount) : '');
    const [saving, setSaving] = useState(false);

    const target = (k: GrowTargetKey): GrowTarget => ({ amount: parseAmount(amounts[k]), frequency: freqs[k] });
    const monthly = {
        income: monthlyEquivalent(target('income')),
        expense: monthlyEquivalent(target('expense')),
        savings: monthlyEquivalent(target('savings')),
        investment: monthlyEquivalent(target('investment')),
    };
    const leftOver = monthly.income - monthly.expense;
    const unallocated = leftOver - monthly.savings - monthly.investment;

    const startNw = editing ? existing!.startNetWorth : netWorthNow ?? 0;
    const draft = useMemo(() => ({
        startMonth,
        goalMonth: addMonths(startMonth, horizon - 1),
        income: target('income'), expense: target('expense'), savings: target('savings'), investment: target('investment'),
        annualReturnPct: Math.min(100, Math.max(0, Number(returnPct) || 0)),
        goalAmount: parseAmount(stretch) || null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [startMonth, horizon, amounts, freqs, returnPct, stretch]);
    const projection = useMemo(() => projectGrowPlan(draft, startNw), [draft, startNw]);

    const current = STEPS[step];
    const canContinue = current === 'income' ? monthly.income > 0 : true;

    const next = () => {
        if (!canContinue) return;
        hapticTick();
        if (step < STEPS.length - 1) setStep(step + 1);
    };
    const back = () => (step === 0 ? router.back() : setStep(step - 1));

    const finish = async () => {
        setSaving(true);
        const now = new Date().toISOString();
        const plan: GrowPlan = {
            version: 1,
            ...draft,
            startNetWorth: startNw,
            createdAt: editing ? existing!.createdAt : now,
            updatedAt: now,
        };
        const { synced } = await save(plan);
        setSaving(false);
        hapticSuccess();
        if (!synced) {
            Alert.alert('Saved on this phone', "We couldn't reach MoneyWise just now, so your plan is saved on this device and will sync next time you open Grow.");
        }
        router.back();
    };

    const progressStyle = useAnimatedStyle(() => ({ width: withTiming(`${((step + 1) / STEPS.length) * 100}%`, { duration: 250 }) }));

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <Pressable onPress={back} hitSlop={12} accessibilityLabel={step === 0 ? 'Close' : 'Back'} style={styles.headerSide}>
                    {step === 0 ? <X size={24} color="#000" /> : <ChevronLeft size={26} color="#000" />}
                </Pressable>
                <Text style={styles.headerTitle}>{editing ? 'Edit plan' : 'Set up Grow'}</Text>
                <Text style={[styles.headerSide, styles.stepCount]}>{step + 1}/{STEPS.length}</Text>
            </View>
            <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, progressStyle]} /></View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                    <Animated.View key={current} entering={FadeInRight.duration(240)} exiting={FadeOutLeft.duration(160)}>
                        {current === 'income' || current === 'expense' || current === 'savings' || current === 'investment' ? (
                            <TargetStep
                                k={current}
                                value={amounts[current]}
                                onChange={(v) => setAmounts((a) => ({ ...a, [current]: formatInput(v) }))}
                                freq={freqs[current]}
                                onFreq={(f) => { hapticTick(); setFreqs((s) => ({ ...s, [current]: f })); }}
                                suggestion={
                                    current === 'income' ? last?.income
                                        : current === 'expense' ? last?.expense
                                            : current === 'savings' ? last?.savings
                                                : last?.investment
                                }
                                suggestionMonth={monthName(lastMonth)}
                                onUseSuggestion={(n) => { hapticTick(); setAmounts((a) => ({ ...a, [current]: toInput(n) })); setFreqs((s) => ({ ...s, [current]: 'MONTHLY' })); }}
                                percentOf={current === 'savings' || current === 'investment' ? monthly.income : 0}
                                onPercent={(pct) => { hapticTick(); setAmounts((a) => ({ ...a, [current]: toInput(monthly.income * pct) })); setFreqs((s) => ({ ...s, [current]: 'MONTHLY' })); }}
                                extra={current === 'investment' ? (
                                    <View style={styles.returnRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.returnLabel}>Expected yearly return</Text>
                                            <Text style={styles.returnHelp}>Used to grow your invested money in the plan. Be conservative.</Text>
                                        </View>
                                        <View style={styles.returnInputWrap}>
                                            <TextInput
                                                value={returnPct}
                                                onChangeText={(v) => setReturnPct(v.replace(/[^0-9.]/g, '').slice(0, 5))}
                                                keyboardType="decimal-pad"
                                                style={styles.returnInput}
                                                accessibilityLabel="Expected yearly return in percent"
                                            />
                                            <Text style={styles.returnPct}>%</Text>
                                        </View>
                                    </View>
                                ) : null}
                            />
                        ) : current === 'goal' ? (
                            <GoalStep
                                editing={editing}
                                startNext={startNext}
                                onStartNext={(v) => { hapticTick(); setStartNext(v); }}
                                thisMonth={thisMonth}
                                horizon={horizon}
                                onHorizon={(h) => { hapticTick(); setHorizon(h); }}
                                stretch={stretch}
                                onStretch={(v) => setStretch(formatInput(v))}
                                projection={projection}
                                startNw={startNw}
                                nwLoading={nwLoading && !editing}
                                nwUnavailable={nwError && !editing}
                                goalMonth={draft.goalMonth}
                            />
                        ) : (
                            <ReviewStep
                                draft={draft}
                                monthly={monthly}
                                projection={projection}
                                startNw={startNw}
                                onEdit={(s) => setStep(STEPS.indexOf(s))}
                            />
                        )}
                    </Animated.View>

                    {step > 0 && step < 4 && monthly.income > 0 && (
                        <MoneyFlow monthly={monthly} leftOver={leftOver} unallocated={unallocated} highlight={current as GrowTargetKey} />
                    )}
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
                    <Pressable onPress={back} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
                        <Text style={styles.secondaryText}>Back</Text>
                    </Pressable>
                    {current === 'review' ? (
                        <Pressable onPress={finish} disabled={saving} style={({ pressed }) => [styles.primary, styles.finish, pressed && styles.pressed]} accessibilityRole="button">
                            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{editing ? 'Save changes' : 'Start growing'}</Text>}
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={next}
                            disabled={!canContinue}
                            style={({ pressed }) => [styles.primary, !canContinue && styles.primaryDisabled, pressed && styles.pressed]}
                            accessibilityRole="button"
                        >
                            <Text style={styles.primaryText}>Next</Text>
                        </Pressable>
                    )}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Steps ───────────────────────────────────────────────────────────────────

function TargetStep(props: {
    k: GrowTargetKey;
    value: string; onChange: (v: string) => void;
    freq: GrowFrequency; onFreq: (f: GrowFrequency) => void;
    suggestion?: number; suggestionMonth: string; onUseSuggestion: (n: number) => void;
    percentOf: number; onPercent: (pct: number) => void;
    extra?: React.ReactNode;
}) {
    const { k, value, onChange, freq, onFreq, suggestion, suggestionMonth, onUseSuggestion, percentOf, onPercent, extra } = props;
    const inputRef = useRef<TextInput>(null);
    useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 320); return () => clearTimeout(t); }, [k]);
    const meta = TARGET_META[k];
    const amount = parseAmount(value);

    return (
        <View style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
                <Text style={styles.emojiBig}>{meta.emoji}</Text>
                <Text style={styles.question}>{COPY[k].q}</Text>
                <Text style={styles.help}>{COPY[k].help}</Text>
            </View>

            <Pressable style={styles.amountBox} onPress={() => inputRef.current?.focus()}>
                <Text style={[styles.currency, !value && { color: colors.textFaint }]}>K</Text>
                <TextInput
                    ref={inputRef}
                    value={value}
                    onChangeText={onChange}
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="decimal-pad"
                    style={[styles.amountInput, value.length > 12 ? { fontSize: 22 } : value.length > 8 ? { fontSize: 28 } : null]}
                    accessibilityLabel={`${meta.short} amount`}
                />
                {amount > 0 && <Text style={styles.amountUnit}>{GROW_FREQUENCY_UNIT[freq]}</Text>}
            </Pressable>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {GROW_FREQUENCIES.map((f) => (
                    <Pressable key={f} onPress={() => onFreq(f)} style={[styles.chip, freq === f && styles.chipActive]}>
                        <Text style={[styles.chipText, freq === f && styles.chipTextActive]}>{GROW_FREQUENCY_LABEL[f]}</Text>
                    </Pressable>
                ))}
            </ScrollView>

            {freq !== 'MONTHLY' && amount > 0 && (
                <Text style={styles.equiv}>≈ {formatK(monthlyEquivalent({ amount, frequency: freq }))} a month</Text>
            )}

            {percentOf > 0 && (
                <View style={{ gap: 8 }}>
                    <Text style={styles.subLabel}>Quick pick — share of your income</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[0.05, 0.1, 0.15, 0.2, 0.3].map((p) => (
                            <Pressable key={p} onPress={() => onPercent(p)} style={[styles.chip, styles.pctChip]}>
                                <Text style={styles.chipText}>{Math.round(p * 100)}%</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            )}

            {suggestion != null && suggestion > 0 && (
                <Pressable onPress={() => onUseSuggestion(suggestion)} style={styles.suggestion}>
                    <AstroidIcon size={16} color={colors.blue} />
                    <Text style={styles.suggestionText}>
                        In {suggestionMonth} your books show <Text style={styles.bold}>{formatK(suggestion)}</Text>. Tap to use it.
                    </Text>
                </Pressable>
            )}

            {extra}
        </View>
    );
}

function GoalStep(props: {
    editing: boolean; startNext: boolean; onStartNext: (v: boolean) => void; thisMonth: string;
    horizon: number; onHorizon: (h: number) => void;
    stretch: string; onStretch: (v: string) => void;
    projection: ReturnType<typeof projectGrowPlan>; startNw: number; nwLoading: boolean; nwUnavailable: boolean; goalMonth: string;
}) {
    const { editing, startNext, onStartNext, thisMonth, horizon, onHorizon, stretch, onStretch, projection, startNw, nwLoading, nwUnavailable, goalMonth } = props;
    const [aimHigher, setAimHigher] = useState(!!stretch);
    const stretchN = parseAmount(stretch);

    return (
        <View style={{ gap: 20 }}>
            <View style={{ gap: 6 }}>
                <Text style={styles.emojiBig}>🏆</Text>
                <Text style={styles.question}>When do you want to get there?</Text>
                <Text style={styles.help}>
                    {nwUnavailable
                        ? "We couldn't read your net worth just now — your chart will start from your books once they load."
                        : <>You're starting from {nwLoading ? '…' : <Text style={styles.bold}>{formatK(startNw)}</Text>} net worth.</>}
                </Text>
            </View>

            {!editing && (
                <View style={{ gap: 8 }}>
                    <Text style={styles.subLabel}>Start</Text>
                    <View style={styles.segment}>
                        {[false, true].map((v) => (
                            <Pressable key={String(v)} onPress={() => onStartNext(v)} style={[styles.segmentBtn, startNext === v && styles.segmentBtnActive]}>
                                <Text style={[styles.segmentText, startNext === v && styles.segmentTextActive]}>
                                    {v ? `Next month (${monthName(addMonths(thisMonth, 1), 'short')})` : `This month (${monthName(thisMonth, 'short')})`}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            )}

            <View style={{ gap: 8 }}>
                <Text style={styles.subLabel}>Reach my goal in</Text>
                <View style={styles.wrap}>
                    {HORIZONS.map((h) => (
                        <Pressable key={h.months} onPress={() => onHorizon(h.months)} style={[styles.chip, horizon === h.months && styles.chipActive]}>
                            <Text style={[styles.chipText, horizon === h.months && styles.chipTextActive]}>{h.label}</Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>On this plan, by {monthLabelWithYear(goalMonth, 'long')}</Text>
                <Text style={styles.previewValue}>{formatK(projection.naturalEnd)}</Text>
                <Text style={styles.previewSub}>
                    {nwUnavailable
                        ? `+${formatK(projection.naturalEnd - startNw)} of growth`
                        : projection.naturalEnd >= startNw
                        ? `+${formatK(projection.naturalEnd - startNw)} from today`
                        : `${formatK(projection.naturalEnd - startNw)} — your spending is above your income`}
                </Text>
                <MiniProjection projection={projection} />
            </View>

            {!aimHigher ? (
                <Pressable onPress={() => setAimHigher(true)} style={styles.linkBtn}>
                    <Text style={styles.linkText}>Aim higher — set a bigger goal</Text>
                </Pressable>
            ) : (
                <View style={{ gap: 8 }}>
                    <Text style={styles.subLabel}>My net-worth goal (optional)</Text>
                    <View style={[styles.amountBox, { paddingVertical: 12 }]}>
                        <Text style={[styles.currency, { fontSize: 22 }]}>K</Text>
                        <TextInput
                            value={stretch}
                            onChangeText={onStretch}
                            placeholder={Math.round(projection.naturalEnd).toLocaleString('en-US')}
                            placeholderTextColor={colors.textFaint}
                            keyboardType="decimal-pad"
                            style={[styles.amountInput, { fontSize: 24 }]}
                            accessibilityLabel="Net worth goal"
                        />
                    </View>
                    {stretchN > projection.naturalEnd && (
                        <Text style={styles.warnText}>
                            That's {formatK(stretchN - projection.naturalEnd)} above your plan — about{' '}
                            <Text style={styles.bold}>{formatK(projection.monthlyCatchUp)}</Text> more growth each month. We'll build it into your monthly targets.
                        </Text>
                    )}
                    {stretchN > 0 && stretchN <= projection.naturalEnd && (
                        <Text style={styles.okText}>Your targets already get you there. 🎉</Text>
                    )}
                </View>
            )}
        </View>
    );
}

function ReviewStep({ draft, monthly, projection, startNw, onEdit }: {
    draft: Pick<GrowPlan, 'income' | 'expense' | 'savings' | 'investment' | 'annualReturnPct' | 'startMonth' | 'goalMonth' | 'goalAmount'>;
    monthly: Record<GrowTargetKey, number>;
    projection: ReturnType<typeof projectGrowPlan>;
    startNw: number;
    onEdit: (s: Step) => void;
}) {
    const keys: GrowTargetKey[] = ['income', 'expense', 'savings', 'investment'];
    return (
        <View style={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
                <Text style={styles.emojiBig}>🌱</Text>
                <Text style={styles.question}>Your plan</Text>
                <Text style={styles.help}>From {formatK(startNw)} to {formatK(projection.goal)} by {monthLabelWithYear(draft.goalMonth, 'long')}.</Text>
            </View>
            <View style={styles.reviewCard}>
                {keys.map((k, i) => (
                    <Pressable key={k} onPress={() => onEdit(k)} style={[styles.reviewRow, i < keys.length - 1 && styles.reviewDivider]}>
                        <Text style={styles.reviewEmoji}>{TARGET_META[k].emoji}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.reviewLabel}>{TARGET_META[k].label}</Text>
                            <Text style={styles.reviewSub}>
                                {draft[k].amount > 0 ? `${formatK(draft[k].amount)} ${GROW_FREQUENCY_UNIT[draft[k].frequency]}` : 'Not set'}
                                {draft[k].frequency !== 'MONTHLY' && draft[k].amount > 0 ? ` · ≈ ${formatK(monthly[k])}/mo` : ''}
                            </Text>
                        </View>
                        <Pencil size={16} color={colors.textFaint} />
                    </Pressable>
                ))}
                <Pressable onPress={() => onEdit('goal')} style={[styles.reviewRow, styles.reviewTopDivider]}>
                    <Text style={styles.reviewEmoji}>🏆</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.reviewLabel}>Goal</Text>
                        <Text style={styles.reviewSub}>
                            {formatK(projection.goal)} · {monthLabelWithYear(draft.startMonth)} → {monthLabelWithYear(draft.goalMonth)}
                        </Text>
                    </View>
                    <Pencil size={16} color={colors.textFaint} />
                </Pressable>
            </View>
            {monthly.savings + monthly.investment > monthly.income - monthly.expense + 0.5 && (
                <Text style={styles.warnText}>
                    Heads up: you plan to save and invest {formatK(monthly.savings + monthly.investment)} a month but only{' '}
                    {formatK(Math.max(0, monthly.income - monthly.expense))} is left after spending.
                </Text>
            )}
            <Text style={styles.footnote}>
                Grow reads your actual income, spending, savings and investments from your MoneyWise books every month — nothing to log by hand.
            </Text>
        </View>
    );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Where an average month's income goes: spending · saving · investing · left over. */
function MoneyFlow({ monthly, leftOver, unallocated, highlight }: {
    monthly: Record<GrowTargetKey, number>; leftOver: number; unallocated: number; highlight: GrowTargetKey;
}) {
    const inc = Math.max(1, monthly.income);
    const segs = [
        { k: 'expense', v: monthly.expense, c: '#A1A1AA', label: 'Spend' },
        { k: 'savings', v: monthly.savings, c: GROW_COLORS.success, label: 'Save' },
        { k: 'investment', v: monthly.investment, c: GROW_COLORS.blue, label: 'Invest' },
    ];
    const over = unallocated < -0.5;
    return (
        <View style={styles.flow}>
            <View style={styles.flowHead}>
                <Text style={styles.flowTitle}>Your average month</Text>
                <Text style={styles.flowIncome}>{formatK(monthly.income)} in</Text>
            </View>
            <View style={styles.flowBar}>
                {segs.map((s) => s.v > 0 && (
                    <View key={s.k} style={{ flex: Math.min(s.v, inc), backgroundColor: s.c, opacity: highlight === s.k || highlight === 'income' ? 1 : 0.55 }} />
                ))}
                {unallocated > 0 && <View style={{ flex: unallocated, backgroundColor: '#E5E7EB' }} />}
            </View>
            <View style={styles.flowLegend}>
                {segs.map((s) => (
                    <View key={s.k} style={styles.flowItem}>
                        <View style={[styles.flowDot, { backgroundColor: s.c }]} />
                        <Text style={styles.flowItemText}>{s.label} {formatK(s.v)}</Text>
                    </View>
                ))}
            </View>
            <Text style={[styles.flowFoot, over && { color: GROW_COLORS.dangerInk }]}>
                {leftOver < 0
                    ? `You'd spend ${formatK(-leftOver)} more than you earn each month.`
                    : over
                        ? `Saving + investing is ${formatK(-unallocated)} more than what's left after spending.`
                        : `${formatK(leftOver)} left after spending · ${formatK(unallocated)} not yet assigned`}
            </Text>
        </View>
    );
}

function MiniProjection({ projection }: { projection: ReturnType<typeof projectGrowPlan> }) {
    const W = 280, H = 70;
    const vals = [projection.baseline, ...projection.months.map((m) => m.targetNetWorth)];
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * (W - 12) + 6, H - 8 - ((v - lo) / span) * (H - 20)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
    const up = vals[vals.length - 1] >= vals[0];
    const c = up ? GROW_COLORS.success : GROW_COLORS.danger;
    return (
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 10 }}>
            <Defs>
                <LinearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={c} stopOpacity={0.25} />
                    <Stop offset="100%" stopColor={c} stopOpacity={0} />
                </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#miniFill)" />
            <Path d={line} stroke={c} strokeWidth={2.5} fill="none" strokeDasharray="6,5" strokeLinecap="round" />
            <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill="#FFF" stroke={c} strokeWidth={2.5} />
        </Svg>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    headerSide: { width: 44 },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 16, color: '#000' },
    stepCount: { textAlign: 'right', fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    progressTrack: { height: 3, backgroundColor: '#E5E7EB', marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: 3, backgroundColor: colors.blue, borderRadius: 2 },

    body: { padding: 22, paddingTop: 26, gap: 22 },
    emojiBig: { fontSize: 34 },
    question: { fontFamily: fonts.display, fontSize: 24, color: '#000', letterSpacing: -0.3 },
    help: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    bold: { fontFamily: fonts.bodyBold, color: colors.text },

    amountBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderRadius: 18,
        borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 18, paddingVertical: 16,
    },
    currency: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
    amountInput: { flex: 1, fontFamily: fonts.display, fontSize: 34, color: colors.text, padding: 0 },
    amountUnit: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    equiv: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginTop: -8 },

    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
    chipActive: { backgroundColor: '#111827', borderColor: '#111827' },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    chipTextActive: { color: '#FFF' },
    pctChip: { flex: 1, alignItems: 'center', paddingHorizontal: 0 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    subLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.3 },

    suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#EFF6FF' },
    suggestionText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: '#1E3A8A', lineHeight: 18 },

    returnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
    returnLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    returnHelp: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    returnInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    returnInput: { minWidth: 34, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, textAlign: 'right', padding: 0 },
    returnPct: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.textMuted, marginLeft: 2 },

    segment: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    segmentText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { fontFamily: fonts.bodyBold, color: colors.text },

    previewCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    previewLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    previewValue: { fontFamily: fonts.display, fontSize: 30, color: colors.text, marginTop: 2 },
    previewSub: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: GROW_COLORS.success },
    linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
    linkText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    warnText: { fontFamily: fonts.body, fontSize: 13, color: '#9A3412', lineHeight: 19, backgroundColor: '#FFF7ED', padding: 12, borderRadius: 12 },
    okText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: '#15803D' },

    reviewCard: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14 },
    reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    reviewDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
    reviewTopDivider: { borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    reviewEmoji: { fontSize: 24, width: 30, textAlign: 'center' },
    reviewLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    reviewSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
    footnote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17, textAlign: 'center' },

    flow: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
    flowHead: { flexDirection: 'row', justifyContent: 'space-between' },
    flowTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    flowIncome: { fontFamily: fonts.bodyBold, fontSize: 13, color: GROW_COLORS.success },
    flowBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F3F4F6', gap: 2 },
    flowLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    flowItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    flowDot: { width: 8, height: 8, borderRadius: 4 },
    flowItemText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    flowFoot: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },

    footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.canvas },
    primary: { flex: 1.6, backgroundColor: colors.blue, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
    finish: { backgroundColor: '#000000' },
    secondary: { flex: 1, borderRadius: 999, paddingVertical: 16, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
    secondaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#111827' },
    primaryDisabled: { backgroundColor: '#93C5FD' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFF' },
    pressed: { opacity: 0.88 },
});
