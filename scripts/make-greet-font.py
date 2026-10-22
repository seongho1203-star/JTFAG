#!/usr/bin/env python3
"""환영창 전용 글꼴(JTGreet)을 만든다 — Pretendard에서 환영창에 나오는 글자만 뽑아 index.html에 직접 넣는다.

골퍼 이름·계급 이름·인사 문구(ui-app.js의 GREET)·안내문이 바뀌면 아래 TEXT를 고쳐 다시 돌린다.
준비: pip install fonttools brotli · npm pack pretendard@1.3.9 && tar xzf pretendard-1.3.9.tgz
실행: python3 scripts/make-greet-font.py package/dist/public/static  (index.html의 JTGreet 세 줄이 바뀐다)
"""
import base64, re, subprocess, sys, tempfile, os

TEXT = "이관교김지명신성호박승수독수리매학참새등급님황제귀환맹수의발톱우아한날개짓앗입장하였습니다화면을누르면넘어갑니다"
TEXT += "".join(chr(c) for c in range(0x20, 0x7f)) + "·…~!?,."
SRC = sys.argv[1]
HTML = os.path.join(os.path.dirname(__file__), '..', 'index.html')
s = open(HTML, encoding='utf-8').read()
tmp = tempfile.mkdtemp()
open(os.path.join(tmp, 'chars.txt'), 'w', encoding='utf-8').write(TEXT)
for w, n in ((500, 'Medium'), (700, 'Bold'), (900, 'Black')):
    out = os.path.join(tmp, n + '.woff2')
    subprocess.check_call(['pyftsubset', f'{SRC}/Pretendard-{n}.otf', f'--text-file={tmp}/chars.txt', '--flavor=woff2',
                           '--layout-features=kern', '--no-hinting', '--desubroutinize', '--drop-tables+=DSIG', f'--output-file={out}'])
    b = base64.b64encode(open(out, 'rb').read()).decode()
    pat = re.compile(r"(font-family: 'JTGreet'; font-weight: %d; font-style: normal; font-display: block; src: url\(')[^']+('\))" % w)
    assert pat.search(s), w
    s = pat.sub(lambda m: m.group(1) + 'data:font/woff2;base64,' + b + m.group(2), s, 1)
open(HTML, 'w', encoding='utf-8').write(s)
print('ok')
