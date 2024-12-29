import anyTest, { TestFn } from "ava";
import { runInIsolateInfallible } from "../isolate.js";
import { isolateEntrypointFilename } from "../paths.js";
import * as exampleOnCommentApproveMergeMeta from "../examples/on-comment-approve-merge.js";
import * as exampleInvalidPipelineMissingExportMeta from "../examples/invalid-pipeline-missing-export.js";

import * as eventsFixture from "./fixtures/events.js";
import { getLogger } from "./fixtures/probot.js";

const test = anyTest as TestFn<{}>;

test.before(() => {});

test.beforeEach((t) => {});

test.afterEach.always(() => {
  // nock.cleanAll();
});

test("runs isolate yields pipeline event - updated context", async (t) => {
  const logger = getLogger();
  const out = await runInIsolateInfallible({
    entrypointFilename: isolateEntrypointFilename,
    isoFilename: exampleOnCommentApproveMergeMeta.__filename,
    eventPayload: eventsFixture.issue_comment_created,
    logger,
  });
  if (out.isOk()) {
    t.like(out.value.ctx, { approved: true, merged: true });
  } else {
    t.fail(out.error);
  }
});

test("runs isolate yields pipeline event - error with pipeline", async (t) => {
  const logger = getLogger();
  const out = await runInIsolateInfallible({
    entrypointFilename: isolateEntrypointFilename,
    isoFilename: exampleInvalidPipelineMissingExportMeta.__filename,
    eventPayload: eventsFixture.issue_comment_created,
    logger,
  });
  if (out.isOk()) {
    t.fail("invalid pipeline should not have succeeded");
  } else {
    t.is(
      out.error,
      "AssertionError [ERR_ASSERTION]: expected pipeline function export"
    );
  }
});
