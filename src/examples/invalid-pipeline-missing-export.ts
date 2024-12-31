import type { Pipeline } from "../pipeline.js";

export const filename = __filename;

const _pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { filter },
    },
  }
) => stream.pipe(filter((evt) => evt.name === "issue_comment"));
