import { expect, test } from "playwright/test";

test("a browser-local dashboard survives a page reload", async ({ page }) => {
  const title = "Dashboard persistence E2E";

  await page.goto("/dashboards");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboards" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New Dashboard" }).click();
  await page.getByRole("textbox", { name: "Dashboard title" }).fill(title);
  await page.getByRole("button", { exact: true, name: "Create" }).click();

  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();
});
