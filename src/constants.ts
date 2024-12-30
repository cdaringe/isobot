import { url } from "node:inspector";
const { NODE_OPTIONS } = process.env;

export const isDebug = !!url() || NODE_OPTIONS?.includes("--inspect");
