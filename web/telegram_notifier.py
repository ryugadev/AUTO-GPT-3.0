"""Telegram notifier — gửi QR UPI + thông tin account qua Telegram Bot API.

Single source of truth cho config là Settings Store (`telegram.bot_token`,
`telegram.chat_id`, `upi.notify_enabled`). Notifier hydrate qua `apply_settings`
lúc startup và cập nhật live qua setters (write-through ở endpoint).

Flow khi 1 job UPI success + có QR:
    1. sendPhoto (PNG) / sendDocument (SVG) — caption gồm amount + thời điểm
       hết hạn theo giờ VN (Asia/Ho_Chi_Minh) và Ấn Độ (Asia/Kolkata).
    2. sendMessage reply vào tin trên — nội dung `email|password|secret` để
       dạng spoiler (tap mới hiện) tránh lộ khi lướt nhanh.

Dùng curl_cffi.AsyncSession (đồng nhất với phần còn lại của repo). Fail-fast,
không nuốt lỗi: trả dict kết quả + raise TelegramNotifyError khi gửi fail để
caller (UpiJobManager) log vào job.
"""
from __future__ import annotations

import html
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

LogFn = Callable[[str], None]

_API_BASE = "https://api.telegram.org/bot{token}/{method}"
_TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")
_TZ_IN = ZoneInfo("Asia/Kolkata")
_TIME_FMT = "%H:%M:%S %d/%m/%Y"

# Format đồng nhất với upi_runner: "[tg]   label[16ch] icon  detail"
_TG_LABEL_WIDTH = 16


def _tg_line(label: str, icon: str, detail: str = "") -> str:
    line = f"[tg]   {label.ljust(_TG_LABEL_WIDTH)}{icon}"
    if detail:
        line += f"  {detail}"
    return line


class TelegramNotifyError(Exception):
    """Gửi Telegram thất bại (HTTP non-200 hoặc API ok=false)."""


    def __init__(
        self,
        message: str,
        *,
        method: str | None = None,
        status_code: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.method = method
        self.status_code = status_code
        self.payload = payload or {}

    @property
    def migrate_to_chat_id(self) -> str | None:
        params = self.payload.get("parameters")
        if not isinstance(params, dict):
            return None
        chat_id = params.get("migrate_to_chat_id")
        return str(chat_id).strip() if chat_id is not None else None


def _fmt_amount(amount: int) -> str:
    if not amount:
        return "-"
    return f"₹{amount / 100:.2f}"


def _fmt_expiry(expires_at: int | None) -> str:
    """Format hết hạn theo giờ VN + IN, mỗi múi 1 dòng. None → 'không xác định'."""
    if not expires_at:
        return "Hết hạn: không xác định"
    vn = datetime.fromtimestamp(expires_at, _TZ_VN).strftime(_TIME_FMT)
    inn = datetime.fromtimestamp(expires_at, _TZ_IN).strftime(_TIME_FMT)
    return f"Hết hạn: {vn} VN\nExpired: {inn} IN"


def _mask_email(email: str | None) -> str:
    """Ẩn email cho hiển thị Telegram: giữ alias trừ 3 ký tự cuối + ẩn domain trừ TLD.

    Ví dụ: ``lantrinh1xyz@hotmail.com`` → ``lantrinh1***@****.com``.
    Alias có ≤ 3 ký tự → toàn bộ thay bằng ``***``.
    Domain không có dot/TLD → thay bằng ``****``.
    Email rỗng / không hợp lệ → ``***@****``.
    """
    if not email or "@" not in email:
        return "***@****"
    local, _, domain = email.partition("@")
    if not local:
        masked_local = "***"
    elif len(local) <= 3:
        masked_local = "***"
    else:
        masked_local = local[:-3] + "***"

    dot = domain.rfind(".")
    if dot <= 0 or dot == len(domain) - 1:
        masked_domain = "****"
    else:
        masked_domain = "****" + domain[dot:]

    return f"{masked_local}@{masked_domain}"


class TelegramNotifier:
    """Quản lý config + gửi thông báo Telegram. Singleton qua get_telegram_notifier()."""

    def __init__(self) -> None:
        self._enabled: bool = False
        self._bot_token: str | None = None
        self._chat_id: str | None = None
        self._groups: list[dict[str, Any]] = []

    # ── Config ──────────────────────────────────────────────────────────
    def apply_settings(self, settings: dict[str, Any]) -> None:
        """Hydrate từ settings dict lúc startup. Chỉ set khi key có mặt."""
        if "upi.notify_enabled" in settings:
            self._enabled = bool(settings["upi.notify_enabled"])
        if "telegram.bot_token" in settings:
            token = settings["telegram.bot_token"]
            self._bot_token = token.strip() if isinstance(token, str) and token.strip() else None
        if "telegram.chat_id" in settings:
            chat = settings["telegram.chat_id"]
            self._chat_id = chat.strip() if isinstance(chat, str) and chat.strip() else None
        if "telegram.groups" in settings:
            self._groups = self._normalize_groups(settings["telegram.groups"])

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = bool(enabled)

    def set_credentials(self, bot_token: str | None, chat_id: str | None) -> None:
        self._bot_token = bot_token.strip() if isinstance(bot_token, str) and bot_token.strip() else None
        self._chat_id = chat_id.strip() if isinstance(chat_id, str) and chat_id.strip() else None

    @staticmethod
    def _normalize_groups(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            chat_id = str(item.get("chat_id") or "").strip()
            if not chat_id or chat_id in seen:
                continue
            seen.add(chat_id)
            out.append({
                "chat_id": chat_id,
                "title": str(item.get("title") or chat_id)[:120],
                "type": str(item.get("type") or "group"),
                "bot_token": str(item.get("bot_token") or "").strip(),
                "enabled": bool(item.get("enabled", True)),
                "qr_sent": max(int(item.get("qr_sent") or 0), 0),
                "plus_count": max(int(item.get("plus_count") or 0), 0),
                "qr_messages": item.get("qr_messages") if isinstance(item.get("qr_messages"), dict) else {},
                "last_seen_at": int(item.get("last_seen_at") or 0),
            })
        return out

    def set_groups(self, groups: list[dict[str, Any]] | None) -> None:
        self._groups = self._normalize_groups(groups)

    def groups(self) -> list[dict[str, Any]]:
        return [dict(g) for g in self._groups]

    def selected_group(self) -> dict[str, Any] | None:
        for group in self._groups:
            if group.get("chat_id") == self._chat_id:
                return dict(group)
        return None

    def group_for(self, chat_id: str | None) -> dict[str, Any] | None:
        target = str(chat_id or "").strip()
        for group in self._groups:
            if group.get("chat_id") == target:
                return group
        return None

    def bot_token_for(self, chat_id: str | None = None) -> str | None:
        group = self.group_for(chat_id or self._chat_id)
        token = str((group or {}).get("bot_token") or "").strip()
        return token or self._bot_token

    def upsert_group(self, group: dict[str, Any]) -> None:
        chat_id = str(group.get("chat_id") or "").strip()
        if not chat_id:
            return
        now = int(time.time())
        for existing in self._groups:
            if existing.get("chat_id") == chat_id:
                existing["title"] = str(group.get("title") or existing.get("title") or chat_id)[:120]
                existing["type"] = str(group.get("type") or existing.get("type") or "group")
                if "bot_token" in group:
                    existing["bot_token"] = str(group.get("bot_token") or "").strip()
                if "qr_sent" in group:
                    existing["qr_sent"] = max(0, int(group.get("qr_sent") or 0))
                if "plus_count" in group:
                    existing["plus_count"] = max(0, int(group.get("plus_count") or 0))
                existing["last_seen_at"] = now
                return
        self._groups.append({
            "chat_id": chat_id,
            "title": str(group.get("title") or chat_id)[:120],
            "type": str(group.get("type") or "group"),
            "bot_token": str(group.get("bot_token") or "").strip(),
            "enabled": True,
            "qr_sent": 0,
            "plus_count": 0,
            "qr_messages": {},
            "last_seen_at": now,
        })

    def migrate_chat_id(self, old_chat_id: str | None, new_chat_id: str) -> None:
        old_id = str(old_chat_id or "").strip()
        new_id = str(new_chat_id or "").strip()
        if not new_id:
            return
        now = int(time.time())
        migrated = False
        for group in self._groups:
            if group.get("chat_id") == old_id:
                group["chat_id"] = new_id
                group["type"] = "supergroup"
                group["last_seen_at"] = now
                migrated = True
                break
        if not migrated:
            self.upsert_group({
                "chat_id": new_id,
                "title": new_id,
                "type": "supergroup",
            })
        if self._chat_id == old_id:
            self._chat_id = new_id

    def set_group_enabled(self, chat_id: str, enabled: bool) -> None:
        for group in self._groups:
            if group.get("chat_id") == chat_id:
                group["enabled"] = bool(enabled)
                return

    def reset_group_stats(self, chat_id: str | None = None) -> None:
        for group in self._groups:
            if chat_id is None or group.get("chat_id") == chat_id:
                group["qr_sent"] = 0
                group["plus_count"] = 0
                group["qr_messages"] = {}

    def mark_qr_sent(self, chat_id: str | None = None, *, job_id: str | None = None,
                     message_id: int | None = None) -> None:
        target = chat_id or self._chat_id
        for group in self._groups:
            if group.get("chat_id") == target:
                group["qr_sent"] = int(group.get("qr_sent") or 0) + 1
                if job_id and message_id:
                    messages = group.get("qr_messages")
                    if not isinstance(messages, dict):
                        messages = {}
                    messages[str(job_id)] = int(message_id)
                    group["qr_messages"] = messages
                return

    def qr_message_id_for(self, chat_id: str | None, job_id: str | None) -> int | None:
        group = self.group_for(chat_id or self._chat_id)
        messages = (group or {}).get("qr_messages")
        if not isinstance(messages, dict) or not job_id:
            return None
        try:
            return int(messages.get(str(job_id)) or 0) or None
        except (TypeError, ValueError):
            return None

    def mark_plus(self, chat_id: str | None = None) -> None:
        target = chat_id or self._chat_id
        for group in self._groups:
            if group.get("chat_id") == target:
                group["plus_count"] = int(group.get("plus_count") or 0) + 1
                return

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def configured(self) -> bool:
        return bool(self._chat_id and self.bot_token_for(self._chat_id))

    @property
    def bot_ready(self) -> bool:
        return bool(self._bot_token)

    @property
    def bot_token(self) -> str | None:
        return self._bot_token

    @property
    def chat_id(self) -> str | None:
        return self._chat_id

    # ── Telegram API ────────────────────────────────────────────────────
    async def _call(self, sess: Any, method: str, *, data: dict[str, Any],
                    bot_token: str | None = None,
                    multipart: Any | None = None) -> dict[str, Any]:
        """Gọi 1 method Telegram Bot API.

        ``data``: dict text fields (chat_id, caption, parse_mode, text, ...).
        ``multipart``: ``curl_cffi.CurlMime`` instance khi gửi kèm file
            (sendPhoto/sendDocument). Khi multipart != None, phải gắn cả text
            fields vào multipart luôn — curl_cffi không cho dùng đồng thời
            ``data`` + ``multipart``. Caller phụ trách chuyện này; method này
            chỉ nhận MỘT trong hai.
        """
        token = (bot_token or self._bot_token or "").strip()
        if not token:
            raise TelegramNotifyError("bot_token chưa cấu hình")
        url = _API_BASE.format(token=token, method=method)
        if multipart is not None:
            resp = await sess.post(url, multipart=multipart, timeout=30)
        else:
            resp = await sess.post(url, data=data, timeout=30)
        try:
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise TelegramNotifyError(
                f"{method} HTTP {resp.status_code}: non-JSON response",
                method=method,
                status_code=resp.status_code,
            ) from exc
        if resp.status_code != 200 or not payload.get("ok"):
            desc = payload.get("description") if isinstance(payload, dict) else None
            raise TelegramNotifyError(
                f"{method} failed: HTTP {resp.status_code} {desc or payload}",
                method=method,
                status_code=resp.status_code,
                payload=payload if isinstance(payload, dict) else {},
            )
        return payload

    async def _send_message_with_migration(
        self,
        sess: Any,
        *,
        chat_id: str,
        bot_token: str | None,
        data: dict[str, Any],
        log: LogFn | None = None,
    ) -> dict[str, Any]:
        """sendMessage + auto-update chat_id khi Telegram nâng group lên supergroup."""
        target_chat_id = str(chat_id or "").strip()
        payload = dict(data)
        payload["chat_id"] = target_chat_id
        try:
            return await self._call(sess, "sendMessage", bot_token=bot_token, data=payload)
        except TelegramNotifyError as exc:
            migrate_to = exc.migrate_to_chat_id
            if not migrate_to:
                raise
            self.migrate_chat_id(target_chat_id, migrate_to)
            retry_payload = dict(payload)
            retry_payload["chat_id"] = migrate_to
            if log:
                log(_tg_line("migrate", "->", f"chat_id {migrate_to}"))
            return await self._call(sess, "sendMessage", bot_token=bot_token, data=retry_payload)

    async def send_test(self, *, log: LogFn | None = None) -> dict[str, Any]:
        """Gửi 1 tin test để verify token + chat_id."""
        if not self.configured:
            raise TelegramNotifyError("bot_token/chat_id chưa cấu hình")
        from curl_cffi.requests import AsyncSession

        text = (
            "✅ <b>gpt_signup_hybrid</b> — Telegram đã kết nối.\n"
            f"<i>{datetime.now(_TZ_VN).strftime(_TIME_FMT)} (VN)</i>"
        )
        async with AsyncSession() as sess:
            payload = await self._send_message_with_migration(
                sess,
                chat_id=str(self._chat_id),
                bot_token=self.bot_token_for(self._chat_id),
                data={"text": text, "parse_mode": "HTML"},
                log=log,
            )
        if log:
            log(_tg_line("test", "✓", "sendMessage OK"))
        return payload

    async def sync_groups_from_updates(self) -> list[dict[str, Any]]:
        if not self._bot_token:
            raise TelegramNotifyError("bot_token chưa cấu hình")
        from curl_cffi.requests import AsyncSession

        async with AsyncSession() as sess:
            payload = await self._call(
                sess,
                "getUpdates",
                data={"allowed_updates": '["message","my_chat_member"]'},
            )
        for upd in payload.get("result") or []:
            if not isinstance(upd, dict):
                continue
            msg = upd.get("message") if isinstance(upd.get("message"), dict) else None
            member = upd.get("my_chat_member") if isinstance(upd.get("my_chat_member"), dict) else None
            chat = (msg or member or {}).get("chat")
            if not isinstance(chat, dict):
                continue
            chat_type = str(chat.get("type") or "")
            if chat_type not in ("group", "supergroup", "channel"):
                continue
            self.upsert_group({
                "chat_id": str(chat.get("id") or ""),
                "title": str(chat.get("title") or chat.get("username") or chat.get("id") or ""),
                "type": chat_type,
            })
        return self.groups()

    async def notify_upi_qr(
        self,
        *,
        email: str,
        password: str,
        secret: str | None,
        amount: int,
        qr_path: str | None,
        qr_expires_at: int | None,
        checkout_session: str | None = None,
        return_url: str | None = None,
        payment_link: str | None = None,
        job_id: str | None = None,
        log: LogFn | None = None,
    ) -> int | bool:
        """Gửi QR (caption gồm email masked + thời điểm hết hạn). Combo reply
        hiện đang DISABLED (xem comment block trong body) — caller chỉ nhận
        ảnh QR, copy combo lấy từ Output pane trên web UI.

        Returns:
            True nếu đã gửi; False nếu skip (tắt toggle / chưa cấu hình / không có QR).
        Raises:
            TelegramNotifyError nếu gửi thất bại.
        """
        def _log(msg: str) -> None:
            if log:
                log(msg)

        if not self._enabled:
            return False
        bot_token = self.bot_token_for(self._chat_id)
        if not self._chat_id or not bot_token:
            _log(_tg_line("skip", "—", "chưa cấu hình bot_token/chat_id"))
            return False
        selected = self.selected_group()
        if selected and not selected.get("enabled", True):
            _log(_tg_line("skip", "-", f"group {selected.get('title')} dang tat"))
            return False
        if not qr_path:
            _log(_tg_line("skip", "—", "job không có QR file"))
            return False
        path = Path(qr_path)
        if not path.exists():
            _log(_tg_line("skip", "—", f"QR file không tồn tại: {path.name}"))
            return False

        is_svg = path.suffix.lower() == ".svg"
        # Caption gọn: tiêu đề + email masked + 2 dòng hết hạn (VN/IN). Bỏ
        # amount/checkout — combo đầy đủ ở tin reply (code block tap-to-copy).
        caption_lines = [
            "🟢 <b>UPI QR — ChatGPT Plus (IN)</b>",
            f"Email: {html.escape(_mask_email(email))}",
            _fmt_expiry(qr_expires_at),
        ]
        # Link thanh toán hosted (payments.stripe.com/upi/instructions/...) —
        # mở ra trang QR + nút mở app UPI. Hữu ích khi user trả bằng điện thoại.
        if payment_link:
            caption_lines.append(
                f'💳 <a href="{html.escape(payment_link, quote=True)}">Link thanh toán UPI</a>'
            )
        caption = "\n".join(caption_lines)

        # ─── DISABLED: combo reply ─────────────────────────────────────────
        # Hiện tại không gửi tin reply chứa `email|password|secret` (spam channel
        # + đã có Output pane trên web UI để copy). Giữ code dạng comment để
        # bật lại sau bằng cách uncomment block này + block sendMessage bên dưới.
        # combo = f"{email}|{password}|{secret or ''}"
        # # Vừa spoiler vừa code: ẩn sau lớp spoiler, tap mở ra là code block
        # # với nút Copy (monospace). Telegram cho phép lồng <tg-spoiler> + <pre>.
        # reply_text = f"<tg-spoiler><pre>{html.escape(combo)}</pre></tg-spoiler>"
        # ──────────────────────────────────────────────────────────────────

        from curl_cffi import CurlMime
        from curl_cffi.requests import AsyncSession

        content = path.read_bytes()
        media_field = "document" if is_svg else "photo"
        method = "sendDocument" if is_svg else "sendPhoto"
        mime_type = "image/svg+xml" if is_svg else "image/png"

        def _build_media_multipart(chat_id: str) -> CurlMime:
            mp = CurlMime()
            mp.addpart(name="chat_id", data=str(chat_id).encode("utf-8"))
            mp.addpart(name="caption", data=caption.encode("utf-8"))
            mp.addpart(name="parse_mode", data=b"HTML")
            mp.addpart(
                name=media_field,
                content_type=mime_type,
                filename=path.name,
                data=content,
            )
            return mp

        # Build multipart: tất cả text fields PHẢI gắn vào CurlMime cùng file
        # vì curl_cffi không cho dùng đồng thời data= + multipart=.
        target_chat_id = str(self._chat_id)
        mp = CurlMime()
        mp.addpart(name="chat_id", data=target_chat_id.encode("utf-8"))
        mp.addpart(name="caption", data=caption.encode("utf-8"))
        mp.addpart(name="parse_mode", data=b"HTML")
        mp.addpart(
            name=media_field,
            content_type=mime_type,
            filename=path.name,
            data=content,
        )

        async with AsyncSession() as sess:
            try:
                try:
                    media_payload = await self._call(sess, method, data={}, bot_token=bot_token, multipart=mp)
                except TelegramNotifyError as exc:
                    migrate_to = exc.migrate_to_chat_id
                    if not migrate_to:
                        raise
                    mp.close()
                    self.migrate_chat_id(target_chat_id, migrate_to)
                    target_chat_id = migrate_to
                    _log(_tg_line("migrate", "↪", f"chat_id {migrate_to}"))
                    mp = _build_media_multipart(target_chat_id)
                    media_payload = await self._call(sess, method, data={}, bot_token=bot_token, multipart=mp)
            finally:
                mp.close()
            message_id = (
                media_payload.get("result", {}).get("message_id")
                if isinstance(media_payload.get("result"), dict) else None
            )
            # ─── DISABLED: combo reply (uncomment để bật lại) ──────────────
            # message_id = (
            #     media_payload.get("result", {}).get("message_id")
            #     if isinstance(media_payload.get("result"), dict) else None
            # )
            # reply_data: dict[str, Any] = {
            #     "chat_id": self._chat_id,
            #     "text": reply_text,
            #     "parse_mode": "HTML",
            # }
            # if message_id is not None:
            #     reply_data["reply_to_message_id"] = message_id
            # await self._call(sess, "sendMessage", data=reply_data)
            # ──────────────────────────────────────────────────────────────
            del media_payload  # currently unused — giữ block fetch để keep
            # parity nếu uncomment reply ở trên.

        _log(_tg_line("sent", "✓", "QR only (combo reply disabled)"))
        self.mark_qr_sent(target_chat_id, job_id=job_id, message_id=message_id)
        return int(message_id) if message_id else True

    async def notify_plus_success(
        self,
        *,
        email: str,
        job_id: str,
        plan: str | None = "plus",
        chat_id: str | None = None,
        reply_to_message_id: int | None = None,
        log: LogFn | None = None,
    ) -> bool:
        """Gửi tin xác nhận account đã lên Plus về group Telegram."""
        if not self._enabled:
            return False
        target_chat_id = (chat_id or self._chat_id or "").strip()
        bot_token = self.bot_token_for(target_chat_id)
        if not bot_token or not target_chat_id:
            raise TelegramNotifyError("bot_token/chat_id chưa cấu hình")

        text = "\n".join([
            "✅ <b>Tài khoản đã lên PLUS</b>",
            f"Job: <code>{html.escape(job_id)}</code>",
            "Email:",
            f"<code>{html.escape(email)}</code>",
            f"Plan: <code>{html.escape(plan or 'plus')}</code>",
        ])

        from curl_cffi.requests import AsyncSession

        async with AsyncSession() as sess:
            data = {
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": "true",
            }
            if reply_to_message_id:
                data["reply_to_message_id"] = str(int(reply_to_message_id))
                data["allow_sending_without_reply"] = "true"
            await self._send_message_with_migration(
                sess,
                chat_id=target_chat_id,
                bot_token=bot_token,
                data=data,
                log=log,
            )
        if log:
            log(_tg_line("plus", "✓", f"sent plus notify to {target_chat_id}"))
        return True

    async def send_group_test(self, chat_id: str) -> dict[str, Any]:
        target_chat_id = str(chat_id or "").strip()
        bot_token = self.bot_token_for(target_chat_id)
        if not bot_token or not target_chat_id:
            raise TelegramNotifyError("bot_token/chat_id chÆ°a cáº¥u hÃ¬nh")
        group = self.group_for(target_chat_id) or {}
        title = str(group.get("title") or target_chat_id)
        text = "\n".join([
            "OK Telegram group",
            f"Group: {html.escape(title)}",
            f"Chat ID: {html.escape(target_chat_id)}",
        ])

        from curl_cffi.requests import AsyncSession

        async with AsyncSession() as sess:
            return await self._send_message_with_migration(
                sess,
                chat_id=target_chat_id,
                bot_token=bot_token,
                data={
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": "true",
                },
            )

    async def send_group_stats(self, chat_id: str) -> dict[str, Any]:
        target_chat_id = str(chat_id or "").strip()
        group = self.group_for(target_chat_id)
        if group is None:
            raise TelegramNotifyError("group chÆ°a tá»“n táº¡i")
        bot_token = self.bot_token_for(target_chat_id)
        if not bot_token:
            raise TelegramNotifyError("bot_token chÆ°a cáº¥u hÃ¬nh")
        title = str(group.get("title") or target_chat_id)
        sent = int(group.get("qr_sent") or 0)
        plus = int(group.get("plus_count") or 0)
        rate = round((plus / sent) * 100) if sent else 0
        text = "\n".join([
            "Thong ke QR UPI",
            f"Group: {html.escape(title)}",
            f"QR da gui: {sent}",
            f"Len Plus: {plus}",
            f"Ty le: {rate}%",
        ])

        from curl_cffi.requests import AsyncSession

        async with AsyncSession() as sess:
            return await self._send_message_with_migration(
                sess,
                chat_id=target_chat_id,
                bot_token=bot_token,
                data={
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": "true",
                },
            )


# ── Singleton ───────────────────────────────────────────────────────────
_notifier: TelegramNotifier | None = None


def get_telegram_notifier() -> TelegramNotifier:
    global _notifier  # noqa: PLW0603
    if _notifier is None:
        _notifier = TelegramNotifier()
    return _notifier
