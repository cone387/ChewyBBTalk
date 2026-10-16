"""Install one app's existing distribution credentials in an ephemeral macOS runner."""
import base64
import json
import hashlib
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import sys

TEAM = '3GB4JPZU5X'
BUNDLE = 'com.chewy.bbtalk'
temporary = Path(os.environ['RUNNER_TEMP']).resolve()
work = temporary / 'bbtalk-signing'
profile_roots = [Path.home() / 'Library/MobileDevice/Provisioning Profiles',
                 Path.home() / 'Library/Developer/Xcode/UserData/Provisioning Profiles']

if '--cleanup' in sys.argv:
    manifest = work / 'profile-id.txt'
    if manifest.exists():
        uid = manifest.read_text().strip()
        if re.fullmatch(r'[A-Fa-f0-9-]{36}', uid):
            for folder in profile_roots:
                (folder / f'{uid}.mobileprovision').unlink(missing_ok=True)
    if work.exists():
        if work.is_symlink() or work.resolve().parent != temporary:
            raise RuntimeError('Unexpected signing directory')
        shutil.rmtree(work)
    sys.exit(0)


def security(*args):
    result = subprocess.run(['security', *args], capture_output=True)
    if result.returncode:
        # Never echo argv or stderr: the import/unlock commands contain passwords.
        raise RuntimeError(f'Signing operation failed: security {args[0]}')
    return result.stdout


credentials = json.loads(os.environ.pop('IOS_SIGNING_BUNDLE'))
if credentials['bundleIdentifier'] != BUNDLE or credentials['teamId'] != TEAM:
    raise RuntimeError('Credentials do not match the production application')
work.mkdir(mode=0o700)
certificate = work / 'distribution.p12'
profile = work / 'profile.mobileprovision'
certificate.write_bytes(base64.b64decode(credentials['certificateP12'], validate=True))
profile.write_bytes(base64.b64decode(credentials['provisioningProfile'], validate=True))
certificate.chmod(0o600)
profile.chmod(0o600)
decoded = plistlib.loads(security('cms', '-D', '-i', str(profile)))
uid = decoded['UUID']
entitlements = decoded['Entitlements']
if (not re.fullmatch(r'[A-Fa-f0-9-]{36}', uid)
        or entitlements.get('application-identifier') != f'{TEAM}.{BUNDLE}'
        or entitlements.get('get-task-allow')
        or decoded.get('ProvisionedDevices') or decoded.get('ProvisionsAllDevices')
        or TEAM not in decoded['TeamIdentifier']):
    raise RuntimeError('Expected this app\'s App Store distribution profile')
(work / 'profile-id.txt').write_text(uid)
for folder in profile_roots:
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(profile, folder / f'{uid}.mobileprovision')

keychain = work / 'signing.keychain-db'
password = secrets.token_urlsafe(32)
security('create-keychain', '-p', password, str(keychain))
security('set-keychain-settings', '-lut', '21600', str(keychain))
security('unlock-keychain', '-p', password, str(keychain))
security('import', str(certificate), '-P', credentials['certificatePassword'], '-k', str(keychain), '-T', '/usr/bin/codesign', '-T', '/usr/bin/security')
security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, str(keychain))
security('list-keychains', '-d', 'user', '-s', str(keychain), str(Path.home() / 'Library/Keychains/login.keychain-db'))
identities = set(re.findall(r'\b[A-F0-9]{40}\b', security('find-identity', '-v', '-p', 'codesigning', str(keychain)).decode()))
profile_certificates = {hashlib.sha1(der).hexdigest().upper() for der in decoded['DeveloperCertificates']}
matches = identities & profile_certificates
if len(matches) != 1:
    raise RuntimeError('Expected one valid signing identity matching the profile')
identity = matches.pop()
export_options = {'method': 'app-store-connect', 'teamID': TEAM, 'signingStyle': 'manual',
                  'signingCertificate': identity, 'manageAppVersionAndBuildNumber': False,
                  'provisioningProfiles': {BUNDLE: uid}}
(work / 'ExportOptions.plist').write_bytes(plistlib.dumps(export_options))
with open(os.environ['GITHUB_ENV'], 'a') as output:
    output.write(f'IOS_PROFILE_UUID={uid}\nIOS_SIGNING_IDENTITY={identity}\n')
print('Production signing credentials imported into the temporary keychain.')
