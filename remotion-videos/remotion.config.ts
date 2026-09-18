import fs from 'node:fs';
import { Config } from '@remotion/cli/config';

/**
 * 复用本机已安装的 Chrome / Edge，避免首次渲染时下载 chrome-headless-shell
 * （在部分网络环境下该下载非常慢）。
 * 想强制使用 Remotion 自带的浏览器：删除下面这几行即可，
 * 或通过环境变量 REMOTION_BROWSER 指定其它可执行文件。
 */
const BROWSER_CANDIDATES = [
  process.env.REMOTION_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter((p): p is string => Boolean(p));

const localBrowser = BROWSER_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

if (localBrowser) {
  Config.setBrowserExecutable(localBrowser);
}

// PNG 逐帧：渐变与中文小字不会出现 JPEG 压缩噪点
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
