import urllib.request, re, sys
sys.stdout.reconfigure(encoding='utf-8')

req = urllib.request.Request('https://usetalla.pages.dev', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8')
    js_m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    if js_m:
        req_js = urllib.request.Request('https://usetalla.pages.dev' + js_m.group(1), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_js, timeout=10) as r_js:
            js = r_js.read().decode('utf-8')
            print('Has old footer text?', 'switch on the platform' in js)
            print('Has new footer text?', 'Built for West African social commerce' in js)
