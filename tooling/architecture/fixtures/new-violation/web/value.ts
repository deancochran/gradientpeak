import "../core/value";
import "@repo/core/src/value";

export interface SharedPayload {
  id: string;
}

export const value: SharedPayload = { id: "fixture" };

interface LocalPayload {
  title: string;
}

declare const trpc: {
  groups: { create: { mutate: (input: LocalPayload) => void } };
};

trpc.groups.create.mutate({ title: "fixture" } as LocalPayload);
