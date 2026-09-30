import { Image, StyleSheet } from 'react-native';

const LOGOS: Record<string, any> = {
    longhorn: require('../../../assets/invest-logos/longhorn.jpeg'),
    hobbiton: require('../../../assets/invest-logos/hobbiton.png'),
    aflife: require('../../../assets/invest-logos/aflife.png'),
    abc: require('../../../assets/invest-logos/abc.jpeg'),
};

// Real investment targets carry their organization's uploaded logo as a URL;
// the demo catalog uses the bundled files above, keyed by name.
const sourceFor = (logo: string) => (/^https?:\/\//.test(logo) ? { uri: logo } : LOGOS[logo]);

export const InvestLogo: React.FC<{ logo: string; size: number }> = ({ logo, size }) => (
    <Image source={sourceFor(logo)} style={[styles.img, { width: size, height: size }]} resizeMode="contain" />
);

const styles = StyleSheet.create({ img: { borderRadius: 8 } });
