from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def assert_parse(path: str) -> None:
    ast.parse((ROOT / path).read_text(encoding="utf-8"), filename=path)


def assert_contains(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    assert needle in text, f"{needle!r} missing from {path}"


def main() -> None:
    for path in [
        "mail_providers.py",
        "models.py",
        "signup.py",
        "web/mail_modes.py",
        "web/server.py",
    ]:
        assert_parse(path)

    for path in [
        "models.py",
        "signup.py",
        "web/mail_modes.py",
        "web/server.py",
        "web/static/app.js",
    ]:
        assert_contains(path, "icloud_api")

    from mail_providers import IcloudApiMailProvider, build_provider_icloud_api
    from web.mail_modes import get_registry, get_spec

    messages = IcloudApiMailProvider._normalize({
        "data": [{"subject": "OpenAI verification", "body": "Your code is 123456"}]
    })
    assert len(messages) == 1
    assert IcloudApiMailProvider._extract_from_msg(messages[0]) == "123456"
    assert IcloudApiMailProvider._extract_from_msg({"otp": "654321"}) == "654321"

    provider = build_provider_icloud_api(
        email="pedicab_21_wraiths@icloud.com",
        rental_token="TDJA7XURS2H4",
    )
    assert provider.email == "pedicab_21_wraiths@icloud.com"
    assert provider.rental_token == "TDJA7XURS2H4"

    registry = get_registry()
    assert "icloud_api" in registry
    spec = get_spec("icloud_api")

    parsed = spec.parse_line("pedicab_21_wraiths@icloud.com|TDJA7XURS2H4")
    req = spec.build_request(
        parsed,
        worker_config={},
        password="Passw0rd!123",
        headless=True,
        keep_browser_open=False,
        proxy=None,
        reg_mode="pure_request",
    )
    assert req.email == "pedicab_21_wraiths@icloud.com"
    assert req.mail_provider == "icloud_api"
    assert req.icloud_api_rental_token == "TDJA7XURS2H4"

    parsed_shared = spec.parse_line("pedicab_21_wraiths@icloud.com")
    req_shared = spec.build_request(
        parsed_shared,
        worker_config={
            "inbox_url": "https://mail.congas.uk/api/rentals/inbox",
            "rental_token": "SHARED_TOKEN",
        },
        password=None,
        headless=True,
        keep_browser_open=False,
        proxy=None,
        reg_mode="pure_request",
    )
    assert req_shared.icloud_api_inbox_url == "https://mail.congas.uk/api/rentals/inbox"
    assert req_shared.icloud_api_rental_token == "SHARED_TOKEN"

    print("ok: icloud_api mode wired")


if __name__ == "__main__":
    main()
