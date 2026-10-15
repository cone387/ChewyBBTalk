import json
from pathlib import Path
import subprocess
import sys

# iOS 26's password-saving service has no accessible WebView. Maestro's
# unconditional SafariViewService snapshot crashes XCTest after a valid login.
# Match Appium's simulator-only AutoFill setting; production credentials and
# the application's secure text/password manager behavior remain unchanged.
subprocess.run([
    'xcrun', 'simctl', 'spawn', sys.argv[1], 'defaults', 'write',
    'com.apple.WebUI', 'AutoFillPasswords', '-int', '0',
], check=True)

container = Path(subprocess.check_output(['xcrun', 'simctl', 'get_app_container', sys.argv[1], 'com.chewy.bbtalk', 'data'], text=True).strip())
storage = container / 'Library/Application Support/com.chewy.bbtalk/RCTAsyncLocalStorage_V1'
storage.mkdir(parents=True, exist_ok=True)
(storage / 'manifest.json').write_text(json.dumps({
    'bbtalk_api_base_url': 'http://localhost:8020', 'bbtalk_theme_key': 'light',
    'privacy_enabled': 'false', 'privacy_locked': 'false',
}), encoding='utf-8')
