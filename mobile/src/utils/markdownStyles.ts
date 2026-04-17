import type { ThemeColors } from '../theme/ThemeContext';

/**
 * 生成 Markdown 渲染样式，BBTalkCard 和 ComposeScreen 预览共用。
 * 接收当前主题配色，自动适配 light / dark / 自定义主题。
 */
export function getMarkdownStyles(colors: ThemeColors): Record<string, any> {
  return {
    body: { fontSize: 15, lineHeight: 24, color: colors.text },
    heading1: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: 8 },
    heading2: { fontSize: 19, fontWeight: '700', color: colors.text, marginVertical: 6 },
    heading3: { fontSize: 17, fontWeight: '600', color: colors.text, marginVertical: 4 },
    strong: { fontWeight: '700' },
    em: { fontStyle: 'italic' },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
      paddingLeft: 12,
      marginVertical: 6,
      backgroundColor: colors.borderLight,
      borderRadius: 4,
      padding: 8,
    },
    code_inline: {
      backgroundColor: colors.borderLight,
      color: '#DC2626',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      fontSize: 14,
    },
    fence: {
      backgroundColor: colors.borderLight,
      padding: 12,
      borderRadius: 8,
      marginVertical: 6,
      fontSize: 13,
    },
    code_block: {
      backgroundColor: colors.borderLight,
      padding: 12,
      borderRadius: 8,
      marginVertical: 6,
      fontSize: 13,
    },
    link: { color: colors.primary, textDecorationLine: 'underline' },
    list_item: { marginVertical: 2 },
    paragraph: { marginVertical: 2 },
  };
}
