import anyTest, { TestFn } from "ava";
import nock from "nock";
import { createListener, PipelineResult, ResultEmitter } from "../index.js";
import { getProbot } from "./fixtures/probot.js";
import * as eventsFixture from "./fixtures/events.js";
import { Probot } from "probot";
import EventEmitter from "node:events";
import { setupServer, SetupServerApi } from "msw/node";
import { http, HttpResponse } from "msw";

const test = anyTest as TestFn<{
  emitter: ResultEmitter;
  probot: Probot;
  server: SetupServerApi;
}>;

test.before((t) => {
  nock.recorder.rec();
  nock.disableNetConnect();

  const emitter: ResultEmitter = new EventEmitter();
  t.context.emitter = emitter;

  const probot = getProbot();
  probot.load(createListener({ emitter }));
  t.context.probot = probot;
});

test.beforeEach((t) => {
  t.context.server = setupServer();
  t.context.server.resetHandlers();
});

test.afterEach.always(async (t) => {
  await t.context.server.close();
  nock.cleanAll();
});

test.after((t) => {});

test("fetches isobot.ts file when receiving webhook", async (t) => {
  t.context.server.use(
    http.all("*", (info) => {
      info.request.url;
      return HttpResponse.json({
        type: "file",
        content: Buffer.from(
          "export const pipeline = stream => stream"
        ).toString("base64"),
        encoding: "base64",
      });
    })
  );
  await t.context.server.listen();

  t.context.probot.receive(eventsFixture.issue_comment_created);

  const [result] = (await EventEmitter.once(t.context.emitter, "result")) as [
    PipelineResult
  ];
  if (result.isOk() && result.value.status === "OK") {
    t.deepEqual(result.value.pipelineEvent.ctx, {});
  } else {
    t.fail("expected OK result");
  }
});
