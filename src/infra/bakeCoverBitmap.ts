/**
 * 位图烘焙：按焦点 cover 裁剪 + 缩放到目标尺寸 + 高斯模糊，一次产出可直接渲染的位图与其平均色 / 主色调
 *
 * 为什么烘焙而不是渲染时加 blurRadius：`expo-image` 的模糊是解码期 transformation，
 * 改一次就换一次缓存键、整张位图重算；相册原图当全屏背景还会长期占住十几 MB 内存。
 * 这里一次性把结果压到目标尺寸的 JPEG，运行时只显示一张普通位图。
 */
import { read } from '@dr.pogodin/react-native-fs';
import {
    ColorType,
    FilterMode,
    ImageFormat,
    MipmapMode,
    Skia,
    TileMode,
    type SkImage,
    type SkPaint,
    type SkSurface,
} from '@shopify/react-native-skia';

import { decodeBase64 } from '@/utils/base64';
import { orientationTransform, readExifOrientation } from '@/utils/exif';
import { uriToLocalPath } from '@/utils/media';
import { AVERAGE_COLOR_FALLBACK, sampleColors } from '@/utils/sampleColors';

import type { OrientationTransform } from '@/utils/exif';
import type { SampledColors } from '@/utils/sampleColors';

interface CoverBitmapSpec {
    /** 源图 URI（file:// 或远端） */
    readonly sourceUri: string;
    /** 目标位图尺寸，单位像素；超上限时按长边等比缩，画幅不变 */
    readonly targetWidth: number;
    readonly targetHeight: number;
    /** 裁剪焦点，0–1；0.5 为居中 */
    readonly focusX: number;
    readonly focusY: number;
    /** 相对「恰好铺满」的额外放大倍数，≥1 */
    readonly scale: number;
    /** 模糊半径，单位为**未缩放前**的目标像素；随等比缩放一起收缩，观感不变 */
    readonly blurRadius: number;
}

interface BakedBitmap extends SampledColors {
    /** JPEG base64，不含 data: 前缀 */
    readonly base64: string;
}

/** 目标位图长边上限：再大对全屏背景没有可见收益，只增内存 */
const MAX_TARGET_EDGE = 2160;
/** 取色采样缩略图边长：几百个像素足够定明暗方向、也够挑出占比最大的那一档色相 */
const COLOR_SAMPLE_SIZE = 24;
/** 高斯模糊的标准差 = 半径的一半，与 CSS blur 的观感对齐 */
const BLUR_SIGMA_RATIO = 0.5;
const JPEG_QUALITY = 90;
/** 读文件头找 EXIF 的字节数：APP1 段总在最前，64KB 足够且不必把整张图搬进 JS */
const EXIF_HEAD_BYTES = 64 * 1024;
/**
 * 带 alpha 的源图被合成到的底色；离屏画布初始是透明黑，不清底会在 JPEG 编码时压黑
 * 对外可见：编辑器的预览层要铺同一个底，否则透明区域会透出旧背景、与最终结果不符
 */
const BAKE_BACKDROP_COLOR = '#ffffff';

/** 烘焙一张背景位图，返回可直接落盘的内容与其平均色 / 主色调 */
async function bakeCoverBitmap(spec: CoverBitmapSpec): Promise<BakedBitmap> {
    // 长边统一收缩：宽高各自截断会改变画幅，运行时再按 cover 铺满就会二次裁剪
    const fit = Math.min(
        1,
        MAX_TARGET_EDGE / Math.max(spec.targetWidth, spec.targetHeight),
    );
    const width = Math.max(1, Math.round(spec.targetWidth * fit));
    const height = Math.max(1, Math.round(spec.targetHeight * fit));

    // Skia 解码不应用 EXIF 方向，手机竖拍照片会躺倒；自己读出来在绘制时补上
    const orientation = orientationTransform(
        await readSourceOrientation(spec.sourceUri),
    );
    const data = await Skia.Data.fromURI(spec.sourceUri);
    let source: SkImage | null = null;
    let surface: SkSurface | null = null;
    let snapshot: SkImage | null = null;
    try {
        source = Skia.Image.MakeImageFromEncoded(data);
        if (!source) {
            throw new Error('图片无法解码');
        }
        surface = Skia.Surface.MakeOffscreen(width, height);
        if (!surface) {
            throw new Error('无法创建离屏画布');
        }
        drawCover(surface, source, width, height, {
            focusX: spec.focusX,
            focusY: spec.focusY,
            scale: spec.scale,
            blurRadius: spec.blurRadius * fit,
            orientation,
        });
        snapshot = surface.makeImageSnapshot();
        const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, JPEG_QUALITY);
        if (!base64) {
            throw new Error('位图编码失败');
        }
        return { base64, ...measureSampleColors(snapshot) };
    } finally {
        // SkData 持有整张原图的编码字节（手机照片 3–12 MB），漏掉它等于每次烘焙泄一次
        snapshot?.dispose();
        surface?.dispose();
        source?.dispose();
        data.dispose();
    }
}

/** 只取文件头找 EXIF；远端图或读取失败一律按正立处理 */
async function readSourceOrientation(sourceUri: string): Promise<number> {
    const path = sourceUri.startsWith('file://')
        ? uriToLocalPath(sourceUri)
        : undefined;
    if (!path) {
        return 1;
    }
    try {
        const head = await read(path, EXIF_HEAD_BYTES, 0, 'base64');
        return readExifOrientation(decodeBase64(head));
    } catch {
        return 1;
    }
}

/** 按 cover 语义把源图铺满目标，再按焦点平移被裁掉的溢出量 */
function drawCover(
    surface: SkSurface,
    source: SkImage,
    width: number,
    height: number,
    shape: {
        focusX: number;
        focusY: number;
        scale: number;
        blurRadius: number;
        orientation: OrientationTransform;
    },
): void {
    const { rotation, mirrored } = shape.orientation;
    const quarterTurn = rotation === 90 || rotation === 270;
    // 取景一律在「摆正后」的尺寸上算；四分之一转会交换宽高
    const orientedWidth = quarterTurn ? source.height() : source.width();
    const orientedHeight = quarterTurn ? source.width() : source.height();
    const cover =
        Math.max(width / orientedWidth, height / orientedHeight) *
        Math.max(1, shape.scale);
    const drawWidth = orientedWidth * cover;
    const drawHeight = orientedHeight * cover;
    const left = -(drawWidth - width) * clampRatio(shape.focusX);
    const top = -(drawHeight - height) * clampRatio(shape.focusY);

    const canvas = surface.getCanvas();
    // 离屏画布初始是透明黑：带 alpha 的源图不清底会在 JPEG 编码时压黑，
    // 平均色采样读到的预乘值也会整体偏暗、把明暗判反
    canvas.clear(Skia.Color(BAKE_BACKDROP_COLOR));
    const paint = Skia.Paint();
    try {
        if (shape.blurRadius > 0) {
            const sigma = shape.blurRadius * BLUR_SIGMA_RATIO;
            // Clamp：边缘像素外推，避免模糊在四边吃进透明色而出现暗框
            const blur = Skia.ImageFilter.MakeBlur(
                sigma,
                sigma,
                TileMode.Clamp,
                null,
            );
            try {
                paint.setImageFilter(blur);
            } finally {
                blur.dispose();
            }
        }
        // 本地绘制矩形：四分之一转时宽高互换（旋转后才回到目标画幅）
        const localWidth = quarterTurn ? drawHeight : drawWidth;
        const localHeight = quarterTurn ? drawWidth : drawHeight;
        // 画布变换按代码顺序「由外向内」叠：先摆位、再旋转、最后（若需要）在本地矩形内镜像。
        // 平移量取旋转后包围盒相对原点的偏移：
        //   90° 时 (x,y)→(−y,x)，包围盒 [−drawWidth,0]×[0,drawHeight] → 补 (left+drawWidth, top)
        //   180° 时 (x,y)→(−x,−y) → 补 (left+drawWidth, top+drawHeight)
        //   270° 时 (x,y)→(y,−x) → 补 (left, top+drawHeight)
        canvas.save();
        if (rotation === 90) {
            canvas.translate(left + drawWidth, top);
        } else if (rotation === 180) {
            canvas.translate(left + drawWidth, top + drawHeight);
        } else if (rotation === 270) {
            canvas.translate(left, top + drawHeight);
        } else {
            canvas.translate(left, top);
        }
        canvas.rotate(rotation, 0, 0);
        if (mirrored) {
            // 在本地矩形内沿其竖直中线翻：包围盒不变，故上面的平移量依旧成立
            canvas.scale(-1, 1);
            canvas.translate(-localWidth, 0);
        }
        // 显式给线性采样 + mipmap：默认最近邻，把 4000px 级原图降到 1080p 时
        // 在模糊为 0（用户可以拖到）的情况下走样肉眼可见
        canvas.drawImageRectOptions(
            source,
            Skia.XYWHRect(0, 0, source.width(), source.height()),
            Skia.XYWHRect(0, 0, localWidth, localHeight),
            FilterMode.Linear,
            MipmapMode.Linear,
            paint,
        );
        canvas.restore();
        surface.flush();
    } finally {
        paint.dispose();
    }
}

/** 把成图缩到极小尺寸再读像素，避免为取色搬运整张全屏位图 */
function measureSampleColors(image: SkImage): SampledColors {
    const fallback: SampledColors = {
        averageColor: AVERAGE_COLOR_FALLBACK,
        dominantColor: null,
    };
    const surface = Skia.Surface.MakeOffscreen(
        COLOR_SAMPLE_SIZE,
        COLOR_SAMPLE_SIZE,
    );
    if (!surface) {
        return fallback;
    }
    let sample: SkImage | null = null;
    let paint: SkPaint | null = null;
    try {
        paint = Skia.Paint();
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color(BAKE_BACKDROP_COLOR));
        // 求平均色更要线性采样：最近邻等于稀疏抽点，噪点图会把明暗判偏
        canvas.drawImageRectOptions(
            image,
            Skia.XYWHRect(0, 0, image.width(), image.height()),
            Skia.XYWHRect(0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE),
            FilterMode.Linear,
            MipmapMode.Linear,
            paint,
        );
        surface.flush();
        sample = surface.makeImageSnapshot();
        const pixels = sample.readPixels(0, 0, {
            width: COLOR_SAMPLE_SIZE,
            height: COLOR_SAMPLE_SIZE,
            colorType: ColorType.RGBA_8888,
            alphaType: sample.getImageInfo().alphaType,
        });
        return pixels ? sampleColors(pixels) : fallback;
    } finally {
        sample?.dispose();
        paint?.dispose();
        surface.dispose();
    }
}

function clampRatio(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

export { bakeCoverBitmap, BAKE_BACKDROP_COLOR, BLUR_SIGMA_RATIO };
export type { BakedBitmap, CoverBitmapSpec };
