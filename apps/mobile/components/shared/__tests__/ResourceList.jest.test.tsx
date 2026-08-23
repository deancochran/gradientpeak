import { Text } from "@repo/ui/components/text";
import { Pressable } from "react-native";
import { fireEvent, renderNative } from "../../../test/render-native";
import { DefaultErrorState, getResourceListMode, ResourceList } from "../ResourceList";

describe("ResourceList", () => {
  it("shows an initial error with retry instead of an empty state", async () => {
    const onRetry = jest.fn();
    const { getByText } = await renderNative(
      <DefaultErrorState
        description="Network unavailable"
        onRetry={onRetry}
        title="Unable to load routes"
      />,
    );

    expect(getByText("Unable to load routes")).toBeTruthy();
    await fireEvent.press(getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps stale data visible with refresh failure copy and retry", async () => {
    const onRetry = jest.fn();
    const { getByText } = await renderNative(
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
    await fireEvent.press(getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("honors query-owned retry state", async () => {
    const onRetry = jest.fn();
    const { container, getByText } = await renderNative(
      <DefaultErrorState isRetrying onRetry={onRetry} />,
    );

    const retryButton = container.queryAll((node) => node.type === "Pressable")[0];
    if (!retryButton) throw new Error("Expected retry button");
    expect(getByText("Retrying")).toBeTruthy();
    expect(retryButton.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(retryButton);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("distinguishes active-query emptiness from a globally empty library", async () => {
    const rendered = await renderNative(
      <ResourceList
        data={[]}
        emptyDescription="Saved routes will appear here."
        emptyTitle="No routes yet"
        isEmptyFiltered
        keyExtractor={(item: { id: string }) => item.id}
        renderItem={() => null}
      />,
    );

    const list = rendered.container.queryAll((node) => node.type === "FlatList")[0];
    if (!list) throw new Error("Expected a FlatList");
    expect(list.props.ListEmptyComponent.props.title).toBe("No matching results");
    expect(list.props.ListEmptyComponent.props.description).toBe(
      "Try adjusting your search or filters.",
    );
  });
});
