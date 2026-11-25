import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";

type PermissionOption = {
  coach: { membershipId: string; name: string };
  currentGrant: { id: string } | null;
  organization: { id: string; name: string };
};

function hasNotFoundCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const data = error.data;
  return typeof data === "object" && data !== null && "code" in data && data.code === "NOT_FOUND";
}

function failureMessage(error: unknown) {
  return hasNotFoundCode(error)
    ? "The permission changed elsewhere. Reloading its current status."
    : "We could not update this permission. Check your connection and try again.";
}

/**
 * Athlete-owned publication permission. It intentionally does not represent
 * general coaching edit or read access.
 */
export function CoachingPublicationPermissions() {
  const actorId = useAuthStore((state) => state.user?.id ?? null);
  const utils = api.useUtils();
  const mounted = useRef(true);
  const pendingMembershipIdRef = useRef<string | null>(null);
  const owner = useRef({ actorId, generation: 0 });
  if (owner.current.actorId !== actorId) {
    owner.current = { actorId, generation: owner.current.generation + 1 };
    pendingMembershipIdRef.current = null;
  }
  const ownerKey = `${actorId ?? "anonymous"}:${owner.current.generation}`;
  const isCurrentOwner = () =>
    mounted.current &&
    owner.current.actorId === actorId &&
    ownerKey === `${actorId ?? "anonymous"}:${owner.current.generation}`;
  const [_pendingMembershipId, setPendingMembershipId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const optionsQuery = useQuery({
    enabled: actorId !== null,
    queryFn: ({ signal }) =>
      utils.client.coachingPublication.permissionOptions.query(undefined, { signal }),
    queryKey: ["coaching-publication-permission-options", actorId, owner.current.generation],
    refetchOnMount: "always",
    retry: false,
  });

  async function refreshCurrentStatus() {
    const refreshed = await optionsQuery.refetch();
    if (refreshed.error || !refreshed.data) return false;
    return true;
  }

  async function setPermission(option: PermissionOption, enabled: boolean) {
    if (
      pendingMembershipIdRef.current !== null ||
      !actorId ||
      !isCurrentOwner() ||
      useAuthStore.getState().user?.id !== actorId
    ) {
      return;
    }

    const requestOwnerKey = ownerKey;
    pendingMembershipIdRef.current = option.coach.membershipId;
    setPendingMembershipId(option.coach.membershipId);
    setError(null);
    setNotice(null);
    let mutationSucceeded = false;
    let mutationError: unknown = null;

    try {
      // Check again immediately before dispatch because the client auth headers are dynamic.
      if (
        !isCurrentOwner() ||
        requestOwnerKey !== ownerKey ||
        useAuthStore.getState().user?.id !== actorId
      ) {
        return;
      }
      if (enabled) {
        await utils.client.coachingPublication.grant.mutate({
          coachMembershipId: option.coach.membershipId,
          organizationId: option.organization.id,
        });
      } else if (option.currentGrant) {
        await utils.client.coachingPublication.revoke.mutate({ grantId: option.currentGrant.id });
      }
      mutationSucceeded = true;
    } catch (caught) {
      mutationError = caught;
    } finally {
      if (isCurrentOwner() && requestOwnerKey === ownerKey) {
        try {
          const refreshed = await refreshCurrentStatus();
          if (isCurrentOwner() && requestOwnerKey === ownerKey && !refreshed) {
            if (mutationSucceeded) {
              setNotice(
                "Saved, but the current status is unavailable. Retry only reloads the status.",
              );
            } else {
              setError(
                "The update may have been saved, but its current status is unavailable. Retry only reloads the status.",
              );
            }
          } else if (isCurrentOwner() && requestOwnerKey === ownerKey && mutationSucceeded) {
            setNotice("Current permission status updated.");
          } else if (isCurrentOwner() && requestOwnerKey === ownerKey) {
            setError(failureMessage(mutationError));
          }
        } catch {
          if (isCurrentOwner() && requestOwnerKey === ownerKey) {
            setError(
              "The current permission status is unavailable. Retry only reloads the status.",
            );
          }
        } finally {
          if (isCurrentOwner() && requestOwnerKey === ownerKey) {
            pendingMembershipIdRef.current = null;
            setPendingMembershipId(null);
          }
        }
      }
    }
  }

  const unavailable =
    !actorId || optionsQuery.isLoading || optionsQuery.isFetching || optionsQuery.isError;
  const options = optionsQuery.data?.options ?? [];

  return (
    <View className="flex-1 bg-background" testID="coaching-publication-permissions">
      <ScrollView contentContainerClassName="gap-5 p-6 pb-10">
        <View className="gap-2">
          <Text className="text-xl font-semibold text-foreground">Coaching permissions</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Allow an assigned coach to add a copy of their activity plan to your schedule. This
            permission does not grant general plan editing or read-only coaching access. Other
            permissions are separate.
          </Text>
        </View>

        {optionsQuery.isLoading || optionsQuery.isFetching ? (
          <View
            accessibilityLabel="Loading assigned coaches"
            className="flex-row items-center gap-2"
          >
            <ActivityIndicator />
            <Text className="text-sm text-muted-foreground">Loading assigned coaches…</Text>
          </View>
        ) : null}
        {optionsQuery.isError ? (
          <View accessibilityRole="alert" className="gap-3">
            <Text className="text-sm text-destructive">
              Coaching permissions are currently unavailable.
            </Text>
            <Pressable
              accessibilityLabel="Retry loading coaching permissions"
              accessibilityRole="button"
              className="min-h-11 justify-center self-start rounded-lg border border-border px-3"
              onPress={() => void refreshCurrentStatus()}
              testID="coaching-permissions-retry"
            >
              <Text className="text-sm font-medium text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {!unavailable && options.length === 0 ? (
          <Text className="text-sm leading-5 text-muted-foreground">
            You do not have any currently assigned coaches who can receive this permission.
          </Text>
        ) : null}
        {!unavailable
          ? options.map((option) => {
              const enabled = option.currentGrant !== null;
              const pending = pendingMembershipIdRef.current !== null;
              return (
                <View
                  className="min-h-11 flex-row items-center justify-between gap-4 border-b border-border py-3"
                  key={option.coach.membershipId}
                >
                  <View className="flex-1 gap-1">
                    <Text className="text-sm font-medium text-foreground">
                      Allow {option.coach.name} to publish activity plans
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {option.organization.name}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={`Allow ${option.coach.name} at ${option.organization.name} to publish activity plans`}
                    checked={enabled}
                    disabled={pending}
                    onCheckedChange={(next) => void setPermission(option, next)}
                    testId={`coaching-permission-${option.coach.membershipId}`}
                  />
                </View>
              );
            })
          : null}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            className="text-sm text-destructive"
          >
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            {notice}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
