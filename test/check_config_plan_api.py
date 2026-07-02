import json
import re
import urllib.request


BASE = "http://127.0.0.1:8083"


def main() -> None:
    html = urllib.request.urlopen(BASE + "/", timeout=10).read().decode("utf-8")
    match = re.search(r'<meta name="auth-token" content="([^"]+)"', html)
    if not match:
        raise AssertionError("auth token meta not found")
    token = match.group(1)
    req = urllib.request.Request(BASE + "/api/config", headers={"X-API-Token": token})
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode("utf-8"))
    if "post_reg_check_plan" not in data:
        raise AssertionError(f"missing post_reg_check_plan in /api/config: {data}")
    if not isinstance(data["post_reg_check_plan"], bool):
        raise AssertionError(f"post_reg_check_plan must be bool: {data}")
    print("[PASS] /api/config exposes post_reg_check_plan")


if __name__ == "__main__":
    main()
