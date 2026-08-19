import { test, expect } from "@playwright/test";

import { DEMO, loginViaUi, submitButton, API_URL } from "./helpers";

test.describe("signing in", () => {
  test("an engineer can sign in through the form and reach the app", async ({ page }) => {
    await loginViaUi(page, DEMO.engineer);

    // The app keeps the token in localStorage; without it nothing else would work.
    const token = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(token, "a token should be stored after signing in").toBeTruthy();
  });

  test("a manager can sign in as well", async ({ page }) => {
    await loginViaUi(page, DEMO.manager);

    const stored = await page.evaluate(() => window.localStorage.getItem("user"));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).role).toBe("manager");
  });

  test("a wrong password is refused and leaves you on the sign-in page", async ({ page }) => {
    await page.goto("/auth");
    await page.locator("#email").fill(DEMO.engineer.email);
    await page.locator("#password").fill("definitely-not-the-password");
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/auth/);
    const token = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(token, "no token should be stored after a failed sign-in").toBeFalsy();
  });

  test("an unauthenticated visitor cannot reach the dashboard", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/");

    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe("the API behind the form", () => {
  test("rejects bad credentials with 401 and no token", async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: { email: DEMO.engineer.email, password: "wrong" },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain("accessToken");
  });

  test("refuses an unknown account with the same message as a wrong password", async ({ request }) => {
    // Identical wording matters: a different message would tell an attacker which
    // addresses exist.
    const unknown = await request.post(`${API_URL}/auth/login`, {
      data: { email: "nobody@example.com", password: "Password123!" },
    });
    const wrongPassword = await request.post(`${API_URL}/auth/login`, {
      data: { email: DEMO.engineer.email, password: "wrong" },
    });

    expect(unknown.status()).toBe(401);
    expect((await unknown.json()).error.message).toBe((await wrongPassword.json()).error.message);
  });

  test("a protected route needs a token", async ({ request }) => {
    const response = await request.get(`${API_URL}/jobs`);
    expect(response.status()).toBe(401);
  });
});
