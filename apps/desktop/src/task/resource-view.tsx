import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { commands as openerCommands } from "@anlg/plugin-opener2";
import { commands as todoCommands } from "@anlg/plugin-todo";
import {
  ArrowSquareOut,
  Chat,
  GitMerge,
  GitPullRequest,
  RadioButton,
  XCircle,
} from "@anlg/ui/components/icons";
import { streamdownIcons } from "@anlg/ui/components/streamdown-icons";
import { cn } from "@anlg/utils";

import { streamdownComponents } from "~/session/components/streamdown";
import { type TaskResource } from "~/store/zustand/tabs";

const rehypePlugins = [defaultRehypePlugins.raw, defaultRehypePlugins.sanitize];

export function ResourceView({ resource }: { resource: TaskResource }) {
  const { t } = useLingui();
  const {
    data: issue,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "github-issue-detail",
      resource.owner,
      resource.repo,
      resource.number,
    ],
    queryFn: async () => {
      const result = await todoCommands.githubIssueDetail(
        resource.owner,
        resource.repo,
        resource.number,
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 60_000,
  });

  const { data: comments } = useQuery({
    queryKey: [
      "github-issue-comments",
      resource.owner,
      resource.repo,
      resource.number,
    ],
    queryFn: async () => {
      const result = await todoCommands.githubIssueComments(
        resource.owner,
        resource.repo,
        resource.number,
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 60_000,
    enabled: !!issue,
  });

  const isPR = resource.type === "github_pr" || issue?.pull_request != null;
  const urlPath = isPR ? "pull" : "issues";
  const url = `https://github.com/${resource.owner}/${resource.repo}/${urlPath}/${resource.number}`;
  const isMerged = issue?.pull_request?.merged_at != null;
  const isClosed = issue?.state === "closed";

  return (
    <div className="w-full max-w-3xl px-6 py-6">
      {isLoading ? (
        <div className="text-muted-foreground flex items-center justify-center py-12">
          <Trans>Loading...</Trans>
        </div>
      ) : null}
      {error ? (
        <div className="text-muted-foreground flex items-center justify-center py-12">
          {isPR ? (
            <Trans>Failed to load pull request</Trans>
          ) : (
            <Trans>Failed to load issue</Trans>
          )}
        </div>
      ) : null}
      {issue ? (
        <>
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-foreground text-page-title">
                {issue.title}
                <span className="text-muted-foreground ms-2 font-normal">
                  #{issue.number}
                </span>
              </h1>
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-100"
                onClick={() => openerCommands.openUrl(url, null)}
                title={t`Open on GitHub`}
              >
                <ArrowSquareOut className="size-3.5" />
              </button>
            </div>
            <div className="text-muted-foreground text-ui mt-1 flex items-center gap-2">
              <StateBadge isPR={isPR} isMerged={isMerged} isClosed={isClosed} />
              <span>
                <Trans>{issue.user?.login} opened on</Trans>{" "}
                {new Date(issue.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {issue.comments != null && issue.comments > 0 ? (
                <span className="tabular-nums">
                  ·{" "}
                  <Plural
                    value={issue.comments}
                    one="# comment"
                    other="# comments"
                  />
                </span>
              ) : null}
            </div>
          </div>

          {issue.labels && issue.labels.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {issue.labels.map((label) => (
                <span
                  key={label.id}
                  className="border-border text-muted-foreground text-label inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-medium"
                >
                  {label.color ? (
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: `#${label.color}` }}
                    />
                  ) : null}
                  {label.name}
                </span>
              ))}
            </div>
          ) : null}

          {issue.assignees && issue.assignees.length > 0 ? (
            <div className="text-muted-foreground text-ui mb-4 flex items-center gap-2">
              <span className="font-medium">
                <Trans>Assignees:</Trans>
              </span>
              {issue.assignees.map((assignee) => (
                <span key={assignee.id} className="flex items-center gap-1">
                  {assignee.avatar_url ? (
                    <img
                      src={assignee.avatar_url}
                      alt={assignee.login}
                      className="size-5 rounded-full"
                    />
                  ) : null}
                  {assignee.login}
                </span>
              ))}
            </div>
          ) : null}

          {issue.body ? (
            <div className="border-border border-t pt-4">
              <Streamdown
                icons={streamdownIcons}
                className="note-typography text-muted-foreground mt-1 [--note-editor-font-size:0.875rem]"
                components={streamdownComponents}
                isAnimating={false}
                rehypePlugins={rehypePlugins}
              >
                {issue.body}
              </Streamdown>
            </div>
          ) : (
            <div className="border-border text-muted-foreground text-body border-t pt-4 italic">
              <Trans>No description provided.</Trans>
            </div>
          )}

          {comments && comments.length > 0 ? (
            <div className="border-border mt-6 border-t pt-4">
              <div className="text-muted-foreground text-body mb-4 flex items-center gap-2 font-medium">
                <Chat className="size-4" />
                <span className="tabular-nums">
                  <Plural
                    value={comments.length}
                    one="# comment"
                    other="# comments"
                  />
                </span>
              </div>
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="border-border bg-muted/50 rounded-lg border"
                  >
                    <div className="border-border text-body flex items-center gap-2 border-b px-4 py-2.5">
                      {comment.user?.avatar_url ? (
                        <img
                          src={comment.user.avatar_url}
                          alt={comment.user.login}
                          className="size-5 rounded-full"
                        />
                      ) : null}
                      <span className="text-muted-foreground font-medium">
                        {comment.user?.login}
                      </span>
                      <span className="text-muted-foreground">
                        <Trans>commented on</Trans>{" "}
                        {new Date(comment.created_at).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      {comment.body ? (
                        <Streamdown
                          icons={streamdownIcons}
                          className="note-typography text-muted-foreground mt-1 [--note-editor-font-size:0.875rem]"
                          components={streamdownComponents}
                          isAnimating={false}
                          rehypePlugins={rehypePlugins}
                        >
                          {comment.body}
                        </Streamdown>
                      ) : (
                        <span className="text-muted-foreground text-body italic">
                          <Trans>No content.</Trans>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StateBadge({
  isPR,
  isMerged,
  isClosed,
}: {
  isPR: boolean;
  isMerged: boolean;
  isClosed: boolean;
}) {
  const { t } = useLingui();
  let label: string;
  let colorClass: string;
  let Icon: typeof RadioButton;

  if (isPR && isMerged) {
    label = t`Merged`;
    colorClass = "text-(--speaker-4)";
    Icon = GitMerge;
  } else if (isClosed) {
    label = t`Closed`;
    colorClass = isPR ? "text-destructive" : "text-muted-foreground";
    Icon = XCircle;
  } else {
    label = t`Open`;
    colorClass = "text-success";
    Icon = isPR ? GitPullRequest : RadioButton;
  }

  return (
    <span className="border-border text-foreground text-label inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-medium">
      <Icon className={cn(["size-3", colorClass])} />
      {label}
    </span>
  );
}
