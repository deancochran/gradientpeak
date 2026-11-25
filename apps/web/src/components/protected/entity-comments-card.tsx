import type { SocialCommentEntityType } from "@repo/core";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { LoadingButton } from "@repo/ui/components/loading";
import { Textarea } from "@repo/ui/components/textarea";
import { useState } from "react";
import { formatDateTime } from "../../lib/activity-route-helpers";
import { api } from "../../lib/api/client";

type EntityCommentsCardProps = {
  entityId: string | null | undefined;
  entityType: Extract<SocialCommentEntityType, "activity" | "route">;
  helperText: string;
  testId: string;
};

function isUuid(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function EntityCommentsCard({
  entityId,
  entityType,
  helperText,
  testId,
}: EntityCommentsCardProps) {
  const [newComment, setNewComment] = useState("");
  const [failedComment, setFailedComment] = useState<{
    commentId: string;
    content: string;
  } | null>(null);
  const enabled = isUuid(entityId);
  const commentsQuery = api.social.getComments.useInfiniteQuery(
    {
      entity_id: entityId ?? "00000000-0000-0000-0000-000000000000",
      entity_type: entityType,
      limit: 25,
    },
    {
      enabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const addCommentMutation = api.social.addComment.useMutation({
    retry: false,
    onSuccess: async () => {
      setNewComment("");
      setFailedComment(null);
      await commentsQuery.refetch();
    },
    onError: (_error, variables) => {
      setFailedComment({
        commentId: variables.comment_id ?? crypto.randomUUID(),
        content: variables.content,
      });
    },
  });
  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];
  const total = commentsQuery.data?.pages[0]?.total ?? 0;
  const submitComment = (value: string, commentId: string = crypto.randomUUID()) => {
    const content = value.trim();
    if (!enabled || !entityId || !content || addCommentMutation.isPending) return;
    setFailedComment(null);
    addCommentMutation.mutate({
      comment_id: commentId,
      content,
      entity_id: entityId,
      entity_type: entityType,
    });
  };

  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{helperText}</p>
        <div className="space-y-3">
          {comments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No comments yet.
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {(comment.profile?.username ?? "GP").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {comment.profile?.username ?? "Unknown athlete"}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDateTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {commentsQuery.hasNextPage ? (
          <Button
            disabled={commentsQuery.isFetchingNextPage}
            onClick={() => void commentsQuery.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {commentsQuery.isFetchingNextPage
              ? "Loading comments..."
              : `Load more comments (${total})`}
          </Button>
        ) : null}
        <div className="space-y-2">
          <Textarea
            accessibilityLabel="Add a comment"
            disabled={addCommentMutation.isPending}
            onChange={(event) => {
              const nextComment = event.currentTarget.value;
              setNewComment(nextComment);
              if (failedComment && nextComment.trim() !== failedComment.content) {
                setFailedComment(null);
              }
            }}
            placeholder="Add a comment"
            rows={4}
            testId={`${testId}-input`}
            value={newComment}
          />
          {failedComment ? (
            <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
              <p className="text-sm text-destructive">
                Comment was not posted. Your text is preserved.
              </p>
              <Button
                disabled={addCommentMutation.isPending}
                onClick={() => submitComment(failedComment.content, failedComment.commentId)}
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
              disabled={!enabled || !newComment.trim() || addCommentMutation.isPending}
              loading={addCommentMutation.isPending}
              loadingLabel="Posting..."
              onClick={() =>
                failedComment
                  ? submitComment(failedComment.content, failedComment.commentId)
                  : submitComment(newComment)
              }
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
