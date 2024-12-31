import { describe, it, vi, expect } from "vitest";
import {
  createListener,
  PipelineErr,
  PipelineResult,
  ResultEmitter,
} from "../index.js";
import { getProbot } from "./fixtures/probot.js";
import * as eventsFixture from "./fixtures/events.js";
import EventEmitter from "node:events";
import { withMockServer } from "./fixtures/mock-server.js";
import { Err, ErrImpl } from "ts-results-es";

describe("integration", () => {
  const probot = getProbot();
  const emitter: ResultEmitter = new EventEmitter();
  probot.load(createListener({ emitter }));

  it(
    "should fetch isobot.ts file when receiving webhook",
    withMockServer(async (server, { msw }) => {
      server.use(
        msw.http.all("*", (info) => {
          return msw.HttpResponse.json({
            type: "file",
            content: Buffer.from(
              "export const pipeline = stream => stream"
            ).toString("base64"),
            encoding: "base64",
          });
        })
      );
      server.listen();

      probot.receive(eventsFixture.issue_comment_created);

      const [result] = (await EventEmitter.once(emitter, "result")) as [
        PipelineResult
      ];

      if (result.isOk() && result.value.status === "OK") {
        expect(result.value.pipelineEvent.ctx).toEqual({});
      } else {
        expect.fail("expected OK result");
      }
    })
  );

  it(
    "should fail gracefully on not found isobot.ts",
    withMockServer(async (server, { msw }) => {
      server.use(
        msw.http.all("*", (info) => {
          return msw.HttpResponse.json("not found", { status: 404 });
        })
      );
      server.listen();

      probot.receive(eventsFixture.issue_comment_created);

      const [result] = (await EventEmitter.once(emitter, "result")) as [
        PipelineResult
      ];

      expect((result as ErrImpl<PipelineErr>).error.message).toBe(
        "failed to get isofile file/base64 from GitHub getContents: HttpError: not found"
      );
    })
  );

  it(
    "should fail gracefully on invalid isobot.ts",
    withMockServer(async (server, { msw }) => {
      server.use(
        msw.http.all("*", (info) => {
          return msw.HttpResponse.json({
            type: "file",
            content: "",
            encoding: "iso-8859-1",
          });
        })
      );
      server.listen();

      probot.receive(eventsFixture.issue_comment_created);

      const [result] = (await EventEmitter.once(emitter, "result")) as [
        PipelineResult
      ];

      expect((result as ErrImpl<PipelineErr>).error.message).toMatch(
        /iso-8859/
      );
    })
  );
});
