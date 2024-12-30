import { DeepPartial } from "utility-types";

export const fromDeepPartial = <T>(x: DeepPartial<T>): T => x as T;

export type ExtractMember<T, K extends keyof T, V extends T[K]> = T extends {
  [P in K]: V;
}
  ? T
  : never;

export type ExtractWithName<
  T extends { name: string },
  N extends string
> = ExtractMember<T, "name", N>;
