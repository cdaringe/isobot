import { Err, Ok, Result } from "ts-results-es";
import { AnyPipelineEvent, Pipeline, tk } from "./pipeline.js";
import { Logger } from "probot";
import * as vm from "node:vm";
import * as operators from "rxjs/operators";
import { deepFreeze } from "../utils/collection.js";
import * as rxjs from "rxjs";
import { primitivify } from "primitivify";
import assert from "node:assert";
import { Code } from "./code.js";

const deepFrozenTk = deepFreeze(tk);
const deepFrozenRxjs = deepFreeze(rxjs);
const deepFrozenOperators = deepFreeze(operators);

export type IsolateResult = Result<AnyPipelineEvent, string>;

/**
 * Load downleveled 3p isobot code into a VM sandbox. Give it resources, but
 * observe that the reference resources are either:
 * 1. Deep-frozen (s.t. userland cannot meddle with our precious references)
 * 2. Safe to for userland to meddle
 */
export const runInIsolateInfallible = async ({
  pipelineEvent,
  logger,
  script: scriptOrCode,
}: {
  pipelineEvent: AnyPipelineEvent;
  logger?: Logger;
  script: string | Code;
}): Promise<IsolateResult> => {
  const sandbox = createCommonJSSandboxContext();
  const context = vm.createContext({
    ...sandbox,
    assertIsPipeline,
    assertObservable,
    URL,
    logger,
    pipelineParams: [
      rxjs.of({ ...pipelineEvent, tk: deepFrozenTk, ctx: {} }),
      {
        primitivify,
        rxjs: {
          rxjs: deepFrozenRxjs,
          operators: deepFrozenOperators,
        },
      },
    ],
  });

  const scriptCode =
    typeof scriptOrCode === "string"
      ? scriptOrCode
      : await scriptOrCode.transpileNodeCJS();

  const wrappedScript = `(() => {
${scriptCode}

assertIsPipeline(module.exports.pipeline);
const __pipeline__ = module.exports.pipeline;

const [event, { rxjs: { operators }, primitivify }] = pipelineParams;
const observable = __pipeline__(...pipelineParams);
assertObservable(observable);
return observable
  .pipe(
     operators.map((v) => primitivify(v)),
  )
  .toPromise();
})();
`;
  return Promise.resolve()
    .then(() =>
      vm.runInContext(wrappedScript, context, {
        timeout: 30_000,
      })
    )
    .then(
      (v) => {
        if (v && !v.ctx) {
          return new Err(
            `pipeline run did not crash, but did not emit a AnyPipelineEvent kind. The same kind of event that enters the pipeline must also exit it.`
          );
        }
        return new Ok(v);
      },
      (err) => new Err(`pipeline run failed: ${String(err)}`)
    );
};

const createCommonJSSandboxContext = () => {
  const sandbox: Record<string, any> = {
    exports: {},
    module: { exports: {} },
    console: {
      ...console,
    },
    require: (moduleName: string) => {
      // Allow requiring only specific modules or built-ins
      // if (moduleName === "fs" || moduleName === "path") {
      //   return require(moduleName);
      // }
      throw new Error(`Module '${moduleName}' is not allowed in the sandbox.`);
    },
    __filename: "/sandbox/module.js",
    __dirname: "/sandbox",
  };
  sandbox.global = sandbox; // Emulate a global object
  return sandbox;
};

function assertIsPipeline(x: unknown): asserts x is Pipeline {
  assert(typeof x === "function", `expected pipeline function export`);
}

function assertObservable(x: unknown): asserts x is rxjs.Observable<unknown> {
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
