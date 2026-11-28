/** react-native-svg-transformer：把 .svg 当 RN 组件导入（metro 时编译） */
declare module '*.svg' {
    import type { FC } from 'react';
    import type { SvgProps } from 'react-native-svg';

    const content: FC<SvgProps>;
    export default content;
}
