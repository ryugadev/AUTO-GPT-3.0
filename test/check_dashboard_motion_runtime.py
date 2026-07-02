"""Runtime smoke check for dashboard motion/toast UI."""

from __future__ import annotations

import asyncio

from playwright.async_api import async_playwright


URL = "http://127.0.0.1:8083/"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".topbar")

        labels = page.locator(".topbar .toggle-label")
        label_count = await labels.count()
        if label_count < 2:
            raise AssertionError("sidebar toggle labels are missing")
        for idx in range(label_count):
            color = await labels.nth(idx).evaluate(
                "el => getComputedStyle(el).color"
            )
            if color not in ("rgb(203, 213, 225)", "rgb(248, 250, 252)", "rgb(255, 255, 255)"):
                raise AssertionError(f"sidebar toggle label has low-contrast color: {color}")

        await page.locator('.tab-btn[data-tab="settings"]').click()
        await page.wait_for_selector("#tab-settings.active")
        await page.locator('.tab-btn[data-tab="upi"]').click()
        await page.wait_for_selector("#tab-upi.active")

        header_box = await page.locator("#tab-upi .upi-jobs-card .card-head").bounding_box()
        if not header_box:
            raise AssertionError("UPI jobs header has no bounding box")
        toolbar_buttons = [
            "#upi-btn-retry-expired-free",
            "#upi-btn-retry-failed",
            "#upi-btn-clear-done",
            "#upi-btn-clear-all",
        ]
        for selector in toolbar_buttons:
            btn = page.locator(selector)
            await btn.wait_for(state="visible")
            box = await btn.bounding_box()
            if not box or box["width"] < 24 or box["height"] < 24:
                raise AssertionError(f"UPI jobs toolbar button is clipped: {selector} {box}")
            if box["y"] > header_box["y"] + header_box["height"] + 2:
                raise AssertionError(f"UPI jobs toolbar button wrapped below header: {selector} {box}")

        await page.evaluate(
            """() => window.Dialog.alert({
                title: 'Runtime check',
                message: 'Toast motion check',
                type: 'success'
            })"""
        )
        toast = page.locator(".gpt-toast.gpt-toast-show").last
        await toast.wait_for(state="visible")
        box = await toast.bounding_box()
        viewport = page.viewport_size or {"width": 1920, "height": 1080}
        if not box:
            raise AssertionError("toast has no bounding box")
        if box["x"] < viewport["width"] * 0.68 or box["y"] > 80:
            raise AssertionError(f"toast is not positioned top-right: {box}")

        toast_type = await toast.get_attribute("data-toast-type")
        if toast_type != "success":
            raise AssertionError(f"toast type metadata mismatch: {toast_type}")

        await browser.close()
    print("ok: dashboard motion runtime smoke")


if __name__ == "__main__":
    asyncio.run(main())
