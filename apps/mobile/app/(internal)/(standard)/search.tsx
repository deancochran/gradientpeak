import { Redirect } from "expo-router";
import { ROUTES } from "@/lib/constants/routes";

/** Compatibility route: global search now lives in Discover. */
export default function SearchRedirect() {
  return <Redirect href={ROUTES.DISCOVER} />;
}
