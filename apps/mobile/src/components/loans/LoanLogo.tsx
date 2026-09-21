import { Image, View, StyleSheet } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { colors } from '../../theme/tokens';

const LOGOS: Record<string, any> = {
    unifi: require('../../../assets/loan-logos/unifi.jpeg'),
    lolc: require('../../../assets/loan-logos/lolc.jpg'),
    finca: require('../../../assets/loan-logos/finca.png'),
    agora: require('../../../assets/loan-logos/agora.png'),
    bayport: require('../../../assets/loan-logos/bayport.jpeg'),
    mfz: require('../../../assets/loan-logos/microfinance-zambia.jpeg'),
};

export const LoanLogo: React.FC<{ logo: string | null; orgLogoUrl?: string | null; size: number }> = ({ logo, orgLogoUrl, size }) => {
    if (logo && LOGOS[logo]) {
        return <Image source={LOGOS[logo]} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" />;
    }
    if (orgLogoUrl) {
        return <Image source={{ uri: orgLogoUrl }} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" />;
    }
    return (
        <View style={[styles.fallback, { width: size, height: size }]}>
            <Building2 size={size * 0.5} color={colors.blue} />
        </View>
    );
};

const styles = StyleSheet.create({
    fallback: { alignItems: 'center', justifyContent: 'center' },
});
