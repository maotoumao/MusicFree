export default function (
  a: IMusic.IMusicItem | null | undefined,
  b: IMusic.IMusicItem | null | undefined,
) {
  return a && b && a.id === b.id && a.platform === b.platform;
}
