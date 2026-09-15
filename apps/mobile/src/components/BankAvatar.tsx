import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getLocalLogoKey, getBankLogoUrls, getBankColor, getBankInitials } from '../data/bankLogos';

/** Bundled bank logos — a bank with none of these falls through to the remote/initials chain. */
const LOCAL_LOGOS: Record<string, any> = {
    zanaco: require('../../assets/bank-logos/zanaco.png'),
    absa: require('../../assets/bank-logos/absa.webp'),
    fnb: require('../../assets/bank-logos/fnb.png'),
    'access-bank': require('../../assets/bank-logos/access-bank.png'),
    'bank-of-china': require('../../assets/bank-logos/bank-of-china.png'),
    'first-alliance': require('../../assets/bank-logos/first-alliance.png'),
    'first-capital': require('../../assets/bank-logos/first-capital.png'),
    natsave: require('../../assets/bank-logos/natsave.png'),
    znbs: require('../../assets/bank-logos/znbs.png'),
    'ab-bank': require('../../assets/bank-logos/ab-bank.jpeg'),
};

/**
 * Native port of web's BankAvatar: bundled logo first, then a chain of
 * remote URLs (Clearbit, Google favicon) tried in order via onError, and
 * finally a coloured initials badge that always renders.
 */
export const BankAvatar: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => {
    const localKey = getLocalLogoKey(name);
    const remoteUrls = getBankLogoUrls(name);
    const [urlIndex, setUrlIndex] = useState(0);

    const boxStyle = { width: size, height: size, borderRadius: 6 };

    if (localKey && LOCAL_LOGOS[localKey]) {
        return (
            <View style={[styles.imageBox, boxStyle]}>
                <Image source={LOCAL_LOGOS[localKey]} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" />
            </View>
        );
    }

    if (remoteUrls.length > 0 && urlIndex < remoteUrls.length) {
        return (
            <View style={[styles.imageBox, boxStyle]}>
                <Image
                    source={{ uri: remoteUrls[urlIndex] }}
                    style={{ width: size - 4, height: size - 4 }}
                    resizeMode="contain"
                    onError={() => setUrlIndex((i) => i + 1)}
                />
            </View>
        );
    }

    const color = getBankColor(name);
    const initials = getBankInitials(name);
    const fontSize = size <= 20 ? 7 : size <= 28 ? 9 : 11;

    return (
        <View style={[boxStyle, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#FFFFFF', fontSize, fontWeight: '800', letterSpacing: -0.2 }}>{initials}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    imageBox: {
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
});
