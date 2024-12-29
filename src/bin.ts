import { run } from "probot";
import { get } from "./logger";

const main = run((app) => {
  const logger = get(app.log);
  app.onAny((event) => {});
});
