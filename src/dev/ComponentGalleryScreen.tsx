import { useMemo, useState, type ReactNode } from 'react';
import {
    Linking,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
} from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';
import {
    SafeAreaProvider,
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { definePanel, showToast, useOverlayStatus } from '@/components/overlay';
import { Box } from '@/components/ui/Box';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/Input';
import { ListItem } from '@/components/ui/ListItem';
import { Loading } from '@/components/ui/Loading';
import { Markdown } from '@/components/ui/Markdown';
import { MediaList } from '@/components/ui/MediaList';
import { Radio } from '@/components/ui/Radio';
import { SeekBar } from '@/components/ui/SeekBar';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { VerticalSlider } from '@/components/ui/VerticalSlider';
import { radius, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { MediaRow } from '@/widgets/MediaRow';
import { MusicCollectionDetail } from '@/widgets/musicCollectionDetail/MusicCollectionDetail';
import { MusicRow } from '@/widgets/MusicRow';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showAlertDialog } from '@/widgets/overlays/AlertDialog';
import { showAppUpdateDialog } from '@/widgets/overlays/AppUpdateDialog';
import { showColorPickerPanel } from '@/widgets/overlays/ColorPickerPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import { showEqualizerPanel } from '@/widgets/overlays/EqualizerPanel';
import {
    showPluginAlternativePanel,
    type PluginAlternativeOptions,
} from '@/widgets/overlays/PluginAlternativePanel';
import { showPluginVariablesPanel } from '@/widgets/overlays/PluginVariablesPanel';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import type { OverlayProps } from '@/components/overlay';
import type { MusicItem } from '@/types';
import type {
    CollectionMenuAction,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';

const APP_UPDATE_DEMO_RELEASE = {
    version: '1.2.0',
    changeLog: [
        '优化应用启动速度与首屏加载体验',
        '新增播放队列的批量管理能力',
        '改进本地音乐扫描的进度反馈',
        '修复部分设备切换音频输出后无法继续播放的问题',
        '修复横屏下少数面板内容显示不完整的问题',
        '更新第三方开源许可清单',
    ],
    downloadUrls: [
        'https://example.com/download',
        'https://example.com/mirror-1',
        'https://example.com/mirror-2',
    ],
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                {title}
            </Text>
            <Box row gap="sm" align="flex-start" style={styles.row}>
                {children}
            </Box>
        </Box>
    );
}

function SeekBarDemo() {
    const [value, setValue] = useState(72);
    const [preview, setPreview] = useState<number | null>(null);
    const total = 212;
    const fmt = (s: number) =>
        `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    return (
        <Box gap="md">
            <Text weight="bold" size="lg">
                SeekBar
            </Text>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    {preview != null
                        ? `拖动预览 ${fmt(preview)}`
                        : `${fmt(value)} / ${fmt(total)} · 带缓冲段`}
                </Text>
                <SeekBar
                    value={value}
                    max={total}
                    buffered={Math.min(total, value + 30)}
                    onSeekChange={setPreview}
                    onSeekEnd={v => {
                        setValue(v);
                        setPreview(null);
                    }}
                    accessibilityLabel="播放进度"
                />
            </Box>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    thumb=active（仅触摸露头）
                </Text>
                <SeekBar
                    value={value}
                    max={total}
                    thumb="active"
                    onSeekEnd={setValue}
                />
            </Box>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    thumb=never + disabled（纯展示细条）
                </Text>
                <SeekBar
                    value={value}
                    max={total}
                    disabled
                    thumb="never"
                    trackHeight={3}
                />
            </Box>
        </Box>
    );
}

function SliderDemo() {
    const [volume, setVolume] = useState(0.6);
    const [opacity, setOpacity] = useState(0.7);
    return (
        <Box gap="md">
            <Text weight="bold" size="lg">
                Slider
            </Text>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    连续 · {Math.round(volume * 100)}%
                </Text>
                <Slider
                    value={volume}
                    max={1}
                    onChange={setVolume}
                    onChangeEnd={setVolume}
                    accessibilityLabel="音量"
                />
            </Box>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    step 0.1 吸附 · 背景透明度 {Math.round(opacity * 100)}%
                </Text>
                <Slider
                    value={opacity}
                    max={0.9}
                    step={0.1}
                    onChange={setOpacity}
                    onChangeEnd={setOpacity}
                    accessibilityLabel="背景透明度"
                />
            </Box>
            <Box gap="sm">
                <Text color="textSecondary" size="sm">
                    thumb=never + disabled（纯展示）
                </Text>
                <Slider
                    value={0.4}
                    max={1}
                    disabled
                    thumb="never"
                    trackHeight={3}
                />
            </Box>
        </Box>
    );
}

function VerticalSliderDemo() {
    const [vol, setVol] = useState(0.6);
    const [gain, setGain] = useState(300);
    const dbLabel = `${gain > 0 ? '+' : ''}${Math.round(gain / 100)} dB`;
    return (
        <Box gap="md">
            <Text weight="bold" size="lg">
                VerticalSlider
            </Text>
            <Box row gap="xl" align="flex-end">
                <Box gap="sm" align="center">
                    <Text color="textSecondary" size="sm">
                        音量 {Math.round(vol * 100)}%
                    </Text>
                    <VerticalSlider
                        value={vol}
                        max={1}
                        onChange={setVol}
                        onChangeEnd={setVol}
                        accessibilityLabel="音量"
                    />
                </Box>
                <Box gap="sm" align="center">
                    <Text color="textSecondary" size="sm">
                        双极 step · {dbLabel}
                    </Text>
                    <VerticalSlider
                        value={gain}
                        min={-1500}
                        max={1500}
                        step={100}
                        baseline={0}
                        showBaseline
                        onChange={setGain}
                        onChangeEnd={setGain}
                        accessibilityLabel="增益"
                        accessibilityValueText={dbLabel}
                    />
                </Box>
                <Box gap="sm" align="center">
                    <Text color="textSecondary" size="sm">
                        disabled
                    </Text>
                    <VerticalSlider value={0.4} max={1} disabled />
                </Box>
            </Box>
        </Box>
    );
}

function ColorPickerDemo() {
    const [color, setColor] = useState('#F2600AFF');
    return (
        <Box gap="md">
            <Text weight="bold" size="lg">
                ColorPicker
            </Text>
            <Text color="textSecondary" size="sm">
                当前 {color}
            </Text>
            <ColorPicker value={color} onChange={setColor} />
            <Button
                size="sm"
                onPress={() =>
                    showColorPickerPanel({
                        title: '文字颜色',
                        value: color,
                        defaultValue: '#F2600AFF',
                        onChange: setColor,
                    })
                }
            >
                打开取色面板
            </Button>
        </Box>
    );
}

/**
 * dev 演示面板（内联 definePanel）：验证抽屉栈——嵌套子面板、隐藏层 active/visible、await 结果
 */
function DemoPanel({
    payload,
    close,
}: OverlayProps<{ depth: number }, string>) {
    const { active, visible } = useOverlayStatus();
    return (
        <Box gap="md" px="lg">
            <Text weight="bold" size="lg">
                面板 · 第 {payload.depth} 层
            </Text>
            <Text color="textSecondary">
                active={String(active)} · visible={String(visible)}
            </Text>
            <Box row gap="sm" style={styles.row}>
                <Button
                    size="sm"
                    onPress={() => showDemoPanel({ depth: payload.depth + 1 })}
                >
                    打开子面板
                </Button>
                <Button
                    size="sm"
                    onPress={() => close(`来自第 ${payload.depth} 层`)}
                >
                    返回结果
                </Button>
                <Button size="sm" onPress={() => close()}>
                    关闭
                </Button>
                <Button
                    size="sm"
                    onPress={() =>
                        showConfirmDialog({
                            title: '压在面板上的对话框',
                            message:
                                '返回键应先关我、再关面板；面板此刻应变暗且不可点。',
                        })
                    }
                >
                    叠 dialog
                </Button>
            </Box>
        </Box>
    );
}
const showDemoPanel = definePanel(DemoPanel);

/** Input 演示：受控值需本地 state，故单列一个组件 */
function InputDemo() {
    const [text, setText] = useState('');
    const [search, setSearch] = useState('可清除的文字');
    const [multi, setMulti] = useState('');
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Input
            </Text>
            <Input
                value={text}
                onChangeText={setText}
                placeholder="请输入内容"
            />
            <Input
                value={search}
                onChangeText={setSearch}
                leadingIcon="search"
                clearable
                placeholder="搜索"
            />
            <Input
                value={multi}
                onChangeText={setMulti}
                placeholder="多行输入（最多 4 行后滚动）"
                multiline
                maxRows={4}
            />
            <Input value="不可编辑" onChangeText={() => undefined} disabled />
        </Box>
    );
}

/** Switch 演示：受控值需本地 state */
function SwitchDemo() {
    const [on, setOn] = useState(true);
    const [off, setOff] = useState(false);
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Switch
            </Text>
            <Box row gap="lg" align="center">
                <Switch
                    checked={on}
                    onChange={setOn}
                    accessibilityLabel="开关一"
                />
                <Switch
                    checked={off}
                    onChange={setOff}
                    accessibilityLabel="开关二"
                />
                <Switch
                    checked
                    disabled
                    onChange={() => undefined}
                    accessibilityLabel="禁用开关"
                />
            </Box>
        </Box>
    );
}

/** Checkbox 演示：纯视觉件，未选空心 / 选中填充带对勾 */
function CheckboxDemo() {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Checkbox
            </Text>
            <Box row gap="lg" align="center">
                <Checkbox checked={false} />
                <Checkbox checked />
            </Box>
        </Box>
    );
}

/** Radio 演示：Checkbox 的圆形孪生，同边长，单选语境用 */
function RadioDemo() {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Radio
            </Text>
            <Box row gap="lg" align="center">
                <Radio selected={false} />
                <Radio selected />
                {/* 与 Checkbox 并排：核对二者边长 / 描边 / 选中色一致，换用不跳位 */}
                <Checkbox checked={false} />
                <Checkbox checked />
            </Box>
        </Box>
    );
}

function ContentUnavailableDemo() {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                ContentUnavailable
            </Text>
            <Box style={styles.contentUnavailableBox}>
                <ContentUnavailable
                    icon="inbox"
                    title="还没有已安装的插件"
                    description="添加一个插件来获取音源、歌词或榜单数据"
                    action={{
                        label: '添加插件',
                        icon: 'plus',
                        onPress: () => showToast('添加插件'),
                    }}
                />
            </Box>
            <Box style={styles.contentUnavailableBox}>
                <ContentUnavailable
                    icon="triangle-alert"
                    title="加载失败"
                    description="网络似乎出了点问题，请检查连接后重试"
                    action={{ label: '重试', onPress: () => showToast('重试') }}
                />
            </Box>
        </Box>
    );
}

/** ListItem 演示：前导 / 标题+副标题 / 尾部三个槽位和选中态；文本样式由调用方决定 */
function ListItemDemo() {
    const colors = useColors();
    const more = (
        <IconButton
            icon="ellipsis-vertical"
            edgeAlign="end"
            accessibilityLabel="更多操作"
            onPress={() => showToast('更多')}
        />
    );
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                ListItem
            </Text>
            <Box style={[styles.listCard, { backgroundColor: colors.surface }]}>
                <ListItem
                    title={
                        <Text size="lg" numberOfLines={1}>
                            平铺行（无前导）
                        </Text>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            示例歌手 - 示例专辑
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="平铺行"
                    onPress={() => showToast('播放：平铺行')}
                />
                <ListItem
                    leading={
                        <Text
                            size="lg"
                            color="textSecondary"
                            style={styles.listIndex}
                        >
                            2
                        </Text>
                    }
                    title={
                        <Text size="lg" numberOfLines={1}>
                            有序行（序号前导）
                        </Text>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            示例歌手 - 示例专辑
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="有序行"
                    onPress={() => showToast('播放：有序行')}
                />
                <ListItem
                    selected
                    title={
                        <Box row align="center" gap="xs">
                            <Text
                                size="lg"
                                color="onPrimarySoft"
                                weight="medium"
                                numberOfLines={1}
                            >
                                当前播放（selected）
                            </Text>
                            <Icon name="play" size="xs" color="onPrimarySoft" />
                        </Box>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            示例歌手 - 示例专辑
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="当前播放行"
                    onPress={() => showToast('播放：当前行')}
                />
                <ListItem
                    leading={<Icon name="list-checks" color="textSecondary" />}
                    title={
                        <Text size="lg" numberOfLines={1}>
                            仅标题 + 前导图标
                        </Text>
                    }
                    accessibilityLabel="仅标题行"
                    onPress={() => showToast('仅标题行')}
                />
                <ListItem
                    title={
                        <Text size="lg" color="textSecondary" numberOfLines={1}>
                            不可点行（无 onPress）
                        </Text>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            纯展示，无按压反馈
                        </Text>
                    }
                />
            </Box>
        </Box>
    );
}

/** 演示 Tag 的基础用法、长文本截断及其在 selected 行中保持中性色 */
function TagDemo() {
    const colors = useColors();
    const more = (
        <IconButton
            icon="ellipsis-vertical"
            edgeAlign="end"
            accessibilityLabel="更多操作"
            onPress={() => showToast('更多')}
        />
    );
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Tag
            </Text>
            <Box
                accessible
                accessibilityLabel="标签示例：示例音源 A，歌词增强"
                row
                gap="sm"
                align="center"
                style={styles.row}
            >
                <Tag label="示例音源 A" />
                <Tag label="歌词增强" />
            </Box>
            <Box style={[styles.listCard, { backgroundColor: colors.surface }]}>
                <ListItem
                    title={
                        <Box row align="center" gap="xs">
                            <Text
                                size="lg"
                                numberOfLines={1}
                                style={styles.tagTitle}
                            >
                                雨后电台
                            </Text>
                            <Box style={styles.tagSlot}>
                                <Tag label="示例音源 A" />
                            </Box>
                        </Box>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            林间合唱团 - 慢速公路
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="雨后电台，林间合唱团，示例音源 A"
                    onPress={() => showToast('播放：雨后电台')}
                />
                <ListItem
                    title={
                        <Box
                            row
                            align="center"
                            gap="xs"
                            style={styles.tagPressureLine}
                        >
                            <Text
                                size="lg"
                                numberOfLines={1}
                                style={styles.tagTitle}
                            >
                                一首名称很长但仍需优先辨认的曲目
                            </Text>
                            <Box style={styles.tagSlot}>
                                <Tag label="示例音源超长扩展服务" />
                            </Box>
                        </Box>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            示例歌手 - 很长的专辑名称
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="一首名称很长但仍需优先辨认的曲目，示例歌手，示例音源超长扩展服务"
                    onPress={() => showToast('播放：长标题')}
                />
                <ListItem
                    selected
                    title={
                        <Box row align="center" gap="xs">
                            <Icon name="play" size="xs" color="onPrimarySoft" />
                            <Text
                                size="lg"
                                color="onPrimarySoft"
                                weight="medium"
                                numberOfLines={1}
                                style={styles.tagTitle}
                            >
                                当前播放
                            </Text>
                            <Box style={styles.tagSlot}>
                                <Tag label="歌词增强" />
                            </Box>
                        </Box>
                    }
                    subtitle={
                        <Text size="md" color="textSecondary" numberOfLines={1}>
                            示例乐队 - 向前的夜
                        </Text>
                    }
                    trailing={more}
                    accessibilityLabel="当前播放，示例乐队，歌词增强"
                    onPress={() => showToast('播放：当前行')}
                />
            </Box>
        </Box>
    );
}

function LoadingDemo() {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Loading
            </Text>
            <Box row gap="lg" align="center" style={styles.row}>
                <Loading />
                <Loading label="同步中" />
            </Box>
            <Box style={styles.loadingFullscreen}>
                <Loading variant="fullscreen" label="正在加载插件列表…" />
            </Box>
        </Box>
    );
}

const DEMO_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

function ImageDemo() {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Image
            </Text>
            <Box row gap="lg" align="center" style={styles.row}>
                <Image
                    source="https://picsum.photos/seed/musicfree/240/144"
                    placeholder={{ blurhash: DEMO_BLURHASH }}
                    style={styles.demoImage}
                    accessibilityLabel="示例图片 · cover"
                />
                <Image
                    source="https://picsum.photos/seed/mf2/240/144"
                    contentFit="contain"
                    style={styles.demoImage}
                    accessibilityLabel="示例图片 · contain"
                />
            </Box>
        </Box>
    );
}

const DEMO_MARKDOWN = [
    '## 使用说明',
    '',
    '这是一段 **粗体**、*斜体*、~~删除线~~ 与 `行内 code` 的说明，支持 [链接](https://example.com)。',
    '',
    '- 列表项一',
    '  - 123',
    '- 列表项二，较长内容验证悬挂缩进换行对齐',
    '',
    '> 引用：注意接口限流，请合理使用',
    '',
    '```',
    '代码块示例',
    '第二行',
    '```',
    '',
    '![示例图片](https://picsum.photos/seed/mdimg/480/240)',
].join('\n');

function MarkdownDemo() {
    const openLink = (url: string) => {
        Linking.openURL(url).catch(() => undefined);
    };
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Markdown
            </Text>
            <Text size="sm" color="textSecondary">
                默认门控（点击展示图片）
            </Text>
            <Markdown source={DEMO_MARKDOWN} onOpenLink={openLink} />
            <Text size="sm" color="textSecondary">
                showImages（直接展示）
            </Text>
            <Markdown source={DEMO_MARKDOWN} onOpenLink={openLink} showImages />
        </Box>
    );
}

function MediaListDemo() {
    const [open, setOpen] = useState(false);
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                MediaList
            </Text>
            <Text size="sm" color="textSecondary">
                FlashList 是整页滚动容器，需全屏预览（嵌在本页 ScrollView
                内无法虚拟化 / 滚动）
            </Text>
            <Button size="sm" onPress={() => setOpen(true)}>
                全屏预览
            </Button>
            <Modal
                visible={open}
                animationType="slide"
                onRequestClose={() => setOpen(false)}
            >
                {open ? (
                    <MediaListPreview onClose={() => setOpen(false)} />
                ) : null}
            </Modal>
        </Box>
    );
}

// 全屏预览内容：脱离外层 ScrollView，MediaList 作唯一滚动容器；
// Modal 是独立原生视图树，需自带 SafeAreaProvider 才能拿到状态栏安全区（否则内容穿透状态栏）
function MediaListPreview({ onClose }: { onClose: () => void }) {
    const colors = useColors();
    const [mode, setMode] = useState<'data' | 'empty' | 'loading'>('data');
    const items =
        mode === 'data'
            ? Array.from({ length: 20 }, (_, i) => `示例曲目 ${i + 1}`)
            : [];
    // 验证 onScroll 走 UI 线程：封面头随列表滚走，浮层 AppBar 随下滑淡入（即真实歌单页动线）
    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler(event => {
        scrollY.value = event.contentOffset.y;
    });
    const pinnedBarStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            scrollY.value,
            [0, 120],
            [0, 1],
            Extrapolation.CLAMP,
        ),
    }));
    return (
        <SafeAreaProvider>
            <Screen edges={['top', 'bottom']}>
                <Box
                    row
                    gap="sm"
                    style={[styles.row, styles.mediaListModalBar]}
                >
                    <Button
                        size="sm"
                        variant={mode === 'data' ? 'filled' : 'outline'}
                        onPress={() => setMode('data')}
                    >
                        有数据 + 翻页
                    </Button>
                    <Button
                        size="sm"
                        variant={mode === 'empty' ? 'filled' : 'outline'}
                        onPress={() => setMode('empty')}
                    >
                        空态
                    </Button>
                    <Button
                        size="sm"
                        variant={mode === 'loading' ? 'filled' : 'outline'}
                        onPress={() => setMode('loading')}
                    >
                        初次加载
                    </Button>
                    <Button size="sm" variant="ghost" onPress={onClose}>
                        关闭
                    </Button>
                </Box>
                <Box style={styles.mediaListModal}>
                    <MediaList
                        data={items}
                        keyExtractor={item => item}
                        isLoading={mode === 'loading'}
                        hasNextPage={mode === 'data'}
                        isFetchingNextPage={mode === 'data'}
                        onScroll={onScroll}
                        contentContainerStyle={styles.mediaListModalContent}
                        ListHeaderComponent={
                            <Box
                                style={[
                                    styles.mediaListHeader,
                                    { backgroundColor: colors.primarySoft },
                                ]}
                            >
                                <Text size="lg" color="onPrimarySoft">
                                    封面头（ListHeaderComponent）
                                </Text>
                                <Text size="sm" color="onPrimarySoft">
                                    随列表向上滚走 · 加载中也常驻
                                </Text>
                            </Box>
                        }
                        empty={{
                            icon: 'inbox',
                            title: '没有找到内容',
                            description: '换个关键词再试试',
                        }}
                        renderItem={({ item }) => (
                            <ListItem
                                title={
                                    <Text size="lg" numberOfLines={1}>
                                        {item}
                                    </Text>
                                }
                                subtitle={
                                    <Text
                                        size="md"
                                        color="textSecondary"
                                        numberOfLines={1}
                                    >
                                        示例歌手 · 示例专辑
                                    </Text>
                                }
                                accessibilityLabel={item}
                                onPress={() => showToast(`播放：${item}`)}
                            />
                        )}
                    />
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.mediaListPinnedBar,
                            pinnedBarStyle,
                            { backgroundColor: colors.primary },
                        ]}
                    >
                        <Text size="sm" color="onPrimary">
                            浮层 AppBar · 下滑淡入（onScroll 驱动）
                        </Text>
                    </Animated.View>
                </Box>
            </Screen>
        </SafeAreaProvider>
    );
}

type FakeCollectionMode = 'local' | 'remote' | 'empty' | 'loading' | 'error';

// 假 source：验证「行为由数据驱动」——本地有 sort、远程有 star/pagination
function buildFakeSource(mode: FakeCollectionMode): MusicCollectionSource {
    const toast = (msg: string) => showToast(msg, { type: 'info' });
    const header = {
        artwork: COLLECTION_SONGS[0]?.artwork || undefined,
        fallbackIcon: 'list-music' as const,
        title: '深夜播放列表 · 示例歌单',
        description:
            '收录深夜适合独处时聆听的慢歌与器乐，从城市夜景到失眠时分的白噪音，按情绪起伏编排；描述较长时头部只显两行、点整行展开底部面板看全文。',
        details: ['创建于 2026'],
    };
    const itemOptionsSource = { kind: 'generic' } as const;
    const overflowActions: CollectionMenuAction[] = [
        { label: '编辑信息', onPress: () => toast('编辑信息') },
        { label: '删除歌单', danger: true, onPress: () => toast('删除歌单') },
    ];
    if (mode === 'loading') {
        return {
            header,
            musicList: [],
            listState: 'loading',
            overflowActions: [],
            itemOptionsSource,
        };
    }
    if (mode === 'error') {
        return {
            header,
            musicList: [],
            listState: 'error',
            retryInitialLoad: () => toast('重试'),
            overflowActions: [],
            itemOptionsSource,
        };
    }
    if (mode === 'empty') {
        return {
            header,
            musicList: [],
            listState: 'ready',
            overflowActions,
            itemOptionsSource,
        };
    }
    if (mode === 'remote') {
        return {
            kind: 'playlist',
            header: {
                ...header,
                creator: { name: '示例创建者' },
                details: ['播放量 1234 万'],
            },
            musicList: COLLECTION_SONGS,
            listState: 'ready',
            pagination: {
                hasMore: true,
                isLoadingMore: false,
                hasLoadMoreError: false,
                loadMore: () => toast('加载更多'),
            },
            star: {
                isStarred: false,
                isPending: false,
                onToggle: () => toast('收藏'),
            },
            overflowActions: [],
            itemOptionsSource,
        };
    }
    return {
        kind: 'playlist',
        header,
        musicList: COLLECTION_SONGS,
        listState: 'ready',
        sort: {
            activeKey: 'manual',
            options: [
                { key: 'manual', label: '手动排序' },
                { key: 'title', label: '按标题' },
                { key: 'newest', label: '最近添加' },
            ],
            onSelect: k => toast(`排序：${k}`),
        },
        overflowActions,
        itemOptionsSource,
    };
}

function MusicCollectionDetailPreview({ onClose }: { onClose: () => void }) {
    const [mode, setMode] = useState<FakeCollectionMode>('local');
    const source = useMemo(() => buildFakeSource(mode), [mode]);
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const modeBtn = (m: FakeCollectionMode, label: string) => (
        <Button
            size="sm"
            variant={mode === m ? 'filled' : 'outline'}
            onPress={() => setMode(m)}
        >
            {label}
        </Button>
    );
    // 全屏沉浸页：从物理屏顶铺满，ImmersiveAppBar 独占 top inset
    // （勿再套吃 top 的 Screen，否则双重 inset 会把 AppBar 顶到封面中部）
    return (
        <Box flex={1} bg="background">
            <StatusBar
                translucent
                backgroundColor="transparent"
                barStyle="dark-content"
            />
            <MusicCollectionDetail source={source} />
            {/* dev 模式切换栏：浮底部，不占顶部 inset */}
            <Box
                bg="surface"
                style={[
                    styles.collectionPreviewBar,
                    {
                        paddingBottom: insets.bottom + space.sm,
                        borderTopColor: colors.border,
                    },
                ]}
            >
                <Box row gap="sm" style={styles.row}>
                    {modeBtn('local', '本地')}
                    {modeBtn('remote', '远程')}
                    {modeBtn('empty', '空')}
                    {modeBtn('loading', '加载')}
                    {modeBtn('error', '错误')}
                    <Button size="sm" variant="ghost" onPress={onClose}>
                        关闭
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}

function MusicCollectionDetailDemo({
    onOpenPreview,
}: {
    onOpenPreview: (node: ReactNode | null) => void;
}) {
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                MusicCollectionDetail
            </Text>
            <Text size="sm" color="textSecondary">
                整页业务 widget（假 source）；本地 / 远程差异由数据驱动 ·
                全屏预览
            </Text>
            <Button
                size="sm"
                onPress={() =>
                    onOpenPreview(
                        <MusicCollectionDetailPreview
                            onClose={() => onOpenPreview(null)}
                        />,
                    )
                }
            >
                全屏预览
            </Button>
        </Box>
    );
}

const MUSIC_ROW_SONGS: MusicItem[] = [
    {
        platform: '示例音源',
        id: 'mr-1',
        title: '海岸线以北',
        artist: '林栋',
        album: '晚潮',
        artwork: '',
        duration: 0,
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    },
    {
        platform: '示例音源',
        id: 'mr-2',
        title: '停在海风里',
        artist: '安然',
        album: '漂流信号',
        artwork: '',
        duration: 0,
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    },
    {
        platform: '歌词增强超长来源名称示例',
        id: 'mr-3',
        title: '一首名称很长很长很长用来验证标题与来源标签一起截断的曲目',
        artist: '示例歌手',
        album: '',
        artwork: '',
        duration: 0,
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    },
];

// 详情预览用更长的列表，滚动后才能看到 AppBar 实底态与播放条样式
const COLLECTION_SONGS: MusicItem[] = [
    ...MUSIC_ROW_SONGS,
    ...Array.from({ length: 24 }, (_, i): MusicItem => {
        const n = i + 1;
        const artists = ['林栋', '安然', '南声岛', '未名河', '海屿', '青野'];
        const albums = ['晚潮', '漂流信号', '夜航班', '折返点', '白噪音', ''];
        return {
            platform: '示例音源',
            id: `col-${n}`,
            title: `示例曲目 ${n} · 深夜聆听`,
            artist: artists[i % artists.length] ?? '示例歌手',
            album: albums[i % albums.length] ?? '',
            artwork: '',
            duration: 0,
            url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${
                (i % 8) + 1
            }.mp3`,
        };
    }),
];

function MusicRowDemo() {
    const colors = useColors();
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                MusicRow（点按真实播放，当前曲高亮）
            </Text>
            <Box style={[styles.listCard, { backgroundColor: colors.surface }]}>
                {MUSIC_ROW_SONGS.map((item, i) => (
                    <MusicRow
                        key={item.id}
                        item={item}
                        position={i === 0 ? 1 : undefined}
                        onMore={m => showToast(`更多：${m.title}`)}
                    />
                ))}
            </Box>
        </Box>
    );
}

function MediaRowDemo() {
    const colors = useColors();
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                MediaRow（专辑 / 歌手 / 歌单）
            </Text>
            <Box style={[styles.listCard, { backgroundColor: colors.surface }]}>
                <MediaRow
                    type="album"
                    item={{
                        platform: '示例音源',
                        id: 'al-1',
                        title: '晚潮',
                        artist: '林栋',
                        artwork:
                            'https://raw.githubusercontent.com/maotoumao/MusicFree/master/src/assets/imgs/logo.png',
                        worksNum: 10,
                    }}
                    onPress={() => showToast('专辑：晚潮')}
                />
                <MediaRow
                    type="album"
                    item={{
                        platform: '示例音源',
                        id: 'al-2',
                        title: '缺封面的专辑（disc-3 兜底）',
                        artist: '安然',
                        worksNum: 8,
                    }}
                    onPress={() => showToast('专辑：缺封面')}
                />
                <MediaRow
                    type="artist"
                    item={{
                        platform: '示例音源',
                        id: 'ar-1',
                        name: '北岛乐队',
                        worksNum: 120,
                    }}
                    onPress={() => showToast('歌手：北岛乐队')}
                />
                <MediaRow
                    type="playlist"
                    item={{
                        platform: '歌词增强',
                        id: 'pl-1',
                        title: '海风收集站',
                        artist: '林栋',
                        worksNum: 42,
                    }}
                    onPress={() => showToast('歌单：海风收集站')}
                />
            </Box>
        </Box>
    );
}

function AppBarDemo() {
    const [query, setQuery] = useState('');
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                AppBar · 文字动作 + center
            </Text>
            <AppBar
                style={styles.appBarDemo}
                leading={{
                    icon: 'chevron-left',
                    label: '返回',
                    onPress: () => showToast('返回'),
                }}
                center={
                    <Input
                        value={query}
                        onChangeText={setQuery}
                        size="md"
                        leadingIcon="search"
                        clearable
                        placeholder="在这里搜索内容"
                        accessibilityLabel="搜索输入框"
                    />
                }
                actions={[{ label: '搜索', onPress: () => showToast('搜索') }]}
            />
        </Box>
    );
}

function ChipDemo() {
    const [category, setCategory] = useState('华语');
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Chip
            </Text>
            <Box row gap="sm" style={styles.chipRow}>
                <Chip label="周杰伦" onPress={() => showToast('周杰伦')} />
                <Chip label="夜曲" onPress={() => showToast('夜曲')} />
                <Chip label="七里香" onPress={() => showToast('七里香')} />
                <Chip label="晴天" onPress={() => showToast('晴天')} />
            </Box>
            {/* 受控 selected 单选组：所有项声明选中态、点击切换当前项（分类筛选） */}
            <Box row gap="sm" style={styles.chipRow}>
                {['华语', '欧美', '日语'].map(c => (
                    <Chip
                        key={c}
                        label={c}
                        selected={category === c}
                        onPress={() => setCategory(c)}
                    />
                ))}
            </Box>
        </Box>
    );
}

const DEMO_TAB_ITEMS = [
    { key: 'music', label: '单曲' },
    { key: 'album', label: '专辑' },
    { key: 'artist', label: '歌手' },
    { key: 'playlist', label: '歌单' },
] as const;
type DemoTabKey = (typeof DEMO_TAB_ITEMS)[number]['key'];

function TabsDemo() {
    const [type, setType] = useState<DemoTabKey>('music');
    return (
        <Box gap="sm">
            <Text weight="bold" size="lg">
                Tabs
            </Text>
            <Tabs items={DEMO_TAB_ITEMS} value={type} onChange={setType} />
        </Box>
    );
}

function ActionSheetSection() {
    return (
        <Section title="ActionSheet">
            <Button
                size="sm"
                onPress={() =>
                    showActionSheetPanel({
                        items: [
                            {
                                icon: 'plus',
                                label: '从网络地址安装',
                                onPress: () => showToast('从网络地址安装'),
                            },
                            {
                                icon: 'inbox',
                                label: '从本地文件安装',
                                onPress: () => showToast('从本地文件安装'),
                            },
                        ],
                    })
                }
            >
                页面级（无标题）
            </Button>
            <Button
                size="sm"
                onPress={() =>
                    showActionSheetPanel({
                        title: '示例音源',
                        items: [
                            {
                                icon: 'settings',
                                label: '检查更新',
                                onPress: () => showToast('检查更新'),
                            },
                            {
                                icon: 'x',
                                label: '卸载',
                                danger: true,
                                separatorBefore: true,
                                onPress: () =>
                                    showToast('卸载', { type: 'error' }),
                            },
                        ],
                    })
                }
            >
                条目级（带标题）
            </Button>
        </Section>
    );
}

function PluginVariablesPanelSection() {
    return (
        <Section title="PluginVariablesPanel">
            <Button
                size="sm"
                onPress={async () => {
                    const values = await showPluginVariablesPanel({
                        platform: '示例插件 A',
                        variables: [
                            {
                                key: 'apiHost',
                                name: 'API 地址',
                                hint: '留空则使用插件内置地址',
                            },
                            { key: 'token', name: '访问令牌' },
                            { key: 'quality', name: '音质偏好' },
                            { key: 'region', name: '区域' },
                            { key: 'language', name: '语言' },
                            {
                                key: 'note',
                                name: '备注',
                                hint: '多字段时内容区可独立滚动，标题与底部操作保持稳定',
                            },
                        ],
                        currentValues: {
                            apiHost: 'https://example.com',
                            quality: 'standard',
                            staleKey: '保存后不返回',
                        },
                    });
                    showToast(
                        values
                            ? `已返回 ${Object.keys(values).length} 项变量`
                            : '已取消',
                        { type: values ? 'success' : 'info' },
                    );
                }}
            >
                多字段
            </Button>
            <Button
                size="sm"
                onPress={() =>
                    showPluginVariablesPanel({
                        platform: '示例插件 B',
                        variables: [],
                        currentValues: {},
                    })
                }
            >
                空 schema
            </Button>
            <Button
                size="sm"
                onPress={async () => {
                    const variables = Array.from(
                        { length: 18 },
                        (_, index) => ({
                            key: `field${index + 1}`,
                            name: `字段 ${index + 1}`,
                            hint:
                                index % 3 === 0
                                    ? '用于验证超长表单的连续滚动与键盘边界'
                                    : undefined,
                        }),
                    );
                    const values = await showPluginVariablesPanel({
                        platform: '示例插件 C',
                        variables,
                        currentValues: {
                            field1: '首项已有值',
                            field18: '末项已有值',
                        },
                    });
                    showToast(
                        values
                            ? `已返回 ${Object.keys(values).length} 项变量`
                            : '已取消',
                        { type: values ? 'success' : 'info' },
                    );
                }}
            >
                超长列表
            </Button>
        </Section>
    );
}

async function showPluginAlternativeDemo(options: PluginAlternativeOptions) {
    const result = await showPluginAlternativePanel(options);
    const message =
        result === undefined
            ? '已取消'
            : result === null
            ? '已选择：不使用替代源'
            : `已选择：${result}`;
    showToast(message, { type: result === undefined ? 'info' : 'success' });
}

function PluginAlternativePanelSection() {
    return (
        <Section title="PluginAlternativePanel">
            <Button
                size="sm"
                onPress={() =>
                    showPluginAlternativeDemo({
                        platform: '示例插件 A',
                        candidates: ['示例插件 B', '歌词增强'],
                        currentAlternative: '示例插件 B',
                    })
                }
            >
                正常选中
            </Button>
            <Button
                size="sm"
                onPress={() =>
                    showPluginAlternativeDemo({
                        platform: '示例插件 A',
                        candidates: ['示例插件 B', '歌词增强'],
                        currentAlternative: '已卸载示例源',
                    })
                }
            >
                失效当前值
            </Button>
            <Button
                size="sm"
                onPress={() =>
                    showPluginAlternativeDemo({
                        platform: '示例插件 A',
                        candidates: [],
                        currentAlternative: null,
                    })
                }
            >
                仅不使用
            </Button>
            <Button
                size="sm"
                onPress={() =>
                    showPluginAlternativeDemo({
                        platform: '示例插件 A',
                        candidates: Array.from(
                            { length: 24 },
                            (_, index) => `示例插件 ${index + 1}`,
                        ),
                        currentAlternative: '示例插件 18',
                    })
                }
            >
                超长候选
            </Button>
        </Section>
    );
}

/**
 * dev 组件展示墙：各基础组件的活样例；建新组件时在此加分区（取代一次性探针）
 */
export default function ComponentGalleryScreen() {
    const back = useBackAction();
    const [preview, setPreview] = useState<ReactNode | null>(null);
    const [skippedUpdateVersion, setSkippedUpdateVersion] = useState<
        string | null
    >(null);

    const showUpdateDemo = async () => {
        const release = APP_UPDATE_DEMO_RELEASE;
        const openDownload = (addressNumber: number) => {
            setSkippedUpdateVersion(null);
            showToast(`模拟打开下载地址 ${addressNumber}`, {
                type: 'success',
            });
        };
        const action = await showAppUpdateDialog({
            release,
            initialSkipVersion: skippedUpdateVersion === release.version,
            onSkipVersionChange: skipped => {
                setSkippedUpdateVersion(skipped ? release.version : null);
            },
        });
        if (action === 'otherDownloads') {
            showActionSheetPanel({
                title: '备用地址',
                items: release.downloadUrls.slice(1).map((_, index) => ({
                    label: `下载地址 ${index + 2}`,
                    onPress: () => openDownload(index + 2),
                })),
            });
        } else if (action === 'download') {
            openDownload(1);
        }
    };

    if (preview) {
        return preview;
    }
    return (
        <Screen edges={['bottom']}>
            <AppBar
                title="组件展示"
                leading={back}
                actions={[
                    {
                        icon: 'search',
                        label: '搜索',
                        onPress: () => showToast('搜索'),
                    },
                    {
                        icon: 'plus',
                        label: '添加',
                        onPress: () => showToast('添加'),
                    },
                ]}
                overflow={{
                    onPress: () =>
                        showActionSheetPanel({
                            items: [
                                {
                                    icon: 'settings',
                                    label: '排序插件',
                                    onPress: () => showToast('排序插件'),
                                },
                                {
                                    icon: 'plus',
                                    label: '订阅源设置',
                                    onPress: () => showToast('订阅源设置'),
                                },
                                {
                                    icon: 'x',
                                    label: '批量卸载',
                                    danger: true,
                                    separatorBefore: true,
                                    onPress: () =>
                                        showToast('批量卸载', {
                                            type: 'error',
                                        }),
                                },
                            ],
                        }),
                }}
            />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
            >
                <Section title="图标 · 尺寸">
                    <Icon name="search" size="sm" />
                    <Icon name="search" size="md" />
                    <Icon name="search" size="lg" />
                    <Icon name="search" size="xl" />
                    <Icon name="search" size="2xl" />
                    <Icon name="search" size="3xl" />
                </Section>
                <Section title="图标 · 语义色 + override">
                    <Icon name="check" color="text" />
                    <Icon name="check" color="textSecondary" />
                    <Icon name="check" color="primary" />
                    <Icon name="check" color="danger" />
                    <Icon name="settings" color="#e91e63" />
                </Section>
                <Section title="图标 · 常用（末个带 a11y label）">
                    <Icon name="play" />
                    <Icon name="pause" />
                    <Icon name="plus" />
                    <Icon name="x" />
                    <Icon name="chevron-right" />
                    <Icon name="settings" accessibilityLabel="设置" />
                </Section>
                <Section title="Button · 变体">
                    <Button
                        variant="filled"
                        onPress={() => showToast('filled')}
                    >
                        filled
                    </Button>
                    <Button
                        variant="outline"
                        onPress={() => showToast('outline')}
                    >
                        outline
                    </Button>
                    <Button variant="ghost" onPress={() => showToast('ghost')}>
                        ghost
                    </Button>
                    <Button variant="soft" onPress={() => showToast('soft')}>
                        soft
                    </Button>
                </Section>
                <Section title="Button · 语气">
                    <Button tone="primary" onPress={() => showToast('primary')}>
                        primary
                    </Button>
                    <Button
                        tone="danger"
                        onPress={() => showToast('danger', { type: 'error' })}
                    >
                        danger
                    </Button>
                    <Button tone="neutral" onPress={() => showToast('neutral')}>
                        neutral
                    </Button>
                </Section>
                <Section title="Button · 尺寸">
                    <Button size="sm" onPress={() => showToast('sm')}>
                        sm
                    </Button>
                    <Button size="md" onPress={() => showToast('md')}>
                        md
                    </Button>
                    <Button size="lg" onPress={() => showToast('lg')}>
                        lg
                    </Button>
                </Section>
                <Section title="Button · 状态/图标">
                    <Button icon="plus" onPress={() => showToast('新建')}>
                        带图标
                    </Button>
                    <Button loading onPress={() => undefined}>
                        加载中
                    </Button>
                    <Button disabled onPress={() => undefined}>
                        禁用
                    </Button>
                    <Button
                        variant="outline"
                        tone="danger"
                        icon="x"
                        onPress={() => showToast('删除', { type: 'error' })}
                    >
                        删除
                    </Button>
                </Section>
                <Section title="IconButton">
                    <IconButton
                        icon="search"
                        accessibilityLabel="搜索"
                        onPress={() => showToast('搜索')}
                    />
                    <IconButton
                        icon="settings"
                        tone="primary"
                        accessibilityLabel="设置"
                        onPress={() => showToast('设置')}
                    />
                    <IconButton
                        icon="x"
                        tone="danger"
                        accessibilityLabel="关闭"
                        onPress={() => showToast('关闭', { type: 'error' })}
                    />
                    <IconButton
                        icon="play"
                        disabled
                        accessibilityLabel="播放"
                        onPress={() => undefined}
                    />
                </Section>
                <InputDemo />
                <SwitchDemo />
                <CheckboxDemo />
                <RadioDemo />
                <SeekBarDemo />
                <SliderDemo />
                <VerticalSliderDemo />
                <ColorPickerDemo />
                <LoadingDemo />
                <ImageDemo />
                <MarkdownDemo />
                <ContentUnavailableDemo />
                <ListItemDemo />
                <MediaListDemo />
                <MusicCollectionDetailDemo onOpenPreview={setPreview} />
                <MusicRowDemo />
                <MediaRowDemo />
                <AppBarDemo />
                <TagDemo />
                <ChipDemo />
                <TabsDemo />
                <ActionSheetSection />
                <PluginVariablesPanelSection />
                <PluginAlternativePanelSection />
                <Section title="Toast">
                    <Button
                        size="sm"
                        onPress={() => showToast('信息提示', { type: 'info' })}
                    >
                        info
                    </Button>
                    <Button
                        size="sm"
                        onPress={() =>
                            showToast('操作成功', { type: 'success' })
                        }
                    >
                        success
                    </Button>
                    <Button
                        size="sm"
                        onPress={() =>
                            showToast('注意警告', { type: 'warning' })
                        }
                    >
                        warning
                    </Button>
                    <Button
                        size="sm"
                        onPress={() => showToast('发生错误', { type: 'error' })}
                    >
                        error
                    </Button>
                    <Button
                        size="sm"
                        onPress={() =>
                            showToast(
                                '这是一条很长很长很长很长很长很长很长很长很长很长很长很长的提示，用来验证最多两行后省略号截断的效果',
                                { type: 'info' },
                            )
                        }
                    >
                        长文案
                    </Button>
                    <Button
                        size="sm"
                        onPress={() =>
                            showToast('已删除歌曲', {
                                type: 'success',
                                action: {
                                    label: '撤销',
                                    onPress: () =>
                                        showToast('已撤销', { type: 'info' }),
                                },
                            })
                        }
                    >
                        带 action
                    </Button>
                </Section>
                <Section title="Dialog">
                    <Button size="sm" onPress={showUpdateDemo}>
                        系统更新
                    </Button>
                    <Button
                        size="sm"
                        onPress={async () => {
                            const ok = await showConfirmDialog({
                                title: '删除歌曲',
                                message: '确定要删除吗？此操作不可撤销。',
                                danger: true,
                            });
                            showToast(ok ? '已确认删除' : '已取消', {
                                type: ok ? 'success' : 'info',
                            });
                        }}
                    >
                        confirm
                    </Button>
                    <Button
                        size="sm"
                        onPress={() =>
                            showAlertDialog({
                                title: '提示',
                                message: '这是一条 alert 提示。',
                            })
                        }
                    >
                        alert
                    </Button>
                </Section>
                <Section title="Panel">
                    <Button
                        size="sm"
                        onPress={() => showDemoPanel({ depth: 1 })}
                    >
                        打开面板
                    </Button>
                    <Button
                        size="sm"
                        onPress={async () => {
                            const r = await showDemoPanel({ depth: 1 });
                            showToast(r ? `结果：${r}` : '面板被取消', {
                                type: r ? 'success' : 'info',
                            });
                        }}
                    >
                        await 结果
                    </Button>
                    <Button
                        size="sm"
                        onPress={async () => {
                            const text = await showTextPromptPanel<string>({
                                title: '重命名歌单',
                                placeholder: '输入名称',
                                defaultValue: '我喜欢的音乐',
                                onSubmit: async value => ({
                                    ok: true,
                                    result: value,
                                }),
                            });
                            showToast(
                                text !== undefined ? `输入：${text}` : '已取消',
                                {
                                    type:
                                        text !== undefined ? 'success' : 'info',
                                },
                            );
                        }}
                    >
                        输入面板
                    </Button>
                    <Button size="sm" onPress={() => showEqualizerPanel()}>
                        音效面板
                    </Button>
                </Section>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: space.lg,
        gap: space.xl,
    },
    row: {
        flexWrap: 'wrap',
    },
    demoImage: {
        width: 140,
        height: 84,
        borderRadius: radius.md,
    },
    loadingFullscreen: {
        height: 140,
        alignSelf: 'stretch',
    },
    contentUnavailableBox: {
        height: 240,
        alignSelf: 'stretch',
    },
    listCard: {
        marginHorizontal: -space.lg,
        overflow: 'hidden',
    },
    mediaListModal: {
        flex: 1,
    },
    mediaListModalBar: {
        flexWrap: 'wrap',
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
        paddingBottom: space.sm,
    },
    collectionPreviewBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    mediaListModalContent: {
        paddingBottom: space.xl,
    },
    mediaListHeader: {
        height: 160,
        paddingHorizontal: space.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
    },
    mediaListPinnedBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingVertical: space.md,
        alignItems: 'center',
    },
    appBarDemo: {
        paddingTop: 0,
        marginHorizontal: -space.lg,
    },
    chipRow: {
        flexWrap: 'wrap',
    },
    listIndex: {
        width: 24,
        textAlign: 'center',
    },
    tagTitle: {
        flex: 1,
        minWidth: 0,
    },
    tagSlot: {
        maxWidth: '33%',
        flexShrink: 1,
        justifyContent: 'center',
    },
    tagPressureLine: {
        maxWidth: 280,
    },
    scroll: {
        flex: 1,
    },
});
