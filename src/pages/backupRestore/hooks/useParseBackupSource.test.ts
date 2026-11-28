import { backup, classifyBackupFailure } from '@/core/backup';
import { atomStore } from '@/utils/atomStore';
import { showAlertDialog } from '@/widgets/overlays/AlertDialog';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import { backupOpAtom, cancelBackupOp, endBackupOp } from '../store';

import { useParseBackupSource } from './useParseBackupSource';

import type { ParsedBackup } from '@/core/backup';
import type { TextPromptOptions } from '@/widgets/overlays/TextPromptPanel';

jest.mock('react', () => ({
    ...jest.requireActual('react'),
    useCallback: (callback: unknown) => callback,
}));
jest.mock('@/core/backup', () => ({
    backup: { parseBackupFromUrl: jest.fn() },
    classifyBackupFailure: jest.fn(),
    describeBackupFailure: jest.fn(() => 'error'),
}));
jest.mock('@/core/errorLog', () => ({ errorLog: { capture: jest.fn() } }));
jest.mock('@/components/overlay', () => ({ showToast: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => (key: string) => key }));
jest.mock('@/infra/documentPicker', () => ({ pickFile: jest.fn() }));
jest.mock('@/widgets/overlays/AlertDialog', () => ({
    showAlertDialog: jest.fn(),
}));
jest.mock('@/widgets/overlays/TextPromptPanel', () => ({
    showTextPromptPanel: jest.fn(),
}));

const mockRead = jest.mocked(backup.parseBackupFromUrl);
let options: TextPromptOptions<ParsedBackup>;
let closePanel: (value?: ParsedBackup) => void;

beforeEach(() => {
    jest.clearAllMocks();
    endBackupOp('reading');
    jest.mocked(classifyBackupFailure).mockReturnValue('cancelled');
    jest.mocked(showTextPromptPanel).mockImplementation(input => {
        options = input as TextPromptOptions<ParsedBackup>;
        return Object.assign(
            new Promise<ParsedBackup | undefined>(resolve => {
                closePanel = resolve;
            }),
            { close: () => closePanel() },
        ) as ReturnType<typeof showTextPromptPanel>;
    });
    mockRead.mockImplementation(
        (_url, request) =>
            new Promise((_resolve, reject) => {
                request?.signal?.addEventListener('abort', () =>
                    reject(
                        Object.assign(new Error('cancelled'), {
                            name: 'AbortError',
                        }),
                    ),
                );
            }),
    );
});

it('关闭链接面板会取消当前下载并释放操作锁，不显示迟到错误', async () => {
    const panel = useParseBackupSource()('url');
    const submit = options.onSubmit('https://example.com/backup.json');
    expect(atomStore.get(backupOpAtom)).toBe('reading');
    closePanel();
    await panel;
    await expect(submit).resolves.toEqual({ ok: false });
    expect(mockRead.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(atomStore.get(backupOpAtom)).toBeNull();
    expect(showAlertDialog).not.toHaveBeenCalled();
});

it('横幅取消后可在同一面板重试，新的请求不继承旧取消状态', async () => {
    const panel = useParseBackupSource()('url');
    const first = options.onSubmit('https://example.com/first.json');
    cancelBackupOp();
    await first;
    const second = options.onSubmit('https://example.com/second.json');
    expect(mockRead.mock.calls[1]![1]?.signal?.aborted).toBe(false);
    closePanel();
    await panel;
    await second;
    expect(atomStore.get(backupOpAtom)).toBeNull();
});
