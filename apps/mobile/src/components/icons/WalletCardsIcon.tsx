import Svg, { Path, Rect } from 'react-native-svg';
import { StyleProp, ViewStyle } from 'react-native';

/** lucide's "wallet-cards" icon — the correct Wallet tab icon (not lucide's plain "wallet"). */
export const WalletCardsIcon: React.FC<{ color?: string; size?: number; style?: StyleProp<ViewStyle> }> = ({ color = 'currentColor', size = 24, style }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <Path d="M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21" />
        <Path d="M3 7h18" />
        <Rect x={3} y={3} width={18} height={18} rx={2} />
    </Svg>
);
