/**
 * @shopify/flash-list 桌面端实现
 * 直接使用 react-native-web 的 FlatList(虚拟化列表)。
 * estimatedItemSize 等 FlashList 专属 prop 做兼容透传。
 */
import React from "react";
import { FlatList, FlatListProps } from "react-native";

type FlashListProps<T> = FlatListProps<T> & {
    /** FlashList 专属,桌面端忽略(FlatList 自身虚拟化即可) */
    estimatedItemSize?: number;
    /** FlashList 2.x 的 overrideItemLayout,忽略 */
    overrideItemLayout?: any;
};

function FlashList<T>(props: FlashListProps<T>, ref: any) {
    const { estimatedItemSize: _estimated, overrideItemLayout: _override, ...rest } = props;
    return <FlatList ref={ref} {...(rest as FlatListProps<T>)} />;
}

const FlashListWithRef = React.forwardRef(FlashList) as any;

export { FlashListWithRef as FlashList };
export default FlashListWithRef;
