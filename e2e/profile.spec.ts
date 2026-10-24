import { test, expect } from "@playwright/test";

test("unauthenticated visitor is redirected from profile", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);
});

test("seeded student can sign in and read own profile", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("student1@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Student One",
  );
  await expect(page.getByText("student — demo", { exact: true })).toBeVisible();
});

test("student can update display name and sees persisted success", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("student1@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile/);

  await page.getByRole("textbox", { name: "Display name" }).fill("Student One Updated");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status")).toHaveText("Display name updated.");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Student One Updated",
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);
});
