/**
 * 搜索页壳：编辑态（输入 + 历史）↔ 结果态（真实结果列表）
 * 会话态用本页私有 atoms（store）；提交 = 存历史 + 落 submittedQuery + 转结果态
 */
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { Keyboard } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { Input } from '@/components/ui/Input';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { MusicBar } from '@/widgets/MusicBar';

import { SearchHistorySection } from './components/SearchHistorySection';
import { SearchResultsPane } from './components/SearchResultsPane';
import { addSearchHistory } from './lib/history';
import { draftQueryAtom, phaseAtom, submittedQueryAtom } from './store';

/** 搜索页 */
export default function SearchPage() {
    const t = useT();
    const back = useBackAction();
    const [draftQuery, setDraftQuery] = useAtom(draftQueryAtom);
    const [phase, setPhase] = useAtom(phaseAtom);
    const [submittedQuery, setSubmittedQuery] = useAtom(submittedQueryAtom);

    // 页面卸载时重置会话态，下次进入从空编辑态开始
    useEffect(
        () => () => {
            setDraftQuery('');
            setPhase('editing');
            setSubmittedQuery('');
        },
        [setDraftQuery, setPhase, setSubmittedQuery],
    );

    const submit = useCallback(
        (raw: string) => {
            const q = raw.trim();
            if (!q) {
                return;
            }
            addSearchHistory(q);
            setDraftQuery(q);
            setSubmittedQuery(q);
            setPhase('result');
            Keyboard.dismiss();
        },
        [setDraftQuery, setSubmittedQuery, setPhase],
    );

    return (
        <Screen edges={['bottom']}>
            <AppBar
                leading={back}
                center={
                    <Input
                        value={draftQuery}
                        onChangeText={setDraftQuery}
                        onFocus={() => setPhase('editing')}
                        onClear={() => setPhase('editing')}
                        size="md"
                        leadingIcon="search"
                        clearable
                        autoFocus
                        returnKeyType="search"
                        onSubmitEditing={() => submit(draftQuery)}
                        placeholder={t('search.prompt')}
                        accessibilityLabel={t('search.a11y.searchField')}
                    />
                }
                actions={[
                    {
                        label: t('common.search'),
                        onPress: () => submit(draftQuery),
                        disabled: draftQuery.trim().length === 0,
                    },
                ]}
            />
            {phase === 'editing' ? (
                <SearchHistorySection onPick={submit} />
            ) : (
                <SearchResultsPane query={submittedQuery} />
            )}
            <MusicBar />
        </Screen>
    );
}
