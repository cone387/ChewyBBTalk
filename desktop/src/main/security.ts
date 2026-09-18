import { session } from 'electron';

export function setupCsp() {
  const isDev = !!process.env['ELECTRON_RENDERER_URL'];

  const csp = isDev
    ? [
        "default-src 'self' http://localhost:* ws://localhost:*",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: http://localhost:*",
        "connect-src 'self' https://bbtalk.cone387.top http://localhost:* ws://localhost:*",
        "font-src 'self' data:",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://bbtalk.cone387.top",
        "font-src 'self' data:",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
