import { View, Text, Image, StyleSheet } from 'react-native';
import { fonts } from '../../theme/tokens';

const TINTS = [
    { bg: '#E0E7FF', ink: '#4338CA' }, { bg: '#FFE4E6', ink: '#BE123C' }, { bg: '#DCFCE7', ink: '#15803D' },
    { bg: '#FEF3C7', ink: '#B45309' }, { bg: '#E0F2FE', ink: '#0369A1' }, { bg: '#F3E8FF', ink: '#7E22CE' },
];

const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/**
 * A person's picture: their MoneyWise account's logo/photo when they have one, otherwise
 * their initials on a soft colour (stable per person, so the same name always looks the same).
 */
export const PersonAvatar: React.FC<{ name: string; url?: string | null; size?: number }> = ({ name, url, size = 38 }) => {
    const tint = TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
    if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#F1F5F9' }} />;
    return (
        <View style={[styles.box, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg }]}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.36, color: tint.ink }}>{initials(name)}</Text>
        </View>
    );
};

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
