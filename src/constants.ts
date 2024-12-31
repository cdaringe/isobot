import { url } from "node:inspector";
const { NODE_OPTIONS } = process.env;

/* istanbul ignore next reason: static analysis sufficient @preserve */
export const isDebug = !!url() || NODE_OPTIONS?.includes("--inspect");
