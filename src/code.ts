import * as esbuild from "esbuild";
import * as fs from "fs/promises";

export class Code {
  static from(value: string): Code {
    return new Code(value);
  }
  static async fromFilename(filename: string): Promise<Code> {
    return Code.from(await fs.readFile(filename, "utf8"));
  }

  constructor(public value: string) {}

  toString(): string {
    return this.value;
  }

  async transpileNodeCJS() {
    const result = await esbuild.transform(this.value, {
      platform: "node",
      target: "node20",
      format: "cjs",
      loader: "ts",
    });
    this.value = result.code;
    return this.value;
  }
}
