import { buildElevationProfilePoints } from "../elevationProfile";

describe("buildElevationProfilePoints", () => {
  it("interpolates distance at mismatched elevation intervals", () => {
    expect(
      buildElevationProfilePoints(
        { timestamps: [0, 1000, 2000], values: [100, 110, 120] },
        { timestamps: [0, 2000], values: [0, 400] },
      ),
    ).toEqual([
      { elevation: 100, x: 0 },
      { elevation: 110, x: 0.2 },
      { elevation: 120, x: 0.4 },
    ]);
  });

  it("keeps null elevation gaps from shifting later distance pairings", () => {
    expect(
      buildElevationProfilePoints(
        { timestamps: [0, 1000, 2000], values: [100, null, 120] },
        { timestamps: [0, 1000, 2000], values: [0, 150, 400] },
      ),
    ).toEqual([
      { elevation: 100, x: 0 },
      { elevation: 120, x: 0.4 },
    ]);
  });

  it("omits elevation points before an offset distance stream starts", () => {
    expect(
      buildElevationProfilePoints(
        { timestamps: [0, 1000, 2000, 3000], values: [90, 100, 110, 120] },
        { timestamps: [1500, 3000], values: [300, 600] },
      ),
    ).toEqual([
      { elevation: 110, x: 0.4 },
      { elevation: 120, x: 0.6 },
    ]);
  });
});
