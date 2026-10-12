import { useMemo } from 'react';
import { Linking, Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, fonts, radius } from '../../theme/tokens';

/**
 * While an answer is still streaming, a half-written marker ("**Total spen") would flash as raw asterisks.
 * Close any dangling bold / inline-code / fence so the text renders cleanly at every moment.
 */
export function closeDanglingMarkdown(text: string): string {
    let out = text;
    if ((out.match(/```/g) || []).length % 2 === 1) out += '\n```';
    else {
        const withoutFences = out.replace(/```[\s\S]*?```/g, '');
        if ((withoutFences.match(/`/g) || []).length % 2 === 1) out += '`';
        if ((withoutFences.replace(/`[^`]*`/g, '').match(/\*\*/g) || []).length % 2 === 1) out += '**';
    }
    return out;
}

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Renders the assistant's Markdown (bold, lists, headings, tables, code, links) in the app's typography. */
export const AssistantMarkdown: React.FC<{ content: string; streaming?: boolean }> = ({ content, streaming }) => {
    const text = useMemo(() => (streaming ? closeDanglingMarkdown(content) : content), [content, streaming]);
    return (
        <Markdown
            style={mdStyles}
            onLinkPress={(url) => { Linking.openURL(url).catch(() => undefined); return false; }}
        >
            {text}
        </Markdown>
    );
};

// Custom fonts have no synthetic bold/italic: each weight must name its own font family.
const mdStyles = {
    body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontFamily: fonts.bodyBold, fontWeight: 'normal' as const, color: colors.text },
    em: { fontFamily: fonts.body, fontStyle: 'italic' as const },
    s: { textDecorationLine: 'line-through' as const },
    heading1: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24, marginTop: 6, marginBottom: 8, color: colors.text },
    heading2: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, marginTop: 6, marginBottom: 6, color: colors.text },
    heading3: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: 4, color: colors.text },
    heading4: { fontFamily: fonts.bodyBold, fontSize: 14, marginTop: 4, marginBottom: 4, color: colors.text },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginBottom: 3 },
    bullet_list_icon: { color: colors.textMuted, marginRight: 8, marginTop: 0 },
    ordered_list_icon: { color: colors.textMuted, fontFamily: fonts.bodyBold, marginRight: 8 },
    link: { color: colors.blue, textDecorationLine: 'underline' as const },
    blockquote: { backgroundColor: colors.canvasAlt, borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingHorizontal: 10, paddingVertical: 2, marginVertical: 6 },
    code_inline: { fontFamily: mono, fontSize: 13, backgroundColor: colors.canvasAlt, color: colors.navy, paddingHorizontal: 4, borderRadius: 4 },
    code_block: { fontFamily: mono, fontSize: 12.5, backgroundColor: colors.canvasAlt, padding: 10, borderRadius: radius.md, borderWidth: 0, marginVertical: 6 },
    fence: { fontFamily: mono, fontSize: 12.5, backgroundColor: colors.canvasAlt, padding: 10, borderRadius: radius.md, borderWidth: 0, marginVertical: 6 },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginVertical: 6 },
    thead: { backgroundColor: colors.canvasAlt },
    th: { fontFamily: fonts.bodyBold, padding: 7, fontSize: 13 },
    td: { padding: 7, fontSize: 13 },
    tr: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' as const },
};
