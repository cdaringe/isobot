debugger; // eslint-disable-line
import { run } from "probot";
import { get } from "./logger.js";
import { createListener } from "./index.js";

run((app) => {
  const log = get(app.log);
  app.load(createListener({ log }));
  log.info("Hello Seattle, I'm listening...");
});
