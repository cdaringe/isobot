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
    mergeMap((evt) => evt.tk.gh.approvePR(evt, evt.ctx.pr.id)),
    mergeMap((evt) => evt.tk.gh.mergePR(evt, evt.ctx.pr.id))
  );
