import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useRef, useState } from "react";

import { formatDateTime } from "../../lib/activity-route-helpers";
import { api } from "../../lib/api/client";

export function ActivityPlanComments({ planId }: { planId: string }) {
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const contextRef = useRef(planId);
  contextRef.current = planId;
  const failedRequest = useRef<{ content: string; comment_id: string } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A different plan owns a different comment draft.
  useEffect(() => {
    setComment("");
    setError(null);
    failedRequest.current = null;
  }, [planId]);
  const commentsQuery = api.social.getComments.useInfiniteQuery(
    { entity_id: planId, entity_type: "activity_plan", limit: 25 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const addComment = api.social.addComment.useMutation({ retry: false });
  const post = async () => {
    const content = comment.trim();
    if (!content || pendingRef.current) return;
    const request =
      failedRequest.current?.content === content
        ? failedRequest.current
        : { content, comment_id: crypto.randomUUID() };
    failedRequest.current = request;
    pendingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      await addComment.mutateAsync({ ...request, entity_id: planId, entity_type: "activity_plan" });
      if (contextRef.current !== planId) return;
      failedRequest.current = null;
      setComment((current) => (current.trim() === content ? "" : current));
      try {
        await commentsQuery.refetch();
      } catch {
        if (contextRef.current === planId)
          setError("Comment posted, but comments could not be refreshed. Retry loading comments.");
      }
    } catch {
      if (contextRef.current === planId)
        setError("Comment could not be confirmed. Your text is kept; retry when ready.");
    } finally {
      pendingRef.current = false;
      setPosting(false);
    }
  };
  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];

  return (
    <Card data-testid="activity-plan-comments">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {commentsQuery.isLoading ? (
          <p role="status">Loading comments...</p>
        ) : commentsQuery.isError ? (
          <div role="alert">
            <p className="text-sm text-destructive">Comments could not be loaded.</p>
            <Button type="button" variant="outline" onClick={() => void commentsQuery.refetch()}>
              Retry comments
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No comments yet.
          </p>
        ) : (
          comments.map((item) => (
            <div className="flex gap-3 rounded-lg border p-3" key={item.id}>
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {(item.profile?.username ?? "GP").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item.profile?.username ?? "Unknown athlete"}{" "}
                  <span className="font-normal text-muted-foreground">
                    {formatDateTime(item.created_at)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p>
              </div>
            </div>
          ))
        )}
        {commentsQuery.hasNextPage ? (
          <Button
            disabled={commentsQuery.isFetchingNextPage}
            onClick={() => void commentsQuery.fetchNextPage()}
            type="button"
            variant="outline"
          >
            Load more comments
          </Button>
        ) : null}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="activity-plan-comment">
            Add a comment
          </label>
          <Textarea
            disabled={posting || addComment.isPending}
            aria-describedby={error ? "activity-plan-comment-error" : undefined}
            id="activity-plan-comment"
            maxLength={1000}
            onChange={(event) => {
              if (pendingRef.current) return;
              setComment(event.currentTarget.value);
              setError(null);
            }}
            value={comment}
          />
          <Button
            disabled={!comment.trim() || posting || addComment.isPending}
            onClick={() => void post()}
            type="button"
          >
            {posting || addComment.isPending ? "Posting..." : "Post comment"}
          </Button>
          {error ? (
            <p role="alert" id="activity-plan-comment-error">
              {error}
              <Button type="button" variant="outline" onClick={() => void commentsQuery.refetch()}>
                Reload comments
              </Button>
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
