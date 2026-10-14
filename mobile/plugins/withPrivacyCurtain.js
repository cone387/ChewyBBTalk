const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withDangerousMod } = require('expo/config-plugins');

const SUPPORTED_VERSION = '8.0.10';
const ORIGINAL_HASH = '725a34798d5262493475afc98f014b1243d98b125f5eff65d1658b135a5d877f';
const PATCHED_HASH = '135325d3bda9a8e68e8fb50a3dfbcde19d8a5844eedcd001df2b7dbacafaf0d4';
const digest = (source) => crypto.createHash('sha256').update(source).digest('hex');

/**
 * Expo 8.0.10 adds its blur below native Modal presentations and fades it in.
 * Patch only the background curtain: leave the secure-text-field capture layer intact.
 * A dependency change must be reviewed explicitly instead of silently skipping privacy.
 */
function patchScreenCapture(source, version) {
  const normalized = source.replace(/\r\n/g, '\n');
  const hash = digest(normalized);
  if (version !== SUPPORTED_VERSION || ![ORIGINAL_HASH, PATCHED_HASH].includes(hash)) {
    throw new Error('Privacy curtain: unsupported expo-screen-capture source; review the native patch before building.');
  }
  if (hash === PATCHED_HASH) return normalized;

  const patched = normalized
    .replace('private var blurEffectView: AnimatedBlurEffectView?', 'private var blurEffectView: UIView?')
    .replace('  private func enableAppSwitcherProtection() {', `  private func enableAppSwitcherProtection() {
    // Registration can occur during startup while already inactive.
    disableAppSwitcherProtection()
    if UIApplication.shared.applicationState != .active {
      showPrivacyOverlay()
    }`)
    .replace(/  private func showPrivacyOverlay\(\) \{[\s\S]*\n  }\n}\n?$/, `  private func showPrivacyOverlay() {
    // BBTalk privacy curtain: synchronous and above native Modal presentations.
    guard self.blurEffectView == nil, let keyWindow = keyWindow else { return }
    let curtain = UIView(frame: keyWindow.bounds)
    curtain.backgroundColor = UIColor(red: 17 / 255.0, green: 24 / 255.0, blue: 39 / 255.0, alpha: 1)
    curtain.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    curtain.isUserInteractionEnabled = false
    curtain.accessibilityElementsHidden = true
    keyWindow.addSubview(curtain)
    self.blurEffectView = curtain
  }

  private func removePrivacyOverlay() {
    // No animation: foreground content is gated separately by the privacy lock.
    self.blurEffectView?.removeFromSuperview()
    self.blurEffectView = nil
  }
}`);
  if (digest(patched) !== PATCHED_HASH) {
    throw new Error('Privacy curtain: native patch output changed; review before building.');
  }
  return patched;
}

function withPrivacyCurtain(config) {
  return withDangerousMod(config, ['ios', async (mod) => {
    const packagePath = require.resolve('expo-screen-capture/package.json', {
      paths: [mod.modRequest.projectRoot],
    });
    const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
    const sourcePath = path.join(path.dirname(packagePath), 'ios', 'ScreenCaptureModule.swift');
    const original = fs.readFileSync(sourcePath, 'utf8');
    const patched = patchScreenCapture(original, version);
    if (patched !== original) fs.writeFileSync(sourcePath, patched);
    return mod;
  }]);
}

module.exports = withPrivacyCurtain;
module.exports.patchScreenCapture = patchScreenCapture;
