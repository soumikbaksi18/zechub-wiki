import { expect, type Page, test } from "@playwright/test";

// Section layout of /wallets: In production, then Beta wallets, then
// Transparent-only wallets, then the Deprecated block. Which wallets sit in
// each section is content (site/Using_Zcash/Wallets.md in ZecHub/zechub) and
// changes often, so this file checks structure and behaviour, not names or
// counts. The grouping rules themselves are unit tested in
// src/components/__tests__/walletList.test.tsx. Needs a server running
// (`yarn dev`, or `yarn build && yarn start`).

const SECTION_ORDER = ["production", "beta", "transparent-only"];

const section = (page: Page, key: string) =>
  page.locator(`section[data-section="${key}"]`);

const toggle = (page: Page, key: string) =>
  section(page, key).getByRole("heading", { level: 2 }).getByRole("button");

const grid = (page: Page, key: string) =>
  section(page, key).locator(".wl-wallet-grid");

/** Opens /wallets and waits for React, since the toggles do nothing before it hydrates. */
async function openWallets(page: Page, locale = "en") {
  await page.goto(`/${locale}/wallets`);
  await expect(section(page, "production")).toBeVisible();
  await page.waitForFunction(() => {
    const button = document.querySelector("section[data-section] h2 button");
    return !!button && Object.keys(button).some((key) => key.startsWith("__reactProps"));
  });
}

test("sections follow In production, Beta, Transparent-only, then Deprecated", async ({ page }) => {
  await openWallets(page);

  const keys = await page
    .locator("section[data-section]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-section")));
  expect(keys).toEqual(SECTION_ORDER);

  // Deprecated wallets stay last, after the three sections.
  const deprecated = page.locator("details.wl-deprecated");
  if ((await deprecated.count()) > 0) {
    const follows = await section(page, "transparent-only").evaluate(
      (el) => {
        const block = document.querySelector("details.wl-deprecated")!;
        return !!(el.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
    );
    expect(follows).toBe(true);
  }
});

test("every card in the Beta section carries the Beta badge", async ({ page }) => {
  await openWallets(page);

  const cards = grid(page, "beta").getByRole("heading", { level: 5 });
  const badges = grid(page, "beta").locator('[title="Release stage"]', { hasText: /^Beta$/i });

  expect(await cards.count()).toBeGreaterThan(0);
  await expect(badges).toHaveCount(await cards.count());
});

test("each section collapses and expands by mouse and keyboard", async ({ page }) => {
  await openWallets(page);

  for (const key of SECTION_ORDER) {
    const button = toggle(page, key);

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(grid(page, key)).toBeVisible();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(grid(page, key)).toBeHidden();
    // The subtitle explains the section even while it is closed.
    await expect(section(page, key).locator(".wl-section-note")).toBeVisible();

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(grid(page, key)).toBeVisible();
  }

  // Closing one section leaves the others open.
  await toggle(page, "beta").click();
  await expect(grid(page, "production")).toBeVisible();
  await expect(grid(page, "transparent-only")).toBeVisible();
});

test("the Transparent-only subtitle links to the shielded pools guide in the current locale", async ({ page }) => {
  await openWallets(page, "de");
  await expect(
    section(page, "transparent-only").locator("a.wl-section-link"),
  ).toHaveAttribute("href", "/de/using-zcash/shielded-pools");

  await openWallets(page);
  const link = section(page, "transparent-only").getByRole("link", {
    name: /Learn about shielded pools/,
  });
  await link.click();
  await expect(page).toHaveURL(/\/using-zcash\/shielded-pools$/);
});

test("section headings and their arrows fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWallets(page);

  for (const key of SECTION_ORDER) {
    const box = await toggle(page, key).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expect(toggle(page, key).locator("svg")).toBeVisible();
  }
});
