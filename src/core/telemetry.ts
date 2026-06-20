import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ReactNativePlugin } from "@microsoft/applicationinsights-react-native";
import { IInjectable } from "@/types/infra";
import appMeta from "../utils/appMeta";
import { nanoid } from "nanoid";
import { IAppConfig } from "@/types/core/config";
import delay from "@/utils/delay";
import DeviceInfo from "react-native-device-info";

class Telemetry implements IInjectable {
    private appInsights: ApplicationInsights | null = null;

    private appConfigService!: IAppConfig;

    injectDependencies(appConfigService: IAppConfig): void {
        this.appConfigService = appConfigService;
    }

    private static configList = [
        "https://gitee.com/maotoumao/MusicFree/raw/master/release/telemetry.json",
        "https://raw.gitcode.com/maotoumao/MusicFree/raw/master/release/telemetry.json",
        "https://raw.githubusercontent.com/maotoumao/MusicFree/master/release/telemetry.json",
        "https://cdn.jsdelivr.net/gh/maotoumao/MusicFree@master/release/telemetry.json",
    ];

    private static debugId = nanoid();

    get debugId() {
        return Telemetry.debugId;
    }

    async setup() {
        if (process.env.EXPO_PUBLIC_AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING) {
            this.appInsights = new ApplicationInsights({
                config: {
                    connectionString: process.env.EXPO_PUBLIC_AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING,
                    extensions: [new ReactNativePlugin()],
                    disableAjaxTracking: true,
                    disableFetchTracking: true,
                },
            });
            this.appInsights.loadAppInsights();
        }

        if (__DEV__) {
            // 开发模式不启用性能服务检测
            return;
        }
        // 延迟20秒后检查，先让出主线程
        delay(20000, true).then(async () => {
            const telemetryCheckTimestamp = appMeta.telemetryCheckTimestamp;
            const now = Date.now();
            // 一天检查一次
            if (now - telemetryCheckTimestamp > 24 * 60 * 60 * 1000) {
                for (let i = 0; i < Telemetry.configList.length; ++i) {
                    try {
                        const response = await fetch(Telemetry.configList[i]);
                        const config = await response.json();
                        if (config.disableTelemetry !== true) {
                            appMeta.setTelemetryAvailable(true);
                        } else {
                            appMeta.setTelemetryAvailable(false);
                        }
                        break;
                    } catch {}
                }
                appMeta.setTelemetryCheckTimestamp(Date.now());
            }
        });
    }

    private checkTelemetryEnabled(withUserPerference: boolean = true): boolean {
        if (__DEV__) {
            return false;
        }
        
        if (!this.appInsights) {
            return false;
        }

        if (!appMeta.telemetryAvailable) {
            return false;
        }

        if (withUserPerference) {
            if (this.appConfigService.getConfig("debug.disableTelemetry")) {
                return false;
            }
        }

        return true;
    }

    logMetric(name: string, average: number, properties?: { [key: string]: any }) {
        if (!this.checkTelemetryEnabled()) {
            return;
        }

        this.appInsights?.trackMetric({
            name,
            average,
            properties: {
                debugId: Telemetry.debugId,
                appVersion: DeviceInfo.getVersion(),
                ...(properties || {}),
            },
        });
    }

    logEvent(name: string, properties?: { [key: string]: any }) {
        if (!this.checkTelemetryEnabled()) {
            return;
        }
        this.appInsights?.trackEvent({
            name,
            properties: {
                debugId: Telemetry.debugId,
                appVersion: DeviceInfo.getVersion(),
                ...(properties || {}),
            },
        });
    }

    logException(error: Error, properties?: { [key: string]: any }) {
        if (!this.checkTelemetryEnabled()) {
            return;
        }
        this.appInsights?.trackException({
            exception: error,
            properties: {
                debugId: Telemetry.debugId,
                appVersion: DeviceInfo.getVersion(),
                ...(properties || {}),
            },
        });
    }
}

const telemetry = new Telemetry();
export default telemetry;