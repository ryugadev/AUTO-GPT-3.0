"""Check Telegram group -> supergroup chat_id migration handling."""

from pathlib import Path
import asyncio
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def contains(path: str, needle: str) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    assert needle in text, f"missing {needle!r} in {path}"


from web.telegram_notifier import TelegramNotifier, TelegramNotifyError  # noqa: E402


err = TelegramNotifyError(
    "sendPhoto failed",
    method="sendPhoto",
    status_code=400,
    payload={
        "ok": False,
        "description": "Bad Request: group chat was upgraded to a supergroup chat",
        "parameters": {"migrate_to_chat_id": -1001234567890},
    },
)
assert err.migrate_to_chat_id == "-1001234567890"

n = TelegramNotifier()
n.set_credentials("123:ABC", "-5380146103")
n.set_groups([{
    "chat_id": "-5380146103",
    "title": "UPI SCAN 3",
    "type": "group",
    "enabled": True,
    "qr_sent": 4,
    "plus_count": 2,
}])
n.migrate_chat_id("-5380146103", "-1001234567890")

assert n.chat_id == "-1001234567890"
groups = n.groups()
assert len(groups) == 1
assert groups[0]["chat_id"] == "-1001234567890"
assert groups[0]["type"] == "supergroup"
assert groups[0]["qr_sent"] == 4
assert groups[0]["plus_count"] == 2


class MigratingNotifier(TelegramNotifier):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[dict] = []

    async def _call(self, sess, method, *, data, bot_token=None, multipart=None):
        self.calls.append({"method": method, "data": dict(data)})
        if len(self.calls) == 1:
            raise TelegramNotifyError(
                "sendMessage failed",
                method="sendMessage",
                status_code=400,
                payload={
                    "ok": False,
                    "description": "Bad Request: group chat was upgraded to a supergroup chat",
                    "parameters": {"migrate_to_chat_id": -1009876543210},
                },
            )
        return {"ok": True, "result": {"message_id": 77}}


async def check_send_message_migration() -> None:
    notifier = MigratingNotifier()
    notifier.set_credentials("123:ABC", "-5380146103")
    notifier.set_groups([{
        "chat_id": "-5380146103",
        "title": "UPI SCAN 3",
        "type": "group",
        "enabled": True,
    }])
    result = await notifier._send_message_with_migration(
        object(),
        chat_id="-5380146103",
        bot_token="123:ABC",
        data={"text": "test"},
    )
    assert result["ok"] is True
    assert notifier.chat_id == "-1009876543210"
    assert notifier.groups()[0]["chat_id"] == "-1009876543210"
    assert notifier.groups()[0]["type"] == "supergroup"
    assert notifier.calls[0]["data"]["chat_id"] == "-5380146103"
    assert notifier.calls[1]["data"]["chat_id"] == "-1009876543210"


asyncio.run(check_send_message_migration())

contains("web/telegram_notifier.py", "migrate_to_chat_id")
contains("web/telegram_notifier.py", "_send_message_with_migration")
contains("web/telegram_notifier.py", "self.migrate_chat_id(target_chat_id, migrate_to)")
contains("web/server.py", '"telegram.chat_id": n.chat_id')

print("ok: telegram migrate_to_chat_id handled")
