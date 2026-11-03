import urllib.request, re

for host in ['https://c3abc15a.usetalla.pages.dev', 'https://usetalla.pages.dev']:
    req = urllib.request.Request(host, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8')
        m = re.search(r'href="(/assets/index-[^"]+\.css)"', html)
        if m:
            css_url = host + m.group(1)
            req2 = urllib.request.Request(css_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                css = resp2.read().decode('utf-8')
                print(host, 'css file:', m.group(1))
                print('  Old fixed?', 'position:fixed;left:12px;right:12px;bottom:12px' in css)
                print('  New static?', 'position:static;max-height:none;border-radius:18px' in css)
