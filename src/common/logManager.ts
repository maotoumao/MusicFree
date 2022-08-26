import {logger, fileAsyncTransport} from 'react-native-logs';
import RNFS, {exists, mkdir, writeFile} from 'react-native-fs';
import {Platform} from 'react-native';
import dayjs from 'dayjs';

const logPath =
  (Platform.OS === 'android'
    ? RNFS.ExternalDirectoryPath
    : RNFS.DocumentDirectoryPath) + '/log/';

const config = {
  transport: fileAsyncTransport,
  transportOptions: {
    FS: RNFS,
    filepath: logPath,
    fileName: `/error-log.txt`,
  },
};

const log = logger.createLogger(config);


export default {
  error(reason: string, errMsg?: any) {
    log.error(
      `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}]    ${reason}    ${errMsg}`,
    );
  },
};
