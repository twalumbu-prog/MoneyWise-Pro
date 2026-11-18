import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { fonts } from '../theme/tokens';

const TINTS = [
    { bg: '#E0E7FF', ink: '#4338CA' }, { bg: '#FFE4E6', ink: '#BE123C' }, { bg: '#DCFCE7', ink: '#15803D' },
    { bg: '#FEF3C7', ink: '#B45309' }, { bg: '#E0F2FE', ink: '#0369A1' }, { bg: '#F3E8FF', ink: '#7E22CE' },
];

/** Two letters: first letters of the first two words, or the first two letters of a single word. */
export const twoLetterInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
    return letters.toUpperCase();
};

/**
 * An organisation's (or personal account's) picture: its logo / profile photo when it has one,
 * otherwise two-letter initials on a soft colour (stable per name).
 */
export const OrgAvatar: React.FC<{ name: string; url?: string | null; size?: number }> = ({ name, url, size = 36 }) => {
    const [failed, setFailed] = useState(false);
    const tint = TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
    const round = { width: size, height: size, borderRadius: size / 2 };
    if (url && !failed) {
        return <Image source={{ uri: url }} onError={() => setFailed(true)} style={[round, { backgroundColor: '#F1F5F9' }]} />;
    }
    return (
        <View style={[styles.box, round, { backgroundColor: tint.bg }]}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.36, color: tint.ink }}>{twoLetterInitials(name)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
