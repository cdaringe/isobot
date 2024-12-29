import { ExtractWithName, fromDeepPartial } from "../../../utils/typescript.js";
import type { EmitterWebhookEvent as WebhookEvent } from "@octokit/webhooks";

type IssueCommentEvent = ExtractWithName<WebhookEvent, "issue_comment">;

export const issue_comment_created = fromDeepPartial<IssueCommentEvent>({
  id: "test-issue_comment-id",
  name: "issue_comment",
  payload: {
    action: "created",
    issue: {
      number: 1,
      title: "test-title",
      body: "test-body",
    },
    repository: {
      default_branch: "test-default-branch",
      name: "test-repository",
      owner: {
        login: "test-owner-login",
      },
    },
    comment: {
      id: 2,
      body: "test-comment-body",
      user: {
        login: "test-comment-user-login",
      },
    },
  },
});
