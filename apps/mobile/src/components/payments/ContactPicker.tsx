import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, UserRound } from 'lucide-react-native';
import {
    requestContactsAccess, loadContactNumbers, searchContactNumbers, openAppSettings,
    type ContactNumber, type ContactsAccess,
} from '../../lib/contacts';
import { colors, fonts, radius } from '../../theme/tokens';

/** Loads the phone's contacts on demand (asks permission the first time something needs them). */
export function useContactBook() {
    const [access, setAccess] = useState<ContactsAccess | 'unknown'>('unknown');
    const [all, setAll] = useState<ContactNumber[]>([]);
    const [loading, setLoading] = useState(false);
    const started = useRef(false);

    const ensure = useCallback(async () => {
        if (started.current) return;
        started.current = true;
        setLoading(true);
        const a = await requestContactsAccess();
        setAccess(a);
        if (a === 'granted') {
            try { setAll(await loadContactNumbers()); } catch { setAccess('unavailable'); }
        }
        setLoading(false);
        // A refusal can be undone later in Settings, so don't remember it forever.
        if (a !== 'granted') started.current = false;
    }, []);

    return { access, all, loading, ensure };
}

const NoAccess: React.FC<{ access: ContactsAccess | 'unknown' }> = ({ access }) => (
    <View style={styles.note}>
        <Text style={styles.noteText}>
            {access === 'unavailable'
                ? 'Contacts aren’t available in this version of the app. Type the number instead.'
                : 'Allow MoneyWise to read your contacts to search them by name.'}
        </Text>
        {access === 'denied' && (
            <Pressable onPress={openAppSettings} hitSlop={6}><Text style={styles.noteLink}>Open Settings</Text></Pressable>
        )}
    </View>
);

const Row: React.FC<{ c: ContactNumber; onPick: (c: ContactNumber) => void }> = ({ c, onPick }) => (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.canvasAlt }]} onPress={() => onPick(c)}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{c.name.trim().charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.number}>{c.number} · {c.label}</Text>
        </View>
    </Pressable>
);

/** Inline matches under the phone field while the user types a NAME. */
export const ContactSuggestions: React.FC<{ query: string; book: ReturnType<typeof useContactBook>; onPick: (c: ContactNumber) => void }> = ({ query, book, onPick }) => {
    useEffect(() => { void book.ensure(); }, [book.ensure]);
    if (book.loading) return <View style={styles.box}><ActivityIndicator size="small" color={colors.blue} /></View>;
    if (book.access !== 'granted') return <View style={styles.box}><NoAccess access={book.access} /></View>;
    const matches = searchContactNumbers(book.all, query, 5);
    return (
        <View style={styles.box}>
            <Text style={styles.header}>FROM YOUR CONTACTS</Text>
            {matches.length === 0
                ? <Text style={styles.empty}>No contact with a Zambian mobile number matches “{query.trim()}”.</Text>
                : matches.map((c) => <Row key={c.id} c={c} onPick={onPick} />)}
        </View>
    );
};

/** Full contact list with search — opened from the contacts button next to the number. */
export const ContactPickerSheet: React.FC<{ visible: boolean; onClose: () => void; onPick: (c: ContactNumber) => void; book: ReturnType<typeof useContactBook> }> = ({ visible, onClose, onPick, book }) => {
    const insets = useSafeAreaInsets();
    const [q, setQ] = useState('');
    useEffect(() => { if (visible) { setQ(''); void book.ensure(); } }, [visible, book.ensure]);
    const results = searchContactNumbers(book.all, q, 60);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <KeyboardAvoidingView behavior="padding" style={[styles.sheet, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Choose a contact</Text>
                    <Pressable onPress={onClose} hitSlop={10} style={styles.close}><X size={18} color={colors.textFaint} /></Pressable>
                </View>
                <View style={styles.search}>
                    <Search size={16} color={colors.textFaint} />
                    <TextInput value={q} onChangeText={setQ} placeholder="Search by name or number" placeholderTextColor={colors.textFaint} style={styles.searchInput} autoCorrect={false} />
                </View>
                {book.loading ? (
                    <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>
                ) : book.access !== 'granted' ? (
                    <View style={styles.center}><NoAccess access={book.access} /></View>
                ) : results.length === 0 ? (
                    <View style={styles.center}><UserRound size={28} color={colors.textFaint} /><Text style={styles.empty}>No contacts with a Zambian mobile number{q ? ` match “${q.trim()}”` : ' found'}.</Text></View>
                ) : (
                    <FlatList data={results} keyExtractor={(c) => c.id} renderItem={({ item }) => <Row c={item} onPick={onPick} />} keyboardShouldPersistTaps="handled" />
                )}
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    box: { marginTop: 8, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, overflow: 'hidden' },
    header: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textFaint, letterSpacing: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    number: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: 14 },
    note: { padding: 14, gap: 8, alignItems: 'center' },
    noteText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
    noteLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    sheet: { flex: 1, backgroundColor: colors.canvas },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
    close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 14, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
});
