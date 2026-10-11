import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/tokens';

/** iOS number pads and multi-line fields have no Return key. Point an input's `inputAccessoryViewID` here to get a Done bar. */
export const KB_DONE_ID = 'kbDone';

/** Mount once (root layout). Renders nothing on Android, where the back gesture closes the keyboard. */
export const KeyboardDoneBar: React.FC = () => {
    if (Platform.OS !== 'ios') return null;
    return (
        <InputAccessoryView nativeID={KB_DONE_ID}>
            <View style={styles.bar}>
                <Pressable onPress={Keyboard.dismiss} hitSlop={10} accessibilityLabel="Hide keyboard">
                    <Text style={styles.done}>Done</Text>
                </Pressable>
            </View>
        </InputAccessoryView>
    );
};

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: colors.canvasAlt, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    },
    done: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
});
