"""Capture current dashboard preview for visual QA."""

from __future__ import annotations

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright


URL = "http://127.0.0.1:8083/"
OUT = Path(__file__).with_name("dashboard_upi_preview.png")


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".topbar")
        await page.locator('.tab-btn[data-tab="upi"]').click()
        await page.wait_for_selector("#tab-upi.active")
        await page.screenshot(path=str(OUT), full_page=False)
        await browser.close()
    print(f"ok: captured {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
