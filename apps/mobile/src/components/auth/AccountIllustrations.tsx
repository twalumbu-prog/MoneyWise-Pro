import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Circle, Path, G, Ellipse } from 'react-native-svg';

/**
 * Small flat illustrations for the "Personal or Pro?" choice, drawn in code (no image files): a wallet spilling coins for
 * your own money, a striped-awning shop with a paid badge for a business. Soft shapes, two or three colours each,
 * sitting on a tinted rounded tile.
 */
const NAVY = '#0B2A5B';
const BLUE = '#006AFF';
const BLUE_DEEP = '#0050C8';
const GOLD = '#FFC83D';
const GOLD_DEEP = '#E9A400';

/** A wallet with a card peeking out the top, a coin stack, and a sparkle. */
export function PersonalArt({ size = 72 }: { size?: number }) {
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#E4EEFF', overflow: 'hidden' }}>
            <Svg width={size} height={size} viewBox="0 0 72 72">
                {/* ground shadow */}
                <Ellipse cx={36} cy={62} rx={22} ry={3.2} fill={NAVY} opacity={0.1} />
                {/* a card tucked behind the wallet */}
                <G rotation={-9} origin="30, 28">
                    <Rect x={17} y={17} width={30} height={20} rx={4} fill="#9CC4FF" />
                    <Rect x={17} y={22} width={30} height={4} fill="#6FA6FF" />
                    <Rect x={21} y={30} width={10} height={2.6} rx={1.3} fill="#FFFFFF" opacity={0.85} />
                </G>
                {/* coin stack */}
                <Ellipse cx={55} cy={43} rx={7} ry={2.6} fill={GOLD_DEEP} />
                <Rect x={48} y={37} width={14} height={6} fill={GOLD} />
                <Ellipse cx={55} cy={37} rx={7} ry={2.6} fill="#FFE08A" />
                <Ellipse cx={55} cy={34} rx={7} ry={2.6} fill={GOLD_DEEP} />
                <Rect x={48} y={28} width={14} height={6} fill={GOLD} />
                <Ellipse cx={55} cy={28} rx={7} ry={2.6} fill="#FFE08A" />
                {/* wallet */}
                <Rect x={9} y={30} width={46} height={29} rx={8} fill={BLUE} />
                <Path d="M9 38 a8 8 0 0 1 8 -8 h30 a8 8 0 0 1 8 8 v1 H9 Z" fill={BLUE_DEEP} opacity={0.55} />
                <Rect x={38} y={39} width={21} height={12} rx={6} fill="#FFFFFF" />
                <Circle cx={45} cy={45} r={2.8} fill={BLUE} />
                {/* sparkle */}
                <Path d="M60 12 l1.7 4.3 4.3 1.7 -4.3 1.7 -1.7 4.3 -1.7 -4.3 -4.3 -1.7 4.3 -1.7 Z" fill={GOLD} />
                <Circle cx={14} cy={14} r={2} fill="#FFFFFF" />
            </Svg>
        </View>
    );
}

/** A little shop: scalloped striped awning, door and window, with a green "paid" badge. */
export function ProArt({ size = 72 }: { size?: number }) {
    const stripes = [0, 1, 2, 3, 4, 5];
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#FFEBD6', overflow: 'hidden' }}>
            <Svg width={size} height={size} viewBox="0 0 72 72">
                {/* ground shadow */}
                <Ellipse cx={36} cy={62} rx={26} ry={3.2} fill={NAVY} opacity={0.1} />
                {/* building */}
                <Rect x={12} y={30} width={48} height={30} rx={3} fill="#FFFFFF" />
                <Rect x={12} y={30} width={48} height={30} rx={3} fill="none" stroke="#F0D5BC" strokeWidth={1.2} />
                {/* door */}
                <Rect x={17} y={39} width={14} height={21} rx={2.5} fill={NAVY} />
                <Circle cx={28} cy={50} r={1.3} fill={GOLD} />
                {/* window with a little awning-lit glow */}
                <Rect x={37} y={39} width={18} height={13} rx={2.5} fill="#D7E8FF" stroke={NAVY} strokeWidth={1.6} />
                <Path d="M37 46 H55" stroke={NAVY} strokeWidth={1.2} opacity={0.5} />
                {/* awning stripes, then scallops */}
                {stripes.map((i) => (
                    <Rect key={`s${i}`} x={10 + i * 8.7} y={17} width={8.7} height={13} fill={i % 2 === 0 ? '#FF7A1A' : '#FFFFFF'} />
                ))}
                <Rect x={10} y={17} width={52} height={13} rx={3} fill="none" stroke="#F0D5BC" strokeWidth={1.2} />
                {stripes.map((i) => (
                    <Circle key={`c${i}`} cx={14.35 + i * 8.7} cy={30} r={4.35} fill={i % 2 === 0 ? '#FF7A1A' : '#FFFFFF'} stroke="#F0D5BC" strokeWidth={1.2} />
                ))}
                {/* roof lip */}
                <Rect x={8} y={13} width={56} height={5} rx={2.5} fill={NAVY} />
                {/* paid badge */}
                <Circle cx={58} cy={14} r={8} fill="#03D47C" />
                <Circle cx={58} cy={14} r={8} fill="none" stroke="#FFFFFF" strokeWidth={2} />
                <Path d="M54.2 14.2 l2.7 2.7 l5 -5.3" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
        </View>
    );
}
