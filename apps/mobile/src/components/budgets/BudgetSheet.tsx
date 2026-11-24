import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Plus, Check, Search, Trash2, ChevronDown } from 'lucide-react-native';
import { BUDGET_BASES, periodContaining } from 'core';
import type { Account, BudgetBasis } from 'core';
import { AnimatedSegmented } from '../AnimatedTabs';
import { AccountGlyph } from '../AccountGlyph';
import { KB_DONE_ID } from '../KeyboardDoneBar';
import { PRESET_EMOJIS, extractEmojiAndName, getAccountEmoji } from '../../utils/emoji';
import { hapticTick } from '../../lib/haptics';
import { colors, fonts, radius } from '../../theme/tokens';

export interface BudgetDraft { amount: string; basis: BudgetBasis; due: number | null }

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n: number) => `K${n.toLocaleString(undefined, Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const monthsIn = (b: BudgetBasis) => (b === 'QUARTERLY' ? 3 : b === 'YEARLY' ? 12 : 1);
const PER: Record<string, string> = { MONTHLY: 'a month', QUARTERLY: 'a quarter', YEARLY: 'a year' };

/**
 * Add or edit one budget line: the category, the amount, how often it repeats, and — for quarterly / yearly — whether
 * it is spread across the months or paid all at once in a given month. Done stages the change; the Budgets screen's
 * Save button writes it.
 */
export function BudgetSheet({
    visible, monthStart, account, initial, choices, onClose, onDone, onRemove, onCreateCategory,
}: {
    visible: boolean;
    /** First day of the month being viewed. */
    monthStart: string;
    /** The line being edited; null when adding. */
    account: Account | null;
    initial?: BudgetDraft;
    /** Categories that can still be added (income / expense without a budget). */
    choices: Account[];
    onClose: () => void;
    onDone: (accountId: string, draft: BudgetDraft) => void;
    onRemove?: (accountId: string) => void;
    onCreateCategory: (name: string, emoji: string, type: 'INCOME' | 'EXPENSE') => Promise<Account>;
}) {
    const insets = useSafeAreaInsets();
    const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [picked, setPicked] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmoji, setNewEmoji] = useState('🛒');
    const [amount, setAmount] = useState('');
    const [basis, setBasis] = useState<BudgetBasis>('MONTHLY');
    const [due, setDue] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!visible) return;
        setType('EXPENSE'); setPicked(null); setQuery(''); setOpen(false); setCreating(false); setNewName(''); setNewEmoji('🛒');
        setAmount(initial?.amount ?? ''); setBasis(initial?.basis ?? 'MONTHLY'); setDue(initial?.due ?? null);
        setBusy(false); setError('');
    }, [visible, initial]);

    const period = periodContaining(basis, monthStart);
    const n = monthsIn(basis);
    const periodMonths = useMemo(() => {
        const first = Number(period.start.slice(5, 7)) - 1;
        return Array.from({ length: n }, (_, i) => SHORT[(first + i) % 12]);
    }, [period.start, n]);
    const value = parseFloat(amount) || 0;

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return choices
            .filter((a) => a.type === type && (!q || a.name.toLowerCase().includes(q)))
            .sort((a, b) => extractEmojiAndName(a.name).cleanName.localeCompare(extractEmojiAndName(b.name).cleanName));
    }, [choices, type, query]);
    const typed = query.trim();
    const exact = !!typed && choices.some((a) => a.type === type && extractEmojiAndName(a.name).cleanName.toLowerCase() === typed.toLowerCase());
    const pickedAccount = choices.find((a) => a.id === picked) ?? null;

    const choose = (id: string) => { hapticTick(); setPicked(id); setCreating(false); setOpen(false); setQuery(''); };
    /** "+ Add 'Gym'" — a new category with that name, its emoji guessed from the name (changeable). */
    const addTyped = () => { hapticTick(); setNewName(typed); setNewEmoji(getAccountEmoji(typed, type)); setCreating(true); setPicked(null); setOpen(false); setQuery(''); };
    const newBlank = () => { hapticTick(); setNewName(typed); setNewEmoji(typed ? getAccountEmoji(typed, type) : '🛒'); setCreating(true); setPicked(null); setOpen(false); setQuery(''); };

    const chooseBasis = (b: BudgetBasis) => {
        hapticTick();
        setBasis(b);
        // Keep "all at once" if it was chosen, falling on the month being viewed.
        if (b === 'MONTHLY') setDue(null);
        else if (due !== null) {
            const p = periodContaining(b, monthStart);
            setDue(Number(monthStart.slice(5, 7)) - Number(p.start.slice(5, 7)));
        }
    };

    const canDone = (account || picked || (creating && newName.trim())) && value >= 0 && amount.trim() !== '';

    const done = async () => {
        if (!canDone || busy) return;
        setError('');
        let id = account?.id ?? picked;
        if (!account && creating) {
            setBusy(true);
            try {
                id = (await onCreateCategory(newName.trim(), newEmoji, type)).id;
            } catch (e: any) {
                setError(e?.message ?? 'Could not add the category.');
                setBusy(false);
                return;
            }
            setBusy(false);
        }
        if (!id) return;
        onDone(id, { amount: String(value), basis, due: basis === 'MONTHLY' ? null : due });
    };

    const name = account ? extractEmojiAndName(account.name).cleanName : null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={styles.grabber} />
                    <View style={styles.head}>
                        <Text style={styles.title}>{account ? name : 'Add a budget'}</Text>
                        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
                            <X size={18} color={colors.text} />
                        </Pressable>
                    </View>

                    <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 18, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                        {!account && (
                            <View style={{ gap: 10 }}>
                                <Text style={styles.label}>Category</Text>
                                <AnimatedSegmented
                                    value={type}
                                    onChange={(v) => { hapticTick(); setType(v as 'EXPENSE' | 'INCOME'); setPicked(null); setCreating(false); }}
                                    trackStyle={styles.segment}
                                    indicatorStyle={styles.segmentIndicator}
                                    itemStyle={styles.segmentBtn}
                                    items={(['EXPENSE', 'INCOME'] as const).map((t) => ({
                                        value: t,
                                        content: <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>{t === 'EXPENSE' ? 'Expense' : 'Income'}</Text>,
                                    }))}
                                />
                                {/* The category field: tap to drop down every category, type to filter. */}
                                <Pressable
                                    onPress={() => { hapticTick(); setOpen((o) => !o); }}
                                    style={[styles.field, open && styles.fieldOpen]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Choose a category"
                                >
                                    {open ? (
                                        <>
                                            <Search size={16} color={colors.textFaint} />
                                            <TextInput
                                                style={styles.fieldInput}
                                                value={query}
                                                onChangeText={setQuery}
                                                placeholder={pickedAccount ? extractEmojiAndName(pickedAccount.name).cleanName : creating && newName ? newName : 'Search or type a new category'}
                                                placeholderTextColor={colors.textFaint}
                                                autoFocus
                                                returnKeyType="done"
                                                onSubmitEditing={() => { if (list.length === 1) choose(list[0].id); else if (typed && !exact) addTyped(); }}
                                            />
                                        </>
                                    ) : creating ? (
                                        <>
                                            <Text style={{ fontSize: 20 }}>{newEmoji}</Text>
                                            <Text style={styles.fieldValue} numberOfLines={1}>{newName || 'New category'}</Text>
                                            <View style={styles.newTag}><Text style={styles.newTagText}>New</Text></View>
                                        </>
                                    ) : pickedAccount ? (
                                        <>
                                            <AccountGlyph name={pickedAccount.name} type={pickedAccount.type} logoUrl={(pickedAccount as any).logo_url} />
                                            <Text style={styles.fieldValue} numberOfLines={1}>{extractEmojiAndName(pickedAccount.name).cleanName}</Text>
                                        </>
                                    ) : (
                                        <Text style={styles.fieldPlaceholder}>Choose a category</Text>
                                    )}
                                    <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                                </Pressable>

                                {open && (
                                    <View style={styles.dropdown}>
                                        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                            {!!typed && !exact && (
                                                <Pressable onPress={addTyped} style={styles.pickRow}>
                                                    <View style={styles.plusGlyph}><Plus size={16} color={colors.blue} /></View>
                                                    <Text style={[styles.pickName, { color: colors.blue }]} numberOfLines={1}>Add “{typed}”</Text>
                                                </Pressable>
                                            )}
                                            {list.map((a, i) => (
                                                <Pressable key={a.id} onPress={() => choose(a.id)} style={[styles.pickRow, (i > 0 || (!!typed && !exact)) && styles.pickBorder]}>
                                                    <AccountGlyph name={a.name} type={a.type} logoUrl={(a as any).logo_url} />
                                                    <Text style={styles.pickName} numberOfLines={1}>{extractEmojiAndName(a.name).cleanName}</Text>
                                                    {picked === a.id && <Check size={18} color={colors.blue} />}
                                                </Pressable>
                                            ))}
                                            {list.length === 0 && !typed && (
                                                <Text style={styles.empty}>Every {type === 'EXPENSE' ? 'expense' : 'income'} category already has a budget.</Text>
                                            )}
                                        </ScrollView>
                                        {/* Always in reach, however long the list. */}
                                        <Pressable onPress={newBlank} style={styles.stickyNew}>
                                            <Plus size={16} color={colors.blue} />
                                            <Text style={styles.stickyNewText}>New category</Text>
                                        </Pressable>
                                    </View>
                                )}

                                {creating && !open && (
                                    <View style={styles.newBox}>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                            {PRESET_EMOJIS.map((em) => (
                                                <Pressable key={em} onPress={() => setNewEmoji(em)} style={[styles.emoji, newEmoji === em && styles.emojiOn]}>
                                                    <Text style={{ fontSize: 18 }}>{em}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                        <TextInput
                                            style={styles.input}
                                            value={newName}
                                            onChangeText={setNewName}
                                            placeholder={type === 'EXPENSE' ? 'Category name, e.g. School fees' : 'Category name, e.g. Consulting'}
                                            placeholderTextColor={colors.textFaint}
                                            autoFocus={!newName}
                                        />
                                    </View>
                                )}
                            </View>
                        )}

                        <View style={{ gap: 10 }}>
                            <Text style={styles.label}>Repeats</Text>
                            <AnimatedSegmented
                                value={basis}
                                onChange={(v) => chooseBasis(v as BudgetBasis)}
                                trackStyle={styles.segment}
                                indicatorStyle={styles.segmentIndicator}
                                itemStyle={styles.segmentBtn}
                                items={BUDGET_BASES.map((b) => ({
                                    value: b.value,
                                    content: <Text style={[styles.segmentText, basis === b.value && styles.segmentTextActive]}>{b.label}</Text>,
                                }))}
                            />
                        </View>

                        <View style={{ gap: 10 }}>
                            <Text style={styles.label}>Amount {PER[basis]}</Text>
                            <View style={styles.amountBox}>
                                <Text style={styles.amountK}>K</Text>
                                <TextInput
                                    style={styles.amountInput}
                                    value={amount}
                                    onChangeText={(v) => setAmount(clean(v))}
                                    keyboardType="decimal-pad" inputAccessoryViewID={KB_DONE_ID}
                                    placeholder="0"
                                    placeholderTextColor={colors.textFaint}
                                />
                            </View>
                        </View>

                        {basis !== 'MONTHLY' && (
                            <View style={{ gap: 10 }}>
                                <Text style={styles.label}>How is it paid?</Text>
                                <Pressable onPress={() => { hapticTick(); setDue(null); }} style={[styles.option, due === null && styles.optionOn]}>
                                    <View style={[styles.radio, due === null && styles.radioOn]}>{due === null && <View style={styles.radioDot} />}</View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.optionTitle}>Spread across the months</Text>
                                        <Text style={styles.optionSub}>{value > 0 ? `${fmt(Math.round((value / n) * 100) / 100)} counts each month` : `Each month gets an equal share`}</Text>
                                    </View>
                                </Pressable>
                                <Pressable
                                    onPress={() => { hapticTick(); if (due === null) setDue(Number(monthStart.slice(5, 7)) - Number(period.start.slice(5, 7))); }}
                                    style={[styles.option, due !== null && styles.optionOn, { flexDirection: 'column', alignItems: 'stretch' }]}
                                >
                                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                                        <View style={[styles.radio, due !== null && styles.radioOn]}>{due !== null && <View style={styles.radioDot} />}</View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.optionTitle}>All at once</Text>
                                            <Text style={styles.optionSub}>Counts only in the month it's due</Text>
                                        </View>
                                    </View>
                                    {due !== null && (
                                        <View style={styles.months}>
                                            {periodMonths.map((m, i) => (
                                                <Pressable key={m} onPress={() => { hapticTick(); setDue(i); }} style={[styles.month, due === i && styles.monthOn]}>
                                                    <Text style={[styles.monthText, due === i && styles.monthTextOn]}>{m}</Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    )}
                                </Pressable>
                            </View>
                        )}

                        {!!error && <Text style={styles.error}>{error}</Text>}

                        {account && onRemove && (
                            <Pressable onPress={() => onRemove(account.id)} style={styles.remove} hitSlop={6}>
                                <Trash2 size={15} color={colors.danger} />
                                <Text style={styles.removeText}>Remove from budgets</Text>
                            </Pressable>
                        )}
                    </ScrollView>

                    <Pressable onPress={() => { void done(); }} disabled={!canDone || busy} style={[styles.doneBtn, (!canDone || busy) && { opacity: 0.4 }]}>
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.doneText}>{account ? 'Done' : 'Add budget'}</Text>}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 20, paddingTop: 8, gap: 14, maxHeight: '88%',
    },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.text },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, letterSpacing: 0.6, textTransform: 'uppercase' },
    segment: { flexDirection: 'row', padding: 4, backgroundColor: colors.chipActiveBg, borderRadius: radius.pill },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    segmentIndicator: {
        borderRadius: radius.pill, backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    segmentText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    segmentTextActive: { color: colors.text },
    search: {
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, padding: 0 },
    field: {
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8,
        backgroundColor: colors.canvas, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    },
    fieldOpen: { borderColor: colors.blue, backgroundColor: colors.surface },
    fieldInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text, padding: 0 },
    fieldValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    fieldPlaceholder: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textFaint },
    newTag: { backgroundColor: colors.tabActiveBg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    newTagText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.blue },
    dropdown: {
        borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3,
    },
    stickyNew: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
    },
    stickyNewText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
    pickBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    pickName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    plusGlyph: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    empty: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, padding: 14, textAlign: 'center' },
    newBox: { gap: 10 },
    emoji: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
    emojiOn: { backgroundColor: colors.tabActiveBg, borderWidth: 1.5, borderColor: colors.blue },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text, backgroundColor: colors.canvas, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11,
    },
    link: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.blue },
    amountBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.canvas, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
    },
    amountK: { fontFamily: fonts.display, fontSize: 24, color: colors.textFaint },
    amountInput: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.text, padding: 0 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    optionOn: { borderColor: colors.blue, backgroundColor: '#F7FAFF' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: colors.blue },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
    optionTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    optionSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    months: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingLeft: 32 },
    month: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.chipActiveBg },
    monthOn: { backgroundColor: colors.blue },
    monthText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
    monthTextOn: { color: '#FFFFFF' },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
    remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 4 },
    removeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.danger },
    doneBtn: { backgroundColor: colors.blue, borderRadius: radius.pill, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
    doneText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
});
