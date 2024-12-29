import { Logger, Probot, ProbotOctokit } from "probot";
import sinon from "sinon";
import { isDebug } from "../../constants.js";

export const getProbot = (options?: unknown) => {
  return new Probot({
    appId: 123,
    privateKey: "test",
    githubToken: "test",
    Octokit: ProbotOctokit.defaults((instanceOptions: any) => {
      return {
        ...instanceOptions,
        retry: { enabled: false },
        throttle: { enabled: false },
      };
    }),
  });
};

export const getLogger = (): Logger => {
  return {
    info: sinon.fake((...args: any[]) =>
      isDebug ? console.info(...args) : undefined
    ),
    debug: sinon.fake((...args: any[]) =>
      isDebug ? console.debug(...args) : undefined
    ),
    error: sinon.fake((...args: any[]) =>
      isDebug ? console.error(...args) : undefined
    ),
  } as Partial<Logger> as Logger;
};
