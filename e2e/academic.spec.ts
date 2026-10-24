import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("student dashboard shows only own academic record and enrolments", async ({ page }) => {
  await signInAs(page, "student1@example.com");
  await expect(page.getByRole("heading", { name: "My academic record" })).toBeVisible();
  await expect(page.getByText("CSE2023001", { exact: true })).toBeVisible();
  await expect(page.getByText(/Data Structures/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Directory" })).toHaveCount(0);
});

test("student cannot access staff directory", async ({ page }) => {
  await signInAs(page, "student1@example.com");
  await page.goto("/directory");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("assigned teacher sees assigned students and can search", async ({ page }) => {
  await signInAs(page, "teacher1@example.com");
  await page.goto("/directory");
  await expect(page.getByRole("heading", { name: "Student directory" })).toBeVisible();
  await expect(page.getByText("CSE2023001", { exact: true })).toBeVisible();
  await expect(page.getByText("CSE2023002", { exact: true })).toBeVisible();
  await page.getByLabel("Search").fill("Student Two");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/q=Student\+Two/);
  await expect(page.getByText("CSE2023002", { exact: true })).toBeVisible();
  await expect(page.getByText("CSE2023001", { exact: true })).toHaveCount(0);
});

test("unassigned teacher has an empty directory and cannot open guessed records", async ({ page }) => {
  await signInAs(page, "teacher2@example.com");
  await page.goto("/directory");
  await expect(page.getByText("No students match the current filters.")).toBeVisible();
  await page.goto("/directory/11111111-1111-1111-1111-111111111111");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("admin can view academic structure and create an unlinked student record", async ({ page }) => {
  await signInAs(page, "admin1@example.com");
  await page.goto("/admin/academics");
  await expect(page.getByRole("heading", { name: "Academic structure" })).toBeVisible();
  await expect(page.getByText(/CSE — Computer Science/)).toBeVisible();
  await page.goto("/admin/students/new");
  await expect(page.getByRole("heading", { name: "Create student record" })).toBeVisible();
  const studentOption = await page.getByLabel("Student account").locator("option").filter({ hasText: "student3@example.com" }).getAttribute("value");
  expect(studentOption).toBeTruthy();
  await page.getByLabel("Student account").selectOption(studentOption!);
  await page.getByLabel("Registration number").fill(`E2E${Date.now()}`);
  const programOption = await page.getByLabel("Program").locator("option").filter({ hasText: "BTECH_CSE" }).getAttribute("value");
  expect(programOption).toBeTruthy();
  await page.getByLabel("Program").selectOption(programOption!);
  await page.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByRole("status")).toHaveText("Student record created.");
});

test("multi-role admin and student sees both personal record and admin totals", async ({ page }) => {
  await signInAs(page, "adminstudent1@example.com");
  await expect(page.getByRole("heading", { name: "My academic record" })).toBeVisible();
  await expect(page.getByText("CSE2023099", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Structure totals" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Academics" })).toBeVisible();
});
