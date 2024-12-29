/**
 * Bonkers IPC over RPC.
 * We use this to not have to re-create complex resources in the isolate, such
 * as the GitHub API.
 */
import { randomUUID } from "crypto";

// Message protocol
type RPCRequest = {
  id: string;
  path: string[];
  args: unknown[];
  type: "call";
};

type RPCResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

// Host handler
export class RPCHandler {
  private callbacks = new Map<string, (result: any) => void>();

  constructor(private target: any, private process: NodeJS.Process) {
    process.on("message", this.handleMessage);
  }

  private handleMessage = (msg: RPCRequest) => {
    if (msg.type === "call") {
      try {
        let current = this.target;
        for (const key of msg.path.slice(0, -1)) {
          current = current[key];
        }
        const method = current[msg.path[msg.path.length - 1]!];
        Promise.resolve(method.apply(current, msg.args))
          .then((result) =>
            this.process.send?.({
              id: msg.id,
              result,
            })
          )
          .catch((error) =>
            this.process.send?.({
              id: msg.id,
              error: error.message,
            })
          );
      } catch (error) {
        this.process.send?.({
          id: msg.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}

// Child-side proxy generator
export function createRPCProxy<T>(process: NodeJS.Process): T {
  return new Proxy({} as any, {
    get(target, prop) {
      return new Proxy(() => {}, {
        apply: (_, __, args) => {
          return new Promise((resolve, reject) => {
            const id = randomUUID();

            const handler = (response: RPCResponse) => {
              if (response.id === id) {
                process.off("message", handler);
                if ("error" in response) {
                  reject(new Error(response.error));
                } else {
                  resolve(response.result);
                }
              }
            };

            process.on("message", handler);
            process.send?.({
              id,
              path: [...(target._path || []), prop],
              args,
              type: "call",
            });
          });
        },
        get: (_, nestedProp) => {
          const newProxy = createRPCProxy(process);
          (newProxy as any)._path = [...(target._path || []), prop, nestedProp];
          return newProxy;
        },
      });
    },
  });
}
