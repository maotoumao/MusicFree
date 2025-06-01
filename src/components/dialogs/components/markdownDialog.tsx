import React, { useEffect, useRef, useState } from 'react';
import { hideDialog } from '../useDialog';
import Dialog from './base';
import { useI18N } from '@/core/i18n';
import { WebView } from 'react-native-webview';
import rpx, { vh } from '@/utils/rpx';
import { StyleSheet } from 'react-native';
import { Marked } from 'marked';
import Loading from '@/components/base/loading';
import { useOnMounted } from '@/hooks/useMounted';
import useColors from '@/hooks/useColors';

interface IMarkdownDialogProps {
    title: string;
    markdownContent: string;
    okText?: string;
}
export default function MarkdownDialog(props: IMarkdownDialogProps) {
    const { title, markdownContent, okText } = props;
    const markedRef = useRef<Marked>(new Marked());
    const [loading, setLoading] = useState(true);
    const [htmlContent, setHtmlContent] = useState<string>('');
    const { onMounted } = useOnMounted();

    const { t } = useI18N();
    const colors = useColors();


    useEffect(() => {
        const md = markedRef.current;

        md.parse(markdownContent, {
            async: true
        }).then(html => {
            if (onMounted()) {
                setHtmlContent(`
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport"
            content="width=device-width,initial-scale=1.0,user-scalable=no,maximum-scale=1.0,minimum-scale=1.0,viewport-fit=cover" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Cache-control" content="no-cache" />
        <meta http-equiv="Cache" content="no-cache" />
        <meta http-equiv="window-target" content="_top" />
        <meta name="format-detection" content="telephone=no" />
        <title>${title}</title>
        <style>
            html, body {
                background-color: transparent;
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                font-size: 16px;
                line-height: 1.2;
                color: ${colors.text};
                -webkit-text-size-adjust: 100%;
                text-rendering: optimizeLegibility;
            }

            body {
                    padding: 0px 16px;
            }
            
            h1, h2, h3, h4, h5, h6 {
                margin: 24px 0 16px 0;
                font-weight: 600;
                line-height: 1.3;
            }
            
            h1 { font-size: 28px; }
            h2 { font-size: 24px; }
            h3 { font-size: 20px; }
            h4 { font-size: 18px; }
            h5 { font-size: 16px; }
            h6 { font-size: 14px; }
            
            p {
                margin: 12px 0 12px 0;
                line-height: 1.6;
            }
            
            ul, ol {
                margin: 0 0 16px 0;
                padding-left: 24px;
            }
            
            li {
                margin: 4px 0;
                line-height: 1.5;
            }
            
            blockquote {
                margin: 16px 0;
                padding: 4px 16px;
                border-left: 4px solid ${colors.primary || '#007AFF'};
                background-color: rgba(0, 122, 255, 0.05);
                border-radius: 4px;
            }
            
            code {
                font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                font-size: 14px;
                background-color: rgba(0, 0, 0, 0.05);
                padding: 2px 6px;
                border-radius: 3px;
            }
            
            pre {
                font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
                font-size: 14px;
                background-color: rgba(0, 0, 0, 0.05);
                padding: 16px;
                border-radius: 8px;
                overflow-x: auto;
                margin: 16px 0;
                line-height: 1.4;
            }
            
            a {
                color: ${colors.primary || '#007AFF'};
                text-decoration: none;
                border-bottom: 1px solid transparent;
                transition: border-color 0.2s ease;
            }
            
            a:hover {
                border-bottom-color: ${colors.primary || '#007AFF'};
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
                font-size: 14px;
            }
            
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid ${colors.border || 'rgba(0, 0, 0, 0.1)'};
            }
            
            th {
                font-weight: 600;
                background-color: rgba(0, 0, 0, 0.02);
            }
            
            img {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                margin: 8px 0;
            }
            
            hr {
                border: none;
                height: 1px;
                background-color: ${colors.border || 'rgba(0, 0, 0, 0.1)'};
                margin: 24px 0;
            }
            
            strong {
                font-weight: 600;
            }
            
            em {
                font-style: italic;
            }
        </style>
    </head>
<body>
    ${html}
</body>
</html>
                    `);

                setLoading(false);
            }
        }).catch(() => {
            if (onMounted()) {
                setHtmlContent(markdownContent);
                setLoading(false);
            }
        })

    }, [markdownContent, onMounted, colors]);

    const actions = [
        {
            title: okText ?? t("dialog.errorLogKnow"),
            type: 'primary',
            onPress() {
                hideDialog();
            },
        },
    ] as any;

    return (
        <Dialog onDismiss={hideDialog} >
            <Dialog.Title withDivider>{title}</Dialog.Title>
            <Dialog.Content style={[{ height: vh(60), maxHeight: vh(60) }, styles.dialogContent]}>
                {loading ? <Loading /> : <WebView style={styles.webView} originWhitelist={["*"]} source={{
                    html: htmlContent,
                }} />}
            </Dialog.Content>
            <Dialog.Actions actions={actions} />
        </Dialog>
    );
}


const styles = StyleSheet.create({
    webView: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
    },
    dialogContent: {
        paddingVertical: 0, paddingHorizontal: 0, paddingBottom: rpx(8)
    }
});
