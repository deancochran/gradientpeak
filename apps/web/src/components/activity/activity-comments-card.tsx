import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { LoadingButton } from "@repo/ui/components/loading";
import { Textarea } from "@repo/ui/components/textarea";
import { useState } from "react";
import { formatDateTime } from "../../lib/activity-route-helpers";
import { api } from "../../lib/api/client";

export function ActivityCommentsCard({ activityId }: { activityId: string }) {
  const [comment, setComment] = useState("");
  const [failedComment, setFailedComment] = useState<string | null>(null);
  const commentsQuery = api.social.getComments.useInfiniteQuery(
    { entity_id: activityId, entity_type: "activity", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const addComment = api.social.addComment.useMutation({
    onSuccess: async () => {
      setComment("");
      setFailedComment(null);
      await commentsQuery.refetch();
    },
    onError: (_error, variables) => {
      setFailedComment(variables.content);
    },
  });
  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];

  const submit = (value: string) => {
    const content = value.trim();
    if (!content || addComment.isPending) return;
    setFailedComment(null);
    addComment.mutate({ content, entity_id: activityId, entity_type: "activity" });
  };

  return (
    <Card data-testid="activity-comments">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Discuss the activity, ask follow-up questions, or leave coaching notes.
        </p>
        {commentsQuery.isLoading ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Loading comments…
          </p>
        ) : null}
        {commentsQuery.isError ? (
          <div className="space-y-2 rounded-xl border border-destructive/40 p-4" role="alert">
            <p className="text-sm">Comments could not be loaded.</p>
            <Button
              onClick={() => void commentsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try comments again
            </Button>
          </div>
        ) : null}
        {!commentsQuery.isError && !commentsQuery.isLoading && comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No comments yet.
          </div>
        ) : null}
        {!commentsQuery.isError
          ? comments.map((item) => (
              <article className="rounded-xl border border-border bg-muted/20 p-4" key={item.id}>
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {(item.profile?.username ?? "GP").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {item.profile?.username ?? "Unknown athlete"}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                  </div>
                </div>
              </article>
            ))
          : null}
        {commentsQuery.hasNextPage ? (
          <Button
            disabled={commentsQuery.isFetchingNextPage}
            onClick={() => void commentsQuery.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {commentsQuery.isFetchingNextPage ? "Loading comments…" : "Load more comments"}
          </Button>
        ) : null}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="activity-comment">
            Add a comment
          </label>
          <Textarea
            id="activity-comment"
            onChange={(event) => setComment(event.currentTarget.value)}
            rows={4}
            value={comment}
          />
          {failedComment ? (
            <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
              <p className="text-sm text-destructive">
                Comment was not posted. Your text is preserved.
              </p>
              <Button
                disabled={addComment.isPending}
                onClick={() => submit(failedComment)}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry comment
              </Button>
            </div>
          ) : null}
          <div className="flex justify-end">
            <LoadingButton
              disabled={!comment.trim() || addComment.isPending}
              loading={addComment.isPending}
              loadingLabel="Posting…"
              onClick={() => submit(comment)}
              type="button"
            >
              Post comment
            </LoadingButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
