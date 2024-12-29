import { EmitterWebhookEvent } from "@octokit/webhooks";
import { cpus } from "os";
import { file } from "tmp-promise";
import * as fs from "node:fs/promises";
import { Probot, ProbotOctokit } from "probot";
import PQueue from "p-queue";
import { IsolateResult, runInIsolateInfallible } from "./isolate.js";
import { Err, Ok, Result } from "ts-results-es";
import { EventEmitter } from "node:events";
import { isolateEntrypointFilename } from "./paths.js";
import { Pipeline } from "./pipeline.js";

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
        const { path: isofilename, cleanup } = await file({ postfix: ".ts" });
        try {
          const result = await attemptPipeline(event as EmitterWebhookEvent, {
            isofilename,
            probot: app,
          });
          result.isOk()
            ? app.log.info(result.value)
            : app.log.error(result.error);
          emitter?.emit("result", result);
        } finally {
          cleanup().catch(() => null);
        }
      })
    );
  };

type RepoContext = { repo: string; owner: string; ref: string };
export type PipelineResult = Result<
  | { status: "SKIPPED"; repoContext?: RepoContext; message?: string }
  | {
      status: "HALTED";
      repoContext?: RepoContext;
      isolateResult: IsolateResult;
    },
  { repoContext?: RepoContext; message: string }
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

  const isofileReadyResult = await octokit.repos
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
          const fileContent = Buffer.from(
            res.data.content,
            "base64"
          ).toString();
          await fs.writeFile(opts.isofilename, fileContent, "utf-8");
          return new Ok(undefined);
        } else {
          return new Err({
            repoContext,
            message: `failed to get isofile file/base64 from GitHub getContents: ${JSON.stringify(
              res
            )}`,
          });
        }
      },
      (err) =>
        new Err({
          repoContext,
          message: `failed to get isofile file/base64 from GitHub getContents: ${String(
            err
          )}`,
        })
    );

  if (isofileReadyResult.isErr()) {
    return isofileReadyResult;
  }

  const isolateResult = await runInIsolateInfallible({
    entrypointFilename: isolateEntrypointFilename,
    eventPayload: context,
    isoFilename: opts.isofilename,
    logger: opts.probot?.log,
  });

  return new Ok({ status: "HALTED", repoContext, isolateResult });
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
