import React from "react";

const createHost = (type: string) =>
  function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };

export const Modal = createHost("Modal");
export const ActivityIndicator = createHost("ActivityIndicator");
export const KeyboardAvoidingView = createHost("KeyboardAvoidingView");
export const Pressable = createHost("Pressable");
export const RefreshControl = createHost("RefreshControl");
export const ScrollView = createHost("ScrollView");
export const SectionList = (props: any) => {
  const sections = props.sections ?? [];

  return React.createElement(
    "SectionList",
    props,
    React.createElement(
      React.Fragment,
      null,
      props.ListHeaderComponent ?? null,
      sections.map((section: any) =>
        React.createElement(
          React.Fragment,
          { key: section.dateKey || section.title },
          props.renderSectionHeader?.({ section }) ?? null,
          (section.data || []).map((item: any, itemIndex: number) =>
            React.createElement(
              React.Fragment,
              { key: item.key ?? `${section.dateKey}-${itemIndex}` },
              props.renderItem?.({ item, section, index: itemIndex }) ?? null,
            ),
          ),
        ),
      ),
    ),
  );
};
export const Text = createHost("Text");
export const TextInput = createHost("TextInput");
export const TouchableOpacity = createHost("TouchableOpacity");
export const View = createHost("View");

export const useColorScheme = () => "light";
export const useWindowDimensions = () => ({ width: 390, height: 844 });

export const Alert = {
  alert: jest.fn(),
};

export const Platform = {
  OS: "ios",
  select: (values: Record<string, unknown>) =>
    values.ios ?? values.native ?? values.default ?? values.web,
};

export const StyleSheet = {
  absoluteFill: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  flatten: (style: unknown) => style,
};
