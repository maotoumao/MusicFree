/**
 * SkiaListItem：单行媒体行的 Skia 自绘（track 变体，固定行高 64）
 * 纯绘制器——收已建 paragraph + 几何（静态或 reanimated 派生皆可），画 底 + 序号 + 标题 + 副标题 + 平台 Tag
 * paragraph 由调用方经 buildRowParagraph 构建；Tag 的 pill 宽/右对齐平移/标题让宽由调用方按测量算好传入
 * 视觉对齐 MusicRow：横 padding 16、序号列 24 居中溢出、leading gap 16、标题 md/副标题 sm、Tag=xs pill
 * showHandle 时尾部留把手条画 grip 点阵（仅视觉；拖拽手势在列表级统一处理）
 */
import {
    Circle,
    Group,
    Paragraph,
    Path,
    Rect,
    RoundedRect,
    Skia,
    TextAlign,
    type SkParagraph,
} from '@shopify/react-native-skia';
import { type SharedValue } from 'react-native-reanimated';

import {
    borderWidth,
    fontSize,
    iconSize,
    layout,
    radius,
    space,
} from '@/design';

/** 固定行高（无封面；对齐 MusicRow 两行内容 + 上下 padding 12） */
export const SKIA_ROW_HEIGHT = 64;

const PAD_H = space.lg; // 16
const POSITION_WIDTH = space.xl; // 24
const LEADING_GAP = space.lg; // 16
// 竖直排布（Skia paragraph 顶锚）：内容整体在行高内居中；字号改档后由 SkiaRowCompareScreen 真机并排复核
const TITLE_TOP = 12;
const SUBTITLE_TOP = 35;
const POSITION_TOP = 23;
// 尾部拖拽把手条宽 = 无障碍命中目标；grip 点阵 2 列 × 3 行
export const DRAG_HANDLE_WIDTH = layout.hitTarget;
const GRIP_DOT_R = 1.6;
const GRIP_COL_GAP = 6;
const GRIP_ROW_GAP = 6;
// grip 6 点相对条中心的偏移
const GRIP_DOTS = [
    { dx: -GRIP_COL_GAP / 2, dy: -GRIP_ROW_GAP },
    { dx: GRIP_COL_GAP / 2, dy: -GRIP_ROW_GAP },
    { dx: -GRIP_COL_GAP / 2, dy: 0 },
    { dx: GRIP_COL_GAP / 2, dy: 0 },
    { dx: -GRIP_COL_GAP / 2, dy: GRIP_ROW_GAP },
    { dx: GRIP_COL_GAP / 2, dy: GRIP_ROW_GAP },
];

// 平台 Tag（对齐 MusicRow 的 <Tag>：xs 文字、surfaceVariant 底、radius.sm 圆角、水平 pad 4）
/** Tag 文字字号 */
export const TAG_TEXT_SIZE = fontSize.xs; // 12
/** Tag 水平内边距（pill 左右各一份） */
export const TAG_PAD_H = space.xs; // 4
/** 标题与 Tag 的间距 */
export const TAG_GAP = space.xs; // 4
/** Tag pill 最大宽占内容区比例（对齐 MusicRow 的 33%；超长来源名截断、不挤爆标题） */
export const TAG_MAX_FRACTION = 0.33;
const TAG_HEIGHT = 17;
// 竖直排布（估值，compare 屏并排调）：pill 与标题行竖直居中、label 在 pill 内居中
const TAG_TOP = 13;
const TAG_LABEL_TOP = 14;
// 测量 Tag 文字用的大宽（取 intrinsic 宽与其无关，仅需先 layout）
const TAG_MEASURE_WIDTH = 9999;
// 无 Tag 时的占位平移（配合 tagWidth 默认 0，整块不可见）
const NO_TAG_TRANSFORM = [{ translateX: 0 }];

// 多选 checkbox（视觉对齐 Checkbox.tsx：iconSize.md 方框、radius.sm 圆角、hairline 边、居中对勾）
const CHECKBOX_SIZE = iconSize.md;
// 居中于序号列宽（PAD_H + POSITION_WIDTH）：使 checkbox 与序号 leading 完全等宽同心、切换多选无跳变
const CHECKBOX_X = PAD_H + (POSITION_WIDTH - CHECKBOX_SIZE) / 2;
const CHECKBOX_TOP = (SKIA_ROW_HEIGHT - CHECKBOX_SIZE) / 2;
const CHECKBOX_STROKE_WIDTH = borderWidth.hairline;
const CHECK_STROKE_WIDTH = 2;
// 对勾折线（相对 checkbox 框的比例：经典左下 → 底 → 右上），模块级建一次
const CHECK_PATH = (() => {
    const p = Skia.Path.Make();
    const s = CHECKBOX_SIZE;
    p.moveTo(CHECKBOX_X + 0.28 * s, CHECKBOX_TOP + 0.52 * s);
    p.lineTo(CHECKBOX_X + 0.44 * s, CHECKBOX_TOP + 0.68 * s);
    p.lineTo(CHECKBOX_X + 0.72 * s, CHECKBOX_TOP + 0.34 * s);
    return p;
})();

/** 静态值或 reanimated 派生值（Skia props 二者皆接受） */
type Animatable<T> = T | SharedValue<T>;

/**
 * 行内容水平边界（供调用方算 Tag 位置 / 标题让宽）：
 * contentX = 标题起点；contentRight = 内容右界（把手条之前）
 */
export function rowContentBounds(
    width: number,
    showPosition: boolean,
    showHandle: boolean,
    showCheckbox = false,
): { contentX: number; contentRight: number } {
    'worklet';
    // checkbox 与序号共用同一 leading 列宽（PAD_H + POSITION_WIDTH），等宽同心、切换多选不跳变；都不显则仅左 padding
    const contentX =
        showCheckbox || showPosition
            ? PAD_H + POSITION_WIDTH + LEADING_GAP
            : PAD_H;
    const contentRight = width - (showHandle ? DRAG_HANDLE_WIDTH : PAD_H);
    return { contentX, contentRight };
}

/** 量 Tag pill 宽度 = 标签文字自然宽 + 左右 pad；JS（静态）与 UI 线程（列表回收）同一函数 */
export function measureTagWidth(labelParagraph: SkParagraph): number {
    'worklet';
    labelParagraph.layout(TAG_MEASURE_WIDTH);
    // ceil + 1 余量：getMaxIntrinsicWidth 对英文可能带亚像素、恰好等宽会误触发单行省略号
    return Math.ceil(labelParagraph.getMaxIntrinsicWidth()) + 1 + 2 * TAG_PAD_H;
}

/** 构建一行文字的单行省略号 paragraph；JS（静态）与 UI 线程（列表回收）同一函数 */
export function buildRowParagraph(
    text: string,
    color: string,
    fontSizePx: number,
    center = false,
): SkParagraph {
    'worklet';
    return Skia.ParagraphBuilder.Make({
        maxLines: 1,
        ellipsis: '…',
        textAlign: center ? TextAlign.Center : TextAlign.Start,
    })
        .pushStyle({ color: Skia.Color(color), fontSize: fontSizePx })
        .addText(text)
        .pop()
        .build();
}

export function SkiaListItem({
    width,
    showPosition,
    showHandle,
    handleColor,
    backgroundColor,
    titleParagraph,
    titleWidth,
    subtitleParagraph,
    positionParagraph,
    sourceLabelParagraph,
    tagWidth,
    tagLabelWidth,
    tagTransform,
    tagBackground,
    showCheckbox,
    checkboxFill,
    checkboxBorder,
    checkboxCheck,
}: {
    width: number;
    showPosition: boolean;
    /** 尾部是否画 grip 点阵（= 列表 dragEnabled） */
    showHandle: boolean;
    /** grip 点阵颜色（静态，取 textSecondary） */
    handleColor: string;
    /** 行背景色（静态或派生；如多选选中行传 primarySoft） */
    backgroundColor: Animatable<string>;
    titleParagraph: Animatable<SkParagraph | null>;
    /** 标题绘制宽（为 Tag 让位后的宽）；省略 = 内容满宽（无 Tag 时） */
    titleWidth?: Animatable<number>;
    subtitleParagraph: Animatable<SkParagraph | null>;
    positionParagraph: Animatable<SkParagraph | null>;
    /** 平台 Tag 标签 paragraph（xs / textSecondary）；省略/null = 无 Tag */
    sourceLabelParagraph?: Animatable<SkParagraph | null>;
    /** Tag pill 宽（含左右 pad）；省略/0 = 无 Tag、整块不可见 */
    tagWidth?: Animatable<number>;
    /** Tag label 绘制宽（= tagWidth - 2*pad）；超宽截断落 pill 内、留左右 padding */
    tagLabelWidth?: Animatable<number>;
    /** Tag 组右对齐平移（translateX 到 contentRight - tagWidth） */
    tagTransform?: Animatable<{ translateX: number }[]>;
    /** Tag pill 底色（surfaceVariant，静态） */
    tagBackground?: string;
    /** 可选模式：画左侧 checkbox（与 showPosition 互斥） */
    showCheckbox?: boolean;
    /** checkbox 填充色（选中 primary / 未选 transparent） */
    checkboxFill?: Animatable<string>;
    /** checkbox 边框色（选中 primary / 未选 border） */
    checkboxBorder?: Animatable<string>;
    /** checkbox 对勾色（选中 onPrimary / 未选 transparent） */
    checkboxCheck?: Animatable<string>;
}) {
    // contentX = 标题起点；contentWidth = 副标题满宽（Tag 只挤标题行、不挤副标题）
    const { contentX, contentRight } = rowContentBounds(
        width,
        showPosition,
        showHandle,
        showCheckbox,
    );
    const contentWidth = contentRight - contentX;
    const gripCx = width - DRAG_HANDLE_WIDTH / 2;
    const gripCy = SKIA_ROW_HEIGHT / 2;
    return (
        <Group>
            <Rect
                x={0}
                y={0}
                width={width}
                height={SKIA_ROW_HEIGHT}
                color={backgroundColor}
            />
            {showCheckbox ? (
                <Group>
                    <RoundedRect
                        x={CHECKBOX_X}
                        y={CHECKBOX_TOP}
                        width={CHECKBOX_SIZE}
                        height={CHECKBOX_SIZE}
                        r={radius.sm}
                        color={checkboxFill ?? 'transparent'}
                    />
                    <RoundedRect
                        x={CHECKBOX_X}
                        y={CHECKBOX_TOP}
                        width={CHECKBOX_SIZE}
                        height={CHECKBOX_SIZE}
                        r={radius.sm}
                        style="stroke"
                        strokeWidth={CHECKBOX_STROKE_WIDTH}
                        color={checkboxBorder ?? 'transparent'}
                    />
                    <Path
                        path={CHECK_PATH}
                        style="stroke"
                        strokeWidth={CHECK_STROKE_WIDTH}
                        strokeCap="round"
                        strokeJoin="round"
                        color={checkboxCheck ?? 'transparent'}
                    />
                </Group>
            ) : null}
            {showPosition && !showCheckbox ? (
                <Paragraph
                    paragraph={positionParagraph}
                    x={0}
                    y={POSITION_TOP}
                    width={contentX}
                />
            ) : null}
            <Paragraph
                paragraph={titleParagraph}
                x={contentX}
                y={TITLE_TOP}
                width={titleWidth ?? contentWidth}
            />
            <Paragraph
                paragraph={subtitleParagraph}
                x={contentX}
                y={SUBTITLE_TOP}
                width={contentWidth}
            />
            {/* 平台 Tag：右对齐贴内容右界（tagWidth=0 时 pill/label 皆不可见） */}
            <Group transform={tagTransform ?? NO_TAG_TRANSFORM}>
                <RoundedRect
                    x={0}
                    y={TAG_TOP}
                    width={tagWidth ?? 0}
                    height={TAG_HEIGHT}
                    r={radius.sm}
                    color={tagBackground ?? 'transparent'}
                />
                <Paragraph
                    paragraph={sourceLabelParagraph ?? null}
                    x={TAG_PAD_H}
                    y={TAG_LABEL_TOP}
                    width={tagLabelWidth ?? 0}
                />
            </Group>
            {showHandle
                ? GRIP_DOTS.map(({ dx, dy }) => (
                      <Circle
                          key={`${dx},${dy}`}
                          cx={gripCx + dx}
                          cy={gripCy + dy}
                          r={GRIP_DOT_R}
                          color={handleColor}
                      />
                  ))
                : null}
        </Group>
    );
}
