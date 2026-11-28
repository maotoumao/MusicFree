import type { ThemeColorRole } from '@/core/theme';

/** 配色编辑的分组：主要角色常驻，其余收进「高级」 */
interface ColorRoleGroup {
    readonly key: 'main' | 'status' | 'derived';
    readonly roles: readonly ThemeColorRole[];
}

/**
 * 主要角色 = 真正需要用户做审美决策的八个；其余两组默认跟随内建或由主要角色派生
 * 顺序即编辑器里的展示顺序：先面、后字、再强调与描边
 */
const COLOR_ROLE_GROUPS: readonly ColorRoleGroup[] = [
    {
        key: 'main',
        roles: [
            'background',
            'surface',
            'surfaceVariant',
            'text',
            'textSecondary',
            'textDisabled',
            'primary',
            'border',
        ],
    },
    {
        key: 'status',
        roles: [
            'danger',
            'success',
            'warning',
            'info',
            'onDanger',
            'onSuccess',
            'onWarning',
            'onInfo',
            'warningSoft',
        ],
    },
    {
        key: 'derived',
        roles: [
            'onPrimary',
            'primarySoft',
            'onPrimarySoft',
            'coverAccent',
            'coverAccentStrong',
            'mask',
            'shadow',
            'ripple',
            'knob',
        ],
    },
];

export { COLOR_ROLE_GROUPS };
export type { ColorRoleGroup };
