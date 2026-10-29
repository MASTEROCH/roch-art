/* Telegram.WebApp stub for recording a TMA outside Telegram.
   initData stays '' so the app runs in "browser" mode (no native BackButton logic), but every call the app might make exists.
   Injected via addInitScript / Page.addScriptToEvaluateOnNewDocument; telegram-web-app.js is routed to this same file. */
(function () {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.__stub) return;
  var noop = function () {}, self = function () { return this; };
  var btn = function () { return { isVisible: false, isActive: true, text: '', color: '#000', textColor: '#fff', show: self, hide: self, enable: self, disable: self, setText: self, setParams: self, onClick: self, offClick: self, showProgress: self, hideProgress: self }; };
  var WA = {
    __stub: true, initData: '', initDataUnsafe: {}, version: '8.0', platform: 'ios', colorScheme: 'dark',
    themeParams: { bg_color: '#060608', text_color: '#ffffff', hint_color: '#8a8a95', link_color: '#ff4f8b', button_color: '#ff4f8b', button_text_color: '#ffffff', secondary_bg_color: '#111116', header_bg_color: '#060608', bottom_bar_bg_color: '#060608', section_bg_color: '#111116' },
    isExpanded: true, get viewportHeight() { return innerHeight; }, get viewportStableHeight() { return innerHeight; }, safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready: noop, expand: noop, close: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop, requestFullscreen: noop, exitFullscreen: noop,
    setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, onEvent: noop, offEvent: noop, sendData: noop,
    openLink: noop, openTelegramLink: noop, openInvoice: function (u, cb) { if (cb) setTimeout(function () { cb('paid'); }, 300); },
    showPopup: function (p, cb) { if (cb) setTimeout(function () { cb('ok'); }, 50); }, showAlert: function (m, cb) { if (cb) cb(); }, showConfirm: function (m, cb) { if (cb) cb(true); },
    requestContact: function (cb) { if (cb) setTimeout(function () { cb(true, {}); }, 200); }, requestWriteAccess: function (cb) { if (cb) cb(true); },
    MainButton: btn(), SecondaryButton: btn(), BackButton: { isVisible: false, show: self, hide: self, onClick: self, offClick: self }, SettingsButton: { show: self, hide: self, onClick: self, offClick: self },
    HapticFeedback: { impactOccurred: self, notificationOccurred: self, selectionChanged: self },
    CloudStorage: { setItem: function (k, v, cb) { if (cb) cb(null, true); }, getItem: function (k, cb) { if (cb) cb(null, ''); }, getItems: function (k, cb) { if (cb) cb(null, {}); }, removeItem: function (k, cb) { if (cb) cb(null, true); }, getKeys: function (cb) { if (cb) cb(null, []); } },
    DeviceOrientation: { start: noop, stop: noop }, Accelerometer: { start: noop, stop: noop }, Gyroscope: { start: noop, stop: noop },
    isVersionAtLeast: function () { return true; }
  };
  window.Telegram = { WebApp: WA, WebView: { initParams: {}, onEvent: noop, offEvent: noop, postEvent: noop }, Utils: {} };
})();
