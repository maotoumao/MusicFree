import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/generate-widget-resources.mjs <resource-directory>");
const palette = JSON.parse(fs.readFileSync(path.join(root, "src/constants/widgetPalette.json"), "utf8"));
const write = (relative, content) => {
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
};
const colorResources = [];
for (const [mode, colors] of Object.entries(palette)) {
    for (const [name, color] of Object.entries(colors)) {
        const token = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        colorResources.push(`    <color name="widget_${mode}_${token}">${color}</color>`);
    }
    for (const [name, shape, token, corners] of [
        ["background", "rectangle", "surface", '<corners android:radius="28dp" />'],
        ["play_background", "oval", "primary", ""],
        ["divider", "rectangle", "divider", ""],
    ]) {
        write(`drawable/widget_${mode}_${name}.xml`, `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="${shape}"><solid android:color="@color/widget_${mode}_${token}" />${corners}</shape>\n`);
    }
    for (const [name, asset] of Object.entries({ play: "play", pause: "pause", previous: "skip-left", next: "skip-right" })) {
        const svg = fs.readFileSync(path.join(root, `src/assets/icons/${asset}.svg`), "utf8");
        const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?\s*>/g)];
        if (!paths.length) throw new Error(`Missing SVG path in ${asset}`);
        const token = name === "play" || name === "pause" ? "on_primary" : "secondary";
        write(`drawable/widget_${mode}_${name}.xml`, `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n${paths.map(match => `    <path android:fillColor="@color/widget_${mode}_${token}" android:fillType="evenOdd" android:pathData="${match[1]}" />`).join("\n")}\n</vector>\n`);
    }
}
write("values/widget_colors.xml", `<resources>\n${colorResources.join("\n")}\n</resources>\n`);
for (const name of ["music_widget", "music_widget_compact"]) {
    const layout = fs.readFileSync(path.join(root, `android/app/src/main/res/layout/${name}.xml`), "utf8");
    write(`layout/${name}_dark.xml`, `<!-- Generated from the shared layout. -->\n${layout.replaceAll("widget_light_", "widget_dark_")}`);
}
