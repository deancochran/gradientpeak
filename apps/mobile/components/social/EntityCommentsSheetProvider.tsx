import type { SocialCommentEntityType } from "@repo/core";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { APP_BOTTOM_SHEET_PRESENTATIONS, AppBottomSheet } from "@/components/shared/AppBottomSheet";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { EntityCommentsSection } from "./EntityCommentsSection";

type EntityCommentsTarget = {
  entityId: string;
  entityType: SocialCommentEntityType;
};

type EntityCommentsSheetContextValue = {
  openEntityComments: (target: EntityCommentsTarget) => void;
};

const EntityCommentsSheetContext = createContext<EntityCommentsSheetContextValue | null>(null);

export function useEntityCommentsSheet() {
  return useContext(EntityCommentsSheetContext);
}

export function EntityCommentsSheetProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<EntityCommentsTarget | null>(null);
  const closeEntityComments = useCallback(() => setTarget(null), []);
  const openEntityComments = useCallback((nextTarget: EntityCommentsTarget) => {
    if (nextTarget.entityId.trim()) {
      setTarget(nextTarget);
    }
  }, []);
  const value = useMemo(() => ({ openEntityComments }), [openEntityComments]);

  return (
    <EntityCommentsSheetContext.Provider value={value}>
      {children}
      {target ? <EntityCommentsSheet target={target} onClose={closeEntityComments} /> : null}
    </EntityCommentsSheetContext.Provider>
  );
}

function EntityCommentsSheet({
  target,
  onClose,
}: {
  target: EntityCommentsTarget;
  onClose: () => void;
}) {
  const comments = useEntityCommentsController({
    entityId: target.entityId,
    entityType: target.entityType,
  });
  const testIDPrefix = target.entityType.replaceAll("_", "-");

  return (
    <AppBottomSheet
      contentKey={`${target.entityType}-${target.entityId}`}
      initialSnapIndex={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.initialSnapIndex}
      onClose={onClose}
      showCloseAction
      snapPoints={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.snapPoints}
      testID="entity-comments-sheet"
      title={`Comments (${comments.commentCount})`}
      visible
    >
      <EntityCommentsSection
        addCommentPending={comments.addCommentPending}
        commentCount={comments.commentCount}
        comments={comments.comments}
        commentsError={comments.commentsError}
        hasMoreComments={comments.hasMoreComments}
        isLoadingComments={comments.isLoadingComments}
        isLoadingMoreComments={comments.isLoadingMoreComments}
        newComment={comments.newComment}
        onAddComment={comments.handleAddComment}
        onChangeNewComment={comments.setNewComment}
        onLoadMoreComments={comments.loadMoreComments}
        testIDPrefix={testIDPrefix}
      />
    </AppBottomSheet>
  );
}
