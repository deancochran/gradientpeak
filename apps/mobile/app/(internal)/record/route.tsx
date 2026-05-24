import { Redirect } from "expo-router";

export default function RoutePickerRedirect() {
  return <Redirect href="/search?scope=routes" />;
}
