import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import AppBar from "@/components/base/appBar";
import StatusBar from "@/components/base/statusBar";
import ThemeText from "@/components/base/themeText";
import MusicBar from "@/components/musicBar";
import MusicItem from "@/components/mediaItem/musicItem";
import Toast from "@/utils/toast";
import { showPanel } from "@/components/panels/usePanel";
import { localProfile, recommendations } from "@/core/personalized/runtime";
import { Candidate } from "@/core/personalized/ranking";
import { RecommendationConfig as config } from "@/core/personalized/config";
import { playTarget, resolveIdentity } from "@/core/aggregateSearch/playback";
import { useFocusEffect } from "@react-navigation/native";
import globalStyle from "@/constants/globalStyle";
import Input from "@/components/base/input";
import { useI18N } from "@/core/i18n";
import { recommendationSettings, configureRecommendations } from "@/core/personalized/runtime";
import { useSheetItem } from "@/core/musicSheet";
import { songKey } from "@/core/musicIdentity";
import { usePreparedRecommendations } from "@/core/personalized/usePreparedRecommendations";

export default function Personalized() {
    const { t } = useI18N();
    const [enabled, setEnabled] = useState(() => recommendationSettings.read().enabled);
    const [apiKey, setApiKey] = useState("");
    const [error, setError] = useState("");
    if (enabled) return <PersonalizedResults onDisable={() => {
        configureRecommendations();
        setApiKey("");
        setEnabled(false);
    }} />;
    return <VerticalSafeAreaView style={globalStyle.fwflex1}>
        <StatusBar />
        <AppBar>{t("recommendations.title")}</AppBar>
        <View style={styles.configuration}>
            <ThemeText>{t("recommendations.disclosure")}</ThemeText>
            <ThemeText fontColor="textSecondary">{t("recommendations.keyHint")}</ThemeText>
            <Input accessibilityLabel="Last.fm API key" placeholder="Last.fm API key" secureTextEntry
                autoCapitalize="none" autoCorrect={false} value={apiKey} onChangeText={setApiKey} />
            {error ? <ThemeText>{error}</ThemeText> : null}
            <Pressable accessibilityRole="button" onPress={() => {
                try {
                    configureRecommendations(apiKey);
                    setApiKey("");
                    setError("");
                    setEnabled(true);
                } catch {
                    setError(t("recommendations.invalidKey"));
                }
            }}><ThemeText fontColor="primary">{t("recommendations.configure")}</ThemeText></Pressable>
        </View>
    </VerticalSafeAreaView>;
}

function PersonalizedResults({ onDisable }: { onDisable: () => void }) {
    const { t } = useI18N();
    const [pool, setPool] = useState(() => recommendations.current(localProfile().liked)?.candidates ?? []);
    const [batch, setBatch] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [resolving, setResolving] = useState("");
    const mounted = useRef(true);
    const click = useRef(0);
    const [resolved, setResolved] = useState<Record<string, IMusic.IMusicItem>>({});
    const favorite = useSheetItem("favorite");
    const likedKeys = new Set((favorite.musicList ?? []).map(songKey));
    const available = pool.filter(song => !likedKeys.has(songKey(song)));
    const visible = available.slice(batch * config.batchSize, (batch + 1) * config.batchSize);
    const prioritize = usePreparedRecommendations(visible, (target, track) => {
        const candidate = visible.find(item => item.artist === target.artist && item.title === target.title);
        if (mounted.current && candidate) setResolved(previous => ({ ...previous, [candidate.key]: track }));
    });
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: Candidate }> }) => {
        prioritize(viewableItems.map(({ item }) => songKey(item)));
    }).current;
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;
    const refresh = useCallback(async (force = false) => {
        const profile = localProfile();
        const cached = recommendations.current(profile.liked);
        if (cached) setPool(cached.candidates);
        if (!force && !recommendations.needsRefresh(profile.liked, profile.history)) return;
        setLoading(true);
        setMessage("");
        try {
            const snapshot = await recommendations.generate(profile.liked, profile.history);
            if (mounted.current) {
                // Re-filter if the user liked a song while generation was running.
                setPool(recommendations.current(localProfile().liked)?.candidates ?? snapshot.candidates);
                setBatch(0);
                if (snapshot.partial) setMessage(t("recommendations.partial"));
            }
        } catch {
            if (mounted.current) setMessage(cached ? t("recommendations.stale") : t("recommendations.unavailable"));
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [t]);
    useFocusEffect(useCallback(() => {
        refresh();
    }, [refresh]));
    useEffect(() => () => {
        mounted.current = false;
    }, []);
    const act = async (candidate: Candidate, menu = false) => {
        const request = ++click.current;
        setResolving("");
        const notice = setTimeout(() => {
            if (mounted.current && request === click.current) setResolving(candidate.key);
        }, 350);
        try {
            const track = menu ? await resolveIdentity(candidate) : await playTarget(candidate);
            if (track && mounted.current) {
                setResolved(previous => ({ ...previous, [candidate.key]: track }));
                if (menu && request === click.current) showPanel("MusicItemOptions", { musicItem: track });
            } else if (menu) Toast.warn("暂时找不到可播放音源");
        } catch {
            Toast.warn("暂时找不到可播放音源");
        } finally {
            clearTimeout(notice);
            if (mounted.current && request === click.current) setResolving("");
        }
    };
    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar menu={[{ icon: "arrow-path", title: t("recommendations.refresh"), onPress: () => {
                if (!loading) refresh(true);
            } }, { icon: "trash-outline", title: t("recommendations.disable"), onPress: onDisable }]}>{t("recommendations.title")}</AppBar>
            <View style={styles.toolbar}>
                <ThemeText fontColor="textSecondary">{t("recommendations.basis")}</ThemeText>
                <Pressable accessibilityRole="button" onPress={() => setBatch(current => (current + 1) % Math.max(1, Math.ceil(available.length / config.batchSize)))}>
                    <ThemeText fontColor="primary">{t("recommendations.next")}</ThemeText>
                </Pressable>
            </View>
            <View>{loading ? <View style={styles.notice}><ActivityIndicator /><ThemeText>{t("recommendations.generating")}</ThemeText></View> : null}</View>
            <View>{message ? <View style={styles.notice}><ThemeText fontColor="textSecondary">{message}</ThemeText></View> : null}</View>
            <FlatList data={visible} keyExtractor={item => item.key} onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig} renderItem={({ item, index }) => (
                    <View>
                        <MusicItem index={index + 1} musicItem={resolved[item.key] ?? {
                            id: item.key, platform: "", title: item.title, artist: item.artist, artwork: "", album: "", duration: 0,
                        }} onItemPress={() => act(item)} onItemLongPress={() => act(item, true)} onMorePress={() => act(item, true)} />
                        {resolving === item.key ? <View style={styles.notice}><ActivityIndicator size="small" /><ThemeText>{t("recommendations.preparing")}</ThemeText></View> : null}
                    </View>
                )} ListEmptyComponent={!loading ? <View style={styles.notice}><ThemeText>{t("recommendations.empty")}</ThemeText></View> : null} />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}
const styles = StyleSheet.create({
    configuration: { padding: 20, gap: 16 },
    toolbar: { padding: 16, flexDirection: "row", justifyContent: "space-between" },
    notice: { padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
});
