import { Redirect } from "expo-router";
import { ROUTES } from "@/lib/constants/routes";

/** Settings retains a stable destination while profile editing owns the form. */
export default function SettingsRedirect() {
  return <Redirect href={ROUTES.PROFILE_EDIT} />;
}
