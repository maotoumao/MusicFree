export function makeTag<X extends Record<string, any>[] = any[]>(
  objArray: X,
  tag: string,
): X {
  objArray.forEach(_ => {
    _.platform = tag;
  });
  return objArray;
}
