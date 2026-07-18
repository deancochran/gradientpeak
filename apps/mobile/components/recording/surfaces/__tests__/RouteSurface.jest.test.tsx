import type { ForwardedRef } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { createHost, type HostProps } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";
import { RouteSurface } from "../RouteSurface";

jest.mock("@/lib/services/ActivityRecorder", () => ({
  __esModule: true,
  ActivityRecorderService: class ActivityRecorderService {},
}));

const addCallbackMock = jest.fn();
const removeCallbackMock = jest.fn();
const addHeadingCallbackMock = jest.fn();
const removeHeadingCallbackMock = jest.fn();

function buildService(): ActivityRecorderService {
  const service: ActivityRecorderService = Object.create(ActivityRecorderService.prototype);
  Object.assign(service, {
    state: "recording",
    currentRoute: {
      name: "Test Route",
      coordinates: [
        { latitude: 40.1, longitude: -105.1 },
        { latitude: 40.2, longitude: -105.2 },
      ],
      polyline: "encoded-route",
    },
    recordedGpsPath: [],
    locationManager: {
      addCallback: addCallbackMock,
      removeCallback: removeCallbackMock,
      addHeadingCallback: addHeadingCallbackMock,
      removeHeadingCallback: removeHeadingCallbackMock,
    },
  });
  return service;
}

jest.mock("react-native-maps", () => {
  const React = require("react");

  const MapView = React.forwardRef((props: HostProps, ref: ForwardedRef<unknown>) => {
    React.useImperativeHandle(ref, () => ({ animateCamera: jest.fn() }));
    return React.createElement("MapView", props, props.children);
  });

  return {
    __esModule: true,
    default: MapView,
    Polyline: createHost("Polyline"),
    PROVIDER_DEFAULT: "default",
  };
});

jest.mock("@/components/recording/GPSStatusOverlay", () => ({
  __esModule: true,
  GPSStatusOverlay: createHost("GPSStatusOverlay"),
}));

jest.mock("@/components/recording/VirtualRouteMap", () => ({
  __esModule: true,
  VirtualRouteMap: createHost("VirtualRouteMap"),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useGpsTracking: () => ({ gpsEnabled: true }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Navigation: createHost("Navigation"),
}));

function findHostNodes(rendered: ReturnType<typeof renderNative>, type: string) {
  return rendered.UNSAFE_root.findAll((node: ReactTestInstance) => node.type === type);
}

describe("RouteSurface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders virtual route guidance without subscribing to GPS callbacks", () => {
    const result = renderNative(
      <RouteSurface
        service={buildService()}
        gpsRecordingEnabled={false}
        hasRoute
        routeMode="virtual"
      />,
    );

    expect(findHostNodes(result, "VirtualRouteMap")[0]).toBeTruthy();
    expect(addCallbackMock).not.toHaveBeenCalled();
    expect(addHeadingCallbackMock).not.toHaveBeenCalled();
  });

  it("renders route preview without GPS overlay or GPS subscriptions", () => {
    const result = renderNative(
      <RouteSurface
        service={buildService()}
        gpsRecordingEnabled={true}
        hasRoute
        routeMode="preview"
      />,
    );

    expect(screen.getByText("Route preview")).toBeTruthy();
    expect(findHostNodes(result, "GPSStatusOverlay")[0] ?? null).toBeNull();
    expect(addCallbackMock).not.toHaveBeenCalled();
    expect(addHeadingCallbackMock).not.toHaveBeenCalled();
  });

  it("subscribes to GPS callbacks only for live navigation", () => {
    const result = renderNative(
      <RouteSurface
        service={buildService()}
        gpsRecordingEnabled={true}
        hasRoute
        routeMode="live_navigation"
      />,
    );

    expect(addCallbackMock).toHaveBeenCalledTimes(1);
    expect(addHeadingCallbackMock).toHaveBeenCalledTimes(1);
    expect(findHostNodes(result, "GPSStatusOverlay")[0]).toBeTruthy();
  });
});
