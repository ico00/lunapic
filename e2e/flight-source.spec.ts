import { expect, test } from "@playwright/test";
import { E2E_BASE } from "./basePath";

test.describe("flight source", () => {
  test("Provider select switches mock, static, and opensky without errors", async ({
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

    await provider.click();
    await page.getByRole("option", { name: "Routes (static)" }).click();
    await expect(provider).toHaveAttribute("data-value", "static");

    await provider.click();
    await page.getByRole("option", { name: "Mock" }).click();
    await expect(provider).toHaveAttribute("data-value", "mock");

    await provider.click();
    await page.getByRole("option", { name: "OpenSky (ADS-B)" }).click();
    await expect(provider).toHaveAttribute("data-value", "opensky");

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
