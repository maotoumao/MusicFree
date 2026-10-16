import dictionary from "./traditional.json";

const characters: Record<string, string> = dictionary.TSCharacters;
const phrases: Record<string, string> = dictionary.TSPhrases;
const phraseLengths = [...new Set(Object.keys(phrases).map(s => s.length))].sort((a, b) => b - a);

/** OpenCC t2s dictionaries; longest phrase first preserves contextual conversions. */
export function simplified(text: string): string {
    let output = "";
    for (let i = 0; i < text.length;) {
        const phrase = phraseLengths.map(n => text.slice(i, i + n)).find(s => phrases[s]);
        if (phrase) {
            output += phrases[phrase];
            i += phrase.length;
        } else {
            output += characters[text[i]] ?? text[i];
            i++;
        }
    }
    return output;
}

export function normalize(value: unknown): string {
    return typeof value === "string" ? simplified(value.normalize("NFKC")).toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, "").trim() : "";
}

const versions: Array<[string, RegExp]> = [
    ["Live", /\blive\b|现场|演唱会/i],
    ["Remix", /\bremix\b|\bdj\b|混音/i],
    ["Cover", /\bcover\b|翻唱/i],
    ["Acoustic", /\bacoustic\b|\bunplugged\b|不插电/i],
    ["Instrumental", /\binstrumental\b|\bkaraoke\b|伴奏|纯音乐/i],
    ["Remastered", /\bremaster(?:ed)?\b|重制/i],
];
export function versionTags(value: string): string[] {
    const text = simplified(value.normalize("NFKC"));
    return versions.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

export function baseTitle(title: string): string {
    // Only remove recognized display annotations. Unknown subtitles are identity.
    return normalize(simplified(title.normalize("NFKC"))
        .replace(/\([^)]*(?:主题曲|片尾曲|片头曲|插曲|原唱|官方|official|lyrics?)[^)]*\)/gi, "")
        .replace(/\([^)]*(?:live|remix|cover|acoustic|instrumental|remaster|现场|伴奏|翻唱|不插电|重制)[^)]*\)/gi, "")
        .replace(/\s+[-–]?\s*(?:live|remix|cover|acoustic|instrumental|remastered)\s*$/i, ""));
}
export interface SongIdentity { artist: string; title: string }
export function songKey(song: SongIdentity): string {
    return JSON.stringify([normalize(song.artist), baseTitle(song.title)]);
}

/** Both artist and title must agree; a title-only match is never playable. */
export function matchTarget(target: SongIdentity, track: IMusic.IMusicItem): number {
    if (!normalize(target.artist) || !baseTitle(target.title)) return 0;
    if (normalize(target.artist) !== normalize(track.artist) || baseTitle(target.title) !== baseTitle(track.title)) return 0;
    const wanted = versionTags(target.title);
    const actual = versionTags([track.title, track.album, track.version].filter(Boolean).join(" "));
    if (wanted.length && (wanted.join() !== actual.join() || normalize(target.title) !== normalize(track.title))) return 0;
    if (actual.some(tag => ["Cover", "Instrumental"].includes(tag)) && !wanted.length) return 0;
    if (Number(track.duration) > 0 && Number(track.duration) <= 65) return 0;
    return actual.length && !wanted.length ? 0.75 : 1;
}
