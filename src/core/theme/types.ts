/** 主题继承的内建配色底表方向 */
type ThemeColorScheme = 'light' | 'dark';

/**
 * 可被用户覆盖的语义色角色
 * 主要角色（面 / 字 / 强调 / 描边）需要审美决策，其余默认由主要角色派生、
 * 用户显式写入即视为解锁手动。沉浸播放页的 cover* 只开放强调两档（`coverAccent` /
 * `coverAccentStrong`）：那一页恒定深色、不随浅深主题翻转，文字与遮罩是它自己的一套、不开放；
 * 强调两档默认由 `primary` 派生（见 resolveThemeColors），用户嫌派生结果不合意时可以直接改
 */
type ThemeColorRole =
    | 'background'
    | 'surface'
    | 'surfaceVariant'
    | 'text'
    | 'textSecondary'
    | 'textDisabled'
    | 'primary'
    | 'border'
    | 'danger'
    | 'success'
    | 'warning'
    | 'info'
    | 'onPrimary'
    | 'primarySoft'
    | 'onPrimarySoft'
    | 'onDanger'
    | 'onSuccess'
    | 'onWarning'
    | 'onInfo'
    | 'warningSoft'
    | 'mask'
    | 'shadow'
    | 'ripple'
    | 'knob'
    | 'coverAccent'
    | 'coverAccentStrong';

/**
 * 主题内的语义色覆盖；缺席的角色继承内建表或由上游角色派生
 * 值为 `#RRGGBB` 或 `#RRGGBBAA`——除页面底色外都可带 alpha
 */
type ThemeColorOverrides = Readonly<Partial<Record<ThemeColorRole, string>>>;

/** 已托管的主题背景；渲染用位图在写入时已完成裁剪、缩放与模糊 */
interface ThemeBackground {
    /** 已烘焙的渲染位图，主题目录内的直属文件名 */
    readonly fileName: string;
    /** 用户原图，重新烘焙时的输入，主题目录内的直属文件名 */
    readonly sourceFileName: string;
    /** 烘焙参数：重新编辑时回填编辑器 */
    readonly blurRadius: number;
    readonly focusX: number;
    readonly focusY: number;
    readonly scale: number;
    /**
     * 成图的平均色（`#RRGGBB`），烘焙时采样一次
     * 存颜色而非亮度标量：幕布是在 sRGB 空间按 alpha 合成的，
     * 只有先在同一空间混出实际底色，再算相对亮度，判明暗与对比度才准
     */
    readonly averageColor: string;
    /**
     * 按壁纸主色派生、已抬过对比度的强调色默认值（`#RRGGBB`）；图太灰没有主色时为 null
     * 存下来是为了判断「强调色是否还跟着壁纸」：换图 / 移除背景时，与它相等的 `primary` 一并跟着走；
     * 用户自己改过的强调色则不动
     */
    readonly accentColor: string | null;
    /** 运行时图层参数：背景可见度与控件不透明度，均无下限 */
    readonly visibility: number;
    readonly surfaceOpacity: number;
}

/** 写入背景时原图的来源：新选一张，或沿用已托管的那张（只重新烘焙） */
type ThemeBackgroundSourceInput =
    | { readonly kind: 'pick'; readonly uri: string; readonly name?: string }
    | { readonly kind: 'keep' };

/**
 * 一次烘焙的完整产物；渲染位图由调用方经 infra 烘焙后以 base64 交付
 * 不含 visibility / surfaceOpacity——那两项是纯运行时图层参数、有自己的命令，
 * 烘焙是异步的，把它们捎带进来会用几百毫秒前的旧值盖掉期间的调整
 */
interface ThemeBackgroundBake {
    readonly source: ThemeBackgroundSourceInput;
    /** 已烘焙的渲染位图（JPEG base64，不含 data: 前缀） */
    readonly imageBase64: string;
    readonly blurRadius: number;
    readonly focusX: number;
    readonly focusY: number;
    readonly scale: number;
    readonly averageColor: string;
    /** 缺省即 null：没有主色，也不动强调色 */
    readonly accentColor?: string | null;
}

/**
 * 一套完整外观：配色 + 背景，用户可复制 / 编辑 / 删除的最小单位
 * 内置主题的 name 为空串，显示名由 UI 按 id 取 i18n 文案（i18n 是叶子层、不入 core）
 */
interface ThemePack {
    readonly id: string;
    readonly name: string;
    readonly scheme: ThemeColorScheme;
    readonly colors: ThemeColorOverrides;
    readonly background: ThemeBackground | null;
    readonly autoContrast: boolean;
}

/** 当前生效的主题：固定一套，或跟随系统在日间 / 夜间两套之间切换 */
type ThemeSelection =
    | { readonly kind: 'fixed'; readonly packId: string }
    | {
          readonly kind: 'system';
          readonly dayPackId: string;
          readonly nightPackId: string;
      };

/** 用户主题偏好；内置主题是代码常量、不入库 */
interface ThemePreferences {
    readonly packs: readonly ThemePack[];
    readonly selection: ThemeSelection;
}

/** 主题偏好端口；UX 经命令修改，禁止直接写持久态 */
interface ITheme {
    /** 启动文件对账；并发与重复调用共享同一次初始化 */
    setup(): Promise<void>;
    getPreferences(): ThemePreferences;
    subscribe(listener: () => void): () => void;

    /** 固定使用某套主题；id 可以是内置主题 */
    selectPack(packId: string): void;
    /** 跟随系统：日间 / 夜间各绑一套 */
    selectSystemPacks(dayPackId: string, nightPackId: string): void;

    /** 从任意主题（含内置）复制一份用户主题，返回新 id */
    createPack(sourcePackId: string, name: string): string;
    renamePack(packId: string, name: string): void;
    /** 删除用户主题并回收其背景文件；被选中时回落到同方向的内置主题 */
    deletePack(packId: string): Promise<void>;

    /**
     * 设置某套用户主题的语义色；null 恢复继承 / 派生
     * 只有 `background` 强制 `#RRGGBB`（`#RRGGBBFF` 会被截断收下）——它是整个合成链的
     * 基准面；其余角色都接受 `#RRGGBBAA`
     */
    setPackColor(
        packId: string,
        role: ThemeColorRole,
        color: string | null,
    ): void;
    resetPackColors(packId: string): void;
    setPackAutoContrast(packId: string, enabled: boolean): void;

    /** 发布已烘焙位图并替换该主题的背景；图层参数沿用当前值，失败时保留旧背景 */
    setPackBackground(packId: string, bake: ThemeBackgroundBake): Promise<void>;
    /** 只改运行时图层参数，不重新烘焙、不碰文件 */
    setPackBackgroundLayers(
        packId: string,
        visibility: number,
        surfaceOpacity: number,
    ): void;
    /** 关闭该主题的背景并 best-effort 删除其文件 */
    clearPackBackground(packId: string): Promise<void>;
}

export type {
    ITheme,
    ThemeBackground,
    ThemeBackgroundBake,
    ThemeBackgroundSourceInput,
    ThemeColorOverrides,
    ThemeColorRole,
    ThemeColorScheme,
    ThemePack,
    ThemePreferences,
    ThemeSelection,
};
