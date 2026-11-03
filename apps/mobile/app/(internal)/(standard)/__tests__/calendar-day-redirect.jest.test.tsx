import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

let dateParam: string | undefined = "2026-04-15";

jest.mock("expo-router", () => ({
  Redirect: createHost("Redirect"),
  useLocalSearchParams: () => ({ date: dateParam }),
}));

const CalendarDayRedirect = require("../calendar-day").default;

beforeEach(() => {
  dateParam = "2026-04-15";
});

it("redirects valid legacy calendar-day links to the canonical day training breakdown", async () => {
  await renderNative(<CalendarDayRedirect />);

  const redirect = screen.container.queryAll((node) => node.type === "Redirect")[0];
  if (!redirect) throw new Error("Expected redirect");
  expect(redirect.props.href).toEqual({
    pathname: "/planning-ledger",
    params: { anchorDate: "2026-04-15", period: "day" },
  });
});

it("returns invalid legacy calendar-day links to Calendar", async () => {
  dateParam = "invalid";
  await renderNative(<CalendarDayRedirect />);

  const redirect = screen.container.queryAll((node) => node.type === "Redirect")[0];
  if (!redirect) throw new Error("Expected redirect");
  expect(redirect.props.href).toEqual({
    pathname: "/(internal)/(tabs)/plan",
    params: { view: "calendar" },
  });
});
