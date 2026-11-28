import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Text } from '@/components/ui/Text';
import { errorLog, useErrorRecords } from '@/core/errorLog';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { copyText } from '@/infra/clipboard';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { ErrorRecord, ErrorSource } from '@/core/errorLog';
import type { TranslationKey } from '@/i18n';

/** 来源 → 文案 key；穷举由类型钉住，新增来源少写会在编译期报出 */
const SOURCE_KEY = {
    render: 'errorLog.sourceRender',
    uncaught: 'errorLog.sourceUncaught',
    localData: 'errorLog.sourceLocalData',
} satisfies Record<ErrorSource, TranslationKey>;

type SourceKey = (typeof SOURCE_KEY)[ErrorSource];

/**
 * 记录是从盘上读回来的，来源值可能来自别的版本（降级安装：新版写、旧版读）；查不到返回 undefined，
 * 调用方原样显示那个值——与复制出来的报告同一口径，也别让错误日志页自己白屏
 */
function sourceKeyOf(source: string): SourceKey | undefined {
    return (SOURCE_KEY as Partial<Record<string, SourceKey>>)[source];
}

/** 列表里只给一眼能认出是哪次的摘要；完整报告在复制出来的文本里 */
function summaryOf(record: ErrorRecord): string {
    return `${record.name}: ${record.message}`;
}

export default function ErrorLogScreen() {
    const t = useT();
    const colors = useColors();
    const back = useBackAction();
    // 平板：卡片列限阅读宽；列表容器自管内容线（卡片不带横向内距）
    const column = useContentColumn('reading', { gutter: 'self' });
    const records = useErrorRecords();

    // 读盘推迟到进页：启动路径不付这个代价。首帧是空列表、水合后补上，
    // 这是个极少访问的诊断页，多一次渲染无所谓
    useEffect(() => {
        errorLog.getRecords();
    }, []);

    const copyOne = (record: ErrorRecord) => {
        const report = errorLog.formatReport(record.id);
        if (!report) {
            return;
        }
        copyText(report)
            .then(() => showToast(t('errorScreen.copied'), { type: 'success' }))
            .catch(() =>
                showToast(t('feedback.operationFailed'), { type: 'error' }),
            );
    };

    const confirmClear = () => {
        showConfirmDialog({
            title: t('errorLog.clearTitle'),
            danger: true,
        })
            .then((confirmed: boolean | undefined) => {
                if (confirmed) {
                    errorLog.clear();
                }
            })
            .catch(() => {});
    };

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('errorLog.title')}
                leading={back}
                contentWidth="reading"
                actions={
                    records.length > 0
                        ? [
                              {
                                  icon: 'trash-2',
                                  label: t('errorLog.clear'),
                                  onPress: confirmClear,
                              },
                          ]
                        : undefined
                }
            />
            {records.length === 0 ? (
                <ContentUnavailable icon="info" title={t('errorLog.empty')} />
            ) : (
                <PaperPane width="reading">
                    <ScrollView
                        contentContainerStyle={
                            column ? [styles.list, column] : styles.list
                        }
                    >
                        {records.map(record => (
                            <View
                                key={record.id}
                                style={[
                                    styles.card,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.border,
                                    },
                                ]}
                            >
                                <Text
                                    size="sm"
                                    weight="medium"
                                    numberOfLines={3}
                                >
                                    {summaryOf(record)}
                                </Text>
                                <Text size="xs" color="textSecondary">
                                    {[
                                        new Date(
                                            record.lastAt,
                                        ).toLocaleString(),
                                        sourceKeyOf(record.source)
                                            ? t(sourceKeyOf(record.source)!)
                                            : record.source,
                                        record.route,
                                        record.count > 1
                                            ? t('errorLog.repeat', {
                                                  count: record.count,
                                              })
                                            : undefined,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </Text>
                                <Text
                                    size="sm"
                                    color="primary"
                                    onPress={() => copyOne(record)}
                                >
                                    {t('errorLog.copyOne')}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                </PaperPane>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    list: {
        padding: layout.screenGutter,
        gap: space.sm,
        maxWidth: layout.listContentMaxWidth,
        width: '100%',
        alignSelf: 'center',
    },
    card: {
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        gap: space.xs,
    },
});
