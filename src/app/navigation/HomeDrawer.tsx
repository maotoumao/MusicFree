import { createDrawerNavigator } from '@react-navigation/drawer';
import { useAtomValue } from 'jotai';
import { useWindowDimensions } from 'react-native';

import {
    borderWidth,
    elevation,
    radius,
    substrateColorAtom,
    useColors,
} from '@/design';
import { useT } from '@/i18n';
import HomeScreen from '@/pages/home';

import { DrawerContent } from './DrawerContent';

/** Home 作用域抽屉参数表（单屏=首页内容；抽屉面板承载工具/设置入口） */
type HomeDrawerParamList = {
    HomeContent: undefined;
};

/** 抽屉宽度封顶（dp）：再宽就不像「侧边」而像半个页面 */
const DRAWER_MAX_WIDTH = 320;
/** 窄屏按屏宽比例收，留出右侧可见的背景让「盖在首页之上」这件事看得出来 */
const DRAWER_WIDTH_RATIO = 0.82;

const Drawer = createDrawerNavigator<HomeDrawerParamList>();

/** Home 路由 = 左侧抽屉（front 覆盖 + scrim）包裹首页内容；仅 Home 有抽屉，其余屏无 */
export function HomeDrawer() {
    const t = useT();
    const colors = useColors();
    // 页面基底的实际颜色：不透明、不吃控件不透明度，也不跟用户给 surface 设的 alpha
    const substrateColor = useAtomValue(substrateColorAtom);
    const { width } = useWindowDimensions();
    return (
        <Drawer.Navigator
            screenOptions={{
                headerShown: false,
                drawerType: 'front',
                overlayAccessibilityLabel: t('home.a11y.closeDrawer'),
                drawerStyle: {
                    width: Math.min(
                        DRAWER_MAX_WIDTH,
                        width * DRAWER_WIDTH_RATIO,
                    ),
                    // 外壳铺不透明的页面基底色，面色（壁纸 + surface）由 DrawerContent 叠在上面：
                    // surface 可能是半透明的，直接当外壳底色会透出首页文字；外壳不能透明——
                    // 半透明的发丝右边框要有实色垫着，iOS 阴影也只在不透明底色上走 shadowPath 快路径
                    backgroundColor: substrateColor,
                    // 右侧圆角与 DrawerContent 的裁剪容器同一个刻度：面色层是矩形，
                    // 只靠库默认的 16 圆角外壳并不裁剪子视图，角会被填平
                    borderTopRightRadius: radius.xl,
                    borderBottomRightRadius: radius.xl,
                    borderRightWidth: borderWidth.hairline,
                    borderRightColor: colors.border,
                    ...elevation.md,
                },
                // 库默认固定 rgba(0,0,0,.5)；改用语义 token，深色下更重、浅色下更轻
                overlayColor: colors.mask,
            }}
            drawerContent={DrawerContent}
        >
            <Drawer.Screen name="HomeContent" component={HomeScreen} />
        </Drawer.Navigator>
    );
}
