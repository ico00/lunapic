import { expect, test } from "@playwright/test";
import { E2E_BASE } from "./basePath";

test.describe("flight source", () => {
  test("Flight source panel: LunaPic is the default, web feeds are opt-in, Avionix is disabled", async ({
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
    const lunaPicFeed = page.getByTestId("live-feed-localsdr");
    const avionixFeed = page.getByTestId("live-feed-avionix");
    await expect(openSkyFeed).toBeVisible();
    await expect(adsbOneFeed).toBeVisible();
    await expect(lunaPicFeed).toBeChecked();
    await expect(openSkyFeed).not.toBeChecked();
    await expect(adsbOneFeed).not.toBeChecked();

    // Avionix: na popisu, ali nije uključen i ne može se kliknuti.
    await expect(avionixFeed).toBeVisible();
    await expect(avionixFeed).not.toBeChecked();
    await expect(avionixFeed).toBeDisabled();

    await adsbOneFeed.check();
    await expect(adsbOneFeed).toBeChecked();

    await adsbOneFeed.uncheck();
    await expect(adsbOneFeed).not.toBeChecked();

    await openSkyFeed.check();
    await expect(openSkyFeed).toBeChecked();

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
