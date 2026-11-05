import { useMemo, useState } from 'react';
import { View, Text, Pressable, SectionList, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, Image as ImageIcon, MessageCircle, Receipt, Smartphone, Mail } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { captureService, formatKwacha } from 'core';
import type { CaptureRow } from 'core';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme/tokens';
import { captureImage, filesAdapter } from '../src/platform/files';

const CAPTURES_KEY = ['captures'];
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const STATUS: Record<string, { label: string; bg: string; ink: string }> = {
    NEEDS_REVIEW: { label: 'To review', bg: '#FFFBEB', ink: colors.warn },
    POSTING: { label: 'Booking…', bg: colors.chipActiveBg, ink: colors.textMuted },
    APPROVED: { label: 'Booked', bg: '#E7FBF2', ink: colors.positiveInk },
    AUTO_POSTED: { label: 'Auto', bg: colors.tabActiveBg, ink: colors.blue },
    MERGED: { label: 'Matched', bg: '#E7FBF2', ink: colors.positiveInk },
};

const dayLabel = (iso: string) => {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return 'Today';
    if (d.toDateString() === new Date(Date.now() - 86400_000).toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const SourceIcon: React.FC<{ source: CaptureRow['source'] }> = ({ source }) => {
    const p = { size: 18, color: colors.blue };
    if (source === 'RECEIPT_UPLOAD') return <Receipt {...p} />;
    if (source === 'MOMO_SMS') return <Smartphone {...p} />;
    if (source === 'EMAIL') return <Mail {...p} />;
    return <MessageCircle {...p} />;
};

/** Captured transactions: drafts from receipts and messages, waiting for a tap. Uploads are read in the background. */
export default function CapturesScreen() {
    const qc = useQueryClient();
    const [reading, setReading] = useState(false);

    const settings = useQuery({ queryKey: [...CAPTURES_KEY, 'settings'], queryFn: () => captureService.settings() });
    const eligible = !!settings.data?.planEligible;
    const list = useQuery({
        queryKey: [...CAPTURES_KEY, 'list'], queryFn: () => captureService.list(), enabled: eligible,
        refetchInterval: reading ? 5000 : false,
    });

    const upload = useMutation({
        mutationFn: async (file: { uri: string; mimeType: string }) => {
            const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
            return captureService.upload(base64, file.mimeType);
        },
        onSuccess: (r) => {
            if (r.duplicate) { Alert.alert('Already added', 'This receipt was uploaded before.'); return; }
            setReading(true);
            setTimeout(() => setReading(false), 90_000);
            void qc.invalidateQueries({ queryKey: CAPTURES_KEY });
        },
        onError: (e: Error) => Alert.alert('Could not add the receipt', e.message),
    });

    const fromCamera = async () => {
        try {
            const photo = await captureImage();
            if (photo) upload.mutate(await filesAdapter.compressImage(photo, MAX_UPLOAD_BYTES));
        } catch (e: any) { Alert.alert('Camera', e?.message ?? 'Please try again.'); }
    };
    const fromPhotos = async () => {
        try {
            const [photo] = await filesAdapter.pick({ kind: 'image' });
            if (photo) upload.mutate(await filesAdapter.compressImage(photo, MAX_UPLOAD_BYTES));
        } catch (e: any) { Alert.alert('Photos', e?.message ?? 'Please try again.'); }
    };
    const fromFiles = async () => {
        try {
            const [doc] = await filesAdapter.pick({ kind: 'document', accept: ['application/pdf'] });
            if (doc) upload.mutate(doc);
        } catch (e: any) { Alert.alert('Files', e?.message ?? 'Please try again.'); }
    };

    const sections = useMemo(() => {
        const m = new Map<string, CaptureRow[]>();
        for (const c of list.data?.items ?? []) { const k = dayLabel(c.created_at); m.set(k, [...(m.get(k) ?? []), c]); }
        return Array.from(m.entries()).map(([title, data]) => ({ title, data }));
    }, [list.data]);

    if (settings.isLoading) return <View style={styles.root}><Stack.Screen options={{ headerShown: false }} /><ScreenHeader title="Captured" /><ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} /></View>;

    if (!eligible) {
        return (
            <View style={styles.root}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="Captured" />
                <Text style={styles.emptyTitle}>Transaction capture is a Premium feature</Text>
                <Text style={styles.empty}>An active Premium plan turns receipts and mobile money messages into ready-to-approve entries.</Text>
            </View>
        );
    }

    const enabled = !!list.data?.enabled;
    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Captured" />
            {enabled && (
                <View style={styles.addRow}>
                    <AddButton label="Camera" onPress={fromCamera} icon={<Camera size={16} color="#FFFFFF" />} primary />
                    <AddButton label="Photos" onPress={fromPhotos} icon={<ImageIcon size={16} color={colors.blue} />} />
                    <AddButton label="PDF" onPress={fromFiles} icon={<FileText size={16} color={colors.blue} />} />
                </View>
            )}
            {(upload.isPending || reading) && <Text style={styles.notice}>{upload.isPending ? 'Uploading…' : 'Reading your receipt. The draft appears here shortly.'}</Text>}
            <SectionList
                sections={sections}
                keyExtractor={(c) => c.id}
                contentContainerStyle={styles.list}
                stickySectionHeadersEnabled={false}
                refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />}
                renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
                ListEmptyComponent={list.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.blue} /> : (
                    <Text style={styles.empty}>{enabled ? 'Nothing captured yet. Add a receipt to get started.' : 'Capture is turned off. An owner or admin can turn it on in the web app under Integrations.'}</Text>
                )}
                renderItem={({ item }) => <Row c={item} />}
            />
        </View>
    );
}

const AddButton: React.FC<{ label: string; icon: React.ReactNode; onPress: () => void; primary?: boolean }> = ({ label, icon, onPress, primary }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.add, primary && styles.addPrimary, pressed && { opacity: 0.7 }]}>
        {icon}<Text style={[styles.addText, primary && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
);

const Row: React.FC<{ c: CaptureRow }> = ({ c }) => {
    const chip = STATUS[c.status] ?? STATUS.NEEDS_REVIEW;
    const isIn = c.direction === 'IN';
    return (
        <Pressable onPress={() => router.push({ pathname: '/captures/[id]', params: { id: c.id } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
            <View style={styles.icon}><SourceIcon source={c.source} /></View>
            <View style={{ flex: 1 }}>
                <Text style={styles.cp} numberOfLines={1}>{c.counterparty_name || (c.source === 'RECEIPT_UPLOAD' ? 'Receipt' : 'Mobile money')}</Text>
                <Text style={styles.meta}>{c.direction ? (isIn ? 'Money in' : 'Money out') : 'Unknown'}{c.occurred_on ? ` · ${c.occurred_on}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.amount, isIn && { color: colors.positiveInk }]}>{c.zmw_amount != null ? formatKwacha(Number(c.zmw_amount)) : '—'}</Text>
                <View style={[styles.chip, { backgroundColor: chip.bg }]}><Text style={[styles.chipText, { color: chip.ink }]}>{chip.label}</Text></View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
    add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    addPrimary: { backgroundColor: colors.blue, borderColor: colors.blue },
    addText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
    notice: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, paddingHorizontal: 20, paddingBottom: 4 },
    list: { padding: 20, paddingTop: 8, gap: 8, paddingBottom: 48 },
    day: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textFaint, marginTop: 8, marginBottom: 6 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, textAlign: 'center', marginTop: 48, paddingHorizontal: 24 },
    empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', marginTop: 12, paddingHorizontal: 24, lineHeight: 20 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14 },
    icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.tabActiveBg, alignItems: 'center', justifyContent: 'center' },
    cp: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
    meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
    amount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
    chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
    chipText: { fontFamily: fonts.bodyBold, fontSize: 10 },
});
