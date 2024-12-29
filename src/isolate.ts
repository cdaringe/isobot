import { ChildProcess, fork, spawn, StdioOptions } from "node:child_process";
import { setTimeout } from "node:timers";
import { Err, Ok, Result } from "ts-results-es";
import { AnyPipelineEvent } from "./pipeline.js";
import { isDebug } from "./constants.js";
import { Logger } from "probot";

export type IsolateResult = Result<AnyPipelineEvent, string>;

export const runInIsolateInfallible = async ({
  entrypointFilename,
  eventPayload,
  logger,
  isoFilename,
}: {
  entrypointFilename: string;
  eventPayload: Record<any, any>;
  logger?: Logger;
  isoFilename: string;
}): Promise<IsolateResult> => {
  const result = await new Promise<IsolateResult>((resolve) => {
    const timeout = setTimeout(() => resolve(new Err("timeout")), 30_000);

    const bin = "tsx";
    const args = [
      // @warn @todo fix this
      // "--permission",
      //  "--allow-fs-read",
      entrypointFilename,
    ];
    const env = {
      // PATH: process.env.PATH,
      // NODE_OPTIONS: process.env.NODE_OPTIONS,
      // NODE_ENV: process.env.NODE_ENV,
      SCRIPT_FILENAME: isoFilename,
      EVENT_PAYLOAD_JSON: JSON.stringify(eventPayload),
    };

    const envstr = Object.entries(env).reduce(
      (acc, [k, v]) => `${k}='${v}' ${acc}`,
      ""
    );
    logger?.debug(
      `running isolate command: ${[envstr, bin, ...args].join(" ")}`
    );

    const stdio: StdioOptions = isDebug
      ? ["inherit", "inherit", "inherit", "ipc"]
      : ["pipe", "pipe", "pipe", "ipc"];
    const child = spawn(bin, args, {
      stdio,
      env: { ...process.env, ...env },
      /**
       * @todo naughty ext
       */
      // execArgv: [
      //   // Restrict permissions
      //   "--permission",
      // ],
    });

    child.on("message", (result) => {
      logger?.debug(`message from isolate: ${result}`);

      try {
        const v = JSON.parse(result.toString());
        typeof v === "object" && v && v.ok
          ? resolve(new Ok(v.value))
          : resolve(new Err(v.value));
      } catch (err) {
        resolve(new Err(`failed to deserialize isolate report ${String(err)}`));
      }
    });

    child.on("error", (err) => {
      logger?.debug(`isolate errored with ${err}`);
      resolve(new Err(`isolate process failed with: ${String(err)}`));
    });
    child.on("exit", (code: number) => {
      clearTimeout(timeout);
      logger?.debug(`isolate exited with code ${code}`);
      resolve(new Err(`expected message, but exited with code ${code}`));
    });
  });
  return result;
};
