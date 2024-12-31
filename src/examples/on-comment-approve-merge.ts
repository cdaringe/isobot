import type { Pipeline } from "../pipeline.js";

export const filename = __filename;

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
    mergeMap((evt) => evt.tk.gh.withPR(evt, evt.payload.issue.number)), // frivolous call, but good for testing
    mergeMap((evt) => evt.tk.gh.withPRComments(evt, evt.payload.issue.number)),
    filter((evt) =>
      evt.ctx.prComments.some((it) => it.body?.startsWith("/merge"))
    ),
    mergeMap((evt) => evt.tk.gh.approvePR(evt, evt.ctx.pr.number)),
    mergeMap((evt) => evt.tk.gh.mergePR(evt, evt.ctx.pr.number))
  );
