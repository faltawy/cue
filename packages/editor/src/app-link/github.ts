import { AppLinkProvider } from "./provider";

export enum GitHubLinkKind {
  Issue = "issue",
  PullRequest = "pull_request",
  IssueComment = "issue_comment",
  PullRequestReviewComment = "pull_request_review_comment",
  Discussion = "discussion",
  DiscussionComment = "discussion_comment",
  Commit = "commit",
  Release = "release",
  ActionRun = "action_run",
  Workflow = "workflow",
}

export interface GitHubAttrs {
  provider: AppLinkProvider.Github;
  kind: GitHubLinkKind;
  url: string;
  owner: string;
  repo: string;
  number?: number;
  subId?: string;
}

function getKindLabel(attrs: GitHubAttrs): string {
  switch (attrs.kind) {
    case GitHubLinkKind.Issue:
      return `Issue #${attrs.number}`;
    case GitHubLinkKind.PullRequest:
      return `PR #${attrs.number}`;
    case GitHubLinkKind.IssueComment:
      return `Comment on #${attrs.number}`;
    case GitHubLinkKind.PullRequestReviewComment:
      return `Review on #${attrs.number}`;
    case GitHubLinkKind.Discussion:
      return `Discussion #${attrs.number}`;
    case GitHubLinkKind.DiscussionComment:
      return `Comment on Discussion #${attrs.number}`;
    case GitHubLinkKind.Commit:
      return `Commit ${attrs.subId?.slice(0, 7)}`;
    case GitHubLinkKind.Release:
      return `Release ${attrs.subId}`;
    case GitHubLinkKind.ActionRun:
      return `Run ${attrs.subId}`;
    case GitHubLinkKind.Workflow:
      return `Workflow ${attrs.subId}`;
  }
}

export function getGitHubDisplayParts(attrs: GitHubAttrs): {
  header: string;
  subline: string;
} {
  return {
    header: `${attrs.owner}/${attrs.repo}`,
    subline: getKindLabel(attrs),
  };
}
