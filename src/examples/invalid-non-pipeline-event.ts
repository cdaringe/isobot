import type { Pipeline } from "../pipeline.js";

export const filename = __filename;

export const pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { map },
    },
  }
) => stream.pipe(map(() => "not a pipeline event"));
