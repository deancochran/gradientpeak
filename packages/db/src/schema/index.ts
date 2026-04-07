import * as authSchemaModule from "../auth-schema";
import * as relationsModule from "./relations";
import * as tablesModule from "./tables";

export * from "../auth-schema";
export * from "./enums";
export * from "./relations";
export * as relations from "./relations";
export { relationsSchema } from "./relations";
export * from "./tables";
export * as tables from "./tables";
export * from "./types";

export const schema = {
  ...authSchemaModule,
  ...tablesModule,
};

export const relationalSchema = {
  ...authSchemaModule,
  ...tablesModule,
  ...relationsModule,
};
