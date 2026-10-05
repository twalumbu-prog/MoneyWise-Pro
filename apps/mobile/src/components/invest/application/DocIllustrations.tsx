import Svg, { Rect, Circle, Path, Line, G, Ellipse } from 'react-native-svg';

/**
 * Generic line illustrations showing what each document should look like. They're
 * deliberately not any real ID: shapes and bars only, so nobody mistakes them for a sample.
 */
export type DocIllustrationKind =
    | 'nrc-front' | 'nrc-back' | 'passport' | 'licence-front' | 'licence-back' | 'photo' | 'residence';

const INK = '#94A3B8';      // outlines
const SOFT = '#CBD5E1';     // text bars
const FILL = '#F1F5F9';     // card body
const ACCENT = '#006AFF';   // brand accent
const GREEN = '#03D47C';

const Bars: React.FC<{ x: number; y: number; widths: number[]; gap?: number; color?: string }> = ({ x, y, widths, gap = 12, color = SOFT }) => (
    <G>
        {widths.map((w, i) => (
            <Rect key={i} x={x} y={y + i * gap} width={w} height={5} rx={2.5} fill={color} />
        ))}
    </G>
);

const Person: React.FC<{ x: number; y: number; w: number; h: number }> = ({ x, y, w, h }) => (
    <G>
        <Rect x={x} y={y} width={w} height={h} rx={6} fill="#E2E8F0" stroke={INK} strokeWidth={1.2} />
        <Circle cx={x + w / 2} cy={y + h * 0.38} r={w * 0.2} fill={INK} />
        <Path d={`M ${x + w * 0.16} ${y + h} Q ${x + w / 2} ${y + h * 0.5} ${x + w * 0.84} ${y + h} Z`} fill={INK} />
    </G>
);

export const DocIllustration: React.FC<{ kind: DocIllustrationKind; width?: number }> = ({ kind, width = 280 }) => {
    const height = kind === 'photo' ? width * 0.72 : kind === 'residence' ? width * 0.78 : kind === 'passport' ? width * 0.7 : width * 0.63;
    const vb = kind === 'photo' ? '0 0 280 202' : kind === 'residence' ? '0 0 280 218' : kind === 'passport' ? '0 0 280 196' : '0 0 280 176';

    return (
        <Svg width={width} height={height} viewBox={vb}>
            {(kind === 'nrc-front' || kind === 'licence-front') && (
                <G>
                    <Rect x={4} y={4} width={272} height={168} rx={14} fill={FILL} stroke={INK} strokeWidth={1.5} />
                    <Rect x={4} y={4} width={272} height={34} rx={14} fill={kind === 'nrc-front' ? GREEN : ACCENT} opacity={0.9} />
                    <Rect x={4} y={24} width={272} height={14} fill={kind === 'nrc-front' ? GREEN : ACCENT} opacity={0.9} />
                    <Bars x={90} y={14} widths={[100]} color="#FFFFFF" />
                    <Person x={22} y={54} w={70} h={86} />
                    <Bars x={108} y={58} widths={[120, 90, 110, 70, 100]} gap={17} />
                    <Rect x={22} y={150} width={90} height={5} rx={2.5} fill={SOFT} />
                </G>
            )}
            {(kind === 'nrc-back' || kind === 'licence-back') && (
                <G>
                    <Rect x={4} y={4} width={272} height={168} rx={14} fill={FILL} stroke={INK} strokeWidth={1.5} />
                    <Rect x={4} y={22} width={272} height={30} fill="#E2E8F0" />
                    <Bars x={22} y={70} widths={[150, 120, 170, 100]} gap={16} />
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((i) => (
                        <Line key={i} x1={26 + i * 11} y1={140} x2={26 + i * 11} y2={158} stroke={INK} strokeWidth={i % 3 === 0 ? 3 : 1.5} />
                    ))}
                </G>
            )}
            {kind === 'passport' && (
                <G>
                    <Rect x={4} y={4} width={272} height={188} rx={12} fill={FILL} stroke={INK} strokeWidth={1.5} />
                    <Line x1={140} y1={4} x2={140} y2={120} stroke={SOFT} strokeWidth={1} strokeDasharray="4 4" />
                    <Person x={22} y={26} w={70} h={86} />
                    <Bars x={108} y={30} widths={[130, 100, 120, 90]} gap={16} />
                    <Rect x={14} y={142} width={252} height={38} rx={4} fill="#E2E8F0" />
                    <Bars x={22} y={150} widths={[236, 236]} gap={14} color={INK} />
                </G>
            )}
            {kind === 'photo' && (
                <G>
                    <Rect x={70} y={4} width={140} height={178} rx={10} fill={FILL} stroke={INK} strokeWidth={1.5} />
                    <Circle cx={140} cy={70} r={30} fill="#E2E8F0" stroke={INK} strokeWidth={1.5} />
                    <Path d="M 82 178 Q 82 110 140 110 Q 198 110 198 178 Z" fill="#E2E8F0" stroke={INK} strokeWidth={1.5} />
                    <Path d="M 78 14 L 78 30 M 78 14 L 94 14 M 202 14 L 202 30 M 202 14 L 186 14" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" fill="none" />
                    <Ellipse cx={140} cy={192} rx={42} ry={5} fill={SOFT} opacity={0.6} />
                </G>
            )}
            {kind === 'residence' && (
                <G>
                    <Rect x={40} y={4} width={200} height={208} rx={10} fill="#FFFFFF" stroke={INK} strokeWidth={1.5} />
                    <Rect x={40} y={4} width={200} height={34} rx={10} fill={ACCENT} opacity={0.9} />
                    <Rect x={40} y={24} width={200} height={14} fill={ACCENT} opacity={0.9} />
                    <Bars x={54} y={16} widths={[70]} color="#FFFFFF" />
                    <Bars x={54} y={54} widths={[110, 90]} gap={14} />
                    <Rect x={54} y={92} width={172} height={52} rx={6} fill={FILL} stroke={SOFT} strokeWidth={1} />
                    <Bars x={64} y={102} widths={[80, 120, 60]} gap={14} />
                    <Bars x={54} y={160} widths={[150, 130, 100]} gap={14} />
                    <Rect x={170} y={184} width={56} height={14} rx={7} fill={GREEN} opacity={0.8} />
                </G>
            )}
        </Svg>
    );
};
