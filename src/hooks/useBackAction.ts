import { useNavigation } from '@react-navigation/native';

import { useT } from '@/i18n';

/**
 * 标准返回动作：喂给 AppBar 的 leading
 * AppBar 保持导航无关（纯 UI），返回逻辑在此注入（navigation 可见）
 * 返回结构兼容 AppBar 的 leading 契约，但不反向依赖 components（保持 hooks 为低层）
 */
export function useBackAction(): {
    icon: 'chevron-left';
    label: string;
    onPress: () => void;
} {
    const navigation = useNavigation();
    const t = useT();
    return {
        icon: 'chevron-left',
        label: t('common.back'),
        onPress: () => navigation.goBack(),
    };
}
