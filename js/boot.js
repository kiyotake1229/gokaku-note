// 描画の前に、テーマとiPhoneの上部の帯を決める（ちらつき防止。CSPのため別ファイル）
;(function () {
  // テーマを描画前に反映（ちらつき防止）
  try {
    var s = JSON.parse(localStorage.getItem('gokaku.v1') || '{}');
    var th = s.profile && s.profile.theme;
    if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
    var fs = s.profile && s.profile.fs;
    if (fs === 's' || fs === 'l' || fs === 'xl') document.documentElement.setAttribute('data-fs', fs);
  } catch (e) {}
  // iPhone のホーム画面アプリの上部の帯（起動時のテーマに合わせる）
  var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var sb = document.createElement('meta');
  sb.name = 'apple-mobile-web-app-status-bar-style';
  sb.content = dark ? 'black-translucent' : 'default';
  document.head.appendChild(sb);
})()
