const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withDangerousMod } = require('expo/config-plugins');

const SUPPORTED_VERSION = '8.0.10';
const ORIGINAL_HASH = '725a34798d5262493475afc98f014b1243d98b125f5eff65d1658b135a5d877f';
const LEGACY_HASH = '135325d3bda9a8e68e8fb50a3dfbcde19d8a5844eedcd001df2b7dbacafaf0d4';
const PATCHED_HASH = '926ec7784f2c707327968f7e6f17bdba19e53670fd26fec48c7e2ace9a8437a6';
const ANDROID_ORIGINAL_HASH = 'eeec42e01668a5cd931c20120ca24d62a7bcb7b9a0253c7d075c23f6bb0bc93e';
const ANDROID_PATCHED_HASH = '18554053176c01c992dbf3f9de6ede157cd290627d3d11c99768b722c91e98f2';
const digest = (source) => crypto.createHash('sha256').update(source).digest('hex');

// Upstream changes must be reviewed, not silently ignored by prebuild.
function checkedSource(source, version, allowed) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (version !== SUPPORTED_VERSION || !allowed.includes(digest(normalized))) {
    throw new Error('Privacy curtain: unsupported expo-screen-capture source; review the native patch before building.');
  }
  return normalized;
}

function patchScreenCapture(source, version) {
  let normalized = checkedSource(source, version, [ORIGINAL_HASH, LEGACY_HASH, PATCHED_HASH]);
  if (digest(normalized) === PATCHED_HASH) return normalized;
  // Repeated prebuilds can encounter the previous release's opaque curtain.
  if (digest(normalized) === LEGACY_HASH) {
    normalized = normalized.replace(`    // Registration can occur during startup while already inactive.
    disableAppSwitcherProtection()
    if UIApplication.shared.applicationState != .active {
      showPrivacyOverlay()
    }
`, '');
  }
  const patched = normalized
    .replace(/private var blurEffectView: (AnimatedBlurEffectView|UIView)\?/, `private var blurEffectView: UIVisualEffectView?
  private var waitingForPrivacyResume = false
  private var previewProtectionEnabled = false
  private var privacyPreviewRevision = 0
  private var deviceLockRevision = 0
  private var deviceLocked = false
  private var observingDeviceLock = false`)
    .replace('Events(onScreenshotEventName)', 'Events(onScreenshotEventName, "onDeviceLock")')
    .replace('    OnCreate {', `    OnCreate {
      DispatchQueue.main.async { self.startDeviceLockObservation() }`)
    .replace('      disableAppSwitcherProtection()\n    }', `      disableAppSwitcherProtection()
      NotificationCenter.default.removeObserver(self)
    }`)
    .replace('    AsyncFunction("preventScreenCapture")', `    AsyncFunction("getDeviceLockState") { () -> [String: Any] in
      self.startDeviceLockObservation()
      self.recordDeviceLock(!UIApplication.shared.isProtectedDataAvailable)
      return self.deviceLockState()
    }.runOnQueue(.main)

    AsyncFunction("setAppPreviewProtection") { (enabled: Bool) in
      if enabled { self.enableAppSwitcherProtection() } else { self.disableAppSwitcherProtection() }
    }.runOnQueue(.main)

    AsyncFunction("getPrivacyPreviewRevision") { () -> Int in
      return self.privacyPreviewRevision
    }.runOnQueue(.main)

    AsyncFunction("resumePrivacyPreview") { (expectedRevision: Int) in
      guard UIApplication.shared.applicationState == .active,
        expectedRevision == self.privacyPreviewRevision else { return }
      self.waitingForPrivacyResume = false
      self.removePrivacyOverlay()
    }.runOnQueue(.main)

    AsyncFunction("preventScreenCapture")`)
    .replace('  private func enableAppSwitcherProtection() {', `  private func enableAppSwitcherProtection() {
    // Preference refreshes must not reset an in-flight foreground handshake.
    guard !previewProtectionEnabled else { return }
    // Registration can occur during startup while already inactive.
    disableAppSwitcherProtection()
    previewProtectionEnabled = true
    if UIApplication.shared.applicationState != .active {
      privacyPreviewRevision += 1
      showPrivacyOverlay()
    }
    waitingForPrivacyResume = UIApplication.shared.applicationState != .active
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )`)
    .replace('  private func disableAppSwitcherProtection() {', `  private func disableAppSwitcherProtection() {
    previewProtectionEnabled = false
    waitingForPrivacyResume = false
    NotificationCenter.default.removeObserver(
      self,
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )`)
    .replace('  private func appWillResignActive() {', `  private func appWillResignActive() {
    // JS must evaluate elapsed timeout even after a long Control Center visit.
    privacyPreviewRevision += 1
    waitingForPrivacyResume = true`)
    .replace(`  private func appDidBecomeActive() {
    removePrivacyOverlay()
  }`, `  private func appDidBecomeActive() {
    if !waitingForPrivacyResume {
      removePrivacyOverlay()
    }
  }

  @objc
  private func appDidEnterBackground() {
    waitingForPrivacyResume = true
    showPrivacyOverlay()
  }`)
    .replace(/  private func showPrivacyOverlay\(\) \{[\s\S]*\n  }\n}\n?$/, `  // Public protected-data notifications are evidence, not a strict screen-lock API.
  // Native memory retains revisions while JS is suspended; process death resets them.
  private func startDeviceLockObservation() {
    guard !observingDeviceLock else { return }
    observingDeviceLock = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(protectedDataWillLock),
      name: UIApplication.protectedDataWillBecomeUnavailableNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(protectedDataDidUnlock),
      name: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil
    )
    recordDeviceLock(!UIApplication.shared.isProtectedDataAvailable)
  }

  private func deviceLockState() -> [String: Any] {
    return ["revision": deviceLockRevision, "locked": deviceLocked, "supported": true]
  }

  private func recordDeviceLock(_ locked: Bool) {
    guard locked != deviceLocked else { return }
    deviceLocked = locked
    if locked { deviceLockRevision += 1 }
    sendEvent("onDeviceLock", deviceLockState())
  }

  @objc
  private func protectedDataWillLock() {
    recordDeviceLock(true)
  }

  @objc
  private func protectedDataDidUnlock() {
    recordDeviceLock(false)
  }

  private func showPrivacyOverlay() {
    // Synchronous blur above native Modal presentations, without an opaque fill.
    guard self.blurEffectView == nil, let keyWindow = keyWindow else { return }
    let curtain = UIVisualEffectView(effect: UIBlurEffect(style: .regular))
    curtain.frame = keyWindow.bounds
    curtain.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    curtain.isUserInteractionEnabled = false
    curtain.accessibilityElementsHidden = true
    keyWindow.addSubview(curtain)
    self.blurEffectView = curtain
  }

  private func removePrivacyOverlay() {
    self.blurEffectView?.removeFromSuperview()
    self.blurEffectView = nil
  }
}`);
  if (digest(patched) !== PATCHED_HASH) {
    throw new Error('Privacy curtain: native patch output changed; review before building. Hash: ' + digest(patched));
  }
  return patched;
}

function patchAndroidScreenCapture(source, version) {
  const normalized = checkedSource(source, version, [ANDROID_ORIGINAL_HASH, ANDROID_PATCHED_HASH]);
  if (digest(normalized) === ANDROID_PATCHED_HASH) return normalized;
  const patched = normalized
    .replace('import android.app.Activity', `import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter`)
    .replace('  private var isRegistered = false', `  private var isRegistered = false
  private var deviceLockRevision = 0
  private var deviceLocked = false
  private var deviceLockReceiverRegistered = false
  private var deviceLockContext: Context? = null
  private var privacyPreviewEnabled = false
  private val deviceLockReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        // Screen-off is retained even when keyguard authentication has a delay.
        Intent.ACTION_SCREEN_OFF -> recordDeviceLock(true)
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> refreshDeviceLock()
      }
    }
  }

  @Synchronized
  private fun deviceLockState(): Map<String, Any> = mapOf(
    "revision" to deviceLockRevision, "locked" to deviceLocked, "supported" to true
  )

  @Synchronized
  private fun recordDeviceLock(locked: Boolean) {
    if (locked == deviceLocked) return
    deviceLocked = locked
    if (locked) deviceLockRevision += 1
    sendEvent("onDeviceLock", deviceLockState())
  }

  private fun refreshDeviceLock() {
    val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    recordDeviceLock(keyguard.isKeyguardLocked)
  }

  private fun registerDeviceLockReceiver() {
    if (deviceLockReceiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    // Only protected system broadcasts; no app-supplied events or permissions.
    val receiverContext = context.applicationContext
    receiverContext.registerReceiver(deviceLockReceiver, filter)
    deviceLockContext = receiverContext
    deviceLockReceiverRegistered = true
    refreshDeviceLock()
  }

  private fun applyPrivacyPreview() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      safeCurrentActivity?.let { activity ->
        activity.runOnUiThread {
          activity.setRecentsScreenshotEnabled(!privacyPreviewEnabled)
        }
      }
    }
  }`)
    .replace('Events(eventName)', 'Events(eventName, "onDeviceLock")')
    .replace('    OnCreate {', '    OnCreate {\n      registerDeviceLockReceiver()')
    .replace('    AsyncFunction("getPermissionsAsync")', `    AsyncFunction("getDeviceLockState") {
      refreshDeviceLock()
      deviceLockState()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setAppPreviewProtection") { enabled: Boolean ->
      privacyPreviewEnabled = enabled
      applyPrivacyPreview()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getPrivacyPreviewRevision") { 0 }.runOnQueue(Queues.MAIN)

    AsyncFunction("resumePrivacyPreview") { expectedRevision: Int ->
      // Android recents policy never overlays the foreground activity.
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getPermissionsAsync")`)
    .replace('    OnActivityEntersForeground {', `    OnActivityEntersForeground {
      refreshDeviceLock()
      applyPrivacyPreview()`)
    .replace('    OnDestroy {', `    OnDestroy {
      if (deviceLockReceiverRegistered) {
        deviceLockContext?.unregisterReceiver(deviceLockReceiver)
        deviceLockContext = null
        deviceLockReceiverRegistered = false
      }
      privacyPreviewEnabled = false
      applyPrivacyPreview()`);
  if (digest(patched) !== ANDROID_PATCHED_HASH) {
    throw new Error('Privacy curtain: native patch output changed; review before building. Hash: ' + digest(patched));
  }
  return patched;
}

function patchDependency(mod, relativePath, patch) {
  const packagePath = require.resolve('expo-screen-capture/package.json', { paths: [mod.modRequest.projectRoot] });
  const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  const sourcePath = path.join(path.dirname(packagePath), relativePath);
  const original = fs.readFileSync(sourcePath, 'utf8');
  const patched = patch(original, version);
  if (patched !== original) fs.writeFileSync(sourcePath, patched);
  return mod;
}

function withPrivacyCurtain(config) {
  config = withDangerousMod(config, ['ios', async (mod) => patchDependency(mod, 'ios/ScreenCaptureModule.swift', patchScreenCapture)]);
  return withDangerousMod(config, ['android', async (mod) => patchDependency(mod, 'android/src/main/java/expo/modules/screencapture/ScreenCaptureModule.kt', patchAndroidScreenCapture)]);
}

module.exports = withPrivacyCurtain;
module.exports.patchScreenCapture = patchScreenCapture;
module.exports.patchAndroidScreenCapture = patchAndroidScreenCapture;
