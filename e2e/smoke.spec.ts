import { expect, test } from "@playwright/test";
import { E2E_BASE } from "./basePath";

test.describe("smoke", () => {
  test("home shell loads; map or Mapbox setup placeholder", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    const response = await page.goto(`${E2E_BASE}/`);
    expect(response?.ok(), "HTTP OK").toBeTruthy();

    await expect(
      page.getByRole("heading", { name: "Moon Transit" })
    ).toBeVisible();

    await expect(page.getByText("Flight source", { exact: true })).toBeVisible();

    // Dynamic Mapbox client chunk: may briefly show map-loading, then map-surface or map-missing-token
    const loading = page.getByTestId("map-loading");
    const mapSurface = page.getByTestId("map-surface");
    const mapMissingToken = page.getByTestId("map-missing-token");
    await expect(
      loading.or(mapSurface).or(mapMissingToken).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      mapSurface.or(mapMissingToken).first()
    ).toBeVisible({ timeout: 90_000 });

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
