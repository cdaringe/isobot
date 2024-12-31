import { Logger } from "probot";

/* istanbul ignore next reason: static analysis sufficient @preserve */
export const get = (logger: Logger): Logger => logger.child({ name: "isobot" });
