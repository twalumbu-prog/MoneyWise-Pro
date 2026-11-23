import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Alert, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Pencil, Camera, Image as ImageIcon, UserCircle2, X, RotateCcw } from 'lucide-react-native';
import { PersonalStepShell } from './PersonalStepShell';
import type { StepContext, AvatarDraft } from './stepContext';
import { UserAvatar, PresetFace, AVATAR_PRESETS } from '../../UserAvatar';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "avatar": a photo (camera or library, cropped square and compressed before upload), the Google/Apple photo
 * from sign-in, one of 8 characters, or the initials. Camera/library permission is asked only when that option is tapped.
 */
export function StepAvatar({ ctx }: { ctx: StepContext }) {
    const insets = useSafeAreaInsets();
    const [sheet, setSheet] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const d = ctx.drafts.avatar;
    const name = `${ctx.state.profile.firstName} ${ctx.state.profile.lastName}`.trim() || 'You';
    const provider = ctx.state.profile.providerPhotoUrl;

    const shown = d.kind === 'photo' ? d.uri : d.kind === 'preset' ? d.preset : d.kind === 'provider' ? provider : d.kind === 'initials' ? null : ctx.state.profile.avatarUrl;

    const choose = (draft: AvatarDraft) => { ctx.setDraft('avatar', draft); setSheet(false); };

    const fromImage = async (source: 'camera' | 'library') => {
        try {
            if (source === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    setSheet(false);
                    Alert.alert('Camera is off for MoneyWise', 'Turn on camera access in Settings to take a photo, or pick another option.', [
                        { text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() },
                    ]);
                    return;
                }
            }
            const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
            const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(opts);
            if (res.canceled || !res.assets?.[0]) return;
            setPreparing(true);
            // Square, 512 px, JPEG ~70%: comfortably under the 300 KB the API is sized for.
            const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 512, height: 512 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
            choose({ kind: 'photo', uri: out.uri, base64: out.base64 ?? undefined, mime: 'image/jpeg' });
        } catch (e: any) {
            Alert.alert('Couldn’t use that picture', e?.message || 'Please try another one.');
        } finally {
            setPreparing(false);
        }
    };

    const save = () => void ctx.run('continue', async () => {
        let r;
        if (d.kind === 'photo' && d.base64) r = await ctx.service.saveAvatar({ imageBase64: d.base64, mime: d.mime || 'image/jpeg' });
        else if (d.kind === 'preset' && d.preset) r = await ctx.service.saveAvatar({ preset: d.preset });
        else if (d.kind === 'provider') r = await ctx.service.saveAvatar({ providerPhoto: true });
        else if (d.kind === 'initials') r = await ctx.service.saveAvatar({ clear: true });
        else return ctx.service.saveStep('avatar', 'done');
        ctx.patchProfile({ avatarUrl: r.data.avatarUrl });
        ctx.setDraft('avatar', {});
        return r;
    });

    return (
        <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip} onContinue={save} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Save' : 'Continue'}>
            <View style={styles.center}>
                <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Change your picture">
                    <UserAvatar url={shown} name={name} size={180} />
                    <View style={styles.pencil}>{preparing ? <ActivityIndicator color={colors.text} /> : <Pencil size={20} color={colors.text} />}</View>
                </Pressable>
                <Text style={styles.hint}>Tap to choose a photo or a character</Text>
            </View>

            <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
                <Pressable style={styles.scrim} onPress={() => setSheet(false)} accessibilityLabel="Close" />
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <View style={styles.sheetHead}>
                        <Text style={styles.sheetTitle}>Your picture</Text>
                        <Pressable onPress={() => setSheet(false)} hitSlop={12} accessibilityLabel="Close"><X size={22} color={colors.text} /></Pressable>
                    </View>
                    <Option icon={<Camera size={20} color={colors.text} />} label="Take a photo" onPress={() => void fromImage('camera')} />
                    <Option icon={<ImageIcon size={20} color={colors.text} />} label="Choose from library" onPress={() => void fromImage('library')} />
                    {!!provider && <Option icon={<UserCircle2 size={20} color={colors.text} />} label="Use my sign-in photo" onPress={() => choose({ kind: 'provider' })} />}
                    <Text style={styles.subhead}>Or pick a character</Text>
                    <View style={styles.grid}>
                        {AVATAR_PRESETS.map((p) => (
                            <Pressable key={p.id} onPress={() => choose({ kind: 'preset', preset: p.id })} accessibilityRole="button" accessibilityLabel={`Character ${p.id.split(':')[1]}`}
                                style={[styles.presetBtn, shown === p.id && styles.presetOn]}>
                                <PresetFace id={p.id} size={60} />
                            </Pressable>
                        ))}
                    </View>
                    <Option icon={<RotateCcw size={20} color={colors.text} />} label="Use my initials" onPress={() => choose({ kind: 'initials' })} />
                </View>
            </Modal>
        </PersonalStepShell>
    );
}

const Option = ({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]} accessibilityRole="button">
        {icon}
        <Text style={styles.optionText}>{label}</Text>
    </Pressable>
);

const styles = StyleSheet.create({
    center: { alignItems: 'center', marginTop: 24 },
    pencil: {
        position: 'absolute', right: 4, bottom: 8, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
    },
    hint: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 20 },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 22 },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
    option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
    optionText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
    subhead: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textMuted, marginTop: 12, marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
    presetBtn: { borderRadius: 34, padding: 2, borderWidth: 2, borderColor: 'transparent' },
    presetOn: { borderColor: colors.blue },
});
