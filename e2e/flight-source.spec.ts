import { expect, test } from "@playwright/test";
import { E2E_BASE } from "./basePath";

test.describe("flight source", () => {
  test("Flight source panel toggles OpenSky and adsb.lol live feeds without errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(`${E2E_BASE}/`);

    const mapSurface = page.getByTestId("map-surface");
    const mapMissingToken = page.getByTestId("map-missing-token");
    await expect(mapSurface.or(mapMissingToken).first()).toBeVisible({
      timeout: 90_000,
    });

    await page.getByRole("button", { name: "Flight source" }).click();

    const openSkyFeed = page.getByTestId("live-feed-opensky");
    const adsbOneFeed = page.getByTestId("live-feed-adsbone");
    await expect(openSkyFeed).toBeVisible();
    await expect(adsbOneFeed).toBeVisible();
    await expect(openSkyFeed).toBeChecked();
    await expect(adsbOneFeed).toBeChecked();

    await adsbOneFeed.uncheck();
    await expect(adsbOneFeed).not.toBeChecked();

    await adsbOneFeed.check();
    await expect(adsbOneFeed).toBeChecked();

    await openSkyFeed.uncheck();
    await expect(openSkyFeed).not.toBeChecked();

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
