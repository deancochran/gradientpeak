import { Redirect } from "expo-router";
import { ROUTES } from "@/lib/constants/routes";

/** Compatibility route: account and profile management now live in Me. */
export default function ProfileTabRedirect() {
  return <Redirect href={ROUTES.ME} />;
}
