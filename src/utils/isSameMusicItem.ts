export default function (
  a: ICommon.IMediaBase | null | undefined,
  b: ICommon.IMediaBase | null | undefined,
) {
  return a && b && a.id === b.id && a.platform === b.platform;
}
