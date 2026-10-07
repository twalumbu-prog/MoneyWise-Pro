import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView, Share } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { X, Copy, Check, Share2, Search, Link2, UserPlus } from 'lucide-react-native';
import { savingsService } from 'core';
import type { SavingsItem, SavingsPerson } from 'core';
import { PersonAvatar } from './PersonAvatar';
import { colors, fonts, radius } from '../../theme/tokens';

const WEB = 'https://moneywise.blueopus.cloud';
export const inviteLink = (item: Pick<SavingsItem, 'inviteCode'>) => `${WEB}/savings/join/${item.inviteCode}`;

/**
 * Centre pop-up for inviting people to a group: a shareable link (copy / share) that opens the app
 * for people who have it and a preview-and-join page in the browser for those who don't, plus
 * search to add people who are already on MoneyWise straight into the group.
 */
export const InviteModal: React.FC<{ visible: boolean; item: SavingsItem | null; onClose: () => void }> = ({ visible, item, onClose }) => {
    const qc = useQueryClient();
    const [copied, setCopied] = useState(false);
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { if (visible) { setQuery(''); setDebounced(''); setAdded(new Set()); setCopied(false); setError(null); } }, [visible]);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 350);
        return () => clearTimeout(t);
    }, [query]);

    const { data: people = [], isFetching } = useQuery({
        queryKey: ['savings-people', item?.id, debounced],
        queryFn: () => savingsService.searchPeople(item!.id, debounced),
        enabled: visible && !!item && debounced.length >= 3,
    });

    if (!item) return null;
    const link = inviteLink(item);

    const copy = async () => {
        await Clipboard.setStringAsync(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const share = () => Share.share({ message: `Join "${item.name}" on MoneyWise group savings:\n${link}` }).catch(() => {});

    const add = async (p: SavingsPerson) => {
        setBusyId(p.userId); setError(null);
        try {
            await savingsService.addMember(item.id, p.userId);
            setAdded((s) => new Set(s).add(p.userId));
            qc.invalidateQueries({ queryKey: ['savings'] });
        } catch (e: any) {
            setError(e?.message || 'Could not add them.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior="padding" style={styles.center} pointerEvents="box-none">
                <View style={styles.card}>
                    <View style={styles.head}>
                        <Text style={styles.title} numberOfLines={1}>Invite to {item.name}</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close"><X size={18} color={colors.textFaint} /></Pressable>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="handled" bounces={false} style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 20, gap: 18 }}>
                        <View>
                            <Text style={styles.label}>Group invite link</Text>
                            <View style={styles.linkBox}>
                                <Link2 size={16} color={colors.blue} />
                                <Text style={styles.linkText} numberOfLines={1}>{link.replace('https://', '')}</Text>
                            </View>
                            <View style={styles.btnRow}>
                                <Pressable onPress={copy} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.8 }]}>
                                    {copied ? <Check size={16} color={colors.positiveInk} /> : <Copy size={16} color={colors.navy} />}
                                    <Text style={styles.btnGhostText}>{copied ? 'Copied' : 'Copy link'}</Text>
                                </Pressable>
                                <Pressable onPress={share} style={({ pressed }) => [styles.btn, styles.btnDark, pressed && { opacity: 0.85 }]}>
                                    <Share2 size={16} color="#FFFFFF" />
                                    <Text style={styles.btnDarkText}>Share</Text>
                                </Pressable>
                            </View>
                            <Text style={styles.hint}>With the app it opens straight into the group. Without it, they can preview the group and join in the browser.</Text>
                        </View>

                        <View>
                            <Text style={styles.label}>Add someone on MoneyWise</Text>
                            <View style={styles.search}>
                                <Search size={16} color={colors.textFaint} />
                                <TextInput
                                    value={query} onChangeText={setQuery} placeholder="Search by email or username"
                                    placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} style={styles.searchInput}
                                />
                                {isFetching && <ActivityIndicator size="small" color={colors.blue} />}
                            </View>
                            {!!error && <Text style={styles.error}>{error}</Text>}

                            {debounced.length >= 3 && !isFetching && people.length === 0 && (
                                <Text style={styles.hint}>No one found. Share the link and they can create an account from it.</Text>
                            )}
                            {people.map((p) => {
                                const isIn = p.isMember || added.has(p.userId);
                                return (
                                    <View key={p.userId} style={styles.person}>
                                        <PersonAvatar name={p.name} url={p.avatarUrl} size={40} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                                            <Text style={styles.personMeta} numberOfLines={1}>{[p.username ? `@${p.username}` : null, p.email].filter(Boolean).join(' · ')}</Text>
                                        </View>
                                        {isIn ? (
                                            <View style={styles.inPill}><Check size={13} color={colors.positiveInk} /><Text style={styles.inText}>In group</Text></View>
                                        ) : (
                                            <Pressable onPress={() => add(p)} disabled={busyId === p.userId} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}>
                                                {busyId === p.userId ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><UserPlus size={14} color="#FFFFFF" /><Text style={styles.addText}>Add</Text></>}
                                            </Pressable>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.canvasAlt },
    title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.navy },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvasAlt, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy, marginBottom: 8 },
    linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderRadius: radius.md, backgroundColor: colors.tabActiveBg },
    linkText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.blue },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: radius.pill },
    btnGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    btnGhostText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
    btnDark: { backgroundColor: '#000000' },
    btnDarkText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#FFFFFF' },
    hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 8 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
    searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
    error: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger, marginTop: 6 },
    person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    personName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    personMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#000000', minWidth: 64, justifyContent: 'center' },
    addText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
    inPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: '#ECFDF5' },
    inText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.positiveInk },
});
