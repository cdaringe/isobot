import * as operators from "rxjs/operators";
import { Observable, of } from "rxjs";
import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";
import { Endpoints } from "@octokit/types";
import { ProbotOctokit } from "probot";
import { RepoContext } from "./utils/github.js";

type GHPullRequest =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];

export const createToolkit = ({
  octokit,
  repoContext,
}: {
  octokit: ProbotOctokit;
  repoContext: RepoContext;
}) => ({
  gh: {
    withPR: async <E extends AnyBasicPipelineEvent>(
      evt: E,
      pull_number: number
    ) => {
      const pr =
        evt.name === "pull_request" &&
        typeof evt.payload.pull_request.id === "number"
          ? evt.payload.pull_request
          : await octokit.pulls
              .get({ pull_number, ...repoContext })
              .then((it) => it.data);
      return updateCtx(evt, { pr });
    },
    withPRComments: async <E extends AnyBasicPipelineEvent>(
      evt: E,
      pull_number: number
    ) =>
      updateCtx(evt, {
        prComments: await octokit.issues
          .listComments({
            issue_number: pull_number,
            ...repoContext,
          })
          .then((it) => it.data),
      }),
    approvePR: async <E extends AnyBasicPipelineEvent>(
      evt: E,
      pull_number: number
    ) =>
      octokit.pulls
        .listReviews({ pull_number, ...repoContext })
        .then(async (it) => {
          const existingBotReview = it.data.find((it) =>
            it.user?.login.match(/isobot/)
          );
          if (existingBotReview) {
            return existingBotReview;
          }
          return octokit.pulls
            .createReview({ pull_number, ...repoContext })
            .then((it) => it.data);
        })

        .then((it) =>
          it.state !== "APPROVED"
            ? octokit.pulls.submitReview({
                pull_number,
                event: "APPROVE",
                review_id: it.id,
                ...repoContext,
              })
            : null
        )
        .then((it) => updateCtx(evt, { approved: true })),
    mergePR: async <E extends AnyBasicPipelineEvent>(
      evt: E,
      pull_number: number
    ) =>
      octokit.pulls
        .merge({ pull_number, ...repoContext })
        .then((__) => updateCtx(evt, { merged: true })),
  },
  filter:
    <UName extends EmitterWebhookEventName>(name: UName) =>
    <E extends AnyBasicPipelineEvent>(evt: E): evt is E =>
      evt.name === name,
  collection: {
    last: <T>(arr: T[]): T | undefined => arr[arr.length - 1],
  },
});

type Toolkit = ReturnType<typeof createToolkit>;

type BasicPipelineEvent<
  TName extends EmitterWebhookEventName,
  Ctx = {}
> = EmitterWebhookEvent<TName> & {
  ctx: Ctx;
};

type AnyBasicPipelineEvent = BasicPipelineEvent<any, any>;

type PipelineEvent<
  TName extends EmitterWebhookEventName,
  Ctx = {}
> = BasicPipelineEvent<TName, Ctx> & {
  tk: Toolkit;
};

export type AnyPipelineEvent = PipelineEvent<
  EmitterWebhookEventName,
  Record<string, any>
>;

interface PipelineResourceRxjs {
  rxjs: {
    operators: typeof operators;
  };
}

export interface PipelineResources extends PipelineResourceRxjs {}

export type Pipeline = (
  stream: Observable<AnyPipelineEvent>,
  resources: PipelineResources
) => Observable<any>;

type UpdateCtx<TEvent, NewCtx> = TEvent extends PipelineEvent<
  infer TName,
  infer TCtx
>
  ? PipelineEvent<TName, TCtx & NewCtx>
  : never;

const updateCtx = <TEvent extends AnyBasicPipelineEvent, NewCtx extends {}>(
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
