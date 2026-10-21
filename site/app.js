// 최신 릴리스를 GitHub에서 읽어 와 다운로드 버튼·변경 내용·이전 버전을 채움. 글자는 모두 textContent로만 넣음(내용을 HTML로 해석하지 않음)
(function () {
  'use strict';
  var REPO = 'zlero7/puopuo', BASE = 'https://github.com/' + REPO + '/releases/';
  var $ = function (id) { return document.getElementById(id); };
  var okUrl = function (u) { return typeof u === 'string' && u.indexOf(BASE) === 0; };
  var fmtDate = function (s) { var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var isSetup = function (a) { return a && /^PuyoPuyo-Setup(-\d+\.\d+\.\d+)?\.exe$/.test(a.name) && okUrl(a.browser_download_url); };
  var setupOf = function (r) { var as = r.assets || [], fixed = as.filter(isSetup).filter(function (a) { return a.name === 'PuyoPuyo-Setup.exe'; })[0]; return fixed || as.filter(isSetup)[0] || null; };

  // 컴퓨터(Windows)가 아니면 안내
  if (!/Windows/i.test(navigator.userAgent)) $('notWin').classList.remove('hidden');
  $('copyLink').addEventListener('click', function () {
    var b = $('copyLink');
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(function () { b.textContent = '복사했어요'; }, function () { b.textContent = location.href; });
  });

  function fallback() {
    $('dlSub').textContent = 'GitHub에서 최신 버전 받기';
    $('relHead').textContent = '최신 변경 내용은 GitHub 릴리스 페이지에서 볼 수 있어요.';
    var ul = $('olds'); ul.textContent = ''; var li = el('li'); var a = el('a', '릴리스 목록 열기'); a.href = BASE; a.rel = 'noopener'; li.appendChild(a); ul.appendChild(li);
  }
  function show(list) {
    var rels = list.filter(function (r) { return !r.draft && !r.prerelease && setupOf(r); });
    if (!rels.length) { fallback(); return; }
    var r = rels[0], a = setupOf(r);
    // 다운로드 버튼
    $('dlBtn').href = a.browser_download_url;
    $('dlSub').textContent = r.tag_name + ' · ' + (a.size ? (a.size / 1048576).toFixed(0) + 'MB' : '') + (r.published_at ? ' · ' + fmtDate(r.published_at) : '');
    $('dlBtn').setAttribute('aria-label', 'Windows용 ' + r.tag_name + ' 다운로드');
    // 변경 내용: 첫 줄은 제목, '- '로 시작하는 줄은 항목. 서명·공동 작성자 줄은 뺌
    var lines = String(r.body || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && !/^(Co-Authored-By|Claude-Session)\b/i.test(s); });
    var title = lines.filter(function (s) { return s.indexOf('- ') !== 0; })[0] || '';
    var items = lines.filter(function (s) { return s.indexOf('- ') === 0; }).map(function (s) { return s.slice(2); });
    $('relHead').textContent = r.tag_name + ' · ' + fmtDate(r.published_at) + (title ? ' — ' + title : '');
    var ul = $('notes'); ul.textContent = ''; items.slice(0, 12).forEach(function (t) { ul.appendChild(el('li', t)); });
    var kind = (String(r.name || '').split('·')[1] || '').trim();
    if (kind) { $('kind').textContent = kind; $('kind').classList.remove('hidden'); }
    // 파일 확인용 값(GitHub가 파일마다 계산해 주는 SHA-256)
    var dg = String(a.digest || '');
    if (/^sha256:[0-9a-f]{64}$/.test(dg)) { $('hashLabel').textContent = a.name + ' 의 SHA-256'; $('hashVal').textContent = dg.slice(7).toUpperCase(); }
    // 이전 버전
    var olds = $('olds'); olds.textContent = '';
    rels.slice(1, 9).forEach(function (o) {
      var oa = setupOf(o), li = el('li'), name = el('span', o.tag_name + (o.published_at ? ' · ' + fmtDate(o.published_at) : ''));
      li.appendChild(name);
      var link = el('a', oa ? '설치 파일 받기' : '릴리스 보기'); link.href = oa ? oa.browser_download_url : (okUrl(o.html_url) ? o.html_url : BASE); link.rel = 'noopener'; li.appendChild(link);
      olds.appendChild(li);
    });
    if (!olds.children.length) olds.appendChild(el('li', '아직 이전 버전이 없어요.', 'muted'));
  }

  fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=12', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (list) { if (!Array.isArray(list)) throw new Error('형식'); show(list); })
    .catch(fallback);
})();
