import { useState, useMemo } from 'react';
import {
    Modal, View, Text, Pressable, TextInput, FlatList, StyleSheet,
} from 'react-native';
import { Search, X, Check, Building2 } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

export interface AccountOption {
    id: string;
    name: string;
    code?: string;
    accountType?: string;
}

export const AccountPickerSheet: React.FC<{
    visible: boolean;
    title?: string;
    accounts: AccountOption[];
    selectedId?: string;
    onClose: () => void;
    onSelect: (acc: AccountOption) => void;
}> = ({ visible, title = 'Select Ledger Account', accounts, selectedId, onClose, onSelect }) => {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return accounts;
        return accounts.filter(
            (a) =>
                a.name.toLowerCase().includes(q) ||
                (a.code || '').toLowerCase().includes(q) ||
                (a.accountType || '').toLowerCase().includes(q)
        );
    }, [accounts, query]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                            <X size={20} color={colors.textMuted} />
                        </Pressable>
                    </View>

                    <View style={styles.searchBar}>
                        <Search size={16} color={colors.textFaint} />
                        <TextInput
                            style={styles.searchInput}
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search by account name or code…"
                            placeholderTextColor={colors.textFaint}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {query.length > 0 && (
                            <Pressable onPress={() => setQuery('')} hitSlop={8}>
                                <X size={15} color={colors.textFaint} />
                            </Pressable>
                        )}
                    </View>

                    <FlatList
                        data={filtered}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => {
                            const isSelected = item.id === selectedId;
                            return (
                                <Pressable
                                    style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, pressed && styles.rowPressed]}
                                    onPress={() => {
                                        onSelect(item);
                                        onClose();
                                    }}
                                >
                                    <View style={styles.rowLeft}>
                                        <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                                            <Building2 size={16} color={isSelected ? colors.blue : colors.textMuted} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.accName, isSelected && styles.accNameSelected]} numberOfLines={1}>
                                                {item.name}
                                            </Text>
                                            <View style={styles.accMetaRow}>
                                                {!!item.code && <Text style={styles.accCode}>{item.code}</Text>}
                                                {!!item.accountType && (
                                                    <View style={styles.typeBadge}>
                                                        <Text style={styles.typeBadgeText}>{item.accountType}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                    {isSelected && <Check size={18} color={colors.blue} />}
                                </Pressable>
                            );
                        }}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>No matching accounts found.</Text>
                            </View>
                        }
                    />
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '82%', minHeight: '55%',
        paddingBottom: 30,
    },
    handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
    title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 20, marginVertical: 8, paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: colors.canvasAlt, borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, padding: 0 },
    list: { paddingHorizontal: 20, paddingVertical: 8 },
    row: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg,
        marginVertical: 2, borderWidth: 1, borderColor: 'transparent',
    },
    rowSelected: { backgroundColor: colors.tabActiveBg, borderColor: 'rgba(0,106,255,0.2)' },
    rowPressed: { opacity: 0.7 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    iconBoxSelected: { backgroundColor: colors.surface },
    accName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
    accNameSelected: { color: colors.blue },
    accMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    accCode: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
    typeBadge: { backgroundColor: colors.canvasAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
    typeBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' },
    empty: { paddingVertical: 40, alignItems: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
});
