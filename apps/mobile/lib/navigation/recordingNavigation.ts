import type { Href, ImperativeRouter } from "expo-router";

const RECORD_ROUTE = "/record" as Href;

export function returnToRecordScreen(router: Pick<ImperativeRouter, "dismissTo">) {
  router.dismissTo(RECORD_ROUTE);
}
