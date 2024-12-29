const { SCRIPT_FILENAME, EVENT_PAYLOAD_JSON } = process.env;
import assert from "node:assert";
import { primitivify } from "primitivify";
import { catchError, Observable, of } from "rxjs";
import { Pipeline, tk } from "./pipeline.js";
import * as operators from "rxjs/operators";

async function main() {
  assert(SCRIPT_FILENAME, "SCRIPT_FILENAME not found");
  assert(EVENT_PAYLOAD_JSON, "EVENT_PAYLOAD_JSON not found");
  const mod = await import(SCRIPT_FILENAME);
  const pipeline = mod.pipeline;
  assertIsPipeline(pipeline);
  const event = Object.assign(
    {
      tk: tk,
    },
    JSON.parse(EVENT_PAYLOAD_JSON)
  );

  const observable = pipeline(of(event), { rxjs: { operators } });
  assertObservable(observable);
  return new Promise<unknown>((resolve, reject) =>
    observable
      .pipe(catchError(async (err, _) => reject(err)))
      .subscribe((v) => resolve(v))
  );
}

function assertIsPipeline(x: unknown): asserts x is Pipeline {
  assert(typeof x === "function", `expected pipeline function export`);
}

function assertObservable(x: unknown): asserts x is Observable<unknown> {
  if (
    x &&
    typeof x === "object" &&
    "subscribe" in x &&
    typeof x.subscribe === "function"
  ) {
    return;
  }
  throw new Error(`expected Observable, got ${typeof x} (${String(x)})`);
}

main().then(
  (v) => {
    console.log(primitivify(v));
    process.send?.(JSON.stringify({ ok: true, value: primitivify(v) }));
    process.disconnect();
  },
  (err) => {
    console.error(err);
    process.send?.(JSON.stringify({ ok: false, value: String(err) }));
    process.disconnect();
    process.exit(1);
  }
);
