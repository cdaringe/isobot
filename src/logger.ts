import { Logger } from "probot";

export const get = (logger: Logger) => logger.child({ name: "isobot" });
