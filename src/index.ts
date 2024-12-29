import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";
import * as operators from "rxjs/operators";
import { Endpoints } from "@octokit/types";
import { components as WebhookComponent } from "@octokit/openapi-webhooks-types";
import { cpus } from "os";
import { DeepPartial } from "utility-types";
import { file } from "tmp-promise";
import * as fs from "node:fs/promises";
import { Observable, of } from "rxjs";
import { Probot, ProbotOctokit } from "probot";
import PQueue from "p-queue";
import { IsolateResult, runInIsolateInfallible } from "./isolate";
import { Err, Ok, Result } from "ts-results";

type GHPullRequest =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];

type PipelineEvent<
  TName extends EmitterWebhookEventName,
  Ctx = {}
> = EmitterWebhookEvent<TName> & {
  ctx: Ctx;
  tk: typeof tk;
};

type AnyPipelineEvent = PipelineEvent<
  EmitterWebhookEventName,
  Record<string, any>
>;

type UpdateCtx<TEvent, NewCtx> = TEvent extends PipelineEvent<
  infer TName,
  infer TCtx
>
  ? PipelineEvent<TName, TCtx & NewCtx>
  : never;

const updateCtx = <TEvent extends AnyPipelineEvent, NewCtx extends {}>(
  { ctx: prevContext, ...evt }: TEvent,
  newCtx: NewCtx
): PipelineEvent<TEvent["name"], TEvent["ctx"] & NewCtx> =>
  ({
    ...evt,
    ctx: {
      ...prevContext,
      ...newCtx,
    },
  } as unknown as PipelineEvent<TEvent["name"], TEvent["ctx"] & NewCtx>);

const tk = {
  gh: {
    withPR: async <E extends AnyPipelineEvent>(evt: E, prId: number) => {
      const pr =
        evt.name === "pull_request" &&
        typeof evt.payload.pull_request.id === "number"
          ? evt.payload.pull_request
          : ({} as GHPullRequest); // @todo getPullRequest(prId)
      return updateCtx(evt, { pr });
    },
    withPRComments: async <
      E extends AnyPipelineEvent & { ctx: { pr: { id: number } } }
    >(
      evt: E,
      prId: number
    ) =>
      updateCtx(evt, {
        prComments: [{ id: prId, message: "merge this!" }],
      }),
    approvePR: async <E extends AnyPipelineEvent>(evt: E, prId: number) =>
      updateCtx(evt, { approved: true }),
    mergePR: async <E extends AnyPipelineEvent>(evt: E, prId: number) =>
      updateCtx(evt, { merged: true }),
  },
  filter:
    <UName extends EmitterWebhookEventName>(name: UName) =>
    <E extends AnyPipelineEvent>(evt: E): evt is E =>
      evt.name === name,
  collection: {
    last: <T>(arr: T[]): T | undefined => arr[arr.length - 1],
  },
};

export const fromDeepPartial = <T>(x: DeepPartial<T>): T => x as T;

// Example event
const exampleEvent: PipelineEvent<"issue_comment", { pr: { id: number } }> = {
  id: "test-event-id",
  name: "issue_comment",
  payload: fromDeepPartial<
    WebhookComponent["schemas"]["webhook-issue-comment-created"]
  >({
    action: "created",
    comment: {
      body: "foo",
      created_at: "",
      html_url: "",
    },
  }),
  ctx: { pr: { id: 42 } },
  tk,
};

export const listen = (app: Probot) => {
  const concurrency = Math.max(1, cpus().length - 1);
  const queue = new PQueue({ concurrency });
  app.onAny((event) =>
    queue.add(async () => {
      const { path: isofilename, cleanup } = await file();
      try {
        const result = await attemptPipeline(event as EmitterWebhookEvent, {
          isofilename,
        });
        result.ok ? app.log.info(result.val) : app.log.error(result.val);
      } finally {
        cleanup().catch(() => null);
      }
    })
  );
};

type RepoContext = { repo: string; owner: string; ref: string };
const attemptPipeline = async (
  event: EmitterWebhookEvent,
  opts: {
    isofilename: string;
  }
): Promise<
  Result<
    | { status: "SKIPPED"; repoContext?: RepoContext; message?: string }
    | {
        status: "HALTED";
        repoContext?: RepoContext;
        isolateResult: IsolateResult;
      },
    { repoContext?: RepoContext; message: string }
  >
> => {
  const context = event.payload;
  if (!("repository" in context)) {
    return new Ok({ status: "SKIPPED", message: "missing repository" });
  }
  if (!context.repository?.owner) {
    return new Ok({ status: "SKIPPED", message: "missing owner" });
  }

  if (!("octokit" in context)) {
    return new Ok({ status: "SKIPPED", message: "missing octokit" });
  }
  const octokit = context.octokit as ProbotOctokit;

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

  if (isofileReadyResult.err) {
    return isofileReadyResult;
  }

  const isolateResult = await runInIsolateInfallible(opts.isofilename, context);

  return new Ok({ status: "HALTED", repoContext, isolateResult });
};

interface PipelineResourceRxjs {
  rxjs: {
    operators: typeof operators;
  };
}

interface PipelineResources extends PipelineResourceRxjs {}

export type Pipeline = (
  stream: Observable<AnyPipelineEvent>,
  resources: PipelineResources
) => Observable<any>;

export const pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { filter, mergeMap: andThen },
    },
  }
) =>
  stream.pipe(
    filter((evt) => evt.name === "issue_comment"),
    andThen((evt) => evt.tk.gh.withPR(evt, evt.payload.issue.id)),
    andThen((evt) => evt.tk.gh.withPRComments(evt, evt.ctx.pr.id)),
    andThen((evt) => evt.tk.gh.approvePR(evt, evt.ctx.pr.id)),
    andThen((evt) => evt.tk.gh.mergePR(evt, evt.ctx.pr.id))
  );
