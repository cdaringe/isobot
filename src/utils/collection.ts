export const deepFreeze = <T extends Record<string, any> | Array<any>>(
  obj: T
): T => {
  if (Array.isArray(obj)) {
    return obj.map(deepFreeze) as T;
  }
  return Object.freeze(
    Object.entries(obj).reduce<any>((acc, [key, value]) => {
      acc[key] = value;
      if (
        typeof value === "object" &&
        value !== null &&
        !Object.isFrozen(value)
      ) {
        acc[key] = deepFreeze(value);
      }
      return acc;
    }, {})
  );
};
