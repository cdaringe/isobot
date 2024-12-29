import type { Pipeline } from "../pipeline.js";

export const __filename = new URL(import.meta.url).pathname;

const _pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { filter },
    },
  }
) => stream.pipe(filter((evt) => evt.name === "issue_comment"));
