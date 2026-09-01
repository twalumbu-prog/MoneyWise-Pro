import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Camera, ImagePlus } from 'lucide-react-native';
import { requisitionService, requireCapability } from 'core';
import { captureImage } from '../../platform/files';
import { uploadReceipts } from '../../lib/uploads';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * Receipt capture for a requisition. Uploads into the same `receipts` bucket and
 * path convention the web app uses, then calls scanReceipts so the existing OCR
 * pipeline processes them identically no matter which client sent them.
 */
export const ReceiptCapture: React.FC<{
    requisitionId: string;
    onUploaded: () => void;
}> = ({ requisitionId, onUploaded }) => {
    const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

    const run = async (source: 'camera' | 'library') => {
        setBusy(source);
        try {
            const files =
                source === 'camera'
                    ? await (async () => {
                          const one = await captureImage();
                          return one ? [one] : [];
                      })()
                    : await requireCapability('files').pick({ kind: 'image', multiple: true });

            if (files.length === 0) return; // user cancelled — not an error

            const paths = await uploadReceipts(requisitionId, files);
            await requisitionService.scanReceipts(requisitionId, paths);
            onUploaded();
        } catch (err: any) {
            Alert.alert('Receipt upload failed', err?.message ?? 'Please try again.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={styles.row}>
            <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                onPress={() => run('camera')}
                disabled={busy !== null}
                accessibilityLabel="Photograph a receipt"
            >
                {busy === 'camera'
                    ? <ActivityIndicator color={colors.blue} size="small" />
                    : <><Camera size={17} color={colors.blue} /><Text style={styles.btnText}>Camera</Text></>}
            </Pressable>
            <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                onPress={() => run('library')}
                disabled={busy !== null}
                accessibilityLabel="Attach receipts from photos"
            >
                {busy === 'library'
                    ? <ActivityIndicator color={colors.blue} size="small" />
                    : <><ImagePlus size={17} color={colors.blue} /><Text style={styles.btnText}>Photos</Text></>}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 13, borderRadius: radius.md, minHeight: 46,
        backgroundColor: colors.tabActiveBg, borderWidth: 1, borderColor: 'rgba(0,106,255,0.2)',
    },
    btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    pressed: { opacity: 0.8 },
});
