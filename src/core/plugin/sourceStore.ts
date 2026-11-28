/**
 * 插件源码存储：app 私有目录 plugins/ 下按文件名读写
 * 路径 = basePath/plugins/<file>（basePath 按平台，= legacy 原路径，老用户零迁移）
 */
import {
    exists,
    mkdir,
    moveFile,
    readDir,
    readFile,
    unlink,
    writeFile,
} from '@dr.pogodin/react-native-fs';

import { basePath } from '@/infra/paths';

/** 插件源码目录 */
const PLUGINS_DIR = `${basePath}/plugins`;

export class PluginSourceStore {
    #pathOf(file: string): string {
        return `${PLUGINS_DIR}/${file}`;
    }

    /** 确保 plugins/ 存在（首次运行时目录还没建，readDir/writeFile 会失败） */
    async #ensureDir(): Promise<void> {
        if (!(await exists(PLUGINS_DIR))) {
            await mkdir(PLUGINS_DIR);
        }
    }

    async save(file: string, source: string): Promise<void> {
        await this.#ensureDir();
        await writeFile(this.#pathOf(file), source, 'utf8');
    }

    read(file: string): Promise<string> {
        return readFile(this.#pathOf(file), 'utf8');
    }

    async list(): Promise<string[]> {
        await this.#ensureDir();
        const entries = await readDir(PLUGINS_DIR);
        return entries.filter(it => it.isFile()).map(it => it.name);
    }

    rename(from: string, to: string): Promise<void> {
        return moveFile(this.#pathOf(from), this.#pathOf(to));
    }

    remove(file: string): Promise<void> {
        return unlink(this.#pathOf(file));
    }
}
