import { Logger, Probot, ProbotOctokit } from "probot";
import { isDebug } from "../../constants.js";
import { vi } from "vitest";

export const getProbot = (options?: unknown) => {
  return new Probot({
    appId: 123,
    privateKey: "test",
    githubToken: "test",
    log: getLogger(),
    Octokit: ProbotOctokit.defaults((instanceOptions: any) => {
      return {
        ...instanceOptions,
        log: getLogger(),
        retry: { enabled: false },
        throttle: { enabled: false },
      };
    }),
  });
};

export const getLogger = (): Logger => {
  return {
    info: vi.fn((...args: any[]) =>
      isDebug ? console.info(...args) : undefined
    ),
    debug: vi.fn((...args: any[]) =>
      isDebug ? console.debug(...args) : undefined
    ),
    error: vi.fn((...args: any[]) =>
      isDebug ? console.error(...args) : undefined
    ),
    child: vi.fn((...args: any[]) => {
      return getLogger();
    }) as any,
  } as Partial<Logger> as Logger;
};
