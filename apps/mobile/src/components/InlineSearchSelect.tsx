import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { ChevronDown, Search, Check } from 'lucide-react-native';
import { colors, fonts, radius } from '../theme/tokens';

export interface InlineItem { id: string; label: string }

/**
 * A select that is its own search bar: tap it and the field turns into a text input, and the matches
 * drop down right underneath it as you type — no separate sheet or screen. Picking one fills the field
 * and puts the keyboard away. `onOpen` lets the screen scroll the field up so the matches stay visible.
 */
export const InlineSearchSelect: React.FC<{
    items: InlineItem[];
    selectedId?: string | null;
    placeholder: string;
    searchPlaceholder?: string;
    onSelect: (item: InlineItem) => void;
    renderIcon?: (label: string) => React.ReactNode;
    onOpen?: () => void;
    onQueryChange?: () => void;
    maxVisible?: number;
}> = ({ items, selectedId, placeholder, searchPlaceholder = 'Type to search…', onSelect, renderIcon, onOpen, onQueryChange, maxVisible = 6 }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<TextInput>(null);
    const selected = items.find((i) => i.id === selectedId);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
        // Names that START with what was typed come first.
        return [...list].sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q))).slice(0, maxVisible);
    }, [items, query, maxVisible]);

    const begin = () => { setOpen(true); setQuery(''); onOpen?.(); };
    const close = () => { setOpen(false); setQuery(''); Keyboard.dismiss(); };
    const pick = (item: InlineItem) => { onSelect(item); close(); };

    if (!open) {
        return (
            <Pressable style={styles.field} onPress={begin} accessibilityRole="button" accessibilityLabel={selected ? selected.label : placeholder}>
                <View style={styles.main}>
                    {!!selected && renderIcon?.(selected.label)}
                    <Text style={[styles.text, !selected && styles.placeholder]} numberOfLines={1}>{selected?.label || placeholder}</Text>
                </View>
                <ChevronDown size={16} color={colors.textFaint} />
            </Pressable>
        );
    }

    return (
        <View>
            <View style={[styles.field, styles.fieldOpen]}>
                <Search size={16} color={colors.blue} />
                <TextInput
                    ref={inputRef}
                    autoFocus
                    style={styles.input}
                    value={query}
                    onChangeText={(t) => { setQuery(t); onQueryChange?.(); }}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={colors.textFaint}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={() => { if (matches[0]) pick(matches[0]); else close(); }}
                />
                <Pressable onPress={close} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable>
            </View>
            <View style={styles.dropdown}>
                {matches.length === 0
                    ? <Text style={styles.empty}>No match for “{query.trim()}”.</Text>
                    : matches.map((item, idx) => (
                        <Pressable
                            key={item.id}
                            style={({ pressed }) => [styles.row, idx > 0 && styles.rowBorder, pressed && { backgroundColor: colors.canvasAlt }]}
                            onPress={() => pick(item)}
                        >
                            {renderIcon?.(item.label)}
                            <Text style={styles.rowText} numberOfLines={1}>{item.label}</Text>
                            {item.id === selectedId && <Check size={15} color={colors.blue} />}
                        </Pressable>
                    ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    field: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface,
        paddingHorizontal: 14, paddingVertical: 13, minHeight: 48,
    },
    fieldOpen: { justifyContent: 'flex-start', borderColor: colors.blue },
    main: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    text: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text, flexShrink: 1 },
    placeholder: { color: colors.textFaint },
    input: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text, padding: 0 },
    cancel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    dropdown: {
        marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, padding: 14 },
});
