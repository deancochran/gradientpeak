import * as relationsModule from "./relations";
import * as tablesModule from "./tables";

export * from "./enums";
export * from "./relations";
export * as relations from "./relations";
export { relationsSchema } from "./relations";
export * from "./tables";
export * as tables from "./tables";
export * from "./types";

export const schema = {
  ...tablesModule,
};

export const relationalSchema = {
  ...tablesModule,
  ...relationsModule,
};
