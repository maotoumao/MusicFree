/**
 * 架构依赖守卫——把「前端架构规范 §3 依赖铁律」变成硬 lint
 * 层与方向取自 docs/前端架构规范.md：
 *   app → pages → widgets → components → design；app/widgets → core → { native, infra }；native/infra → native/specs；所有层 → utils/types（叶子）
 * 校验：npm run depcruise
 */
module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            comment: '禁止循环依赖（守住分层方向即不成环）',
            severity: 'error',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-import-app',
            comment: 'app 是组合根、无人反向 import 它；仅 app/ 内部可互引',
            severity: 'error',
            from: { pathNot: '^src/app/' },
            to: { path: '^src/app/' },
        },
        {
            name: 'components-no-business',
            comment: 'components 是纯 UI：禁 import core / widgets / pages',
            severity: 'error',
            from: { path: '^src/components/' },
            to: { path: '^src/(core|widgets|pages)/' },
        },
        {
            name: 'overlay-barrel-only-outside',
            comment:
                'overlay 是 components 里唯一带单门 barrel 的子系统：外部只能从 components/overlay 进，禁 deep import 内部 kernel/shells',
            severity: 'error',
            from: { pathNot: '^src/components/overlay/' },
            to: {
                path: '^src/components/overlay/.+',
                pathNot: '^src/components/overlay/index\\.(ts|tsx)$',
            },
        },
        {
            name: 'core-no-ui',
            comment: 'core 禁 import 任何 UI（pages / widgets / components）',
            severity: 'error',
            from: { path: '^src/core/' },
            to: { path: '^src/(pages|widgets|components)/' },
        },
        {
            name: 'lower-no-upper',
            comment:
                'components/core/hooks/design/i18n 禁 import 上层 pages/widgets（→app 由 no-import-app 统一拦）',
            severity: 'error',
            from: { path: '^src/(components|core|hooks|design|i18n)/' },
            to: { path: '^src/(pages|widgets)/' },
        },
        {
            name: 'widgets-no-pages',
            comment:
                'widgets 可依赖 core/components/hooks/design，但禁 import pages',
            severity: 'error',
            from: { path: '^src/widgets/' },
            to: { path: '^src/pages/' },
        },
        {
            name: 'pages-no-cross-page',
            comment: '页面之间禁止互相 import，要共享就上升到 widgets',
            severity: 'error',
            from: { path: '^src/pages/([^/]+)/' },
            to: { path: '^src/pages/([^/]+)/', pathNot: '^src/pages/$1/' },
        },
        {
            name: 'native-no-core-ui',
            comment: 'native 是纯桥：禁 import core / UI / infra',
            severity: 'error',
            from: { path: '^src/native/' },
            to: { path: '^src/(core|components|widgets|pages|infra)/' },
        },
        {
            name: 'pure-ui-no-platform',
            comment:
                '纯 UI 与 i18n（components/i18n）禁碰任何 native / infra：保持可搬去任何 app',
            severity: 'error',
            from: { path: '^src/(components|i18n)/' },
            to: { path: '^src/(native|infra)/' },
        },
        {
            name: 'ux-no-native-bridge',
            comment:
                'pages/widgets 经 core 用 native（方向 widgets→core→native，全禁 native/**）；infra 的 ambient 能力可直连',
            severity: 'error',
            from: { path: '^src/(pages|widgets)/' },
            to: { path: '^src/native/' },
        },
        {
            name: 'dev-only-from-app',
            comment:
                'dev 是 __DEV__ 诊断层（可直连 native 含有状态桥）：仅 app/ 可 import，产品层禁引以免拖带 native 直连渗进 release',
            severity: 'error',
            from: { pathNot: '^src/(app|dev)/' },
            to: { path: '^src/dev/' },
        },
        {
            name: 'no-direct-specs-import',
            comment:
                'specs 是裸 codegen 契约：只 `native/`·`infra/` 内可 import；其他层走 @/native/<域> 或 @/infra/<域> 适配器',
            severity: 'error',
            from: { pathNot: '^src/(native|infra)/' },
            to: { path: '^src/native/specs/' },
        },
        {
            name: 'core-siblings-type-only',
            comment:
                'core 模块之间只允许 import type（运行时依赖经 app/container 注入）',
            severity: 'error',
            from: { path: '^src/core/([^/]+)/' },
            to: {
                path: '^src/core/([^/]+)/',
                pathNot: '^src/core/$1/',
                dependencyTypesNot: ['type-only'],
            },
        },
        {
            name: 'core-barrel-only-inside',
            comment: 'core 模块间禁 deep import：只能从对方 index 门进',
            severity: 'error',
            from: { path: '^src/core/([^/]+)/' },
            to: {
                path: '^src/core/[^/]+/.+',
                pathNot: [
                    '^src/core/$1/.+',
                    '^src/core/[^/]+/index\\.(ts|tsx)$',
                ],
            },
        },
        {
            name: 'core-barrel-only-outside',
            comment:
                'core 模块外的任何层只能从 core/<mod>/index 门进，禁 deep import 内部文件',
            severity: 'error',
            from: { pathNot: '^src/core/' },
            to: {
                path: '^src/core/[^/]+/.+',
                pathNot: '^src/core/[^/]+/index\\.(ts|tsx)$',
            },
        },
        {
            name: 'design-leaf',
            comment: 'design 近叶子：只依赖 utils/types，禁 import 其他 src 层',
            severity: 'error',
            from: { path: '^src/design/' },
            to: { path: '^src/(?!design/|utils/|types/).' },
        },
        {
            name: 'utils-types-leaf',
            comment: 'utils/types 是叶子：禁 import 其他 src 层',
            severity: 'error',
            from: { path: '^src/(utils|types)/' },
            to: { path: '^src/(?!utils/|types/).' },
        },
        {
            name: 'infra-only-low-level',
            comment:
                'infra 是领域无关机制：只可 import infra 自身 / native/specs / utils / types；禁 core・上层・native 非 specs 桥（防反向成环）',
            severity: 'error',
            from: { path: '^src/infra/' },
            to: { path: '^src/(?!infra/|native/specs/|utils/|types/).' },
        },
    ],
    options: {
        // 只巡 src；根 App.tsx（临时 harness）不纳入分层校验
        includeOnly: '^src/',
        doNotFollow: { path: 'node_modules' },
        // 读 tsconfig 解析 @/ 别名 + 开启 type-only 依赖类型识别（core 间 type-only 规则依赖它）
        tsConfig: { fileName: 'tsconfig.json' },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: {
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
    },
};
