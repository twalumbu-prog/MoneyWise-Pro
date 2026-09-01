import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { ArrowUp, Square } from 'lucide-react-native';
import { colors, radius, fonts } from '../../theme/tokens';

/**
 * Text-only for now: the web composer also supports voice capture and a bank
 * statement attachment, both of which land with camera/audio work in a later
 * phase. Text is the primary path either way.
 */
export const Composer: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop?: () => void;
    busy: boolean;
}> = ({ value, onChange, onSend, onStop, busy }) => {
    const canSend = value.trim().length > 0 && !busy;

    return (
        <View style={styles.root}>
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                placeholder="Ask about your finances…"
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={4000}
            />
            {busy ? (
                <Pressable style={[styles.send, styles.stop]} onPress={onStop} accessibilityLabel="Stop generating">
                    <Square size={14} color="#FFFFFF" fill="#FFFFFF" />
                </Pressable>
            ) : (
                <Pressable
                    style={[styles.send, !canSend && styles.sendDisabled]}
                    onPress={onSend}
                    disabled={!canSend}
                    accessibilityLabel="Send"
                >
                    <ArrowUp size={18} color="#FFFFFF" />
                </Pressable>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 16, paddingTop: 10,
    },
    input: {
        flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, maxHeight: 120,
        backgroundColor: colors.canvasAlt, borderRadius: radius.lg,
        paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border,
    },
    send: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.35 },
    stop: { backgroundColor: colors.navy },
});
