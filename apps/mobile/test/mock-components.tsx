import React from "react";

export function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

export function createModalHost(type: string) {
  return function MockModal(props: any) {
    if (!props.visible) {
      return null;
    }

    return React.createElement(type, props, props.children);
  };
}

export function createFlatListHost(type = "FlatList") {
  return function MockFlatList(props: any) {
    const {
      data = [],
      renderItem,
      ListEmptyComponent,
      ListHeaderComponent,
      ListFooterComponent,
      keyExtractor,
      ...rest
    } = props;

    const items = data.length
      ? data.map((item: any, index: number) => {
          const key = keyExtractor ? keyExtractor(item, index) : `${index}`;
          return React.createElement(React.Fragment, { key }, renderItem({ item, index }));
        })
      : null;

    return React.createElement(
      type,
      rest,
      ListHeaderComponent,
      items,
      !data.length ? ListEmptyComponent : null,
      ListFooterComponent,
    );
  };
}

export function getTextContent(children: any): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children
      .map((child) => getTextContent(child))
      .join(" ")
      .trim();
  }

  if (children?.props?.children !== undefined) {
    return getTextContent(children.props.children);
  }

  return "";
}

export function buttonTestId(label: string): string {
  return `button-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function createButtonComponent() {
  return function MockButton({ children, onPress, ...props }: any) {
    return React.createElement(
      "Pressable",
      {
        onPress,
        testID: props.testID ?? props.testId ?? buttonTestId(getTextContent(children)),
        ...props,
      },
      children,
    );
  };
}
