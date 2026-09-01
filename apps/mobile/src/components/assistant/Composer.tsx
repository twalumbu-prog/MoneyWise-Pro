import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { ArrowUp, Square } from 'lucide-react-native';
import { colors, fonts } from '../../theme/tokens';

/**
 * Matches the web composer's actual shape: one rounded card with the textarea
 * on top and a control row underneath, not a pill input beside a circular
 * send button. Model picker, attach and mic sit on that bottom row on web;
 * this app has none of those yet, so the row is just the send/stop control,
 * kept in the same position so the card reads as the same component.
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
        <View style={styles.card}>
            <TextInput
                style={styles.input}
                value={value}
                onChangeText={onChange}
                placeholder="Ask about your finances, or ask me to make a change…"
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={4000}
            />
            <View style={styles.controlRow}>
                <View style={{ flex: 1 }} />
                {busy ? (
                    <Pressable style={[styles.send, styles.stop]} onPress={onStop} accessibilityLabel="Stop generating">
                        <Square size={13} color="#FFFFFF" fill="#FFFFFF" />
                    </Pressable>
                ) : (
                    <Pressable
                        style={[styles.send, !canSend && styles.sendDisabled]}
                        onPress={onSend}
                        disabled={!canSend}
                        accessibilityLabel="Send"
                    >
                        <ArrowUp size={17} color="#FFFFFF" />
                    </Pressable>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 16, marginTop: 8,
        borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
        backgroundColor: colors.surface,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    input: {
        fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 21,
        paddingHorizontal: 18, paddingTop: 15, paddingBottom: 6, maxHeight: 140,
    },
    controlRow: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2,
    },
    send: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue,
        alignItems: 'center', justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.3 },
    stop: { backgroundColor: colors.navy },
});
