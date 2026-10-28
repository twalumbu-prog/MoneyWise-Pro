import { StyleSheet } from 'react-native';
import { colors, fonts } from '../../../theme/tokens';

/** Every slide sits in the same minimum height so the card doesn't jump as it moves between them. */
export const SLIDE_MIN_HEIGHT = 96;

export const slideStyles = StyleSheet.create({
    centre: { minHeight: SLIDE_MIN_HEIGHT - 8, alignItems: 'center', justifyContent: 'center', gap: 6 },
    empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },
    emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#000000', textAlign: 'center' },
    track: { height: 6, backgroundColor: '#E5E5E5', borderRadius: 12, overflow: 'hidden' },
    fill: { height: 6, backgroundColor: '#3B82F6', borderRadius: 60 },
});
