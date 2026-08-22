/**
 * 桌面歌词窗口渲染入口
 * 由主进程 LyricWindowManager 驱动,展示当前歌词行。
 */
import React from "react";
import { createRoot } from "react-dom/client";

declare global {
    interface Window {
        __MUSICFREE_DESKTOP__?: any;
    }
}

const bridge = window.__MUSICFREE_DESKTOP__;

interface LyricState {
    text: string;
    fontSize: number;
    color: string;
    background: string;
    align: "left" | "center" | "right";
}

function App() {
    const [state, setState] = React.useState<LyricState>({
        text: " MusicFree ",
        fontSize: 24,
        color: "#ffffff",
        background: "transparent",
        align: "center",
    });

    React.useEffect(() => {
        if (!bridge?.lyric) return;
        bridge.lyric.onLyricUpdate((text: string) => {
            setState((s) => ({ ...s, text: text || " " }));
        });
        bridge.lyric.onLyricConfig((config: any) => {
            setState((s) => ({
                ...s,
                fontSize: config?.fontSize ?? s.fontSize,
                color: config?.textColor || s.color,
                background: config?.backgroundColor || "transparent",
                align:
                    config?.align === 3
                        ? "left"
                        : config?.align === 5
                          ? "right"
                          : "center",
            }));
        });
    }, []);

    const alignItems =
        state.align === "left"
            ? "flex-start"
            : state.align === "right"
              ? "flex-end"
              : "center";

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: alignItems,
                background: state.background,
                fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
                textShadow: "0 1px 3px rgba(0,0,0,0.65), 0 0 1px rgba(0,0,0,0.5)",
                WebkitUserSelect: "none",
                overflow: "hidden",
            }}
        >
            <span
                style={{
                    fontSize: state.fontSize,
                    color: state.color,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    padding: "0 8px",
                }}
            >
                {state.text}
            </span>
        </div>
    );
}

const container = document.getElementById("root");
createRoot(container!).render(<App />);
