const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const withPrivacyCurtain = require('../../plugins/withPrivacyCurtain');
const { patchScreenCapture } = withPrivacyCurtain;

const source = fs.readFileSync(require.resolve('expo-screen-capture/ios/ScreenCaptureModule.swift'), 'utf8');

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
    expect(curtain).toContain('alpha: 1');
    expect(curtain).not.toContain('UIView.animate');
    expect(curtain).not.toContain('subviews.first');
    expect(curtain).toContain('curtain.isUserInteractionEnabled = false');
  });

  it('is safe to apply again during repeated prebuilds', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patchScreenCapture(patched, '8.0.10')).toBe(patched);
  });

  it('covers initial inactive launches and removes observers before re-registering', () => {
    const patched = patchScreenCapture(source, '8.0.10');
    expect(patched).toContain('disableAppSwitcherProtection()\n    if UIApplication.shared.applicationState != .active');
    expect(patched).toContain('self.blurEffectView?.removeFromSuperview()');
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
