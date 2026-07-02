"""Smoke-check desktop dashboard layout at 1920x1080.

Verifies the redesigned sidebar/workspace does not create obvious panel overlap.
"""

from __future__ import annotations

import asyncio

from playwright.async_api import async_playwright


URL = "http://127.0.0.1:8083/"


async def box(page, selector: str) -> dict[str, float]:
    loc = page.locator(selector).first
    value = await loc.bounding_box()
    assert value, f"missing layout box: {selector}"
    return value


def right(b: dict[str, float]) -> float:
    return b["x"] + b["width"]


def bottom(b: dict[str, float]) -> float:
    return b["y"] + b["height"]


def no_overlap(a: dict[str, float], b: dict[str, float], label: str) -> None:
    separate = right(a) <= b["x"] or right(b) <= a["x"] or bottom(a) <= b["y"] or bottom(b) <= a["y"]
    assert separate, f"overlap: {label}"


async def check_reg(page) -> None:
    await page.locator('.tab-btn[data-tab="reg"]').click()
    await page.wait_for_selector("#tab-reg.active")
    sidebar = await box(page, ".topbar")
    reg = await box(page, "#tab-reg")
    assert 205 <= sidebar["width"] <= 225, f"sidebar width unexpected: {sidebar['width']}"
    assert reg["x"] >= 210, f"main content starts under sidebar: x={reg['x']}"
    input_card = await box(page, "#tab-reg > .card-input")
    jobs_card = await box(page, "#tab-reg > .card-jobs")
    log_card = await box(page, "#tab-reg > .card-log")
    success_card = await box(page, "#tab-reg > .card-success")
    error_card = await box(page, "#tab-reg > .card-error")
    no_overlap(input_card, jobs_card, "reg input/jobs")
    no_overlap(log_card, success_card, "reg log/success")
    no_overlap(success_card, error_card, "reg success/error")
    assert bottom(error_card) <= 1080, "reg bottom cards overflow viewport"


async def check_session(page) -> None:
    await page.locator('.tab-btn[data-tab="session"]').click()
    await page.wait_for_selector("#tab-session.active")
    input_card = await box(page, "#tab-session > .card-input")
    jobs_card = await box(page, "#tab-session > .card-jobs")
    log_card = await box(page, "#tab-session > .card-log")
    error_card = await box(page, "#tab-session > .card-error")
    no_overlap(input_card, jobs_card, "session input/jobs")
    no_overlap(log_card, error_card, "session log/error")
    assert bottom(error_card) <= 1080, "session bottom cards overflow viewport"


async def check_upi(page) -> None:
    await page.locator('.tab-btn[data-tab="upi"]').click()
    await page.wait_for_selector("#tab-upi.active")
    ribbon = await box(page, "#tab-upi .upi-status-ribbon")
    input_card = await box(page, "#tab-upi > .card-input")
    jobs_card = await box(page, "#tab-upi > .card-jobs")
    log_card = await box(page, "#tab-upi > .card-log")
    success_card = await box(page, "#tab-upi > .card-success")
    error_card = await box(page, "#tab-upi > .card-error")
    assert ribbon["height"] <= 52, f"UPI ribbon too tall: {ribbon['height']}"
    no_overlap(input_card, jobs_card, "upi input/jobs")
    no_overlap(log_card, success_card, "upi log/success")
    no_overlap(success_card, error_card, "upi success/error")
    assert bottom(error_card) <= 1080, "upi bottom cards overflow viewport"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".topbar")
        await check_reg(page)
        await check_session(page)
        await check_upi(page)
        await browser.close()
    print("ok: desktop dashboard layout smoke")


if __name__ == "__main__":
    asyncio.run(main())
