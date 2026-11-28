/**
 * WebDAV 连接面板（组合内容，非壳）：备份要用的服务器地址与凭据
 * 测试与保存解耦——有些服务端拒绝探测根路径却允许访问备份路径，用测不通拦住保存会把这类用户挡在门外
 * 凭据只落 config，永不写进备份文件；远端路径由协议固定，不给用户改
 * 键盘避让由 Panel 壳统一处理
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
    backup,
    classifyBackupFailure,
    describeBackupFailure,
    type BackupFailureKind,
} from '@/core/backup';
import { config } from '@/core/config';
import { errorLog } from '@/core/errorLog';
import { space } from '@/design';
import { useT } from '@/i18n';
import { httpHostOf } from '@/utils/url';

import type { OverlayProps } from '@/components/overlay';

/**
 * 测试结果；null = 还没测过（或刚被用户取消），不影响能否保存
 * 超时单独成一档：服务器一声不吭与它明确回了个 401 是两回事，给的下一步也不同
 */
type TestResult =
    | { ok: true }
    | { ok: false; kind: 'timeout' }
    | { ok: false; kind: 'error'; reason: string }
    | null;

/**
 * 异常 → 展示用结论；被取消回 null（是用户自己停的，不用再报一遍）
 * switch 穷尽而不留 default：将来 core 多一档失败（比如「鉴权失败」）要编译期就报出来，
 * 而不是被 default 静默吸成「其他错误 + error.message」
 */
function describeTestFailure(error: unknown): TestResult {
    const kind: BackupFailureKind = classifyBackupFailure(error);
    switch (kind) {
        case 'cancelled':
            return null;
        case 'timedOut':
            return { ok: false, kind: 'timeout' };
        case 'other':
        case 'unauthorized':
        case 'forbidden':
        case 'notFound':
        case 'rateLimited':
        case 'storageFull':
        case 'unsupported':
            return {
                ok: false,
                kind: 'error',
                reason: describeBackupFailure(error),
            };
    }
}

function WebdavConnectionPanelView({ close }: OverlayProps<void, true>) {
    const t = useT();
    // 进面板时读一次同步 MMKV 作初值；之后只动本地草稿
    const [url, setUrl] = useState(() => config.get('webdav.url') ?? '');
    const [username, setUsername] = useState(
        () => config.get('webdav.username') ?? '',
    );
    const [password, setPassword] = useState(
        () => config.get('webdav.password') ?? '',
    );
    const [test, setTest] = useState<TestResult>(null);
    const [testing, setTesting] = useState(false);
    // 探测中途要能停：探测自带超时兜底，但没人该被一个不回包的服务器锁住整张表单
    const testAbort = useRef<AbortController | null>(null);

    // 面板被关掉（取消键 / 返回键 / backdrop）时也要停：那是用户最自然的「停」的动作，
    // 不然探测会一直挂到预算到点，而结论已经没人看了
    useEffect(() => () => testAbort.current?.abort(), []);

    const trimmedUrl = url.trim();
    const canSave = httpHostOf(trimmedUrl) !== undefined;
    const insecure = /^http:\/\//i.test(trimmedUrl);

    /** 任一字段改动都让此前的测试结论失效，避免拿旧结果给新配置背书 */
    const edit = <T,>(setter: (value: T) => void) => {
        return (value: T) => {
            setter(value);
            setTest(null);
        };
    };

    const handleTest = async () => {
        const controller = new AbortController();
        testAbort.current = controller;
        setTesting(true);
        setTest(null);
        try {
            // 探测用的是当前输入而非已存配置：试一下不应该等同于存下来
            await backup.testWebdavConnection(
                { url: trimmedUrl, username, password },
                { signal: controller.signal },
            );
            setTest({ ok: true });
        } catch (error) {
            if (classifyBackupFailure(error) !== 'cancelled') {
                errorLog.capture({
                    source: 'uncaught',
                    error: new Error(
                        `WebDAV connection: ${describeBackupFailure(error)}`,
                    ),
                });
            }
            setTest(describeTestFailure(error));
        } finally {
            setTesting(false);
            testAbort.current = null;
        }
    };

    const handleSave = () => {
        config.set('webdav.url', trimmedUrl);
        config.set('webdav.username', username);
        config.set('webdav.password', password);
        close(true);
    };

    return (
        <ScrollView
            contentContainerStyle={styles.root}
            keyboardShouldPersistTaps="handled"
        >
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('webdavConnectionPanel.title')}
            </Text>
            <Text size="sm" color="textSecondary" style={styles.note}>
                {t('webdavConnectionPanel.pathNote')}
            </Text>

            <View style={styles.field}>
                <Text size="sm" color="textSecondary">
                    {t('webdavConnectionPanel.serverUrl')}
                </Text>
                <Input
                    value={url}
                    onChangeText={edit(setUrl)}
                    placeholder={t(
                        'webdavConnectionPanel.serverUrlPlaceholder',
                    )}
                    accessibilityLabel={t('webdavConnectionPanel.serverUrl')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    disabled={testing}
                />
                {insecure ? (
                    <Text
                        size="sm"
                        color="warning"
                        accessibilityLiveRegion="polite"
                    >
                        {t('webdavConnectionPanel.insecureWarning')}
                    </Text>
                ) : null}
            </View>

            <View style={styles.field}>
                <Text size="sm" color="textSecondary">
                    {t('webdavConnectionPanel.username')}
                </Text>
                <Input
                    value={username}
                    onChangeText={edit(setUsername)}
                    accessibilityLabel={t('webdavConnectionPanel.username')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    disabled={testing}
                />
            </View>

            <View style={styles.field}>
                <Text size="sm" color="textSecondary">
                    {t('webdavConnectionPanel.password')}
                </Text>
                <Input
                    value={password}
                    onChangeText={edit(setPassword)}
                    accessibilityLabel={t('webdavConnectionPanel.password')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    disabled={testing}
                />
                <Text size="sm" color="textSecondary">
                    {t('webdavConnectionPanel.passwordHint')}
                </Text>
            </View>

            <View style={styles.field}>
                {/* loading 的按钮不可点（内容也被转圈盖住），取消只能另起一个 */}
                <View style={styles.testRow}>
                    <Button
                        variant="outline"
                        tone="primary"
                        loading={testing}
                        disabled={!canSave}
                        style={styles.testBtn}
                        onPress={() => {
                            handleTest().catch(() => {});
                        }}
                    >
                        {t('webdavConnectionPanel.test')}
                    </Button>
                    {testing ? (
                        <Button
                            variant="outline"
                            tone="neutral"
                            onPress={() => testAbort.current?.abort()}
                        >
                            {t('common.cancel')}
                        </Button>
                    ) : null}
                </View>
                {test !== null ? (
                    <Text
                        size="sm"
                        color={test.ok ? 'success' : 'danger'}
                        accessibilityLiveRegion="polite"
                    >
                        {test.ok
                            ? t('webdavConnectionPanel.testOk')
                            : test.kind === 'timeout'
                            ? t('webdavConnectionPanel.testTimedOut')
                            : t('webdavConnectionPanel.testFailed', {
                                  reason: test.reason,
                              })}
                    </Text>
                ) : null}
            </View>

            <View style={styles.actions}>
                <Button
                    variant="filled"
                    tone="neutral"
                    style={styles.actionBtn}
                    onPress={() => close()}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="filled"
                    tone="primary"
                    style={styles.actionBtn}
                    disabled={!canSave || testing}
                    onPress={handleSave}
                >
                    {t('common.save')}
                </Button>
            </View>
        </ScrollView>
    );
}

/** WebDAV 连接面板：`await showWebdavConnectionPanel()` → 保存 true，取消 / 返回键 / backdrop 为 undefined */
export const showWebdavConnectionPanel = definePanel(WebdavConnectionPanelView);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.md,
    },
    note: {
        marginTop: -space.xs,
    },
    field: {
        gap: space.xs,
    },
    testRow: {
        flexDirection: 'row',
        gap: space.md,
    },
    testBtn: {
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.xs,
    },
    actionBtn: {
        flex: 1,
    },
});
