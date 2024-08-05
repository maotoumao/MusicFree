import {fileAsyncTransport, logger} from 'react-native-logs';
import RNFS, {readDir, readFile} from 'react-native-fs';
import pathConst from '@/constants/pathConst';
import Config from '../core/config';
import {addLog} from '@/lib/react-native-vdebug/src/log';

const config = {
    transport: fileAsyncTransport,
    transportOptions: {
        FS: RNFS,
        filePath: pathConst.logPath,
        fileName: 'error-log-{date-today}.log',
    },
    dateFormat: 'local',
};

const traceConfig = {
    transport: fileAsyncTransport,
    transportOptions: {
        FS: RNFS,
        filePath: pathConst.logPath,
        fileName: 'trace-log.log',
    },
    dateFormat: 'local',
};

const log = logger.createLogger(config);
const traceLogger = logger.createLogger(traceConfig);

export function trace(
    desc: string,
    message?: any,
    level: 'info' | 'error' = 'info',
) {
    if (__DEV__) {
        console.log(desc, message);
    }
    // 特殊情况记录操作路径
    if (Config.get('setting.basic.debug.traceLog')) {
        traceLogger[level]({
            desc,
            message,
        });
    }
}

export async function clearLog() {
    const files = await RNFS.readDir(pathConst.logPath);
    await Promise.all(
        files.map(async file => {
            if (file.isFile()) {
                try {
                    await RNFS.unlink(file.path);
                } catch {}
            }
        }),
    );
}

export async function getErrorLogContent() {
    try {
        const files = await readDir(pathConst.logPath);
        console.log(files);
        const today = new Date();
        // 两天的错误日志
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const todayLog = files.find(
            _ =>
                _.isFile() &&
                _.path.endsWith(
                    `error-log-${today.getDate()}-${
                        today.getMonth() + 1
                    }-${today.getFullYear()}.log`,
                ),
        );
        const yesterdayLog = files.find(
            _ =>
                _.isFile() &&
                _.path.endsWith(
                    `error-log-${yesterday.getDate()}-${
                        yesterday.getMonth() + 1
                    }-${yesterday.getFullYear()}.log`,
                ),
        );
        let logContent = '';
        if (todayLog) {
            logContent += await readFile(todayLog.path, 'utf8');
        }
        if (yesterdayLog) {
            logContent += await readFile(yesterdayLog.path, 'utf8');
        }
        return logContent;
    } catch {
        return '';
    }
}

export function errorLog(desc: string, message: any) {
    if (Config.get('setting.basic.debug.errorLog')) {
        log.error({
            desc,
            message,
        });
        trace(desc, message, 'error');
    }
}

export function devLog(
    method: 'log' | 'error' | 'warn' | 'info',
    ...args: any[]
) {
    if (Config.get('setting.basic.debug.devLog')) {
        addLog(method, args);
    }
}

export {log};
