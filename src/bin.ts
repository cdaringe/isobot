import { run } from "probot";
import { get } from "./logger.js";

const main = run((app) => {
  const logger = get(app.log);
});
