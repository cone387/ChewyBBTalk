const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const withPrivacyCurtain = require('../../plugins/withPrivacyCurtain');
const { patchScreenCapture, patchAndroidScreenCapture } = withPrivacyCurtain;

const source = fs.readFileSync(path.join(__dirname, 'fixtures/ScreenCaptureModule.swift'), 'utf8');
const androidSource = fs.readFileSync(path.join(__dirname, 'fixtures/ScreenCaptureModule.kt'), 'utf8');

describe('native privacy curtain patch', () => {
  it('executes through the Expo iOS mod and writes the reviewed Swift source', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbtalk-privacy-plugin-'));
    try {
      const packageRoot = path.join(projectRoot, 'node_modules', 'expo-screen-capture');
      fs.mkdirSync(path.join(packageRoot, 'ios'), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '8.0.10' }));
      const sourcePath = path.join(packageRoot, 'ios', 'ScreenCaptureModule.swift');
      fs.writeFileSync(sourcePath, source);
      const config = withPrivacyCurtain({ name: 'privacy-test', slug: 'privacy-test' });
      const request = { ...config, modRequest: { projectRoot, platform: 'ios', modName: 'dangerous' }, modResults: {} };
      await config.mods.ios.dangerous(request);
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe(patchScreenCapture(source, '8.0.10'));
      await config.mods.ios.dangerous(request);
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe(patchScreenCapture(source, '8.0.10'));
    } finally {
      const resolved = path.resolve(projectRoot);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('bbtalk-privacy-plugin-')) {
        throw new Error('Refusing to remove an unexpected test directory');
      }
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  it('covers the UIWindow above native presentations immediately without animation', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    const curtain = patched.slice(patched.indexOf('  private func showPrivacyOverlay()'));
    expect(curtain).toContain('keyWindow.addSubview(curtain)');
    expect(curtain).toContain('UIVisualEffectView(effect: UIBlurEffect(style: .regular))');
    expect(curtain).not.toContain('backgroundColor');
    expect(curtain).not.toContain('UIView.animate');
    expect(curtain).not.toContain('subviews.first');
    expect(curtain).toContain('curtain.isUserInteractionEnabled = false');
  });

  it('is safe to apply again during repeated prebuilds', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patchScreenCapture(patched, '8.0.10')).toBe(patched);
  });

  it('upgrades a dependency already patched by the previous opaque-curtain release', () => {
    const legacy = fs.readFileSync(path.join(__dirname, 'fixtures/ScreenCaptureModule.legacy.swift'), 'utf8');
    expect(patchScreenCapture(legacy, '8.0.10')).toBe(patchScreenCapture(source, '8.0.10'));
  });

  it('covers initial inactive launches and removes observers before re-registering', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patched).toContain('disableAppSwitcherProtection()\n    previewProtectionEnabled = true\n    if UIApplication.shared.applicationState != .active');
    expect(patched).toContain('self.blurEffectView?.removeFromSuperview()');
  });

  it('does not remove a pending curtain when unchanged preferences enable preview again', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    const enable = patched.slice(patched.indexOf('  private func enableAppSwitcherProtection()'), patched.indexOf('  private func disableAppSwitcherProtection()'));
    expect(enable).toContain('guard !previewProtectionEnabled else { return }');
    expect(enable.indexOf('guard !previewProtectionEnabled')).toBeLessThan(enable.indexOf('disableAppSwitcherProtection()'));
    expect(patched).toContain('private func disableAppSwitcherProtection() {\n    previewProtectionEnabled = false');
  });

  it('retains the blur across real background until JS commits the resumed privacy state', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patched).toContain('name: UIApplication.didEnterBackgroundNotification');
    expect(patched).toContain('if !waitingForPrivacyResume {');
    expect(patched).toContain('AsyncFunction("resumePrivacyPreview")');
  });

  it('keeps transient inactive previews covered until JS evaluates an expired deadline', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    const resign = patched.slice(patched.indexOf('  private func appWillResignActive()'), patched.indexOf('  private func appDidBecomeActive()'));
    expect(resign).toContain('waitingForPrivacyResume = true\n    showPrivacyOverlay()');
    expect(patched).toContain('waitingForPrivacyResume = UIApplication.shared.applicationState != .active');
  });

  it('rejects stale resume acknowledgements from a previous inactive cycle', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patched).toContain('AsyncFunction("getPrivacyPreviewRevision")');
    expect(patched).toContain('AsyncFunction("resumePrivacyPreview") { (expectedRevision: Int) in');
    expect(patched).toContain('expectedRevision == self.privacyPreviewRevision else { return }');
    const resign = patched.slice(patched.indexOf('  private func appWillResignActive()'), patched.indexOf('  private func appDidBecomeActive()'));
    expect(resign).toContain('privacyPreviewRevision += 1');
  });

  it('records protected-data lock revisions independently of JS observation', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patched).toContain('name: UIApplication.protectedDataWillBecomeUnavailableNotification');
    expect(patched).toContain('name: UIApplication.protectedDataDidBecomeAvailableNotification');
    expect(patched).toContain('deviceLockRevision += 1');
    expect(patched).toContain('AsyncFunction("getDeviceLockState")');
    expect(patched).toContain('Events(onScreenshotEventName, "onDeviceLock")');
    expect(patched).toContain('startDeviceLockObservation()');
  });

  it('does not alter the secure-text-field capture layer', () => {
    const section = (text) => text.slice(text.indexOf('  private func preventScreenshots()'), text.indexOf('  private func enableAppSwitcherProtection()'));
    expect(section(patchScreenCapture(source, '8.0.10'))).toBe(section(source));
  });

  it('fails closed on a changed dependency version or source', () => {
    expect(() => patchScreenCapture(source, '8.0.11')).toThrow('unsupported');
    expect(() => patchScreenCapture(`${source}\n// changed`, '8.0.10')).toThrow('unsupported');
  });
});

describe('Android public privacy APIs', () => {
  it('records screen-off before JS resumes and observes keyguard without changing capture policy', () => {
    const patched = patchAndroidScreenCapture(androidSource, '8.0.10');
    expect(patched).toContain('Intent.ACTION_SCREEN_OFF -> recordDeviceLock(true)');
    expect(patched).toContain('keyguard.isKeyguardLocked');
    expect(patched).toContain('deviceLockContext?.unregisterReceiver(deviceLockReceiver)');
    expect(patched).toContain('AsyncFunction("getDeviceLockState")');
    expect(patched.match(/FLAG_SECURE/g)).toHaveLength(2);
  });

  it('disables only recents screenshots on Android 13+ and is repeatable', () => {
    const patched = patchAndroidScreenCapture(androidSource, '8.0.10');
    expect(patched).toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU');
    expect(patched).toContain('setRecentsScreenshotEnabled(!privacyPreviewEnabled)');
    expect(patchAndroidScreenCapture(patched, '8.0.10')).toBe(patched);
    expect(() => patchAndroidScreenCapture(androidSource, '8.0.11')).toThrow('unsupported');
    expect(() => patchAndroidScreenCapture(androidSource + '// unexpected', '8.0.10')).toThrow('unsupported');
  });

  it('runs the Android dangerous mod on the pinned dependency', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbtalk-privacy-plugin-'));
    try {
      const packageRoot = path.join(projectRoot, 'node_modules/expo-screen-capture');
      const sourcePath = path.join(packageRoot, 'android/src/main/java/expo/modules/screencapture/ScreenCaptureModule.kt');
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '8.0.10' }));
      fs.writeFileSync(sourcePath, androidSource);
      const config = withPrivacyCurtain({ name: 'privacy-test', slug: 'privacy-test' });
      await config.mods.android.dangerous({ ...config, modRequest: { projectRoot, platform: 'android', modName: 'dangerous' }, modResults: {} });
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe(patchAndroidScreenCapture(androidSource, '8.0.10'));
    } finally {
      const resolved = path.resolve(projectRoot);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('bbtalk-privacy-plugin-')) throw new Error('Unexpected directory');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });
});
