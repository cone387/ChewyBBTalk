import json
from pathlib import Path
import subprocess
import sys

container = Path(subprocess.check_output(['xcrun', 'simctl', 'get_app_container', sys.argv[1], 'com.chewy.bbtalk', 'data'], text=True).strip())
storage = container / 'Library/Application Support/com.chewy.bbtalk/RCTAsyncLocalStorage_V1'
storage.mkdir(parents=True, exist_ok=True)
(storage / 'manifest.json').write_text(json.dumps({
    'bbtalk_api_base_url': 'http://localhost:8020', 'bbtalk_theme_key': 'light',
    'privacy_enabled': 'false', 'privacy_locked': 'false',
}), encoding='utf-8')
