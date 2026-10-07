import { useState, useMemo, useEffect, useRef } from 'react';
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
    RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, X, Play, RotateCcw, Calendar, MoreVertical, Check, Mail, ChevronRight, ChevronLeft, List,
} from 'lucide-react-native';
import {
    scheduleService, lencoService, SCHEDULE_CATEGORIES, SCHEDULE_CADENCES,
    scheduleCategoryLabel, scheduleCadenceLabel, formatKwacha, formatShortDate,
} from 'core';
import type { ScheduledItem, ScheduleCategory, ScheduleCadence, ScheduledItemRun } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useAuth } from '../src/context/AuthContext';
import { AnimatedSegmented, AnimatedTabContent } from '../src/components/AnimatedTabs';
import { colors, fonts, radius } from '../src/theme/tokens';

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
    BILLS:            { bg: '#FFEDD5', text: '#C2410C' },
    SUBSCRIPTIONS:    { bg: '#F3E8FF', text: '#6B21A8' },
    INVESTMENTS:      { bg: '#D1FAE5', text: '#047857' },
    LOAN_REPAYMENTS:  { bg: '#FFE4E6', text: '#BE123C' },
    GENERAL_EXPENSES: { bg: '#DBEAFE', text: '#1D4ED8' },
};

function detectOperator(phone: string): 'MTN' | 'Airtel' | 'Zamtel' | '' {
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('260') ? digits.slice(3)
        : digits.startsWith('26') ? digits.slice(2)
        : digits;
    const prefix3 = local.slice(0, 3);
    if (['096', '076'].includes(prefix3)) return 'MTN';
    if (['097', '077'].includes(prefix3)) return 'Airtel';
    if (['095', '075'].includes(prefix3)) return 'Zamtel';
    return '';
}

function OperatorBadge({ op }: { op: string }) {
    if (!op) return null;
    let bg = '#E2E8F0';
    let textClr = '#475569';
    if (op === 'MTN') { bg = '#FEF3C7'; textClr = '#B45309'; }
    else if (op === 'Airtel') { bg = '#FEE2E2'; textClr = '#B91C1C'; }
    else if (op === 'Zamtel') { bg = '#D1FAE5'; textClr = '#047857'; }

    return (
        <View style={[styles.opBadge, { backgroundColor: bg }]}>
            <Text style={[styles.opBadgeText, { color: textClr }]}>{op}</Text>
        </View>
    );
}

// ── Calendar View ─────────────────────────────────────────────────────────────

const CalendarView: React.FC<{
    items: ScheduledItem[];
    onSelectItem: (item: ScheduledItem) => void;
}> = ({ items, onSelectItem }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDow = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();

    const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const itemsByDate = useMemo(() => {
        const map: Record<string, ScheduledItem[]> = {};
        items.forEach((item) => {
            const dateKey = item.next_due_date;
            if (!map[dateKey]) map[dateKey] = [];
            map[dateKey].push(item);
        });
        return map;
    }, [items]);

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const todayStr = new Date().toISOString().slice(0, 10);

    return (
        <View style={styles.calContainer}>
            {/* Header: month & navigation arrows */}
            <View style={styles.calHeader}>
                <Pressable onPress={prevMonth} style={styles.calNavBtn} hitSlop={8}>
                    <ChevronLeft size={20} color={colors.text} />
                </Pressable>
                <Text style={styles.calMonthTitle}>{monthLabel}</Text>
                <Pressable onPress={nextMonth} style={styles.calNavBtn} hitSlop={8}>
                    <ChevronRight size={20} color={colors.text} />
                </Pressable>
            </View>

            {/* Weekday headers */}
            <View style={styles.calWeekRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <Text key={d} style={styles.calWeekHeader}>{d}</Text>
                ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.calGrid}>
                {Array.from({ length: startDow }).map((_, i) => (
                    <View key={`empty-${i}`} style={styles.calCellEmpty} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const dayItems = itemsByDate[dateStr] ?? [];
                    const isToday = dateStr === todayStr;

                    return (
                        <View key={dateStr} style={[styles.calCell, isToday && styles.calCellToday]}>
                            <View style={[styles.calDayNumWrap, isToday && styles.calDayNumWrapToday]}>
                                <Text style={[styles.calDayNum, isToday && styles.calDayNumToday]}>{dayNum}</Text>
                            </View>

                            <View style={styles.calItemsWrap}>
                                {dayItems.slice(0, 2).map((item) => {
                                    const catTheme = CATEGORY_COLORS[item.category] || { bg: '#E2E8F0', text: '#334155' };
                                    return (
                                        <Pressable
                                            key={item.id}
                                            style={[styles.calItemPill, { backgroundColor: catTheme.bg }]}
                                            onPress={() => onSelectItem(item)}
                                        >
                                            <Text style={[styles.calItemPillText, { color: catTheme.text }]} numberOfLines={1}>
                                                {item.title}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                                {dayItems.length > 2 && (
                                    <Text style={styles.calMoreText}>+{dayItems.length - 2} more</Text>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

export default function SchedulesScreen() {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { organizationId } = useAuth();
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [category, setCategory] = useState<ScheduleCategory | 'ALL'>('ALL');
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState<ScheduledItem | null>(null);
    const [detailItem, setDetailItem] = useState<ScheduledItem | null>(null);
    const [actionMenuItem, setActionMenuItem] = useState<ScheduledItem | null>(null);

    const { data: allItems = [], isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['schedules', organizationId, category],
        queryFn: () => scheduleService.getAll(category === 'ALL' ? undefined : category, 'ACTIVE'),
        enabled: !!organizationId,
    });

    const { data: counts = {} } = useQuery({
        queryKey: ['schedule-counts', organizationId],
        queryFn: () => scheduleService.getCounts(),
        enabled: !!organizationId,
    });

    const items: ScheduledItem[] = allItems;

    const runNow = useMutation({
        mutationFn: (id: string) => scheduleService.runNow(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            qc.invalidateQueries({ queryKey: ['requisitions'] });
            Alert.alert('Started', 'A payment request has been raised for this schedule.');
        },
        onError: (e: Error) => Alert.alert('Could not run this now', e.message),
    });

    const archiveMutation = useMutation({
        mutationFn: (id: string) => scheduleService.update(id, { status: 'ARCHIVED' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            qc.invalidateQueries({ queryKey: ['schedule-counts'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => scheduleService.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            qc.invalidateQueries({ queryKey: ['schedule-counts'] });
        },
    });

    const categoriesWithAll = useMemo(() => [
        { value: 'ALL' as const, label: 'All' },
        ...SCHEDULE_CATEGORIES,
    ], []);

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Schedules" />

            {/* List View / Calendar View tab toggle */}
            <AnimatedSegmented
                value={viewMode}
                onChange={(v) => setViewMode(v as 'list' | 'calendar')}
                trackStyle={styles.viewModeRow}
                indicatorStyle={styles.viewModeIndicator}
                itemStyle={styles.viewModeBtn}
                items={[
                    {
                        value: 'list',
                        content: (
                            <View style={styles.viewModeBtnContent}>
                                <List size={14} color={viewMode === 'list' ? colors.blue : colors.textFaint} />
                                <Text style={[styles.viewModeText, viewMode === 'list' && styles.viewModeTextActive]}>
                                    List View
                                </Text>
                            </View>
                        ),
                    },
                    {
                        value: 'calendar',
                        content: (
                            <View style={styles.viewModeBtnContent}>
                                <Calendar size={14} color={viewMode === 'calendar' ? colors.blue : colors.textFaint} />
                                <Text style={[styles.viewModeText, viewMode === 'calendar' && styles.viewModeTextActive]}>
                                    Calendar View
                                </Text>
                            </View>
                        ),
                    },
                ]}
            />

            {/* Category horizontal filter pills (outside of main card) */}
            {viewMode === 'list' && (
                <View style={styles.catScrollWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                        {categoriesWithAll.map((c) => {
                            const isActive = category === c.value;
                            const count = c.value === 'ALL'
                                ? (counts as any)?.ALL ?? allItems.length
                                : (counts as any)?.[c.value] ?? 0;
                            return (
                                <Pressable
                                    key={c.value}
                                    onPress={() => setCategory(c.value)}
                                    style={[styles.catChip, isActive && styles.catChipActive]}
                                >
                                    <Text style={[styles.catChipText, isActive && styles.catChipTextActive]}>
                                        {c.label}
                                    </Text>
                                    {count > 0 && (
                                        <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                                            <Text style={[styles.countText, isActive && styles.countTextActive]}>
                                                {count}
                                            </Text>
                                        </View>
                                    )}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            <AnimatedTabContent tabKey={viewMode} index={viewMode === 'calendar' ? 1 : 0} style={{ flex: 1 }}>
                {viewMode === 'calendar' ? (
                    <View style={[styles.mainCardContainer, { marginBottom: insets.bottom + 16 }]}>
                        <ScrollView contentContainerStyle={styles.calScroll}>
                            <CalendarView items={allItems} onSelectItem={(item) => setDetailItem(item)} />
                        </ScrollView>
                    </View>
                ) : (
                    <View style={[styles.mainCardContainer, { marginBottom: insets.bottom + 16 }]}>
                        {isLoading ? (
                            <View style={styles.centre}><ActivityIndicator color={colors.blue} size="large" /></View>
                        ) : items.length === 0 ? (
                            <View style={styles.empty}>
                                <View style={styles.emptyIconWrap}>
                                    <Calendar size={28} color={colors.blue} />
                                </View>
                                <Text style={styles.emptyTitle}>No scheduled items</Text>
                                <Text style={styles.emptyText}>Tap + to add a recurring bill or subscription.</Text>
                            </View>
                        ) : (
                            <ScrollView
                                style={{ flex: 1 }}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
                                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.blue} />}
                            >
                                {items.map((item, idx) => {
                                    const catTheme = CATEGORY_COLORS[item.category] || { bg: '#E2E8F0', text: '#334155' };
                                    const op = (item as any).payment_method === 'MOBILE_MONEY' && (item as any).recipient_account
                                        ? detectOperator((item as any).recipient_account)
                                        : '';
                                    const isLast = idx === items.length - 1;

                                    return (
                                        <Pressable
                                            key={item.id}
                                            style={[styles.rowItem, !isLast && styles.rowItemBorder]}
                                            onPress={() => setDetailItem(item)}
                                        >
                                            <View style={styles.cardHeader}>
                                                <View style={[styles.categoryBadge, { backgroundColor: catTheme.bg }]}>
                                                    <Text style={[styles.categoryBadgeText, { color: catTheme.text }]}>
                                                        {scheduleCategoryLabel(item.category)}
                                                    </Text>
                                                </View>

                                                <View style={styles.cardHeaderRight}>
                                                    <Text style={styles.amount}>{formatKwacha(item.amount)}</Text>
                                                    <Pressable
                                                        onPress={() => setActionMenuItem(item)}
                                                        hitSlop={8}
                                                        style={styles.moreBtn}
                                                    >
                                                        <MoreVertical size={16} color={colors.textFaint} />
                                                    </Pressable>
                                                </View>
                                            </View>

                                            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>

                                            <View style={styles.metaRow}>
                                                <View style={styles.metaItem}>
                                                    <RotateCcw size={11} color={colors.textFaint} />
                                                    <Text style={styles.metaText}>{scheduleCadenceLabel(item.cadence)}</Text>
                                                </View>
                                                <Text style={styles.metaDot}>•</Text>
                                                <View style={styles.metaItem}>
                                                    <Calendar size={11} color={colors.textFaint} />
                                                    <Text style={styles.metaText}>Due {formatShortDate(item.next_due_date)}</Text>
                                                </View>
                                            </View>

                                            {(item as any).recipient_name ? (
                                                <View style={styles.recipientRow}>
                                                    {op !== '' && <OperatorBadge op={op} />}
                                                    <Text style={styles.recipientText} numberOfLines={1}>
                                                        {(item as any).recipient_name}
                                                        {(item as any).recipient_account ? ` • ${(item as any).recipient_account}` : ''}
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {/* Footer: Run Now button on LEFT side */}
                                            <View style={styles.cardFooter}>
                                                <Pressable
                                                    style={styles.runBtn}
                                                    onPress={() => Alert.alert('Run payment now?', `Raise a payment request for "${item.title}" now.`, [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        { text: 'Run now', onPress: () => runNow.mutate(item.id) },
                                                    ])}
                                                >
                                                    <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                                                    <Text style={styles.runBtnText}>Run Now</Text>
                                                </Pressable>

                                                {(item as any).pop_enabled && (item as any).pop_email ? (
                                                    <View style={styles.popIndicator}>
                                                        <Mail size={11} color={colors.blue} />
                                                        <Text style={styles.popText} numberOfLines={1}>Proof of Payment active</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                )}
            </AnimatedTabContent>

            {/* Floating Action Button */}
            <Pressable
                style={[styles.fab, { bottom: insets.bottom + 20 }]}
                onPress={() => { setEditItem(null); setAddOpen(true); }}
                accessibilityLabel="Add to Schedule"
            >
                <Plus size={26} color="#FFFFFF" />
            </Pressable>

            {/* Modal Form: Create / Edit Schedule */}
            <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)} statusBarTranslucent>
                <ScheduleFormModal
                    initial={editItem}
                    onClose={() => { setAddOpen(false); setEditItem(null); }}
                />
            </Modal>

            {/* Modal Detail View */}
            {detailItem && (
                <Modal visible={!!detailItem} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailItem(null)} statusBarTranslucent>
                    <ScheduleDetailModal
                        item={detailItem}
                        onClose={() => setDetailItem(null)}
                        onEdit={() => { setEditItem(detailItem); setDetailItem(null); setAddOpen(true); }}
                        onRunNow={() => runNow.mutate(detailItem.id)}
                        running={runNow.isPending}
                    />
                </Modal>
            )}

            {/* Context Action Menu Modal */}
            {actionMenuItem && (
                <Modal visible={!!actionMenuItem} transparent animationType="fade" onRequestClose={() => setActionMenuItem(null)} statusBarTranslucent>
                    <Pressable style={styles.menuOverlay} onPress={() => setActionMenuItem(null)}>
                        <View style={styles.menuBox}>
                            <Text style={styles.menuTitle}>{actionMenuItem.title}</Text>
                            <Pressable
                                style={styles.menuOption}
                                onPress={() => {
                                    const target = actionMenuItem;
                                    setActionMenuItem(null);
                                    setEditItem(target);
                                    setAddOpen(true);
                                }}
                            >
                                <Text style={styles.menuOptionText}>Edit Schedule</Text>
                            </Pressable>
                            <Pressable
                                style={styles.menuOption}
                                onPress={() => {
                                    const target = actionMenuItem;
                                    setActionMenuItem(null);
                                    archiveMutation.mutate(target.id);
                                }}
                            >
                                <Text style={styles.menuOptionText}>Archive</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.menuOption, styles.menuOptionDestructive]}
                                onPress={() => {
                                    const target = actionMenuItem;
                                    setActionMenuItem(null);
                                    Alert.alert('Delete Schedule?', `Are you sure you want to delete "${target.title}"?`, [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(target.id) },
                                    ]);
                                }}
                            >
                                <Text style={[styles.menuOptionText, styles.destructiveText]}>Delete</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Modal>
            )}
        </View>
    );
}

// ── Schedule Form Modal (Add / Edit) ──────────────────────────────────────────

const ScheduleFormModal: React.FC<{ initial?: ScheduledItem | null; onClose: () => void }> = ({ initial, onClose }) => {
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();

    const [title, setTitle] = useState(initial?.title ?? '');
    const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
    const [category, setCategory] = useState<ScheduleCategory>(initial?.category ?? 'BILLS');
    const [cadence, setCadence] = useState<ScheduleCadence>(initial?.cadence ?? 'MONTHLY');
    const [nextDue, setNextDue] = useState(initial?.next_due_date ?? new Date().toISOString().slice(0, 10));
    const [description, setDescription] = useState(initial?.description ?? '');

    // Payment recipient
    const [paymentMethod, setPaymentMethod] = useState<'MOBILE_MONEY' | 'BANK_TRANSFER'>((initial as any)?.payment_method ?? 'MOBILE_MONEY');
    const [recipientAccount, setRecipientAccount] = useState((initial as any)?.recipient_account ?? '');
    const [recipientName, setRecipientName] = useState((initial as any)?.recipient_name ?? '');
    const [verifyStatus, setVerifyStatus] = useState<'idle' | 'pending' | 'verified' | 'failed'>((initial as any)?.recipient_name ? 'verified' : 'idle');

    // Proof of payment
    const [popEnabled, setPopEnabled] = useState<boolean>((initial as any)?.pop_enabled ?? false);
    const [popEmail, setPopEmail] = useState<string>((initial as any)?.pop_email ?? '');

    const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const detectedOp = paymentMethod === 'MOBILE_MONEY' ? detectOperator(recipientAccount) : '';

    useEffect(() => {
        if (paymentMethod !== 'MOBILE_MONEY') return;
        if (!detectedOp || recipientAccount.length < 9) return;
        if (verifyTimer.current) clearTimeout(verifyTimer.current);

        verifyTimer.current = setTimeout(async () => {
            setVerifyStatus('pending');
            try {
                const res = await lencoService.resolveMobileMoney(recipientAccount, detectedOp.toUpperCase(), '');
                const name = res.accountName || res.account_name || res.name || '';
                setRecipientName(name);
                setVerifyStatus('verified');
            } catch {
                setVerifyStatus('failed');
            }
        }, 600);

        return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current); };
    }, [recipientAccount, detectedOp, paymentMethod]);

    const numericAmount = Number(amount) || 0;
    const valid = title.trim().length > 0 && numericAmount > 0 && (!popEnabled || popEmail.trim().length > 0);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                title: title.trim(),
                amount: numericAmount,
                category,
                cadence,
                next_due_date: nextDue,
                description: description || undefined,
                ...(recipientName ? {
                    payment_method: paymentMethod,
                    recipient_account: recipientAccount,
                    recipient_name: recipientName,
                } : {}),
                pop_enabled: popEnabled,
                pop_method: popEnabled ? 'EMAIL' : null,
                pop_email: popEnabled ? popEmail.trim() : null,
            };

            if (initial) {
                return scheduleService.update(initial.id, payload as any);
            }
            return scheduleService.create(payload as any);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            qc.invalidateQueries({ queryKey: ['schedule-counts'] });
            onClose();
        },
        onError: (e: Error) => Alert.alert('Could not save schedule', e.message),
    });

    return (
        <KeyboardAvoidingView style={styles.modalRoot} behavior="padding">
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{initial ? 'Edit Schedule' : 'Add to Schedule'}</Text>
                <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.textMuted} /></Pressable>
            </View>

            <ScrollView contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 30 }]}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Director's Monthly Rental"
                    placeholderTextColor={colors.textFaint}
                />

                <Text style={[styles.label, styles.spaced]}>Amount (K)</Text>
                <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textFaint}
                />

                <Text style={[styles.label, styles.spaced]}>Category</Text>
                <View style={styles.chips}>
                    {SCHEDULE_CATEGORIES.map((c) => {
                        const catTheme = CATEGORY_COLORS[c.value];
                        const isActive = category === c.value;
                        return (
                            <Pressable
                                key={c.value}
                                onPress={() => setCategory(c.value)}
                                style={[
                                    styles.chip,
                                    isActive && { backgroundColor: catTheme.bg, borderColor: catTheme.text },
                                ]}
                            >
                                <Text style={[styles.chipText, isActive && { color: catTheme.text, fontFamily: fonts.bodyBold }]}>
                                    {c.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Text style={[styles.label, styles.spaced]}>Frequency</Text>
                <View style={styles.chips}>
                    {SCHEDULE_CADENCES.map((c) => (
                        <Pressable key={c.value} onPress={() => setCadence(c.value)} style={[styles.chip, cadence === c.value && styles.chipActive]}>
                            <Text style={[styles.chipText, cadence === c.value && styles.chipTextActive]}>{c.label}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, styles.spaced]}>Next due date (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={nextDue} onChangeText={setNextDue} placeholder="2026-09-01" placeholderTextColor={colors.textFaint} />

                <Text style={[styles.label, styles.spaced]}>Notes (optional)</Text>
                <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline numberOfLines={2} placeholder="Any additional details..." placeholderTextColor={colors.textFaint} />

                {/* Payment Recipient Section */}
                <View style={styles.sectionDivider}>
                    <Text style={styles.sectionHeader}>PAYMENT RECIPIENT</Text>
                    <View style={styles.methodToggleRow}>
                        <Pressable
                            style={[styles.methodToggleBtn, paymentMethod === 'MOBILE_MONEY' && styles.methodToggleBtnActive]}
                            onPress={() => { setPaymentMethod('MOBILE_MONEY'); setVerifyStatus('idle'); }}
                        >
                            <Text style={[styles.methodToggleText, paymentMethod === 'MOBILE_MONEY' && styles.methodToggleTextActive]}>Mobile Money</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.methodToggleBtn, paymentMethod === 'BANK_TRANSFER' && styles.methodToggleBtnActive]}
                            onPress={() => { setPaymentMethod('BANK_TRANSFER'); setVerifyStatus('idle'); }}
                        >
                            <Text style={[styles.methodToggleText, paymentMethod === 'BANK_TRANSFER' && styles.methodToggleTextActive]}>Bank Transfer</Text>
                        </Pressable>
                    </View>

                    {paymentMethod === 'MOBILE_MONEY' ? (
                        <View style={{ marginTop: 10 }}>
                            <Text style={styles.label}>Phone Number</Text>
                            <View style={styles.inputWithAddon}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    value={recipientAccount}
                                    onChangeText={setRecipientAccount}
                                    keyboardType="phone-pad"
                                    placeholder="0971234567"
                                    placeholderTextColor={colors.textFaint}
                                />
                                {detectedOp !== '' && <OperatorBadge op={detectedOp} />}
                            </View>
                        </View>
                    ) : (
                        <View style={{ marginTop: 10, gap: 10 }}>
                            <Text style={styles.label}>Account Number</Text>
                            <TextInput
                                style={styles.input}
                                value={recipientAccount}
                                onChangeText={setRecipientAccount}
                                keyboardType="number-pad"
                                placeholder="1234567890"
                                placeholderTextColor={colors.textFaint}
                            />
                        </View>
                    )}

                    <View style={{ marginTop: 10 }}>
                        <Text style={styles.label}>Account Holder Name</Text>
                        <TextInput
                            style={styles.input}
                            value={recipientName}
                            onChangeText={setRecipientName}
                            placeholder="Full Name"
                            placeholderTextColor={colors.textFaint}
                        />
                        {verifyStatus === 'pending' && (
                            <Text style={styles.verifyingText}>Verifying recipient details...</Text>
                        )}
                        {verifyStatus === 'verified' && (
                            <View style={styles.verifiedBox}>
                                <Check size={14} color="#047857" />
                                <Text style={styles.verifiedText}>Account verified</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Proof of Payment Section */}
                <View style={styles.sectionDivider}>
                    <View style={styles.switchRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.sectionHeader}>PROOF OF PAYMENT</Text>
                            <Text style={styles.switchSubtext}>Email proof of transfer each time this schedule runs.</Text>
                        </View>
                        <Pressable
                            style={[styles.switchTrack, popEnabled && styles.switchTrackActive]}
                            onPress={() => setPopEnabled(!popEnabled)}
                        >
                            <View style={[styles.switchThumb, popEnabled && styles.switchThumbActive]} />
                        </Pressable>
                    </View>

                    {popEnabled && (
                        <View style={{ marginTop: 12 }}>
                            <Text style={styles.label}>Recipient Email</Text>
                            <TextInput
                                style={styles.input}
                                value={popEmail}
                                onChangeText={setPopEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                placeholder="supplier@example.com"
                                placeholderTextColor={colors.textFaint}
                            />
                        </View>
                    )}
                </View>

                <Pressable
                    style={[styles.saveBtn, !valid && styles.saveBtnDisabled]}
                    onPress={() => saveMutation.mutate()}
                    disabled={!valid || saveMutation.isPending}
                >
                    {saveMutation.isPending ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.saveBtnText}>{initial ? 'Save Changes' : 'Add to Schedule'}</Text>
                    )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

// ── Schedule Detail Modal ─────────────────────────────────────────────────────

const ScheduleDetailModal: React.FC<{
    item: ScheduledItem;
    onClose: () => void;
    onEdit: () => void;
    onRunNow: () => void;
    running: boolean;
}> = ({ item, onClose, onEdit, onRunNow, running }) => {
    const insets = useSafeAreaInsets();
    const { data: runs = [], isLoading } = useQuery<ScheduledItemRun[]>({
        queryKey: ['schedule-runs', item.id],
        queryFn: () => scheduleService.getRuns(item.id),
    });

    const upcoming = runs.find((r) => r.status === 'UPCOMING');
    const history = runs.filter((r) => r.status !== 'UPCOMING');
    const catTheme = CATEGORY_COLORS[item.category] || { bg: '#E2E8F0', text: '#334155' };

    return (
        <View style={styles.modalRoot}>
            <View style={styles.modalHeader}>
                <View style={[styles.categoryBadge, { backgroundColor: catTheme.bg }]}>
                    <Text style={[styles.categoryBadgeText, { color: catTheme.text }]}>
                        {scheduleCategoryLabel(item.category)}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable onPress={onEdit} hitSlop={8}><Text style={styles.editBtnText}>Edit</Text></Pressable>
                    <Pressable onPress={onClose} hitSlop={8}><X size={22} color={colors.textMuted} /></Pressable>
                </View>
            </View>

            <ScrollView contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 30 }]}>
                <Text style={styles.detailTitle}>{item.title}</Text>
                <Text style={styles.detailAmount}>{formatKwacha(item.amount)}</Text>

                <View style={styles.detailMetaBox}>
                    <View style={styles.detailMetaRow}>
                        <RotateCcw size={14} color={colors.textMuted} />
                        <Text style={styles.detailMetaLabel}>Cadence:</Text>
                        <Text style={styles.detailMetaValue}>{scheduleCadenceLabel(item.cadence)}</Text>
                    </View>
                    <View style={styles.detailMetaRow}>
                        <Calendar size={14} color={colors.textMuted} />
                        <Text style={styles.detailMetaLabel}>Next Due:</Text>
                        <Text style={styles.detailMetaValue}>{formatShortDate(item.next_due_date)}</Text>
                    </View>
                </View>

                {(item as any).recipient_name && (
                    <View style={styles.recipientCard}>
                        <Text style={styles.sectionHeader}>PAYMENT RECIPIENT</Text>
                        <Text style={styles.recipientName}>{(item as any).recipient_name}</Text>
                        {(item as any).recipient_account && (
                            <Text style={styles.recipientMeta}>
                                {(item as any).payment_method === 'MOBILE_MONEY' ? 'Mobile Money: ' : 'Account: '}
                                {(item as any).recipient_account}
                            </Text>
                        )}
                    </View>
                )}

                {(item as any).pop_enabled && (item as any).pop_email && (
                    <View style={styles.popCard}>
                        <Mail size={14} color={colors.blue} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.popCardTitle}>Proof of Payment active</Text>
                            <Text style={styles.popCardSub}>Receipts auto-sent to {(item as any).pop_email}</Text>
                        </View>
                    </View>
                )}

                <View style={styles.runSection}>
                    <Text style={styles.sectionHeader}>RUN HISTORY</Text>
                    {upcoming && (
                        <View style={styles.upcomingBox}>
                            <View style={styles.upcomingHeader}>
                                <Text style={styles.upcomingLabel}>Next Scheduled Run</Text>
                                <Text style={styles.upcomingDate}>{formatShortDate(upcoming.due_date)}</Text>
                            </View>
                            <Pressable
                                style={styles.runNowBigBtn}
                                onPress={onRunNow}
                                disabled={running}
                            >
                                {running ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <>
                                        <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                                        <Text style={styles.runNowBigText}>Run Payment Now</Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    )}

                    {isLoading ? (
                        <ActivityIndicator color={colors.blue} style={{ marginTop: 16 }} />
                    ) : history.length === 0 ? (
                        <Text style={styles.noHistoryText}>No past runs recorded yet.</Text>
                    ) : (
                        history.map((run) => (
                            <View key={run.id} style={styles.historyRow}>
                                <View>
                                    <Text style={styles.historyDate}>{formatShortDate(run.due_date)}</Text>
                                    <Text style={styles.historyStatus}>{run.status}</Text>
                                </View>
                                <ChevronRight size={16} color={colors.textFaint} />
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    viewModeRow: {
        flexDirection: 'row', marginHorizontal: 16, marginBottom: 10,
        padding: 3, backgroundColor: colors.chipActiveBg, borderRadius: radius.pill,
    },
    viewModeBtn: {
        flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    },
    viewModeBtnContent: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    viewModeIndicator: {
        borderRadius: radius.pill, backgroundColor: colors.surface,
        shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    viewModeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted },
    viewModeTextActive: { color: colors.text },
    mainCardContainer: {
        flex: 1, marginHorizontal: 16, backgroundColor: colors.surface,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        shadowColor: '#000000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        elevation: 1, overflow: 'hidden',
    },
    catScrollWrap: {
        height: 48, backgroundColor: colors.canvas, marginBottom: 8,
    },
    catRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    catChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    catChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    catChipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    catChipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
    countBadge: {
        backgroundColor: colors.chipActiveBg, paddingHorizontal: 6, paddingVertical: 1,
        borderRadius: radius.pill, minWidth: 18, alignItems: 'center',
    },
    countBadgeActive: { backgroundColor: 'rgba(255, 255, 255, 0.25)' },
    countText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted },
    countTextActive: { color: '#FFFFFF' },
    centre: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16 },
    mainCard: {
        backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16,
        borderWidth: 1, borderColor: colors.border,
        shadowColor: '#000000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    rowItem: { paddingVertical: 14, gap: 8 },
    rowItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
    categoryBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    moreBtn: { padding: 4 },
    title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    metaDot: { fontSize: 12, color: colors.textFaint },
    recipientRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.canvasAlt, paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: radius.md, marginTop: 2,
    },
    recipientText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, flex: 1 },
    opBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
    opBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    popIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    popText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.blue },
    runBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.blue, paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: radius.md,
    },
    runBtnText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
    empty: { paddingVertical: 60, alignItems: 'center', gap: 8 },
    emptyIconWrap: {
        width: 52, height: 52, borderRadius: 26, backgroundColor: colors.tabActiveBg,
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },
    fab: {
        position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
        backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.blue, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    modalRoot: { flex: 1, backgroundColor: colors.canvas },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    modalTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
    editBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    modalScroll: { padding: 20, gap: 4 },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: 6 },
    spaced: { marginTop: 14 },
    input: {
        fontFamily: fonts.body, fontSize: 14, color: colors.text,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface,
    },
    inputWithAddon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    textArea: { height: 60, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    chipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
    sectionDivider: {
        marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    },
    sectionHeader: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.8 },
    methodToggleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    methodToggleBtn: {
        flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1,
        borderColor: colors.borderStrong, alignItems: 'center', backgroundColor: colors.surface,
    },
    methodToggleBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    methodToggleText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
    methodToggleTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
    verifyingText: { fontFamily: fonts.body, fontSize: 11, color: colors.blue, marginTop: 4 },
    verifiedBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    verifiedText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: '#047857' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchSubtext: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    switchTrack: {
        width: 44, height: 26, borderRadius: 13, backgroundColor: colors.borderStrong, padding: 2,
    },
    switchTrackActive: { backgroundColor: colors.blue },
    switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
    switchThumbActive: { transform: [{ translateX: 18 }] },
    saveBtn: {
        backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 14,
        alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 24,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF' },
    detailTitle: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.text, marginTop: 8 },
    detailAmount: { fontFamily: fonts.bodyBold, fontSize: 28, color: colors.navy, marginTop: 2 },
    detailMetaBox: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginTop: 14, gap: 8,
    },
    detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailMetaLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    detailMetaValue: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    recipientCard: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginTop: 12, gap: 4,
    },
    recipientName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginTop: 2 },
    recipientMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    popCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.tabActiveBg, borderRadius: radius.md, padding: 12, marginTop: 12,
    },
    popCardTitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.blue },
    popCardSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
    runSection: { marginTop: 18, gap: 10 },
    upcomingBox: {
        backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
        borderWidth: 1, borderColor: colors.blue, gap: 10,
    },
    upcomingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    upcomingLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.textMuted },
    upcomingDate: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    runNowBigBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: colors.blue, paddingVertical: 10, borderRadius: radius.md,
    },
    runNowBigText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    noHistoryText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, fontStyle: 'italic', marginTop: 4 },
    historyRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    historyDate: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    historyStatus: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    menuOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    menuBox: {
        width: '100%', maxWidth: 280, backgroundColor: colors.surface, borderRadius: radius.lg,
        padding: 16, gap: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5,
    },
    menuTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, marginBottom: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    menuOption: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md },
    menuOptionDestructive: { backgroundColor: '#FEE2E2' },
    menuOptionText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    destructiveText: { color: colors.danger, fontFamily: fonts.bodyBold },

    // Calendar view styles
    calScroll: { padding: 16 },
    calContainer: {
        backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
        borderWidth: 1, borderColor: colors.border, gap: 12,
    },
    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
    calNavBtn: { padding: 6, borderRadius: radius.md },
    calMonthTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 8 },
    calWeekHeader: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, width: 36, textAlign: 'center' },
    calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calCellEmpty: { width: '14.28%', minHeight: 64, padding: 2 },
    calCell: {
        width: '14.28%', minHeight: 64, padding: 2, borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface,
    },
    calCellToday: { backgroundColor: colors.tabActiveBg, borderColor: colors.blue },
    calDayNumWrap: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    calDayNumWrapToday: { backgroundColor: colors.blue },
    calDayNum: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textMuted },
    calDayNumToday: { color: '#FFFFFF' },
    calItemsWrap: { gap: 2 },
    calItemPill: { paddingHorizontal: 3, paddingVertical: 2, borderRadius: 4 },
    calItemPillText: { fontFamily: fonts.bodyBold, fontSize: 9 },
    calMoreText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textFaint, paddingLeft: 2 },
});
