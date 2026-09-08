import { Redirect } from "expo-router";
import { ROUTES } from "@/lib/constants/routes";

/** Compatibility route: Calendar now lives inside the Plan tab. */
export default function CalendarTabRedirect() {
  return <Redirect href={ROUTES.PLAN.CALENDAR} />;
}
