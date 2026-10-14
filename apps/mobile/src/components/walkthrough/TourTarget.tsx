import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { registerTarget, tour } from '../../lib/tour';

/**
 * Wrap an element to make it something the walkthrough can highlight. It adds no visual change and does not take
 * part in touch handling, so the element behaves exactly as before; the tour only reads its position and notices
 * when it is pressed.
 */
export const TourTarget: React.FC<{ id: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ id, children, style }) => {
    const ref = useRef<View>(null);
    useEffect(() => (ref.current ? registerTarget(id, ref.current) : undefined), [id]);
    return (
        <View ref={ref} collapsable={false} style={style} onTouchEnd={() => tour.tapped(id)}>
            {children}
        </View>
    );
};
