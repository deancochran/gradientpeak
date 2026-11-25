import { type ComponentType, createElement, Fragment, type Key, type ReactNode } from "react";

type MockDraggableProps<Item> = {
  data?: Item[];
  keyExtractor: (item: Item, index: number) => Key;
  renderItem: (props: {
    item: Item;
    getIndex: () => number;
    drag: () => void;
    isActive: boolean;
  }) => ReactNode;
  onDragBegin?: (index: number) => void;
  ListHeaderComponent?: ComponentType | ReactNode;
  ListFooterComponent?: ComponentType | ReactNode;
} & Record<string, unknown>;

const renderAccessory = (node: ComponentType | ReactNode) =>
  typeof node === "function" ? createElement(node) : node;

/** Models the list's callback/composition boundary, not native gesture execution. */
export function MockDraggableFlatList<Item>(props: MockDraggableProps<Item>) {
  return createElement(
    "DraggableFlatList",
    props,
    renderAccessory(props.ListHeaderComponent),
    props.data?.map((item, index) =>
      createElement(
        Fragment,
        { key: props.keyExtractor(item, index) },
        props.renderItem({
          item,
          getIndex: () => index,
          drag: () => props.onDragBegin?.(index),
          isActive: false,
        }),
      ),
    ),
    renderAccessory(props.ListFooterComponent),
  );
}
