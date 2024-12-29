const { SCRIPT_FILENAME, EVENT_PAYLOAD_JSON } = process.env;
import assert from "node:assert";
import { primitivify } from "primitivify";
import { catchError, Observable, of } from "rxjs";

async function main() {
  assert(SCRIPT_FILENAME, "SCRIPT_FILENAME not found");
  assert(EVENT_PAYLOAD_JSON, "EVENT_PAYLOAD_JSON not found");
  const mod = await import(SCRIPT_FILENAME);
  const pipeline = mod.pipeline;
  assert(
    typeof mod.pipeline === "function",
    `expected pipeline function export, found: ${exportNameType(mod)}`
  );
  const observable = pipeline(of(JSON.parse(EVENT_PAYLOAD_JSON)));
  assertObservable(observable);
  return new Promise<unknown>((resolve, reject) =>
    observable
      .pipe(catchError(async (err, _) => reject(err)))
      .subscribe((v) => resolve(v))
  );
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
function exportNameType(mod: Record<string, unknown>) {
  return Object.entries(mod).reduce(
    (acc, [k, v]) => ({ ...acc, [k]: typeof v }),
    {}
  );
}

main().then(
  (v) => process.send?.(JSON.stringify({ ok: true, value: primitivify(v) })),
  (err) => process.send?.(JSON.stringify({ ok: false, value: String(err) }))
);
