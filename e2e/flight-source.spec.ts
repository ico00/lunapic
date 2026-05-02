import { expect, test } from "@playwright/test";
import { E2E_BASE } from "./basePath";

test.describe("flight source", () => {
  test("Live feed checkboxes toggle OpenSky and ADS-B One without errors", async ({
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

    const provider = page.getByTestId("flight-provider-select");
    await expect(provider).toBeVisible();
    await expect(provider).toHaveAttribute("data-value", "opensky");
    await expect(provider).toContainText("OpenSky + ADS-B One (merged)");

    await provider.click();
    await page.getByTestId("live-feed-adsbone").uncheck();
    await expect(provider).toHaveAttribute("data-value", "opensky");
    await expect(provider).not.toContainText("merged");

    await provider.click();
    await page.getByTestId("live-feed-adsbone").check();
    await expect(provider).toContainText("OpenSky + ADS-B One (merged)");
    await expect(provider).toHaveAttribute("data-value", "opensky");

    await provider.click();
    await page.getByTestId("live-feed-opensky").uncheck();
    await expect(provider).toHaveAttribute("data-value", "adsbone");

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
