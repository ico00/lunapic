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

    await provider.selectOption("static");
    await expect(provider).toHaveValue("static");

    await provider.selectOption("mock");
    await expect(provider).toHaveValue("mock");

    await provider.selectOption("opensky");
    await expect(provider).toHaveValue("opensky");

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
