/**
 * 受限 Markdown 渲染：markdown-it 解析 → 本项目 Text / View / Image
 * 安全子集：标题(h1-6)/粗斜体/删除线/列表/行内 code/代码块/引用/hr/http(s) 链接/http(s)·data:image 图片
 * 不注入 HTML、不用 WebView、不执行脚本；链接/图片仅限协议白名单（http(s)·data:image）；纯 UI（外链经 onOpenLink 注入）
 */
import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
    borderWidth,
    opacity,
    radius,
    space,
    useColors,
    type Colors,
} from '@/design';
import { useT } from '@/i18n';

import { Icon } from './Icon';
import { Image } from './Image';
import { Text } from './Text';

// html:false → 原始 HTML 当纯文本、不执行；linkify:false → 不自动把裸文本转链接
// （<url> autolink 仍启用，产出的链接照样过 http(s) 白名单）
const md = new MarkdownIt({ html: false, linkify: false, typographer: true });
// 表格不在子集：禁用后退化为纯文本，而非解析后被 renderer 丢弃（吞正文）
md.disable(['table']);
// CommonMark 判定「中文标点 + ** + 中文字符」的收尾标记不能闭合，
// 于是 `…距离。**如果…` 这类写法加粗失效、星号原样外泄；插件按 CJK 扩展规则放行
md.use(cjkFriendly);

// Token 类型从 parse 返回值反取，免依赖 @types 具名/子模块导出差异
type Token = ReturnType<typeof md.parse>[number];

// 资源预算：挡病态超长/超宽说明拖垮解析与渲染（节点爆炸）
const MAX_SOURCE_LENGTH = 64 * 1024;
const MAX_IMAGES = 30;
const MAX_DATA_URI_LENGTH = 256 * 1024;
// 每容器块/项上限（配合 source 截断压低常见病态渲染量；非精确全局节点预算）
const MAX_BLOCKS = 500;
const MAX_LIST_ITEMS = 200;
// NBSP：给行内 code 两侧留白（RN 嵌套 Text 无法用 padding）
const INLINE_CODE_PAD = String.fromCharCode(160);

/** 外链是否放行：仅 http(s) */
function isAllowedLinkUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

/**
 * 图片源是否放行：data:image（限长）或 http(s)
 * 加载结果/响应不回传插件（onLoad/onError 仅用于定尺寸/隐藏），未做本机/内网过滤——
 * 插件沙箱本就注入 axios（能直接读响应发更强请求），故此处只限协议 + 资源预算
 */
function isAllowedImageUrl(url: string): boolean {
    if (/^data:image\//i.test(url)) {
        return url.length <= MAX_DATA_URI_LENGTH;
    }
    return /^https?:\/\//i.test(url);
}

interface RenderContext {
    colors: Colors;
    /** 打开外链；由消费方注入（Linking/infra）；不给则链接不可点 */
    onOpenLink?: (href: string) => void;
    /** 链接的读屏提示（如「将在其他应用中打开」）；由消费方按自身跳转行为注入 */
    linkAccessibilityHint?: string;
    /** 已渲染图片数（跨段共享，用于 MAX_IMAGES 上限） */
    imageBudget: { count: number };
    /** 是否直接展示图片；false 时图片先渲染为可点的「点击展示图片」占位框 */
    showImages: boolean;
    /** 引用内：正文走 textSecondary */
    muted?: boolean;
}

interface MdNode {
    type: string;
    token: Token;
    children: MdNode[];
}

/** 扁平 token 流（靠 nesting 标记开合）→ 嵌套树 */
function buildTree(tokens: Token[]): MdNode[] {
    const roots: MdNode[] = [];
    const stack: MdNode[][] = [roots];
    for (const token of tokens) {
        if (token.nesting === -1) {
            stack.pop();
            continue;
        }
        // stack 恒非空（roots 兜底）；取顶层兼顾 noUncheckedIndexedAccess
        const top = stack[stack.length - 1];
        if (!top) {
            continue;
        }
        if (token.nesting === 1) {
            const node: MdNode = {
                type: token.type.replace(/_open$/, ''),
                token,
                children: [],
            };
            top.push(node);
            stack.push(node.children);
        } else {
            top.push({ type: token.type, token, children: [] });
        }
    }
    return roots;
}

/** 图片 alt：从 inline children 取纯文本（token.content 含 markdown 标记、不适合读屏） */
function imageAlt(token: Token): string {
    const children = token.children ?? [];
    if (children.length === 0) {
        return token.content;
    }
    return children
        .filter(child => child.type === 'text' || child.type === 'code_inline')
        .map(child => child.content)
        .join('');
}

/**
 * markdown 图片
 * showImages=false 时先渲染「点击展示图片」占位框，点开才挂载 Image 联网加载——未揭开不发请求，挡插件里的诱导图
 * 揭开后按 onLoad 的 intrinsic 比例撑正文宽；加载失败渲染可点击重试的失败框
 */
function MarkdownImage({
    src,
    alt,
    showImages,
}: {
    src: string;
    alt: string;
    showImages: boolean;
}) {
    const colors = useColors();
    const t = useT();
    // revealed = 用户手动点开的单图；showImages=true 时全部直接展示（模式切换即时生效）
    const [revealed, setRevealed] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<number>();
    const [failed, setFailed] = useState(false);
    const shown = showImages || revealed;

    // 未展示 = 点击展示；失败 = 点击重试；两态共用占位框
    if (!shown || failed) {
        const label = failed
            ? t('feedback.loadFailed')
            : t('markdown.clickToShowImage');
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={failed ? t('common.retry') : undefined}
                onPress={() => {
                    setFailed(false);
                    setRevealed(true);
                }}
                style={({ pressed }) => [
                    styles.imageBox,
                    {
                        backgroundColor: colors.surfaceVariant,
                        borderColor: colors.border,
                    },
                    pressed ? styles.imageBoxPressed : null,
                ]}
            >
                <Icon name="image" size="lg" color="textSecondary" />
                <Text size="sm" color="textSecondary">
                    {label}
                </Text>
            </Pressable>
        );
    }

    return (
        <Image
            source={src}
            accessibilityLabel={alt}
            contentFit="contain"
            onLoad={event => {
                const { width, height } = event.source;
                if (width > 0 && height > 0) {
                    const ratio = width / height;
                    if (Number.isFinite(ratio)) {
                        setAspectRatio(Math.min(5, Math.max(0.2, ratio)));
                    }
                }
            }}
            onError={() => setFailed(true)}
            style={[
                styles.image,
                aspectRatio
                    ? { aspectRatio }
                    : [
                          styles.imagePlaceholder,
                          { backgroundColor: colors.surfaceVariant },
                      ],
            ]}
        />
    );
}

/** 行内 token 树 → Text span 数组；图片抽成块级、收集进 images */
function renderSpans(
    nodes: MdNode[],
    ctx: RenderContext,
    keyBase: string,
    images: ReactNode[],
): ReactNode[] {
    return nodes.map((node, i) => {
        const key = `${keyBase}.${i}`;
        switch (node.type) {
            case 'text':
                return node.token.content;
            case 'softbreak':
                return ' ';
            case 'hardbreak':
                return '\n';
            case 'strong':
                return (
                    <Text
                        key={key}
                        weight="bold"
                        color={ctx.muted ? 'textSecondary' : 'text'}
                    >
                        {renderSpans(node.children, ctx, key, images)}
                    </Text>
                );
            case 'em':
                return (
                    <Text
                        key={key}
                        color={ctx.muted ? 'textSecondary' : 'text'}
                        style={styles.italic}
                    >
                        {renderSpans(node.children, ctx, key, images)}
                    </Text>
                );
            case 's':
                return (
                    <Text
                        key={key}
                        color={ctx.muted ? 'textSecondary' : 'text'}
                        style={styles.strikethrough}
                    >
                        {renderSpans(node.children, ctx, key, images)}
                    </Text>
                );
            case 'code_inline':
                return (
                    <Text
                        key={key}
                        size="sm"
                        weight="medium"
                        color="primary"
                        style={{ backgroundColor: ctx.colors.surfaceVariant }}
                    >
                        {`${INLINE_CODE_PAD}${node.token.content}${INLINE_CODE_PAD}`}
                    </Text>
                );
            case 'link': {
                const href = node.token.attrGet('href') ?? '';
                if (!ctx.onOpenLink || !isAllowedLinkUrl(href)) {
                    // 无 opener 或非 http(s)：只渲染文字、不可点
                    return (
                        <Text
                            key={key}
                            color={ctx.muted ? 'textSecondary' : 'text'}
                        >
                            {renderSpans(node.children, ctx, key, images)}
                        </Text>
                    );
                }
                const open = ctx.onOpenLink;
                return (
                    <Text
                        key={key}
                        color="onPrimarySoft"
                        style={styles.link}
                        accessibilityRole="link"
                        accessibilityHint={ctx.linkAccessibilityHint}
                        onPress={() => open(href)}
                    >
                        {renderSpans(node.children, ctx, key, images)}
                    </Text>
                );
            }
            case 'image': {
                const src = node.token.attrGet('src') ?? '';
                if (
                    isAllowedImageUrl(src) &&
                    ctx.imageBudget.count < MAX_IMAGES
                ) {
                    ctx.imageBudget.count += 1;
                    images.push(
                        <MarkdownImage
                            key={`${key}.img:${src}`}
                            src={src}
                            alt={imageAlt(node.token)}
                            showImages={ctx.showImages}
                        />,
                    );
                }
                return null;
            }
            default:
                return null;
        }
    });
}

/** 一个 inline 节点 → 段落 Text（+ 抽出的块级图片）；compact=紧凑段落（tight 列表/引用内不加块底距） */
function renderParagraph(
    inlineNode: MdNode | undefined,
    ctx: RenderContext,
    key: string,
    compact: boolean,
): ReactNode {
    const images: ReactNode[] = [];
    const spans = renderSpans(
        buildTree(inlineNode?.token.children ?? []),
        ctx,
        key,
        images,
    );
    const hasText = spans.some(span => span != null && span !== '');
    return (
        <Fragment key={key}>
            {hasText ? (
                <Text
                    lineHeight="relaxed"
                    color={ctx.muted ? 'textSecondary' : 'text'}
                    style={compact ? undefined : styles.block}
                >
                    {spans}
                </Text>
            ) : null}
            {images}
        </Fragment>
    );
}

function renderList(node: MdNode, ctx: RenderContext, key: string): ReactNode {
    const ordered = node.type === 'ordered_list';
    const startAttr = Number(node.token.attrGet('start') ?? '1');
    const start = Number.isFinite(startAttr) ? startAttr : 1;
    const markup = node.token.markup === ')' ? ')' : '.';
    const ordinalDigits = String(
        Math.max(start + node.children.length - 1, 1),
    ).length;
    const orderedWidth =
        ordinalDigits <= 2
            ? space.xl
            : ordinalDigits === 3
            ? space['2xl']
            : space['3xl'];
    return (
        <View key={key} style={styles.listBlock}>
            {node.children.slice(0, MAX_LIST_ITEMS).map((item, i) => (
                <View key={`${key}.${i}`} style={styles.listItem}>
                    <Text
                        color="textSecondary"
                        lineHeight="relaxed"
                        style={[
                            styles.listMarker,
                            ordered
                                ? [
                                      styles.listMarkerOrdered,
                                      { width: orderedWidth },
                                  ]
                                : styles.listMarkerBullet,
                        ]}
                    >
                        {ordered ? `${start + i}${markup}` : '•'}
                    </Text>
                    <View style={styles.listContent}>
                        {renderBlocks(item.children, ctx, `${key}.${i}`)}
                    </View>
                </View>
            ))}
        </View>
    );
}

function headingStyle(level: number) {
    if (level === 1) {
        return {
            size: '3xl',
            weight: 'bold',
            lineHeight: 'tight',
            style: styles.h1,
        } as const;
    }
    if (level === 2) {
        return {
            size: '2xl',
            weight: 'bold',
            lineHeight: 'tight',
            style: styles.h2,
        } as const;
    }
    if (level === 3) {
        return {
            size: 'xl',
            weight: 'bold',
            lineHeight: 'normal',
            style: styles.h3,
        } as const;
    }
    return {
        size: 'lg',
        weight: 'bold',
        lineHeight: 'normal',
        style: styles.h4,
    } as const;
}

/** 块级 token 树 → 组件 */
function renderBlocks(
    nodes: MdNode[],
    ctx: RenderContext,
    keyBase: string,
): ReactNode[] {
    return nodes.slice(0, MAX_BLOCKS).map((node, i) => {
        const key = `${keyBase}.${i}`;
        switch (node.type) {
            case 'heading': {
                const heading = headingStyle(Number(node.token.tag.slice(1)));
                const headingImages: ReactNode[] = [];
                const spans = renderSpans(
                    buildTree(node.children[0]?.token.children ?? []),
                    ctx,
                    key,
                    headingImages,
                );
                const hasText = spans.some(span => span != null && span !== '');
                return (
                    <Fragment key={key}>
                        {hasText ? (
                            <Text
                                size={heading.size}
                                weight={heading.weight}
                                lineHeight={heading.lineHeight}
                                style={[
                                    heading.style,
                                    i === 0 ? styles.firstBlock : null,
                                ]}
                            >
                                {spans}
                            </Text>
                        ) : null}
                        {headingImages}
                    </Fragment>
                );
            }
            case 'paragraph':
                return renderParagraph(
                    node.children[0],
                    ctx,
                    key,
                    node.token.hidden,
                );
            case 'bullet_list':
            case 'ordered_list':
                return renderList(node, ctx, key);
            case 'blockquote':
                return (
                    <View
                        key={key}
                        style={[
                            styles.blockquote,
                            { borderLeftColor: ctx.colors.border },
                        ]}
                    >
                        {renderBlocks(
                            node.children,
                            { ...ctx, muted: true },
                            key,
                        )}
                    </View>
                );
            case 'fence':
            case 'code_block':
                return (
                    <View
                        key={key}
                        style={[
                            styles.codeBlock,
                            { backgroundColor: ctx.colors.surfaceVariant },
                        ]}
                    >
                        <Text size="sm" lineHeight="normal">
                            {node.token.content.replace(/\n$/, '')}
                        </Text>
                    </View>
                );
            case 'hr':
                return (
                    <View
                        key={key}
                        style={[
                            styles.hr,
                            { backgroundColor: ctx.colors.border },
                        ]}
                    />
                );
            default:
                return null;
        }
    });
}

interface MarkdownProps {
    source: string;
    /** 打开外链（由消费方注入 Linking/infra）；不给则链接渲染为不可点文字 */
    onOpenLink?: (href: string) => void;
    /** 链接的读屏提示；跳转行为由消费方决定（先弹确认 / 直接打开），故文案也由它给 */
    linkAccessibilityHint?: string;
    /** 是否直接展示图片；默认 false，图片先门控为「点击展示图片」占位框（挡插件里的诱导图） */
    showImages?: boolean;
}

/** 受限 Markdown 渲染器 */
export function Markdown({
    source,
    onOpenLink,
    linkAccessibilityHint,
    showImages = false,
}: MarkdownProps) {
    const colors = useColors();
    const tree = useMemo(() => {
        const clamped =
            source.length > MAX_SOURCE_LENGTH
                ? source.slice(0, MAX_SOURCE_LENGTH)
                : source;
        return buildTree(md.parse(clamped, {}));
    }, [source]);
    const ctx: RenderContext = {
        colors,
        onOpenLink,
        linkAccessibilityHint,
        imageBudget: { count: 0 },
        showImages,
    };
    return <View>{renderBlocks(tree, ctx, 'md')}</View>;
}

const styles = StyleSheet.create({
    block: {
        marginBottom: space.sm,
    },
    firstBlock: {
        marginTop: 0,
    },
    h1: {
        marginTop: space['3xl'],
        marginBottom: space.lg,
    },
    h2: {
        marginTop: space['3xl'],
        marginBottom: space.md,
    },
    h3: {
        marginTop: space['2xl'],
        marginBottom: space.sm,
    },
    h4: {
        marginTop: space.xl,
        marginBottom: space.sm,
    },
    italic: {
        fontStyle: 'italic',
    },
    strikethrough: {
        textDecorationLine: 'line-through',
    },
    link: {
        textDecorationLine: 'underline',
    },
    codeBlock: {
        padding: space.md,
        borderRadius: radius.md,
        marginTop: space.lg,
        marginBottom: space.lg,
    },
    blockquote: {
        borderLeftWidth: borderWidth.hairline,
        paddingLeft: space.md,
        paddingVertical: space.sm,
        marginTop: space.lg,
        marginBottom: space.lg,
    },
    hr: {
        height: borderWidth.hairline,
        marginTop: space.xl,
        marginBottom: space.xl,
    },
    listBlock: {
        marginTop: space.lg,
        marginBottom: space.lg,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: space.xs,
    },
    listMarker: {
        marginRight: space.sm,
    },
    listMarkerBullet: {
        width: space.lg,
        textAlign: 'center',
    },
    listMarkerOrdered: {
        textAlign: 'right',
    },
    listContent: {
        flex: 1,
    },
    image: {
        width: '100%',
        borderRadius: radius.sm,
        marginTop: space.lg,
        marginBottom: space.lg,
    },
    imagePlaceholder: {
        aspectRatio: 2,
    },
    imageBox: {
        marginTop: space.lg,
        marginBottom: space.lg,
        paddingVertical: space['2xl'],
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
    },
    imageBoxPressed: {
        opacity: opacity.pressed,
    },
});
