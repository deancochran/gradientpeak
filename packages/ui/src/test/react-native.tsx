import React from "react";

const createHost = (type: string) =>
  function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };

export const Modal = createHost("Modal");
export const Pressable = createHost("Pressable");
export const ScrollView = createHost("ScrollView");
export const Text = createHost("Text");
export const TextInput = createHost("TextInput");
export const View = createHost("View");

export const Platform = {
  OS: "ios",
  select: (values: Record<string, unknown>) =>
    values.ios ?? values.native ?? values.default ?? values.web,
};

export const StyleSheet = {
  flatten: (style: unknown) => style,
};
