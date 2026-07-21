import { Text } from "@repo/ui/components/text";
import { FlatList, Pressable } from "react-native";
import { fireEvent, renderNative } from "../../../test/render-native";
import { DefaultErrorState, getResourceListMode, ResourceList } from "../ResourceList";

describe("ResourceList", () => {
  it("shows an initial error with retry instead of an empty state", () => {
    const onRetry = jest.fn();
    const { getByText } = renderNative(
      <DefaultErrorState
        description="Network unavailable"
        onRetry={onRetry}
        title="Unable to load routes"
      />,
    );

    expect(getByText("Unable to load routes")).toBeTruthy();
    fireEvent.press(getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps stale data visible with refresh failure copy and retry", () => {
    const onRetry = jest.fn();
    const { getByText } = renderNative(
      <ResourceList
        data={[{ id: "route-1", name: "River loop" }]}
        errorDescription="Refresh failed"
        isError
        keyExtractor={(item) => item.id}
        onRetry={onRetry}
        renderItem={(item) => (
          <Pressable>
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />,
    );

    expect(getResourceListMode({ dataLength: 1, isError: true, isLoading: false })).toBe("data");
    expect(getByText("River loop")).toBeTruthy();
    expect(getByText("Refresh failed")).toBeTruthy();
    fireEvent.press(getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("honors query-owned retry state", () => {
    const onRetry = jest.fn();
    const { UNSAFE_getByType } = renderNative(<DefaultErrorState isRetrying onRetry={onRetry} />);

    const retryButton = UNSAFE_getByType(Pressable);
    expect(retryButton.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    fireEvent.press(retryButton);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("distinguishes active-query emptiness from a globally empty library", () => {
    const rendered = renderNative(
      <ResourceList
        data={[]}
        emptyDescription="Saved routes will appear here."
        emptyTitle="No routes yet"
        isEmptyFiltered
        keyExtractor={(item: { id: string }) => item.id}
        renderItem={() => null}
      />,
    );

    const list = rendered.UNSAFE_getByType(FlatList);
    expect(list.props.ListEmptyComponent.props.title).toBe("No matching results");
    expect(list.props.ListEmptyComponent.props.description).toBe(
      "Try adjusting your search or filters.",
    );
  });
});
