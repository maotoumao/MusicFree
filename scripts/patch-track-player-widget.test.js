const fs = require("fs");
const os = require("os");
const path = require("path");
const patchWidget = require("./patch-track-player-widget");

// The RNTP patch contract: fail before writing either file if a future release
// changes the service/setup anchors, and remain safe to run after every install.
const serviceSource = `class MusicService {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAndStopEmptyNotificationToAvoidANR()
    }
    fun shouldStop(): Boolean {
        return stopForegroundWhenNotOngoing && (removeNotificationWhenNotOngoing || isForegroundService())
    }
    override fun onDestroy() {
    }
    companion object {
    }
}`;
const moduleSource = `class MusicModule {
    fun setup() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && AppForegroundTracker.backgrounded) {
            return
        }
        Intent(context, MusicService::class.java).also { intent ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            context.bindService(intent, this, Context.BIND_AUTO_CREATE)
        }
    }
}`;

let folder;
let service;
let nativeModule;
beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "musicfree-widget-patch-"));
    service = path.join(folder, "MusicService.kt");
    nativeModule = path.join(folder, "MusicModule.kt");
    fs.writeFileSync(service, serviceSource);
    fs.writeFileSync(nativeModule, moduleSource);
});
afterEach(() => {
    if (path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith("musicfree-widget-patch-")) {
        throw new Error("Unexpected test cleanup path");
    }
    fs.rmSync(folder, { recursive: true, force: true });
});

it("foregrounds the clicked service before JS and limits background setup to its active requests", () => {
    patchWidget(service, nativeModule);
    const output = fs.readFileSync(service, "utf8");
    expect(output.indexOf("startForeground(EMPTY_NOTIFICATION_ID")).toBeLessThan(output.indexOf("startTask(HeadlessJsTaskConfig"));
    expect(output).toContain('setOf("toggle", "previous", "next", "shiyin")');
    expect(output).toContain("widgetHandler.postDelayed(timeout, 120_000)");
    expect(output).toContain("return widgetRequests.isEmpty() && stopForegroundWhenNotOngoing");
    expect(output).toContain("stopForeground(!hasTrack)");
    expect((output.match(/\{/g) || []).length).toBe((output.match(/\}/g) || []).length);
    const moduleOutput = fs.readFileSync(nativeModule, "utf8");
    expect(moduleOutput).toContain("AppForegroundTracker.backgrounded && !MusicService.widgetStartupInProgress");
    expect(moduleOutput).toContain("if (!MusicService.widgetStartupInProgress)");
    expect(moduleOutput).toContain("context.bindService(intent, this, Context.BIND_AUTO_CREATE)");
});

it("does not duplicate service lifecycle hooks on a second install", () => {
    patchWidget(service, nativeModule);
    const first = [fs.readFileSync(service, "utf8"), fs.readFileSync(nativeModule, "utf8")];
    patchWidget(service, nativeModule);
    expect([fs.readFileSync(service, "utf8"), fs.readFileSync(nativeModule, "utf8")]).toEqual(first);
});

it.each(["service", "module"])("leaves both files unchanged when a %s anchor changes", which => {
    const target = which === "service" ? service : nativeModule;
    fs.writeFileSync(target, "upstream changed its lifecycle");
    const before = [fs.readFileSync(service, "utf8"), fs.readFileSync(nativeModule, "utf8")];
    expect(() => patchWidget(service, nativeModule)).toThrow("anchor missing");
    expect([fs.readFileSync(service, "utf8"), fs.readFileSync(nativeModule, "utf8")]).toEqual(before);
});

it("upgrades playback-only installations to discovery without duplicating lifecycle hooks", () => {
    patchWidget(service, nativeModule);
    const current = fs.readFileSync(service, "utf8");
    fs.writeFileSync(service, current.replace('setOf("toggle", "previous", "next", "shiyin")', 'setOf("toggle", "previous", "next")'));
    patchWidget(service, nativeModule);
    expect(fs.readFileSync(service, "utf8")).toBe(current);
});
