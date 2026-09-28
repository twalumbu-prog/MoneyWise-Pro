import { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, FlatList } from 'react-native';
import { Search, Check, X } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

export interface PickableAccount {
    id: string;
    name: string;
    subtitle?: string;
}

/** Shared searchable bottom-sheet list — used by the QuickBooks source-account
 * picker and the AI categorization override editor so both stay in sync. */
export const AccountPickerModal: React.FC<{
    visible: boolean;
    title: string;
    accounts: PickableAccount[];
    selectedId?: string | null;
    emptyText?: string;
    onSelect: (account: PickableAccount) => void;
    onClose: () => void;
}> = ({ visible, title, accounts, selectedId, emptyText, onSelect, onClose }) => {
    const [search, setSearch] = useState('');

    const filtered = accounts.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.subtitle || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>{title}</Text>
                    <Pressable onPress={onClose} hitSlop={8}><X size={18} color={colors.textFaint} /></Pressable>
                </View>
                <View style={styles.searchRow}>
                    <Search size={14} color={colors.textFaint} />
                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search accounts…"
                        placeholderTextColor={colors.textFaint}
                        autoFocus
                    />
                </View>
                <FlatList
                    data={filtered}
                    keyExtractor={(a) => a.id}
                    style={{ maxHeight: 320 }}
                    ListEmptyComponent={<Text style={styles.emptyText}>{emptyText ?? 'No accounts found.'}</Text>}
                    renderItem={({ item }) => (
                        <Pressable style={styles.accountRow} onPress={() => onSelect(item)}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.accountName}>{item.name}</Text>
                                {!!item.subtitle && <Text style={styles.accountType}>{item.subtitle}</Text>}
                            </View>
                            {selectedId === item.id && <Check size={16} color={colors.blue} />}
                        </Pressable>
                    )}
                />
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,42,60,0.5)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%',
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 16, paddingBottom: 28,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sheetTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    searchRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvasAlt,
        borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
    accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    accountName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    accountType: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
    emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
});
