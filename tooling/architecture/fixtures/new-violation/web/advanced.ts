import type { SharedPayload } from "../core/value";

interface ListedContract {
  alpha: number;
  beta: string;
}

export type { ListedContract };

export interface RenamedContract {
  alpha: number;
  beta: string;
}

export type SharedPayloadReplica = SharedPayload;

type RouterInputs = { groups: { create: { title: string } } };
type CreatePayload = RouterInputs["groups"]["create"];

declare const trpc: { groups: { create: { mutate: (input: CreatePayload) => void } } };
trpc.groups.create.mutate({ title: "derived" } as CreatePayload);
