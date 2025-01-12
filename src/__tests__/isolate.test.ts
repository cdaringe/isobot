import { describe, it, expect, vi, Mock } from "vitest";
import { runInIsolateInfallible } from "../isolate.js";
import * as eventsFixture from "./fixtures/events.js";
import { getLogger } from "./fixtures/probot.js";
import { Code } from "../code.js";
import * as exampleOnCommentApproveMergeMeta from "../examples/on-comment-approve-merge.js";
import * as exampleInvalidPipelineEvent from "../examples/invalid-non-pipeline-event.js";
import * as exampleInvalidPipelineObservable from "../examples/invalid-non-observable-pipeline.js";

import { withMockServer } from "./fixtures/mock-server.js";
import * as github from "./fixtures/github/index.js";
import * as mswMod from "msw";

const createOnCommentApproveMergeMetaHandlers = (msw: typeof mswMod) =>
  msw.http.all("*", (info) => {
    const pathname = new URL(info.request.url).pathname;
    switch (`${info.request.method} ${pathname}`) {
      case "GET /repos/owner/repo/pulls/1":
        return msw.HttpResponse.json(github.pulls.get);
      case "GET /repos/owner/repo/issues/1/comments":
        const nextComments = globalThis.structuredClone(
          github.issues.listComments
        );
        nextComments[0]!.body = "/merge";
        return msw.HttpResponse.json(nextComments);
      case `GET /repos/owner/repo/pulls/${github.pulls.get.number}/reviews`:
        return msw.HttpResponse.json(github.reviews.list);
      case `POST /repos/owner/repo/pulls/${github.pulls.get.number}/reviews`:
        return msw.HttpResponse.json(github.reviews.create);
      case `PUT /repos/owner/repo/pulls/${github.pulls.get.number}/merge`:
        return msw.HttpResponse.json(github.pulls.merge);
      default:
        return msw.HttpResponse.json("not found", { status: 404 });
    }
  });

const create404Handlers = (msw: typeof mswMod) =>
  msw.http.all("*", (info) => {
    const pathname = new URL(info.request.url).pathname;
    switch (`${info.request.method} ${pathname}`) {
      default:
        return msw.HttpResponse.json("not found", { status: 404 });
    }
  });
describe("isolate", () => {
  it(
    "should yield pipeline events - updated context",
    withMockServer(async (server, { msw }) => {
      server.use(createOnCommentApproveMergeMetaHandlers(msw));
      server.listen();
      const logger = getLogger();
      const out = await runInIsolateInfallible({
        script: await Code.fromFilename(
          exampleOnCommentApproveMergeMeta.filename
        ),
        pipelineEvent: eventsFixture.asPipelineEvent(
          eventsFixture.issue_comment_created
        ),
        logger,
      });
      if (out.isOk()) {
        expect(out.value.ctx).toEqual(
          expect.objectContaining({ approved: true, merged: true })
        );
      } else {
        expect.fail(out.error);
      }
    })
  );

  it("should yield pipeline events - no pipeline found", async (t) => {
    const logger = getLogger();
    const out = await runInIsolateInfallible({
      script: Code.from(`module.exports.pipelinezzzz  = stream => stream`),
      pipelineEvent: eventsFixture.asPipelineEvent(
        eventsFixture.issue_comment_created
      ),
      logger,
    });
    if (out.isOk()) {
      expect.fail("invalid pipeline should not have succeeded");
    } else {
      expect(out.error).toMatch(/expected pipeline function export/);
    }
  });

  it("should yield pipeline events - invalid pipeline event", async (t) => {
    const logger = getLogger();
    const out = await runInIsolateInfallible({
      script: await Code.fromFilename(exampleInvalidPipelineEvent.filename),
      pipelineEvent: eventsFixture.asPipelineEvent(
        eventsFixture.issue_comment_created
      ),
      logger,
    });
    if (out.isOk()) {
      expect.fail("invalid pipeline should not have succeeded");
    } else {
      expect(out.error).toMatch(/did not emit a AnyPipelineEvent kind/);
    }
  });

  it("should yield pipeline events - pipeline does not provide observable", async (t) => {
    const logger = getLogger();
    const out = await runInIsolateInfallible({
      script: await Code.fromFilename(
        exampleInvalidPipelineObservable.filename
      ),
      pipelineEvent: eventsFixture.asPipelineEvent(
        eventsFixture.issue_comment_created
      ),
      logger,
    });
    if (out.isOk()) {
      expect.fail("invalid pipeline should not have succeeded");
    } else {
      expect(out.error).toMatch(/expected Observable/);
    }
  });

  it(
    "should yield pipeline events with sane github errors",
    withMockServer(async (server, { msw }) => {
      server.use(create404Handlers(msw));
      server.listen();
      const logger = getLogger();
      const out = await runInIsolateInfallible({
        script: await Code.fromFilename(
          exampleOnCommentApproveMergeMeta.filename
        ),
        pipelineEvent: eventsFixture.asPipelineEvent(
          eventsFixture.issue_comment_created
        ),
        logger,
      });
      expect((logger.info as Mock).mock.calls).toMatchInlineSnapshot(`[]`);
      expect((logger.error as Mock).mock.calls).toMatchInlineSnapshot(`[]`);
      if (out.isOk()) {
        expect.fail("invalid pipeline should not have succeeded");
      } else {
        expect(out.error.split("\n")[0]).toMatchInlineSnapshot(`"pipeline run failed: HttpError: Not found. May be due to lack of authentication. Reason: Neither "appId"/"privateKey" nor "token" have been set as auth options"`);
      }
    })
  );
});
