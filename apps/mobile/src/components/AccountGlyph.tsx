import { Image, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { extractEmojiAndName, getAccountEmoji } from '../utils/emoji';

/**
 * The MoneyWise stroke mark (same paths as apps/web/public/logo-mark.svg).
 * Used for wallet accounts instead of the generic card emoji.
 */
export const MoneyWiseMark: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = '#000' }) => (
    <Svg width={size * (26 / 18)} height={size} viewBox="0 0 26 18" fill="none">
        <Path
            d="M2.85474 12.4959L6.10299 4.53705C6.78008 2.87804 9.12932 2.87804 9.80642 4.53705L11.203 7.95881C11.88 9.61782 14.2293 9.61782 14.9064 7.95881L16.3029 4.53705C16.98 2.87804 19.3293 2.87804 20.0063 4.53705L23.2546 12.4959"
            stroke={color} strokeWidth={2.5} strokeLinecap="round"
        />
        <Path d="M25 9.46973L19.3273 9.46973" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path d="M6.5636 9.4707H1" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
);

const isWallet = (name: string) => /\b(wallet|main)\b/i.test(name);

/**
 * The leading glyph for an account row, in priority order: the account's own
 * logo (e.g. a company invested in) → an emoji the user chose → the MoneyWise
 * mark for wallets → the keyword/type emoji fallback.
 */
export const AccountGlyph: React.FC<{ name: string; type?: string; logoUrl?: string | null; size?: number }> = ({
    name, type, logoUrl, size = 16,
}) => {
    if (logoUrl) {
        return <Image source={{ uri: logoUrl }} style={{ width: size + 4, height: size + 4, borderRadius: 6 }} resizeMode="contain" />;
    }
    const { emoji } = extractEmojiAndName(name);
    if (!emoji && isWallet(name)) return <MoneyWiseMark size={size} />;
    return <Text style={{ fontSize: size }}>{emoji || getAccountEmoji(name, type)}</Text>;
};
