import { EmitterWebhookEvent } from "@octokit/webhooks";
import { cpus } from "os";
import { file } from "tmp-promise";
import { Probot, ProbotOctokit } from "probot";
import PQueue from "p-queue";
import { IsolateResult, runInIsolateInfallible } from "./isolate.js";
import { Err, Ok, Result, ResultErrType, ResultOkType } from "ts-results-es";
import { EventEmitter } from "node:events";
import { AnyPipelineEvent, Pipeline, tk } from "./pipeline.js";
import esbuild from "esbuild";
import { deepFreeze } from "../utils/collection.js";
import { Code } from "./code.js";

export type ResultEmitter = EventEmitter<{ result: [PipelineResult] }>;
type ListenOptions = { emitter?: ResultEmitter };

export const createListener =
  (opts: ListenOptions = {}) =>
  (app: Probot) => {
    const { emitter } = opts;
    const concurrency = Math.max(1, cpus().length - 1);
    const queue = new PQueue({ concurrency });
    app.onAny((event) =>
      queue.add(async () => {
        const { path: isofilename, cleanup } = await file({ postfix: ".js" });
        await attemptPipeline(event as EmitterWebhookEvent, {
          isofilename,
          probot: app,
        })
          .then((result) => {
            result.isOk()
              ? app.log.info({
                  status: result.value.status,
                  repoContext: result.value.repoContext,
                })
              : app.log.error({
                  status: result.error.status,
                  repoContext: result.error.repoContext,
                });
            emitter?.emit("result", result);
          })
          .finally(() => cleanup().catch(() => null));
      })
    );
  };

type RepoContext = { repo: string; owner: string; ref: string };
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
  { status: "ERR"; repoContext?: RepoContext; message: string }
>;

const attemptPipeline = async (
  event: EmitterWebhookEvent,
  opts: {
    isofilename: string;
    probot?: Probot;
  }
): Promise<PipelineResult> => {
  const context = event.payload;
  if (!("repository" in context)) {
    return new Ok({ status: "SKIPPED", message: "missing repository" });
  }
  if (!context.repository?.owner) {
    return new Ok({ status: "SKIPPED", message: "missing owner" });
  }

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
    tk: tk,
  });

  const isolateResult = await runInIsolateInfallible({
    pipelineEvent,
    script: isoscriptResult.value,
    logger: opts.probot?.log,
  });

  return isolateResult.isOk()
    ? new Ok({ status: "OK", repoContext, pipelineEvent: isolateResult.value })
    : new Err({ status: "ERR", repoContext, message: isolateResult.error });
};

export const pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { filter, mergeMap },
    },
  }
) =>
  stream.pipe(
    filter((evt) => evt.name === "issue_comment"),
    mergeMap((evt) => evt.tk.gh.withPR(evt, evt.payload.issue.id)),
    mergeMap((evt) => evt.tk.gh.withPRComments(evt, evt.ctx.pr.id)),
    mergeMap((evt) => evt.tk.gh.approvePR(evt, evt.ctx.pr.id)),
    mergeMap((evt) => evt.tk.gh.mergePR(evt, evt.ctx.pr.id))
  );
