from __future__ import annotations

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def parse(path: str) -> None:
    ast.parse(read(path), filename=path)


def main() -> None:
    for path in ("web/manager.py", "web/server.py", "db/repositories.py"):
        parse(path)

    manager = read("web/manager.py")
    server = read("web/server.py")
    repos = read("db/repositories.py")
    session_js = read("web/static/session.js")

    assert "SessionJobManager(max_concurrent=5" in manager
    assert '"session.max_concurrent"' in manager
    assert 'settings_writes["session.max_concurrent"] = clamped' in server
    assert '"session.max_concurrent"' in repos
    assert "maxConcurrent: 5" in session_js
    assert "JSON.stringify({ max_concurrent: 5 })" in session_js

    print("ok: session concurrency defaults to 5")


if __name__ == "__main__":
    main()
