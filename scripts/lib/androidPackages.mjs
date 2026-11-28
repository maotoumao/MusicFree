// Android 侧的依赖采集：以 :app 的 release 运行时闭包为准
//
// 取数交给 scripts/androidLicenses.init.gradle（靠 -I 挂进构建，不改仓库里的构建文件），
// 它输出每个 artifact 的坐标、POM 里的许可信息，以及 jar/aar 内自带的 NOTICE
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 跑一次 Gradle，返回 release 运行时闭包里的全部 Maven artifact */
export function collectAndroidArtifacts({ repoRoot, workDir }) {
    const outPath = join(workDir, 'android-licenses.json');
    const androidDir = join(repoRoot, 'android');
    const isWindows = process.platform === 'win32';
    const wrapper = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
    const args = [
        '-q',
        '-I',
        join(repoRoot, 'scripts', 'androidLicenses.init.gradle'),
        ':app:dumpReleaseLicenses',
        `-PlicenseOut=${outPath}`,
    ];
    console.log('· 正在解析 Android 依赖闭包（这一步比较慢）…');
    // Node 20 起不允许直接 spawn .bat，得经 cmd.exe 转一手。
    // 参数按数组传递，但 cmd 仍会再解析一层，故路径里不能出现 & ^ % ! 之类的元字符——
    // 这些路径全来自仓库自身位置，正常开发环境不会踩到
    execFileSync(
        isWindows ? 'cmd.exe' : wrapper,
        isWindows ? ['/c', wrapper, ...args] : args,
        { cwd: androidDir, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    return JSON.parse(readFileSync(outPath, 'utf8'));
}
