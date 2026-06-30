import React from "react";

type HostProps = Record<string, unknown> & { children?: React.ReactNode };
type ListItem = Record<string, unknown>;

function resolveItemKey(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const record = item as ListItem;
    const key = record.id ?? record.key;

    if (typeof key === "string" || typeof key === "number") {
      return String(key);
    }
  }

  return String(index);
}

const createHost = (type: string) =>
  function MockComponent(props: HostProps) {
    return React.createElement(type, props, props.children);
  };

export const Modal = createHost("Modal");
export const ActivityIndicator = createHost("ActivityIndicator");
export const KeyboardAvoidingView = createHost("KeyboardAvoidingView");
export const FlatList = ({
  data = [],
  ListHeaderComponent,
  renderItem,
  horizontal,
  ...props
}: HostProps & {
  data?: unknown[];
  horizontal?: boolean;
  ListHeaderComponent?: React.ReactNode;
  renderItem?: (input: { item: unknown; index: number }) => React.ReactNode;
}) =>
  React.createElement(
    "FlatList",
    props,
    React.createElement(
      React.Fragment,
      null,
      ListHeaderComponent ?? null,
      data
        .slice(horizontal ? 0 : undefined)
        .map((item: unknown, index: number) =>
          React.createElement(
            React.Fragment,
            { key: resolveItemKey(item, index) },
            renderItem?.({ item, index }) ?? null,
          ),
        ),
    ),
  );
export const Pressable = createHost("Pressable");
export const RefreshControl = createHost("RefreshControl");
export const ScrollView = createHost("ScrollView");
type SectionListSection = ListItem & {
  data?: unknown[];
  dateKey?: string;
  title?: string;
};

export const SectionList = (
  props: HostProps & {
    sections?: SectionListSection[];
    ListHeaderComponent?: React.ReactNode;
    renderSectionHeader?: (input: { section: SectionListSection }) => React.ReactNode;
    renderItem?: (input: {
      item: unknown;
      section: SectionListSection;
      index: number;
    }) => React.ReactNode;
  },
) => {
  const sections = props.sections ?? [];

  return React.createElement(
    "SectionList",
    props,
    React.createElement(
      React.Fragment,
      null,
      props.ListHeaderComponent ?? null,
      sections.map((section) =>
        React.createElement(
          React.Fragment,
          { key: section.dateKey || section.title },
          props.renderSectionHeader?.({ section }) ?? null,
          (section.data || []).map((item, itemIndex) =>
            React.createElement(
              React.Fragment,
              { key: resolveItemKey(item, itemIndex) ?? `${section.dateKey}-${itemIndex}` },
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

export const Appearance = {
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  getColorScheme: jest.fn(() => "light"),
  setColorScheme: jest.fn(),
};

export const Alert = {
  alert: jest.fn(),
};

export const InteractionManager = {
  runAfterInteractions: jest.fn((callback: () => void) => {
    callback();
    return { cancel: jest.fn() };
  }),
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
