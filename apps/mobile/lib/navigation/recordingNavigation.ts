import type { Href, Router } from "expo-router";

const RECORD_ROUTE = "/record" as Href;

export function returnToRecordScreen(router: Pick<Router, "dismissTo">) {
  router.dismissTo(RECORD_ROUTE);
}
