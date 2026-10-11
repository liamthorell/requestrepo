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
page.on("pageerror", (e) => errors.push(e.message));
const screenshots = process.env.REQUESTLAB_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const button = (name) => page.getByRole("button", { name, exact: true });
async function preset(name, target) {
  await button("Response presets").click();
  await page.locator(".preset-grid").getByRole("button", { name }).click();
  if (target)
    await page.getByRole("textbox", { name: "Redirect target" }).fill(target);
  await button("Use preset").click();
}
async function save() {
  await button("Save").click();
  await page.getByText("Saved response", { exact: true }).waitFor();
}
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(password);
  await button("Open a session").click();
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
  await button("Name session").click();
  await page
    .getByRole("textbox", { name: "Session label" })
    .fill("SSRF warmup");
  await button("Save").click();
  await button("Switch to session SSRF warmup").waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Callback domain" }).inputValue(),
    domain,
  );
  await page.reload();
  await button("Switch to session SSRF warmup").waitFor();
  console.log(
    "PASS session label survives reload without changing callback URL",
  );

  await Promise.all(
    ["one", "two"].map((name) => fetch(`https://${domain}/nav-qa-${name}`)),
  );
  await page
    .getByRole("textbox", { name: "Search requests", exact: true })
    .fill("nav-qa");
  await page.waitForFunction(
    () => document.querySelectorAll(".queue-item").length === 2,
  );
  await page
    .getByRole("heading", {
      name: "This session is listening on",
      exact: false,
    })
    .click();
  const ids = await page
    .locator(".queue-item")
    .evaluateAll((rows) => rows.map((row) => row.dataset.requestId));
  for (const [key, id] of [
    ["j", ids[0]],
    ["j", ids[1]],
    ["k", ids[0]],
  ]) {
    await page.keyboard.press(key);
    await page.waitForFunction(
      (id) =>
        document.querySelector('.queue-item[aria-pressed="true"]')?.dataset
          .requestId === id,
      id,
    );
  }
  await page.keyboard.press("b");
  await page
    .locator(".request-tools")
    .getByRole("button", { name: "Bookmarked", exact: true })
    .waitFor();
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await page.keyboard.press("b");
  assert.equal(
    (await page.locator(".request-tools button").first().textContent()).trim(),
    "Bookmarked",
  );
  if (screenshots)
    await page.screenshot({ path: path.join(screenshots, "shortcuts.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Request Details", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    ),
    "Search requests",
  );
  await page.keyboard.press("j");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search requests", exact: true })
      .inputValue(),
    "nav-qaj",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search requests", exact: true })
      .inputValue(),
    "",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(base).origin,
  });
  await page.keyboard.press("c");
  await page.waitForFunction(
    (expected) =>
      navigator.clipboard.readText().then((text) => text === expected),
    `https://${domain}`,
  );
  await page.keyboard.press("p");
  await button("Resume auto-scroll").waitFor();
  await page.keyboard.press("p");
  await button("Pause auto-scroll").waitFor();
  console.log(
    "PASS filtered keyboard navigation, bookmark, search, and typing/dialog guards",
  );

  await page.keyboard.press("2");
  await page.locator(".monaco-editor").waitFor();
  const original = await (await fetch(`https://${domain}/`)).text();
  await preset("JSON reply");
  await page.getByText("Unsaved draft", { exact: true }).waitFor();
  assert.equal(await (await fetch(`https://${domain}/`)).text(), original);
  await save();
  let reply = await fetch(`https://${domain}/`);
  assert.match(reply.headers.get("content-type"), /application\/json/);
  assert.equal((await reply.json()).team, "KebabEngineers");
  await preset("302 redirect", "javascript:alert(1)");
  await page
    .getByText("Redirects must use HTTP or HTTPS.", { exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Redirect target" })
    .fill("https://example.com/kebab-qa");
  if (screenshots)
    await page.screenshot({ path: path.join(screenshots, "presets.png") });
  await button("Use preset").click();
  await save();
  reply = await fetch(`https://${domain}/`, { redirect: "manual" });
  assert.equal(reply.status, 302);
  assert.equal(reply.headers.get("location"), "https://example.com/kebab-qa");
  await preset("204 no content");
  await save();
  reply = await fetch(`https://${domain}/`);
  assert.equal(reply.status, 204);
  assert.equal(await reply.text(), "");
  await preset("CORS-enabled JSON");
  await save();
  reply = await fetch(`https://${domain}/`, { method: "OPTIONS" });
  assert.equal(reply.headers.get("access-control-allow-origin"), "*");
  console.log(
    "PASS presets only publish on Save; JSON, redirect, 204 and CORS verified",
  );

  await preset("302 redirect", "https://example.com/unsaved");
  await button("New session").click();
  await button("Get a random URL").click();
  await page.waitForFunction(
    (old) =>
      document.querySelector('input[aria-label="Callback domain"]')?.value !==
      old,
    domain,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Response status code"]')
        ?.value === "200",
  );
  assert.equal(
    await page.getByText("Unsaved draft", { exact: true }).count(),
    0,
  );
  await button("Switch to session SSRF warmup").click();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Response status code"]')
        ?.value === "200",
  );
  assert.equal(
    await page.getByText("Unsaved draft", { exact: true }).count(),
    0,
  );
  assert.equal(
    (await fetch(`https://${domain}/`)).headers.get(
      "access-control-allow-origin",
    ),
    "*",
  );
  console.log("PASS unsaved presets do not leak between sessions");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await button("Response presets").click();
  await page
    .locator(".preset-grid")
    .getByRole("button", { name: "JSON reply" })
    .click();
  if (screenshots)
    await page.screenshot({
      path: path.join(screenshots, "presets-mobile.png"),
    });
  await button("Cancel").click();
  assert.deepEqual(errors, []);
  console.log("PASS mobile preset controls and no uncaught errors");
} finally {
  await browser.close();
}
