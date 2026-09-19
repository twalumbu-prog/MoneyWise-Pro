import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * Native port of the icon box in apps/web/src/pages/Menu.tsx's
 * OtherServiceButton: an alternating blue->white gradient outer square, a
 * white border spacer, then the OPPOSITE gradient direction on the inner
 * square, with a soft drop shadow. Web also overlays a fractalNoise SVG
 * filter for grain texture — react-native-svg has no filter primitives
 * (feTurbulence/feColorMatrix/feBlend aren't implemented), so that grain is
 * the one thing this can't reproduce; the gradient + shadow treatment itself
 * is exact.
 */
export const OtherServiceIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View style={{ width: 64, height: 64 }}>
        <Svg width={64} height={64} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
            <Defs>
                <LinearGradient id="outerGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor="#006AFF" />
                    <Stop offset="100%" stopColor="#FFFFFF" />
                </LinearGradient>
                <LinearGradient id="innerGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor="#006AFF" />
                    <Stop offset="100%" stopColor="#FFFFFF" />
                </LinearGradient>
            </Defs>
            <Rect x={6} y={7} width={52} height={52} rx={16} fill="rgba(0,0,0,0.12)" />
            <Rect x={4} y={4} width={56} height={56} rx={16} fill="url(#outerGrad)" />
            <Rect x={9} y={9} width={46} height={46} rx={12} fill="#FFFFFF" />
            <Rect x={9} y={9} width={46} height={46} rx={12} fill="url(#innerGrad)" />
        </Svg>
        <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
            {children}
        </View>
    </View>
);
