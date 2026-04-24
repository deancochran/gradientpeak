import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { Send } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";

interface EntityCommentsSectionProps {
  addCommentPending: boolean;
  commentCount: number;
  comments: Array<{
    id: string;
    content: string;
    created_at: string;
    profile?: { id?: string | null; username?: string | null; avatar_url?: string | null } | null;
  }>;
  helperText?: string;
  hasMoreComments?: boolean;
  isLoadingMoreComments?: boolean;
  newComment: string;
  onAddComment: () => void;
  onChangeNewComment: (value: string) => void;
  onLoadMoreComments?: () => void;
  testIDPrefix: string;
}

export function EntityCommentsSection({
  addCommentPending,
  commentCount,
  comments,
  helperText,
  hasMoreComments = false,
  isLoadingMoreComments = false,
  newComment,
  onAddComment,
  onChangeNewComment,
  onLoadMoreComments,
  testIDPrefix,
}: EntityCommentsSectionProps) {
  return (
    <View className="rounded-3xl border border-border bg-card p-4 gap-4">
      <View>
        <Text className="mb-1 font-semibold text-foreground">Comments ({commentCount})</Text>
        {helperText ? <Text className="text-sm text-muted-foreground">{helperText}</Text> : null}
      </View>
      <View className="flex-row items-center gap-2">
        <Textarea
          className="min-h-11 flex-1"
          placeholder="Add a comment..."
          value={newComment}
          onChangeText={onChangeNewComment}
        />
        <Button
          onPress={onAddComment}
          disabled={!newComment.trim() || addCommentPending}
          size="icon"
          testID={`${testIDPrefix}-add-comment-button`}
        >
          <Icon as={Send} size={18} className="text-primary-foreground" />
        </Button>
      </View>
      {comments.length > 0 ? (
        <View className="gap-3 border-t border-border pt-4">
          {comments.map((comment) => (
            <View
              key={comment.id}
              className="rounded-2xl border border-border/60 bg-background p-3"
            >
              <View className="mb-2">
                <EntityOwnerRow
                  owner={comment.profile}
                  subtitle={new Date(comment.created_at).toLocaleDateString()}
                  testID={`${testIDPrefix}-comment-owner-${comment.id}`}
                />
              </View>
              <View className="pl-[52px]">
                <Text className="text-xs text-muted-foreground">Comment</Text>
                <Text className="text-sm text-foreground">{comment.content}</Text>
              </View>
            </View>
          ))}
          {hasMoreComments ? (
            <View className="pl-[52px] pt-1">
              <Button
                variant="outline"
                onPress={onLoadMoreComments}
                disabled={isLoadingMoreComments}
                testID={`${testIDPrefix}-load-more-comments-button`}
              >
                <Text>{isLoadingMoreComments ? "Loading comments..." : "Load more comments"}</Text>
              </Button>
            </View>
          ) : null}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">No comments yet.</Text>
      )}
    </View>
  );
}
