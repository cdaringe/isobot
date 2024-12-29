import { ChildProcess, fork } from "node:child_process";
import { join } from "node:path";
import { setTimeout } from "node:timers";
import { Err, Ok, Result } from "ts-results";

export type IsolateResult = Result<Record<string, any>, string>;

export const runInIsolateInfallible = (
  filename: string,
  eventPayload: Record<string, unknown>
): Promise<IsolateResult> => {
  return new Promise<IsolateResult>((resolve) => {
    setTimeout(() => resolve(new Err("timeout")), 30_000);
    const child: ChildProcess = fork(join(__dirname, "entrypoint"), [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: {
        SCRIPT_FILENAME: filename,
        EVENT_PAYLOAD_JSON: JSON.stringify(eventPayload),
      },
      execArgv: [
        // Restrict permissions
        "--permission",
      ],
    });

    child.on("message", (result) => {
      child.kill();
      try {
        const v = JSON.parse(result.toString());
        typeof v === "object" && v
          ? resolve(new Ok(v))
          : resolve(new Err(`expected an isolate object, got ${v}`));
      } catch (err) {
        resolve(new Err(`failed to deserialize isolate report ${String(err)}`));
      }
    });

    child.on("error", (err) =>
      resolve(new Err(`isolate process failed with: ${String(err)}`))
    );
    child.on("exit", (code: number) => {
      resolve(new Err(`expected message, but exited with code ${code}`));
    });
  });
};
