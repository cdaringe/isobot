import { EmitterWebhookEvent } from "@octokit/webhooks";
import { cpus } from "os";
import { file } from "tmp-promise";
import { Logger, Probot, ProbotOctokit } from "probot";
import PQueue from "p-queue";
import { IsolateResult, runInIsolateInfallible } from "./isolate.js";
import { Err, Ok, Result, ResultOkType } from "ts-results-es";
import { EventEmitter } from "node:events";
import { AnyPipelineEvent, createToolkit, Pipeline } from "./pipeline.js";
import { deepFreeze } from "./utils/collection.js";
import { Code } from "./code.js";
import { RepoContext } from "./utils/github.js";

export type ResultEmitter = EventEmitter<{ result: [PipelineResult] }>;
type ListenOptions = { emitter?: ResultEmitter; log?: Logger };

export const createListener = (opts?: ListenOptions) => (app: Probot) => {
  /* istanbul ignore next reason: static analysis sufficient @preserve */
  const { emitter, log } = opts ?? {};
  const concurrency = Math.max(1, cpus().length - 1);
  const queue = new PQueue({ concurrency });
  app.onAny((event) =>
    queue.add(async () => {
      const { path: isofilename, cleanup } = await file({ postfix: ".js" });
      await attemptPipeline(event as EmitterWebhookEvent, {
        isofilename,
        probot: app,
        log,
      })
        .then((result) => {
          result.isOk()
            ? app.log.info({
                status: result.value.status,
                repoContext: result.value.repoContext,
                eventName: event.name,
              })
            : app.log.error({
                eventName: event.name,
                status: result.error.status,
                repoContext: result.error.repoContext,
                message: result.error.message,
              });
          emitter?.emit("result", result);
        })
        .finally(() =>
          cleanup().catch(
            /* istanbul ignore next reason: static analysis sufficient @preserve */ () =>
              null
          )
        );
    })
  );
};

export type PipelineErr = {
  status: "ERR";
  repoContext?: RepoContext;
  message: string;
};

export type PipelineResult = Result<
  | {
      status: "SKIPPED";
      repoContext?: RepoContext;
      message?: string;
      isolateResult?: undefined;
    }
  | {
      status: "OK";
      repoContext?: RepoContext;
      pipelineEvent: ResultOkType<IsolateResult>;
    },
  PipelineErr
>;

const attemptPipeline = async (
  event: EmitterWebhookEvent,
  opts: {
    isofilename: string;
    probot?: Probot;
    log?: Logger;
  }
): Promise<PipelineResult> => {
  const context = event.payload;
  /* istanbul ignore next @preserve */
  if (!("repository" in context)) {
    return new Ok({ status: "SKIPPED", message: "missing repository" });
  }
  /* istanbul ignore next @preserve */
  if (!context.repository?.owner) {
    return new Ok({ status: "SKIPPED", message: "missing owner" });
  }
  /* istanbul ignore next @preserve */
  if (!("octokit" in event)) {
    return new Ok({ status: "SKIPPED", message: "missing octokit" });
  }
  const octokit = event.octokit as ProbotOctokit;

  const owner = context.repository.owner.login;
  const repo = context.repository.name;
  const ref = context.repository.default_branch;

  const repoContext = { owner, repo, ref };

  const isoscriptResult = await octokit.repos
    .getContent({
      owner,
      repo,
      path: ".github/isobot.ts",
      ref,
    })
    .then(
      async (res) => {
        if (
          "content" in res.data &&
          "type" in res.data &&
          res.data.type === "file" &&
          "encoding" in res.data &&
          res.data.encoding === "base64"
        ) {
          const content = Buffer.from(res.data.content, "base64").toString();
          return new Ok(Code.from(content));
        } else {
          return new Err({
            status: "ERR" as const,
            repoContext,
            message: `failed to get isofile file/base64 from GitHub getContents: ${JSON.stringify(
              res
            )}`,
          });
        }
      },
      (err) =>
        new Err({
          status: "ERR" as const,
          repoContext,
          message: `failed to get isofile file/base64 from GitHub getContents: ${String(
            err
          )}`,
        })
    );

  if (isoscriptResult.isErr()) {
    return isoscriptResult;
  }

  const pipelineEvent: AnyPipelineEvent = deepFreeze({
    ...event,
    ctx: {},
    tk: createToolkit({ octokit, repoContext }),
  });

  const isolateResult = await runInIsolateInfallible({
    pipelineEvent,
    script: isoscriptResult.value,
    logger: opts.log,
  });

  /* istanbul ignore next reason: static analysis sufficient @preserve */
  return isolateResult.isOk()
    ? new Ok({ status: "OK", repoContext, pipelineEvent: isolateResult.value })
    : new Err({ status: "ERR", repoContext, message: isolateResult.error });
};
