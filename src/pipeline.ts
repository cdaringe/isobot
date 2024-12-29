import * as operators from "rxjs/operators";
import { Observable, of } from "rxjs";
import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";
import { Endpoints } from "@octokit/types";

type GHPullRequest =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];

export const tk = {
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

type PipelineEvent<
  TName extends EmitterWebhookEventName,
  Ctx = {}
> = EmitterWebhookEvent<TName> & {
  ctx: Ctx;
  tk: typeof tk;
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
