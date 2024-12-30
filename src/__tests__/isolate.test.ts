import anyTest, { TestFn } from "ava";
import { runInIsolateInfallible } from "../isolate.js";
import * as eventsFixture from "./fixtures/events.js";
import { getLogger } from "./fixtures/probot.js";
import { Code } from "../code.js";
import * as exampleOnCommentApproveMergeMeta from "../examples/on-comment-approve-merge.js";

const test = anyTest as TestFn<{}>;

test.before(() => {});

test.beforeEach((t) => {});

test.afterEach.always(() => {
  // nock.cleanAll();
});

test("runs isolate yields pipeline event - updated context", async (t) => {
  const logger = getLogger();
  const out = await runInIsolateInfallible({
    script: await Code.fromFilename(exampleOnCommentApproveMergeMeta.filename),
    pipelineEvent: eventsFixture.asPipelineEvent(
      eventsFixture.issue_comment_created
    ),
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
    script: Code.from(`module.exports.pipelinezzzz  = stream => stream`),
    pipelineEvent: eventsFixture.asPipelineEvent(
      eventsFixture.issue_comment_created
    ),
    logger,
  });
  if (out.isOk()) {
    t.fail("invalid pipeline should not have succeeded");
  } else {
    t.is(
      out.error,
      "pipeline run failed: AssertionError [ERR_ASSERTION]: expected pipeline function export"
    );
  }
});
