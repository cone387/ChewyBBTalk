import json
import subprocess

devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))['devices']
candidates = [(runtime, device) for runtime, group in devices.items() if 'iOS-26' in runtime
              for device in group if device['name'].startswith('iPhone')]
if not candidates:
    raise RuntimeError('An installed iOS 26 iPhone simulator is required')
runtime, device = sorted(candidates, key=lambda pair: ('Pro Max' in pair[1]['name'], pair[1]['name']))[0]
print('SIMULATOR_UDID=' + device['udid'])
print('SIMULATOR_MODEL=' + device['name'])
print('SIMULATOR_RUNTIME=' + runtime)
