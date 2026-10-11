// Run against a local Vite preview or the deployed app. Credentials stay in memory.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const base = process.env.REQUESTLAB_URL || "http://localhost:5173";
const secrets = await readFile(
  path.join(os.homedir(), ".config/havet/secrets/req.env"),
  "utf8",
);
const password = secrets.match(/^ADMIN_TOKEN=(.*)$/m)?.[1];
assert.ok(password, "ADMIN_TOKEN must be available locally");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const screenshots = process.env.REQUESTLAB_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Open a session" }).click();
  await page.getByRole("textbox", { name: "Callback domain" }).waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('input[aria-label="Callback domain"]')
      ?.value.startsWith(
        JSON.parse(localStorage.getItem("requestrepo-sessions") || "{}").state
          ?.activeSubdomain + ".",
      ),
  );
  const domain = await page
    .getByRole("textbox", { name: "Callback domain" })
    .inputValue();
  if (screenshots)
    await page.screenshot({ path: path.join(screenshots, "welcome-dark.png") });
  const response = await fetch(`https://${domain}/kebab-browser-qa`, {
    method: "POST",
    headers: { "X-Challenge": "KebabEngineers" },
    body: "kebab-browser-body-marker",
  });
  assert.equal(response.status, 200);
  const signal = page.getByRole("button", {
    name: "Select POST request /kebab-browser-qa",
    exact: true,
  });
  await signal.waitFor();
  await signal.click();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Evidence note" })
    .fill("SSRF proof / browser QA");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export selected request" }).click();
  const download = await downloadPromise;
  const evidence = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(evidence.requests.length, 1);
  assert.equal(evidence.requests[0].note, "SSRF proof / browser QA");
  assert.equal(evidence.requests[0].bookmarked, true);
  assert.equal("token" in evidence, false);
  console.log("PASS callback capture, bookmark, note, evidence download");
  await page.reload();
  await signal.click();
  assert.equal(
    await page.getByRole("textbox", { name: "Evidence note" }).inputValue(),
    "SSRF proof / browser QA",
  );
  await page.getByRole("button", { name: "Bookmarked", exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "Search requests", exact: true })
    .fill("kebab-browser-body-marker");
  assert.equal(await page.locator(".queue-item").count(), 1);
  await page
    .getByRole("textbox", { name: "Search requests", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  assert.equal(await page.locator(".queue-item").count(), 1);
  await page
    .locator(".lab-sidebar")
    .getByRole("button", { name: "Bookmarked", exact: true })
    .click();
  console.log("PASS notebook persistence, body search, bookmark filter");
  const peer = await context.newPage();
  await peer.goto(base + "/requests");
  await peer
    .getByRole("button", {
      name: "Select POST request /kebab-browser-qa",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Evidence note" })
    .fill("Updated across tabs / browser QA");
  await peer.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Evidence note"]')?.value ===
      "Updated across tabs / browser QA",
  );
  await peer.selectOption('select[aria-label="Callback URL scheme"]', "http");
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Callback URL scheme"]')
        ?.value === "http",
  );
  await page.reload();
  await signal.click();
  assert.equal(
    await page.getByRole("textbox", { name: "Evidence note" }).inputValue(),
    "Updated across tabs / browser QA",
  );
  await peer.close();
  console.log(
    "PASS two-tab synchronization preserves notes during preference changes",
  );

  await page.getByRole("button", { name: "Pause auto-scroll" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Resume auto-scroll" })
      .getAttribute("aria-pressed"),
    "true",
  );
  const queue = page.locator(".lab-sidebar .overflow-auto");
  await queue.evaluate((el) => {
    el.scrollTop = 0;
  });
  await Promise.all(
    Array.from({ length: 18 }, (_, i) =>
      fetch(`https://${domain}/scroll-qa-${i}`),
    ),
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".queue-item").length >= 19,
  );
  assert.ok(
    (await queue.evaluate((el) => el.scrollTop)) < 2,
    "Paused queue must not jump when requests arrive",
  );
  await page.getByRole("button", { name: "Resume auto-scroll" }).click();
  await fetch(`https://${domain}/scroll-qa-follow`);
  await page.waitForFunction(
    () => document.querySelector(".lab-sidebar .overflow-auto")?.scrollTop > 0,
  );
  await page.selectOption('select[aria-label="Callback URL scheme"]', "http");
  assert.equal(
    await page.getByRole("button", { name: "Callback snippets" }).count(),
    0,
  );
  assert.equal(
    await page.locator('select[aria-label="Callback URL scheme"]').inputValue(),
    "http",
  );
  console.log("PASS pause control and callback scheme choice");
  await page.getByRole("button", { name: "Response", exact: true }).click();
  await page.locator(".monaco-editor").waitFor();
  await page.locator(".monaco-editor").click();
  await page.keyboard.press("Control+KeyA");
  await page.keyboard.insertText("<h1>KebabEngineers browser QA</h1>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved", { exact: true }).waitFor();
  const custom = await fetch(`https://${domain}/`);
  assert.match(await custom.text(), /KebabEngineers browser QA/);
  console.log("PASS response editor saves and serves custom HTML");
  await page.getByRole("button", { name: "DNS", exact: true }).click();
  await page.getByText("DNS", { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/dns");
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  if (screenshots)
    await page.screenshot({ path: path.join(screenshots, "request-dark.png") });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  assert.equal(
    await page.locator("html").evaluate((el) => el.classList.contains("dark")),
    false,
  );
  if (screenshots)
    await page.screenshot({
      path: path.join(screenshots, "request-light.png"),
    });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Open request queue" }).click();
  await signal.last().click();
  await page.waitForFunction(
    () => !document.querySelector("aside.lg\\:hidden"),
  );
  if (screenshots)
    await page.screenshot({
      path: path.join(screenshots, "request-mobile.png"),
    });
  assert.deepEqual(errors, []);
  console.log(
    "PASS DNS navigation, light/dark theme, mobile selection, no uncaught errors",
  );
} finally {
  await browser.close();
}
