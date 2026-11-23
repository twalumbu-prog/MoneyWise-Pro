import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme/tokens';

/**
 * A person's picture: an uploaded photo (https URL), one of the 8 built-in characters ("preset:1"…"preset:8"),
 * or their initials. Characters are drawn in code so they cost nothing to load.
 */
export const AVATAR_PRESETS: { id: string; bg: string; fg: string; shape: 'smile' | 'calm' | 'wink' | 'cool' }[] = [
    { id: 'preset:1', bg: '#DCEBFF', fg: colors.blue, shape: 'smile' },
    { id: 'preset:2', bg: '#D7F7E8', fg: '#059669', shape: 'calm' },
    { id: 'preset:3', bg: '#FFE4EC', fg: '#E11D48', shape: 'wink' },
    { id: 'preset:4', bg: '#FFF4D6', fg: '#B45309', shape: 'cool' },
    { id: 'preset:5', bg: '#E9E5FF', fg: '#6D28D9', shape: 'smile' },
    { id: 'preset:6', bg: '#D9F3F7', fg: '#0E7490', shape: 'wink' },
    { id: 'preset:7', bg: '#FFE7D6', fg: '#C2410C', shape: 'calm' },
    { id: 'preset:8', bg: '#E5E7EB', fg: colors.navy, shape: 'cool' },
];

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export function PresetFace({ id, size }: { id: string; size: number }) {
    const p = AVATAR_PRESETS.find((x) => x.id === id) ?? AVATAR_PRESETS[0];
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="50" fill={p.bg} />
            {/* hair / cap */}
            <Path d="M22 46 A28 28 0 0 1 78 46" stroke={p.fg} strokeWidth="9" strokeLinecap="round" fill="none" />
            {p.shape === 'cool' ? (
                <Rect x="31" y="50" width="38" height="10" rx="5" fill={p.fg} />
            ) : (
                <>
                    <Circle cx="40" cy="55" r="5" fill={p.fg} />
                    {p.shape === 'wink'
                        ? <Path d="M55 55 h10" stroke={p.fg} strokeWidth="4" strokeLinecap="round" />
                        : <Circle cx="60" cy="55" r="5" fill={p.fg} />}
                </>
            )}
            {p.shape === 'calm'
                ? <Path d="M42 70 h16" stroke={p.fg} strokeWidth="4" strokeLinecap="round" />
                : <Path d="M40 68 Q50 77 60 68" stroke={p.fg} strokeWidth="4" strokeLinecap="round" fill="none" />}
        </Svg>
    );
}

export function UserAvatar({ url, name, size = 48 }: { url?: string | null; name: string; size?: number }) {
    if (url && url.startsWith('preset:')) return <PresetFace id={url} size={size} />;
    if (url && /^(https?:|file:)/.test(url)) {
        return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.chipActiveBg }} accessibilityIgnoresInvertColors />;
    }
    return (
        <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.initialsText, { fontSize: size * 0.36 }]}>{initialsOf(name)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    initials: { backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
    initialsText: { fontFamily: fonts.bodyBold, color: colors.blue },
});
