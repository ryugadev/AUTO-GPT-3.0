from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def parse(path: str) -> None:
    ast.parse((ROOT / path).read_text(encoding="utf-8"), filename=path)


def contains(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    assert needle in text, f"{needle!r} missing from {path}"


def main() -> None:
    for path in [
        "web/telegram_notifier.py",
        "web/server.py",
        "web/manager.py",
        "db/repositories.py",
    ]:
        parse(path)

    for path in [
        "web/static/upi.js",
        "web/static/settings_panel.js",
        "web/static/index.html",
        "web/server.py",
    ]:
        contains(path, "telegram")
    contains("web/server.py", "AddTelegramGroupRequest")
    contains("web/static/settings_panel.js", "telegram-add-group")
    contains("web/static/settings_panel.js", "telegram-row-token")
    contains("web/static/settings_panel.js", 'data-tg-action="stats"')
    contains("web/static/settings_panel.js", '"/api/telegram/groups/stats"')
    contains("web/static/settings_panel.js", '"/api/telegram/groups/reset"')
    contains("web/static/settings_panel.js", "telegram-stat-input")
    contains("web/static/settings_panel.js", "startTelegramAutoRefresh")
    contains("web/static/settings_panel.js", 'closest("[data-tg-action]")')
    contains("web/static/settings_panel.js", "qr_sent: sentInput")
    contains("web/static/settings_panel.js", "plus_count: plusInput")
    contains("web/server.py", "send_telegram_group_stats")
    contains("web/server.py", "send_telegram_group_stats_by_body")
    contains("web/server.py", "reset_telegram_group_stats_by_body")
    contains("web/server.py", "qr_sent: int | None")
    contains("web/server.py", "plus_count: int | None")
    contains("web/server.py", "test_telegram_group")
    contains("web/telegram_notifier.py", "send_group_stats")
    contains("web/telegram_notifier.py", "send_group_test")
    contains("web/telegram_notifier.py", "notify_plus_success")
    contains("web/telegram_notifier.py", "reply_to_message_id")
    contains("web/manager.py", "_notify_plus_if_needed")
    contains("web/manager.py", "notify_plus_success")

    from web.telegram_notifier import TelegramNotifier
    from web.server import app
    from db.repositories import _validate_type_constraint

    groups = [{
        "chat_id": "-5486365211",
        "title": "UPI SCAN 1",
        "type": "group",
        "bot_token": "456:DEF",
        "enabled": True,
        "qr_sent": 0,
        "plus_count": 0,
        "qr_messages": {"job123": 77},
    }]
    _validate_type_constraint("telegram.groups", groups)
    n = TelegramNotifier()
    n.apply_settings({
        "telegram.bot_token": "123:ABC",
        "telegram.chat_id": "-5486365211",
        "telegram.groups": groups,
        "upi.notify_enabled": True,
    })
    assert n.configured
    assert n.selected_group()["title"] == "UPI SCAN 1"
    assert n.bot_token_for("-5486365211") == "456:DEF"
    assert n.qr_message_id_for("-5486365211", "job123") == 77
    n.mark_qr_sent(job_id="job456", message_id=88)
    n.mark_plus("-5486365211")
    saved = n.groups()[0]
    assert saved["qr_sent"] == 1
    assert saved["plus_count"] == 1
    n.upsert_group({"chat_id": "-5486365211", "qr_sent": 12, "plus_count": 7})
    saved = n.groups()[0]
    assert saved["qr_sent"] == 12
    assert saved["plus_count"] == 7
    assert saved["qr_messages"]["job456"] == 88
    n.set_group_enabled("-5486365211", False)
    assert n.groups()[0]["enabled"] is False
    n.reset_group_stats("-5486365211")
    assert n.groups()[0]["qr_sent"] == 0
    assert n.groups()[0]["plus_count"] == 0
    assert n.groups()[0]["qr_messages"] == {}
    assert hasattr(n, "notify_plus_success")
    paths = [route.path for route in app.routes if hasattr(route, "path")]
    generic = paths.index("/api/telegram/groups/{chat_id:path}")
    assert paths.count("/api/telegram/groups/reset") == 1
    assert paths.index("/api/telegram/groups/stats") < generic
    assert paths.index("/api/telegram/groups/reset") < generic
    assert paths.index("/api/telegram/groups/{chat_id:path}/test") < generic
    assert paths.index("/api/telegram/groups/{chat_id:path}/stats") < generic
    assert paths.index("/api/telegram/groups/{chat_id:path}/reset") < generic
    assert paths.index("/api/telegram/groups/reset-all") < generic

    print("ok: telegram group routing wired")


if __name__ == "__main__":
    main()
