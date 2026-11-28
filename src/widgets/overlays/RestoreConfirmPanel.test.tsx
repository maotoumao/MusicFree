import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { showRestoreConfirmPanel } from './RestoreConfirmPanel';

import type { ParsedBackup } from '@/core/backup';

jest.mock('@/components/overlay', () => ({
    definePanel: (view: unknown) => view,
}));
jest.mock('@/components/ui/Button', () => ({ Button: 'Button' }));
jest.mock('@/components/ui/ListItem', () => ({ ListItem: 'ListItem' }));
jest.mock('@/components/ui/PanelCheckRow', () => ({
    PanelCheckRow: 'PanelCheckRow',
}));
jest.mock('@/components/ui/Text', () => ({ Text: 'Text' }));
jest.mock('@/design', () => ({ space: { lg: 16, md: 12, xs: 4 } }));
jest.mock('@/i18n', () => ({
    useT: () => (key: string, params?: Record<string, unknown>) =>
        `${key}${params ? JSON.stringify(params) : ''}`,
}));
jest.mock('@/widgets/overlays/ActionSheetPanel', () => ({
    showActionSheetPanel: jest.fn(),
}));
jest.mock('@/widgets/overlays/ConfirmDialog', () => ({
    showConfirmDialog: jest.fn(),
}));

const Panel = showRestoreConfirmPanel as unknown as React.ComponentType<{
    payload: { parsed: ParsedBackup };
    close: (value?: unknown) => void;
}>;

function startButton(renderer: ReactTestRenderer) {
    return renderer.root
        .findAllByType('Button' as never)
        .find(node => node.props.children === 'restoreConfirmPanel.start')!;
}

it('插件来源展示并显式确认后才可恢复，取消选择插件不要求确认', async () => {
    const close = jest.fn();
    const parsed: ParsedBackup = {
        ok: true,
        formatVariant: 'v2',
        sections: {
            plugins: {
                installed: [
                    { srcUrl: 'https://example.com/demo.js', enabled: true },
                ],
                subscriptions: [
                    {
                        name: 'demo',
                        url: 'https://example.com/subscription.json',
                    },
                ],
                alternatives: [],
            },
            settings: { values: {} },
        },
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(<Panel payload={{ parsed }} close={close} />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain(
        'https://example.com/demo.js',
    );
    expect(JSON.stringify(renderer.toJSON())).toContain(
        'https://example.com/subscription.json',
    );
    expect(startButton(renderer).props.disabled).toBe(true);
    const trust = renderer.root
        .findAllByType('PanelCheckRow' as never)
        .find(
            node =>
                node.props.label ===
                'restoreConfirmPanel.pluginSources.confirm',
        )!;
    await act(async () => {
        trust.props.onPress();
    });
    expect(startButton(renderer).props.disabled).toBe(false);
    await act(async () => {
        trust.props.onPress();
    });
    const plugin = renderer.root
        .findAllByType('PanelCheckRow' as never)
        .find(node =>
            String(node.props.accessibilityLabel).includes(
                'restoreConfirmPanel.section.plugins',
            ),
        )!;
    await act(async () => {
        plugin.props.onPress();
    });
    expect(startButton(renderer).props.disabled).toBe(false);
    await act(async () => {
        startButton(renderer).props.onPress();
    });
    expect(close).toHaveBeenCalledWith({
        mode: 'append',
        selection: ['settings'],
    });
    await act(async () => renderer.unmount());
});

it.each([undefined, 0])(
    '备份时间 %p 区分缺失与合法零时间戳',
    async createdAt => {
        const parsed: ParsedBackup = {
            ok: true,
            formatVariant: 'legacyMobile',
            createdAt,
            sections: {},
        };
        let renderer!: ReactTestRenderer;
        await act(async () => {
            renderer = create(<Panel payload={{ parsed }} close={jest.fn()} />);
        });
        const rendered = JSON.stringify(renderer.toJSON());
        expect(
            rendered.includes('restoreConfirmPanel.source.unknownTime'),
        ).toBe(createdAt === undefined);
        expect(rendered.includes('restoreConfirmPanel.source.createdAt')).toBe(
            createdAt !== undefined,
        );
        await act(async () => renderer.unmount());
    },
);
