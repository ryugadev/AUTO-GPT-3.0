from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "web" / "static" / "style.css"


def main() -> None:
    src = CSS.read_text(encoding="utf-8")
    required = [
        "--primary: #7c7df0",
        "@keyframes brandRing",
        "@keyframes tabUnderline",
        "@keyframes tabFadeIn",
        "@keyframes jobEnter",
        "@keyframes modalPop",
        ".gpt-toast.gpt-toast-show",
        ".settings-nav-item.active",
        ".upi-plan-badge.upi-plan-plus",
        "@media (prefers-reduced-motion: reduce)",
    ]
    missing = [item for item in required if item not in src]
    if missing:
        raise AssertionError("missing visual refresh CSS: " + ", ".join(missing))
    print("[PASS] visual refresh CSS selectors present")


if __name__ == "__main__":
    main()
