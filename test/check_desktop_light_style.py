"""Verify the desktop dashboard skin uses a light workspace, not legacy dark panes."""

from __future__ import annotations

import asyncio

from playwright.async_api import async_playwright


URL = "http://127.0.0.1:8083/"


def rgb_tuple(value: str) -> tuple[int, int, int]:
    raw = value.strip().removeprefix("rgb(").removeprefix("rgba(").removesuffix(")")
    parts = [p.strip() for p in raw.split(",")[:3]]
    return tuple(int(float(p)) for p in parts)


async def style(page, selector: str, prop: str) -> str:
    return await page.locator(selector).first.evaluate(
        "(el, prop) => getComputedStyle(el).getPropertyValue(prop)",
        prop,
    )


async def assert_light(page, selector: str) -> None:
    bg = rgb_tuple(await style(page, selector, "background-color"))
    assert min(bg) >= 235, f"{selector} should be light, got rgb{bg}"


async def assert_dark_text(page, selector: str) -> None:
    color = rgb_tuple(await style(page, selector, "color"))
    assert max(color) <= 120, f"{selector} should use dark text, got rgb{color}"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".topbar")
        await page.locator('.tab-btn[data-tab="reg"]').click()
        await page.wait_for_selector("#tab-reg.active")
        for selector in [
            "#combo-input",
            "#default-password",
            "#job-timeout",
            "#log-pane",
            "#success-pane",
            "#error-pane",
            "#tab-reg .job-list",
        ]:
            await assert_light(page, selector)
            await assert_dark_text(page, selector)
        await page.locator('.tab-btn[data-tab="session"]').click()
        await page.wait_for_selector("#tab-session.active")
        for selector in [
            "#ses-combo-input",
            "#ses-job-timeout",
            "#ses-log-pane",
            "#ses-error-pane",
            "#tab-session .job-list",
        ]:
            await assert_light(page, selector)
            await assert_dark_text(page, selector)
        await page.locator('.tab-btn[data-tab="upi"]').click()
        await page.wait_for_selector("#tab-upi.active")
        for selector in [
            "#upi-combo-input",
            "#upi-approve-retries",
            "#upi-log-pane",
            "#upi-success-pane",
            "#upi-error-pane",
            "#tab-upi .job-list",
        ]:
            await assert_light(page, selector)
            await assert_dark_text(page, selector)
        await browser.close()
    print("ok: desktop light style")


if __name__ == "__main__":
    asyncio.run(main())
