import { Redirect } from "expo-router";

export default function PlanPickerRedirect() {
  return <Redirect href="/search?scope=activityPlans" />;
}
