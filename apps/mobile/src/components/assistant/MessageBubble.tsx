import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { Widget } from 'core';
import { WidgetView } from './WidgetView';
import { AssistantMarkdown } from './AssistantMarkdown';
import { colors, fonts, radius } from '../../theme/tokens';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    widgets: Widget[];
    streaming?: boolean;
    activity?: 'thinking' | 'working';
}

export const MessageBubble: React.FC<{ message: ChatMessage; onChoose?: (reply: string) => void }> = ({ message, onChoose }) => {
    const isUser = message.role === 'user';
    const showTyping = message.streaming && !message.content;

    return (
        <View style={[styles.row, isUser && styles.rowUser]}>
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
                {showTyping ? (
                    <View style={styles.typing}>
                        <ActivityIndicator size="small" color={colors.textFaint} />
                        <Text style={styles.typingText}>
                            {message.activity === 'working' ? 'Working…' : 'Thinking…'}
                        </Text>
                    </View>
                ) : (
                    isUser
                        ? <Text style={[styles.text, styles.textUser]}>{message.content}</Text>
                        : <AssistantMarkdown content={message.content} streaming={message.streaming} />
                )}
            </View>
            {message.widgets.map((w, i) => <WidgetView key={i} widget={w} onChoose={onChoose} />)}
        </View>
    );
};

const styles = StyleSheet.create({
    row: { marginVertical: 6, alignItems: 'flex-start' },
    rowUser: { alignItems: 'flex-end' },
    bubble: { borderRadius: radius.lg, paddingHorizontal: 15, paddingVertical: 11, maxWidth: '85%' },
    bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    bubbleUser: { backgroundColor: colors.blue },
    text: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
    textUser: { color: '#FFFFFF' },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typingText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
});
