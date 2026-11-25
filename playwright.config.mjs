import { defineConfig, devices } from "@playwright/test";

// Lokal: Chromium (auch mit iPhone-/iPad-Bildschirm). In GitHub Actions zusätzlich WebKit (Safari-Technik).
const webkit = !!process.env.CI || !!process.env.PW_WEBKIT;
const iphone = devices["iPhone 15"],
  ipad = devices["iPad (gen 7)"];

export default defineConfig({
  testDir: "tests",
  timeout: process.env.CI ? 60_000 : 30_000, // GitHub Actions ist langsamer (zusätzlich WebKit und echter Worker)
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "off", serviceWorkers: "block" },
  webServer: { command: "node tests/server.mjs", url: "http://127.0.0.1:4173/index.html", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium" } },
    { name: "chromium-iphone", use: { ...iphone, browserName: "chromium", defaultBrowserType: undefined } },
    { name: "chromium-ipad", use: { ...ipad, browserName: "chromium", defaultBrowserType: undefined } },
    ...(webkit
      ? [
          { name: "webkit-iphone", use: { ...iphone } },
          { name: "webkit-ipad", use: { ...ipad } },
        ]
      : []),
  ],
});
