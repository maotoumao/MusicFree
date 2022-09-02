import {logger, fileAsyncTransport} from 'react-native-logs';
import RNFS, {exists, mkdir, writeFile} from 'react-native-fs';
import dayjs from 'dayjs';
import pathConst from '@/constants/pathConst';

const config = {
  transport: fileAsyncTransport,
  transportOptions: {
    FS: RNFS,
    filepath: pathConst.logPath,
    fileName: `error-log.log`,
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


log.info("Print this string to a file");