import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, Modal, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireCapability, DOC_LIMITS, toIsoDate, splitIsoDate } from 'core';
import type { PickedFile } from 'core';
import {
    ChevronDown, Check, Search, X, Camera, Image as ImageIcon, FileText, UploadCloud, CheckCircle2, RefreshCw,
} from 'lucide-react-native';
import { captureImage } from '../../../platform/files';
import { uploadToBucket } from '../../../lib/uploads';
import { colors, fonts, radius } from '../../../theme/tokens';

/* ── Select ───────────────────────────────────────────────────────────────── */

export interface SelectOption { value: string; label: string }

/** A field that opens a searchable bottom sheet — the phone version of a <select>. */
export const SelectField: React.FC<{
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    error?: string;
    optional?: boolean;
    searchable?: boolean;
}> = ({ label, value, options, onChange, placeholder = 'Select…', error, optional, searchable }) => {
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const selected = options.find((o) => o.value === value);
    const showSearch = searchable ?? options.length > 8;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    }, [options, query]);

    const close = () => { setOpen(false); setQuery(''); };

    return (
        <View style={styles.field}>
            <View style={styles.labelRow}>
                <Text style={styles.label}>{label}</Text>
                {optional && <Text style={styles.optional}>Optional</Text>}
            </View>
            <Pressable
                onPress={() => setOpen(true)}
                style={[styles.input, styles.selectInput, !!error && styles.inputError]}
                accessibilityRole="button"
                accessibilityLabel={`${label}${selected ? `, ${selected.label}` : ''}`}
            >
                <Text style={[styles.selectText, !selected && { color: colors.textFaint }]} numberOfLines={1}>
                    {selected?.label || placeholder}
                </Text>
                <ChevronDown size={18} color={colors.textFaint} />
            </Pressable>
            {!!error && <Text style={styles.error}>{error}</Text>}

            <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
                <Pressable style={styles.backdrop} onPress={close} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
                    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <View style={styles.handle} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>{label}</Text>
                            <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                        </View>
                        {showSearch && (
                            <View style={styles.searchWrap}>
                                <Search size={16} color={colors.textFaint} />
                                <TextInput
                                    style={styles.searchInput}
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder="Search"
                                    placeholderTextColor={colors.textFaint}
                                    autoCorrect={false}
                                />
                            </View>
                        )}
                        <FlatList
                            data={filtered}
                            keyExtractor={(o) => o.value}
                            keyboardShouldPersistTaps="handled"
                            style={{ maxHeight: 420 }}
                            ListEmptyComponent={<Text style={styles.empty}>No matches</Text>}
                            renderItem={({ item }) => {
                                const active = item.value === value;
                                return (
                                    <Pressable
                                        onPress={() => { onChange(item.value); close(); }}
                                        style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.chipActiveBg }]}
                                    >
                                        <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.label}</Text>
                                        {active && <Check size={18} color={colors.blue} />}
                                    </Pressable>
                                );
                            }}
                        />
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

/* ── Date (DD / MM / YYYY) ────────────────────────────────────────────────── */

/**
 * Three numeric boxes instead of a calendar: a date of birth is typed, not browsed to,
 * and scrolling a picker back 40 years is the slow way to do it. Emits an ISO date, or ''
 * while the boxes don't form a real date.
 */
export const DateField: React.FC<{
    label: string;
    value: string; // YYYY-MM-DD or ''
    onChange: (iso: string) => void;
    error?: string;
}> = ({ label, value, onChange, error }) => {
    const initial = splitIsoDate(value);
    const [day, setDay] = useState(initial.day);
    const [month, setMonth] = useState(initial.month);
    const [year, setYear] = useState(initial.year);
    const monthRef = useRef<TextInput>(null);
    const yearRef = useRef<TextInput>(null);

    // Re-sync when the value changes from outside (e.g. a prefill) and isn't what we already hold.
    useEffect(() => {
        if (value && value !== toIsoDate(day, month, year)) {
            const s = splitIsoDate(value);
            setDay(s.day); setMonth(s.month); setYear(s.year);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const emit = (d: string, m: string, y: string) => onChange(toIsoDate(d, m, y));
    const digits = (t: string) => t.replace(/[^0-9]/g, '');

    return (
        <View style={styles.field}>
            <Text style={[styles.label, { marginBottom: 6 }]}>{label}</Text>
            <View style={styles.dateRow}>
                <TextInput
                    value={day}
                    onChangeText={(t) => { const v = digits(t).slice(0, 2); setDay(v); emit(v, month, year); if (v.length === 2) monthRef.current?.focus(); }}
                    placeholder="DD" placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={2}
                    style={[styles.input, styles.dateBox, !!error && styles.inputError]} accessibilityLabel={`${label} day`}
                />
                <Text style={styles.dateSep}>/</Text>
                <TextInput
                    ref={monthRef}
                    value={month}
                    onChangeText={(t) => { const v = digits(t).slice(0, 2); setMonth(v); emit(day, v, year); if (v.length === 2) yearRef.current?.focus(); }}
                    placeholder="MM" placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={2}
                    style={[styles.input, styles.dateBox, !!error && styles.inputError]} accessibilityLabel={`${label} month`}
                />
                <Text style={styles.dateSep}>/</Text>
                <TextInput
                    ref={yearRef}
                    value={year}
                    onChangeText={(t) => { const v = digits(t).slice(0, 4); setYear(v); emit(day, month, v); }}
                    placeholder="YYYY" placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={4}
                    style={[styles.input, styles.dateBox, styles.dateYear, !!error && styles.inputError]} accessibilityLabel={`${label} year`}
                />
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
    );
};

/* ── Document upload ──────────────────────────────────────────────────────── */

export interface UploadedDoc { path: string; name: string }

const extOf = (name: string) => (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';

/**
 * One upload slot. Photos can come from the camera or the library; documents may also be
 * PDFs. Images are compressed on the phone, PDFs are checked against the size limit, and
 * the file goes straight to the private bucket under the investor's own folder.
 */
export const DocumentField: React.FC<{
    label: string;
    hint?: string;
    /** `photo` = camera/library only; `any` also allows PDFs. */
    kind?: 'photo' | 'any';
    userId: string;
    folder: string;
    slot: string;
    value?: UploadedDoc;
    onChange: (doc: UploadedDoc | undefined) => void;
    error?: string;
    optional?: boolean;
}> = ({ label, hint, kind = 'any', userId, folder, slot, value, onChange, error, optional }) => {
    const insets = useSafeAreaInsets();
    const [sheet, setSheet] = useState(false);
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const handle = async (getFile: () => Promise<PickedFile | null | undefined>) => {
        setSheet(false);
        setLocalError(null);
        try {
            const picked = await getFile();
            if (!picked) return;
            setBusy(true);

            let file = picked;
            const isImage = picked.mimeType.startsWith('image/');
            const isPdf = picked.mimeType === 'application/pdf' || /\.pdf$/i.test(picked.name);
            if (!isImage && !isPdf) throw new Error('Choose a PDF or an image (JPG, PNG or WebP).');

            if (isImage) {
                file = await requireCapability('files').compressImage(picked, DOC_LIMITS.imageBytesAfterCompression);
                if (file.size != null && file.size > DOC_LIMITS.imageBytesAfterCompression) {
                    throw new Error('That image is too large even after compression. Try a smaller one.');
                }
            } else if (picked.size != null && picked.size > DOC_LIMITS.pdfBytes) {
                throw new Error('PDFs must be 10MB or smaller.');
            }

            const ext = isPdf ? 'pdf' : extOf(file.name);
            const path = `${userId}/${folder}/${slot}_${Date.now()}.${ext}`;
            await uploadToBucket('investor-kyc', path, { ...file, mimeType: isPdf ? 'application/pdf' : file.mimeType });
            onChange({ path, name: picked.name || `${slot}.${ext}` });
        } catch (e: any) {
            setLocalError(e?.message || 'The upload failed. Check your connection and try again.');
        } finally {
            setBusy(false);
        }
    };

    const shownError = localError || error;

    return (
        <View style={styles.field}>
            <View style={styles.labelRow}>
                <Text style={styles.label}>{label}</Text>
                {optional && <Text style={styles.optional}>Optional</Text>}
            </View>
            {!!hint && <Text style={styles.hint}>{hint}</Text>}

            {value ? (
                <View style={styles.docDone}>
                    <CheckCircle2 size={20} color={colors.positiveInk} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.docName} numberOfLines={1}>{value.name}</Text>
                        <Text style={styles.docMeta}>Uploaded</Text>
                    </View>
                    <Pressable onPress={() => setSheet(true)} hitSlop={8} style={styles.docAction} accessibilityLabel={`Replace ${label}`}>
                        <RefreshCw size={16} color={colors.blue} />
                    </Pressable>
                    <Pressable onPress={() => onChange(undefined)} hitSlop={8} style={styles.docAction} accessibilityLabel={`Remove ${label}`}>
                        <X size={16} color={colors.textMuted} />
                    </Pressable>
                </View>
            ) : (
                <Pressable
                    onPress={() => setSheet(true)}
                    disabled={busy}
                    style={({ pressed }) => [styles.docEmpty, !!shownError && styles.docEmptyError, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Upload ${label}`}
                >
                    {busy ? <ActivityIndicator color={colors.blue} /> : <UploadCloud size={22} color={colors.blue} />}
                    <Text style={styles.docEmptyText}>{busy ? 'Uploading…' : 'Tap to upload'}</Text>
                </Pressable>
            )}
            {busy && value && <Text style={styles.docMeta}>Uploading…</Text>}
            {!!shownError && <Text style={styles.error}>{shownError}</Text>}

            <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
                <Pressable style={styles.backdrop} onPress={() => setSheet(false)} />
                <View style={styles.sheetWrap} pointerEvents="box-none">
                    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                        <View style={styles.handle} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle} numberOfLines={1}>{label}</Text>
                            <Pressable onPress={() => setSheet(false)} style={styles.closeBtn} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                        </View>
                        <View style={{ padding: 16, gap: 8 }}>
                            <SourceRow icon={Camera} title="Take a photo" onPress={() => handle(() => captureImage())} />
                            <SourceRow icon={ImageIcon} title="Choose from photos" onPress={() => handle(async () => (await requireCapability('files').pick({ kind: 'image' }))[0])} />
                            {kind === 'any' && (
                                <SourceRow
                                    icon={FileText}
                                    title="Choose a PDF"
                                    onPress={() => handle(async () => (await requireCapability('files').pick({ kind: 'document', accept: ['application/pdf'] }))[0])}
                                />
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const SourceRow: React.FC<{ icon: any; title: string; onPress: () => void }> = ({ icon: Icon, title, onPress }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.6 }]}>
        <View style={styles.sourceIcon}><Icon size={20} color={colors.navy} /></View>
        <Text style={styles.sourceText}>{title}</Text>
    </Pressable>
);

/* ── Section heading used inside steps ────────────────────────────────────── */

export const SectionIntro: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <View style={{ marginBottom: 20 }}>
        <Text style={styles.introTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.introSub}>{subtitle}</Text>}
    </View>
);

const styles = StyleSheet.create({
    field: { marginBottom: 16, width: '100%' },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    optional: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 8, marginTop: -2 },
    input: {
        minHeight: 48, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
        paddingHorizontal: 16, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text,
    },
    inputError: { borderColor: colors.danger },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 4 },
    selectInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    selectText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
    handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10 },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt,
    },
    sheetTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 12, marginBottom: 4,
        backgroundColor: colors.chipActiveBg, borderRadius: radius.pill, paddingHorizontal: 14, height: 44,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 15 },
    optionText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text },
    optionTextActive: { fontFamily: fonts.bodyBold, color: colors.blue },
    empty: { textAlign: 'center', padding: 28, fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },

    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateBox: { width: 64, textAlign: 'center', paddingHorizontal: 8 },
    dateYear: { width: 88 },
    dateSep: { fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.textFaint },

    docEmpty: {
        minHeight: 84, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong,
        backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16,
    },
    docEmptyError: { borderColor: colors.danger },
    docEmptyText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.blue },
    docDone: {
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md,
        backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    },
    docName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    docMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    docAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },

    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    sourceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.chipActiveBg, alignItems: 'center', justifyContent: 'center' },
    sourceText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },

    introTitle: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.navy },
    introSub: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 4 },
});
