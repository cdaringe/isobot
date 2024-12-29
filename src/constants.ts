import { url } from "node:inspector";

export const isDebug = !!url();
