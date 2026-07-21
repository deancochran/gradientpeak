import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Textarea } from "@repo/ui/components/textarea";
import { useState } from "react";

import { formatDateTime } from "../../lib/activity-route-helpers";
import { api } from "../../lib/api/client";

export function ActivityPlanComments({ planId }: { planId: string }) {
  const [comment, setComment] = useState("");
  const commentsQuery = api.social.getComments.useInfiniteQuery(
    { entity_id: planId, entity_type: "activity_plan", limit: 25 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const addComment = api.social.addComment.useMutation({
    onSuccess: async () => {
      setComment("");
      await commentsQuery.refetch();
    },
  });
  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];

  return (
    <Card data-testid="activity-plan-comments">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {commentsQuery.isError ? (
          <p className="text-sm text-destructive">Comments could not be loaded.</p>
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
            id="activity-plan-comment"
            maxLength={1000}
            onChange={(event) => setComment(event.currentTarget.value)}
            value={comment}
          />
          <Button
            disabled={!comment.trim() || addComment.isPending}
            onClick={() =>
              addComment.mutate({
                content: comment.trim(),
                entity_id: planId,
                entity_type: "activity_plan",
              })
            }
            type="button"
          >
            {addComment.isPending ? "Posting..." : "Post comment"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
