import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Image, Alert, LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, FadeIn, FadeOut } from 'react-native-reanimated';
import { ChevronLeft, CircleHelp, Camera as CameraIcon, Images, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { investmentService, requireCapability, DOC_LIMITS, ID_TYPES, idNeedsBack } from 'core';
import type { IdType, PickedFile } from 'core';
import { useAuth } from '../src/context/AuthContext';
import { uploadToBucket } from '../src/lib/uploads';
import { captureImage } from '../src/platform/files';
import { hapticTick, hapticImpact, hapticSuccess, hapticError } from '../src/lib/haptics';
import { colors, fonts, radius } from '../src/theme/tokens';

// expo-camera is optional at runtime: an older binary without it falls back to the system camera.
let CameraModule: any = null;
try { CameraModule = require('expo-camera'); } catch { CameraModule = null; }

type Side = 'front' | 'back';
const ID_LABEL: Record<IdType, string> = { NRC: 'NRC', Passport: 'Passport', "Driver's Licence": 'Driver’s Licence' };

/**
 * Screen 2 of identity verification: photograph (or choose) the chosen document, front then back. The viewfinder is a
 * live camera; Capture takes the side on the active tab and moves to the next one. When every side is in, the photos
 * upload to the private KYC bucket and are saved on the person's KYC profile, the same one Settings → KYC profile,
 * investments and loans use, so nothing is asked for twice. The front is also read to check it really is the chosen
 * document and to pre-fill the name, birth date and ID number when the profile has none yet.
 */
export default function KycCaptureScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();
    const { user } = useAuth();
    const params = useLocalSearchParams<{ idType?: string; preview?: string }>();
    const idType: IdType = (ID_TYPES as string[]).includes(String(params.idType)) ? (params.idType as IdType) : 'NRC';
    const preview = params.preview === '1';
    const sides: Side[] = idNeedsBack(idType) ? ['front', 'back'] : ['front'];

    const [side, setSide] = useState<Side>('front');
    const [shots, setShots] = useState<Partial<Record<Side, PickedFile>>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const camRef = useRef<any>(null);
    const [perm, requestPerm] = CameraModule ? CameraModule.useCameraPermissions() : [null, async () => null];
    const liveCamera = !!CameraModule && !!perm?.granted;

    useEffect(() => { if (CameraModule && perm && !perm.granted && perm.canAskAgain) void requestPerm(); }, [perm]); // eslint-disable-line react-hooks/exhaustive-deps

    // Front / Back pill slides under the active tab.
    const [tabW, setTabW] = useState(0);
    const x = useSharedValue(0);
    useEffect(() => { x.value = withSpring(sides.indexOf(side) * tabW, { damping: 18, stiffness: 220 }); }, [side, tabW]); // eslint-disable-line react-hooks/exhaustive-deps
    const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    const onTabsLayout = (e: LayoutChangeEvent) => setTabW((e.nativeEvent.layout.width - 8) / sides.length);

    const pickSide = (s: Side) => { if (s !== side) { hapticTick(); setSide(s); setError(null); } };
    const allIn = sides.every((s) => !!shots[s]);
    const current = shots[side];

    const keep = (file: PickedFile) => {
        hapticImpact('Medium');
        setError(null);
        setShots((prev) => {
            const next = { ...prev, [side]: file };
            // Front done: go straight to the back.
            const nextSide = sides.find((s) => !next[s]);
            if (nextSide && nextSide !== side) setTimeout(() => { hapticTick(); setSide(nextSide); }, 350);
            return next;
        });
    };

    const capture = async () => {
        try {
            if (liveCamera && camRef.current) {
                const photo = await camRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
                if (photo?.uri) keep({ uri: photo.uri, name: `id_${side}.jpg`, mimeType: 'image/jpeg' });
            } else {
                const f = await captureImage();
                if (f) keep(f);
            }
        } catch (e: any) { hapticError(); setError(e?.message || 'Couldn’t take the photo. Try again.'); }
    };
    const chooseExisting = async () => {
        hapticTick();
        try {
            const [f] = await requireCapability('files').pick({ kind: 'image' });
            if (f) keep(f);
        } catch (e: any) { hapticError(); setError(e?.message || 'Couldn’t open your photos.'); }
    };
    const retake = () => { hapticTick(); setShots((p) => ({ ...p, [side]: undefined })); };

    const save = async () => {
        if (preview) { hapticSuccess(); router.back(); return; }
        const uid = user?.id;
        if (!uid) { setError('Sign in again to continue.'); return; }
        setSaving(true); setError(null);
        try {
            const paths: Partial<Record<Side, string>> = {};
            for (const s of sides) {
                const f = await requireCapability('files').compressImage(shots[s]!, DOC_LIMITS.imageBytesAfterCompression);
                const path = `${uid}/kyc-profile/id_${s}_${Date.now()}.jpg`;
                await uploadToBucket('investor-kyc', path, { ...f, mimeType: 'image/jpeg' });
                paths[s] = path;
            }
            // Is it really that document? Also fills in the details the profile doesn't have yet. Never blocks saving
            // when the reader is down; only a clear "this isn't an ID" does.
            const read = await investmentService.extractIdDetails(paths.front!, idType).catch(() => null);
            if (read && read.looks_like_id === false) {
                hapticError();
                setShots((p) => ({ ...p, front: undefined }));
                setSide('front');
                setError(`That doesn’t look like a ${ID_LABEL[idType]}. Take the photo again, with the whole card in the frame.`);
                return;
            }
            const existing = await investmentService.getKycProfile().catch(() => null);
            const applicant: Record<string, string> = { ...((existing?.applicant as Record<string, string>) ?? {}) };
            if (read) {
                for (const [k, v] of Object.entries({ first_name: read.first_name, middle_name: read.middle_name, last_name: read.last_name, date_of_birth: read.date_of_birth, id_number: read.id_number })) {
                    if (v && !applicant[k]) applicant[k] = String(v);
                }
            }
            const { id_front: _f, id_back: _b, ...otherDocs } = existing?.documents ?? {};
            const saved = await investmentService.saveKycProfile({
                applicant, idType,
                documents: { ...otherDocs, id_front: paths.front!, ...(paths.back ? { id_back: paths.back } : {}) },
            });
            qc.setQueryData(['kyc-profile'], saved);
            hapticSuccess();
            router.back();
        } catch (e: any) {
            hapticError();
            setError(e?.message || 'The upload failed. Check your connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    const help = () => Alert.alert('Taking a good photo', 'Lay the document on a dark, flat surface in good light. Fill the frame, keep it straight, and make sure there’s no glare on the photo or the text.');

    return (
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.topBar}>
                <Pressable onPress={() => { hapticTick(); router.back(); }} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Back"><ChevronLeft size={20} color={colors.text} /></Pressable>
                <Pressable onPress={help} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Help"><CircleHelp size={18} color={colors.text} /></Pressable>
            </View>

            <View style={styles.body}>
                <Text style={styles.title}>{ID_LABEL[idType]}</Text>
                <Text style={styles.subtitle}>Take a photo of your {ID_LABEL[idType].toLowerCase() === 'nrc' ? 'NRC' : ID_LABEL[idType].toLowerCase()} or choose one you already have.</Text>

                {sides.length > 1 && (
                    <View style={styles.tabs} onLayout={onTabsLayout}>
                        {tabW > 0 && <Animated.View style={[styles.tabPill, { width: tabW }, pill]} />}
                        {sides.map((s) => (
                            <Pressable key={s} onPress={() => pickSide(s)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: side === s }}>
                                <Text style={[styles.tabText, side === s && styles.tabTextOn]}>{s === 'front' ? 'Front of ID' : 'Back of ID'}{shots[s] ? '  ✓' : ''}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                <View style={styles.viewfinder}>
                    {current ? (
                        <Animated.View key={`shot-${side}`} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
                            <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            <Pressable onPress={retake} style={styles.retake} accessibilityRole="button"><RotateCcw size={14} color="#FFFFFF" /><Text style={styles.retakeText}>Retake</Text></Pressable>
                        </Animated.View>
                    ) : liveCamera ? (
                        <CameraModule.CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
                    ) : (
                        <View style={styles.noCam}><CameraIcon size={28} color="rgba(255,255,255,0.7)" /></View>
                    )}
                    {!current && (
                        <>
                            <View style={[styles.corner, styles.tl]} /><View style={[styles.corner, styles.tr]} />
                            <View style={[styles.corner, styles.bl]} /><View style={[styles.corner, styles.br]} />
                            <Text style={styles.focusHint}>Please ensure all the details are in focus.</Text>
                        </>
                    )}
                </View>

                <Pressable onPress={chooseExisting} style={({ pressed }) => [styles.choose, pressed && { opacity: 0.8 }]} accessibilityRole="button">
                    <Images size={15} color={colors.text} /><Text style={styles.chooseText}>Choose Existing</Text>
                </Pressable>
                {!!error && <Text style={styles.error}>{error}</Text>}
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={styles.privacy}><ShieldCheck size={14} color={colors.textFaint} /><Text style={styles.privacyText}>Stored privately. Only shared when you apply to a company.</Text></View>
                <Pressable
                    onPress={allIn ? save : current ? () => pickSide(sides.find((s) => !shots[s]) ?? side) : capture}
                    disabled={saving}
                    style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.98 }] }, saving && { opacity: 0.7 }]}
                    accessibilityRole="button"
                >
                    {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{allIn ? 'Use these photos' : current ? 'Next side' : 'Capture'}</Text>}
                </Pressable>
            </View>
        </View>
    );
}

const C = 22;
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
    roundBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
    title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
    subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 6 },
    tabs: { flexDirection: 'row', marginTop: 36, padding: 4, borderRadius: radius.pill, backgroundColor: colors.canvas },
    tabPill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
    tabText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint },
    tabTextOn: { color: colors.text },
    viewfinder: { marginTop: 14, aspectRatio: 1.586, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0B0B0F', justifyContent: 'flex-end' },
    noCam: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    corner: { position: 'absolute', width: C, height: C, borderColor: 'rgba(255,255,255,0.85)' },
    tl: { top: 14, left: 14, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 8 },
    tr: { top: 14, right: 14, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 8 },
    bl: { bottom: 14, left: 14, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 8 },
    br: { bottom: 14, right: 14, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 8 },
    focusHint: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 16 },
    retake: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
    retakeText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#FFFFFF' },
    choose: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 16, height: 38, borderRadius: radius.pill, backgroundColor: colors.canvas },
    chooseText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    error: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.danger, textAlign: 'center', marginTop: 12 },
    footer: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
    privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    privacyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
    primary: { height: 54, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
});
