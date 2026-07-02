import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def parse_python(rel: str) -> None:
    ast.parse(read(rel), filename=rel)


def assert_contains(rel: str, needle: str) -> None:
    src = read(rel)
    if needle not in src:
        raise AssertionError(f"{rel}: missing {needle!r}")


def main() -> None:
    for rel in ("web/manager.py", "web/server.py", "db/repositories.py"):
        parse_python(rel)

    assert_contains("db/repositories.py", '"reg.post_reg_check_plan"')
    assert_contains("web/server.py", "post_reg_check_plan: bool | None = None")
    assert_contains("web/server.py", "manager.set_post_reg_check_plan")
    assert_contains("web/manager.py", "self._post_reg_check_plan: bool = True")
    assert_contains("web/manager.py", "async def _post_reg_check_plan_step")
    assert_contains("web/manager.py", "fetch_account_entitlement")
    assert_contains("web/static/index.html", 'id="post-reg-plan-toggle"')
    assert_contains("web/static/app.js", "postRegPlanToggle")
    assert_contains("web/static/app.js", "function renderPlanBadge")
    assert_contains("web/static/style.css", ".plan-badge.plan-error")
    print("[PASS] post-reg check plan wiring OK")


if __name__ == "__main__":
    main()
