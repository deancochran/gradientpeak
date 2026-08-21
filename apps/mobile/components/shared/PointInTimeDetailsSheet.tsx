import { Portal } from "@rn-primitives/portal";
import type { ReactNode } from "react";
import { AppBottomSheet } from "./AppBottomSheet";

type PointInTimeDetailsSheetProps = {
  children: ReactNode;
  contentKey?: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  portalName: string;
  testID: string;
  title: string;
  visible: boolean;
};

export function PointInTimeDetailsSheet({
  children,
  contentKey,
  description,
  footer,
  onClose,
  portalName,
  testID,
  title,
  visible,
}: PointInTimeDetailsSheetProps) {
  return (
    <Portal name={portalName}>
      <AppBottomSheet
        {...(contentKey === undefined ? {} : { contentKey })}
        {...(description === undefined ? {} : { description })}
        {...(footer === undefined ? {} : { footer })}
        contentPanningGestureEnabled={false}
        initialSnapIndex={1}
        onClose={onClose}
        showCloseAction
        snapPoints={["88%", "96%"]}
        testID={testID}
        title={title}
        visible={visible}
      >
        {children}
      </AppBottomSheet>
    </Portal>
  );
}
