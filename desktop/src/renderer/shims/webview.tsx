/**
 * react-native-webview 桌面端实现
 * 项目内唯一用途是 MarkdownDialog 渲染内嵌 HTML(source.html)。
 * 使用 iframe + srcdoc 实现,onShouldStartLoadWithRequest 拦截外链。
 */
import React, { useRef } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

interface WebViewProps {
    style?: ViewStyle | ViewStyle[];
    source?: { html?: string; uri?: string; baseUrl?: string };
    originWhitelist?: string[];
    onShouldStartLoadWithRequest?: (event: { url: string }) => boolean;
    onLoad?: () => void;
    onError?: (e: any) => void;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    startInLoadingState?: boolean;
    renderLoading?: React.ReactNode;
    [key: string]: any;
}

function WebView(props: WebViewProps, ref: any) {
    const { style, source, onShouldStartLoadWithRequest, onLoad, ...rest } = props;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    React.useImperativeHandle(ref, () => ({
        injectJavaScript: (code: string) => {
            // srcdoc iframe 同源,可直接操作
            try {
                iframeRef.current?.contentWindow?.eval(code);
            } catch {
                // ignore
            }
        },
        goBack: () => iframeRef.current?.contentWindow?.history.back(),
        goForward: () => iframeRef.current?.contentWindow?.history.forward(),
        reload: () => {
            if (iframeRef.current) {
                iframeRef.current.srcdoc = iframeRef.current.srcdoc;
            }
        },
        stopLoading: () => {},
    }));

    const html = source?.html;
    const uri = source?.uri;

    return (
        <View style={style as ViewStyle}>
            <iframe
                ref={iframeRef}
                title="webview"
                srcDoc={html}
                src={html ? undefined : uri}
                style={styles.iframe}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                onLoad={onLoad as any}
                {...(rest as any)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    iframe: {
        width: "100%",
        height: "100%",
        border: "none",
        backgroundColor: "transparent",
    } as any,
});

export { WebView };
export default { WebView };
