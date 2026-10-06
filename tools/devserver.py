# 確認用のサーバー（キャッシュさせない）
# /macros/s/<id>/exec は、Google Apps Script（tools/gas/Code.gs）のまね（自動共有の確認用）
import http.server, functools, os, sys, json, time, uuid, urllib.parse, re

MOCK = {'keys': None, 'report': None, 'backup': None, 'at': 0}
ECHO = {}

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

    def _json_redirect(self, obj):
        # 本物と同じく、別のURLへ 302 で送り、そこで JSON を返す
        k = uuid.uuid4().hex
        ECHO[k] = obj
        self.send_response(302)
        self.send_header('Location', f'/macros/echo?user_content_key={k}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/macros/echo':
            k = urllib.parse.parse_qs(u.query).get('user_content_key', [''])[0]
            body = json.dumps(ECHO.pop(k, {'ok': False, 'error': 'gone'}), ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if re.match(r'^/macros/s/[A-Za-z0-9_-]+/exec$', u.path):
            p = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
            keys = MOCK['keys']
            if p.get('what') == 'ping':
                return self._json_redirect({'ok': True, 'app': 'gokaku-note', 'ready': bool(keys)})
            if not keys:
                return self._json_redirect({'ok': False, 'error': 'not-setup'})
            what = p.get('what', 'report')
            if what == 'report' and p.get('k') == keys['r']:
                return self._json_redirect({'ok': True, 'at': MOCK['at'], 'report': MOCK['report']})
            if what == 'backup' and p.get('k') == keys['w']:
                return self._json_redirect({'ok': True, 'at': MOCK['at'], 'backup': MOCK['backup']})
            return self._json_redirect({'ok': False, 'error': 'key'})
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not re.match(r'^/macros/s/[A-Za-z0-9_-]+/exec$', u.path):
            self.send_error(404); return
        n = int(self.headers.get('Content-Length') or 0)
        try:
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return self._json_redirect({'ok': False, 'error': 'bad-json'})
        valid = lambda k: isinstance(k, str) and re.match(r'^[A-Za-z0-9_-]{20,64}$', k)
        if not MOCK['keys']:
            if not (valid(body.get('w')) and valid(body.get('r'))):
                return self._json_redirect({'ok': False, 'error': 'key'})
            MOCK['keys'] = {'w': body['w'], 'r': body['r']}
        if body.get('w') != MOCK['keys']['w']:
            return self._json_redirect({'ok': False, 'error': 'key'})
        if body.get('report'): MOCK['report'] = body['report']
        if body.get('backup'): MOCK['backup'] = body['backup']
        MOCK['at'] = int(time.time() * 1000)
        return self._json_redirect({'ok': True, 'at': MOCK['at']})

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8779))
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
