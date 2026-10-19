import { describe, expect, it } from "vitest";

import {
  getFloatingOverlaySettings,
  getIslandBottomMigration,
  getSettingsValuesFromNativeChange,
} from "./settings";

import { SETTING_DEFINITIONS } from "~/settings/schema";

const noChange = {
  floatingBarOpacity: null,
  liveCaptionOpacity: null,
  liveCaptionWidth: null,
  liveCaptionLineCount: null,
  liveCaptionPosition: null,
  liveCaptionMinimized: null,
  visibleInScreenshots: null,
  overlayDisplay: null,
};

describe("meeting island screenshot setting", () => {
  it("shows the island in screenshots unless it was turned off", () => {
    expect(SETTING_DEFINITIONS.overlay_visible_in_screenshots.default).toBe(
      true,
    );
    expect(getFloatingOverlaySettings({}).visibleInScreenshots).toBe(true);
    expect(
      getFloatingOverlaySettings({ overlay_visible_in_screenshots: false })
        .visibleInScreenshots,
    ).toBe(false);
  });

  it("saves the switch flipped on the island itself", () => {
    expect(
      getSettingsValuesFromNativeChange({
        ...noChange,
        visibleInScreenshots: false,
      }),
    ).toEqual({ overlay_visible_in_screenshots: false });
    expect(getSettingsValuesFromNativeChange(noChange)).toEqual({});
  });
});

describe("meeting island position", () => {
  it("floats at the bottom centre by default", () => {
    expect(SETTING_DEFINITIONS.live_caption_position.default).toBe(
      "bottomCenter",
    );
    expect(getFloatingOverlaySettings({}).liveCaptionPosition).toBe(
      "bottomCenter",
    );
    expect(
      getFloatingOverlaySettings({ live_caption_position: "topCenter" })
        .liveCaptionPosition,
    ).toBe("topCenter");
  });

  it("moves people still under the camera to the bottom once", () => {
    expect(
      getIslandBottomMigration({ live_caption_position: "topCenter" }),
    ).toEqual({
      live_caption_position: "bottomCenter",
      overlay_moved_to_bottom: true,
    });
    expect(getIslandBottomMigration({})).toEqual({
      overlay_moved_to_bottom: true,
    });
    expect(
      getIslandBottomMigration({
        live_caption_position: "topCenter",
        overlay_moved_to_bottom: true,
      }),
    ).toEqual({});
  });

  it("keeps a corner someone picked", () => {
    expect(
      getIslandBottomMigration({ live_caption_position: "topRight" }),
    ).toEqual({ overlay_moved_to_bottom: true });
  });
});

describe("meeting island display setting", () => {
  it("sits under the camera until a display is chosen", () => {
    expect(SETTING_DEFINITIONS.overlay_display.default).toBe("camera");
    expect(getFloatingOverlaySettings({}).overlayDisplay).toBe("camera");
    expect(
      getFloatingOverlaySettings({ overlay_display: "  " }).overlayDisplay,
    ).toBe("camera");
    expect(
      getFloatingOverlaySettings({ overlay_display: "MI-UUID" }).overlayDisplay,
    ).toBe("MI-UUID");
  });

  it("saves the display and corner the island was dragged to, together", () => {
    expect(
      getSettingsValuesFromNativeChange({
        ...noChange,
        overlayDisplay: "MI-UUID",
        liveCaptionPosition: "bottomRight",
      }),
    ).toEqual({
      overlay_display: "MI-UUID",
      live_caption_position: "bottomRight",
    });
  });
});
