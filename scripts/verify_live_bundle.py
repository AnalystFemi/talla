import urllib.request, re, sys

sys.stdout.reconfigure(encoding='utf-8')

req = urllib.request.Request('https://usetalla.pages.dev', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8')
    js_m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    css_m = re.search(r'href="(/assets/index-[^"]+\.css)"', html)
    print('JS:', js_m.group(1) if js_m else 'none')
    print('CSS:', css_m.group(1) if css_m else 'none')
    
    if js_m:
        req_js = urllib.request.Request('https://usetalla.pages.dev' + js_m.group(1), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_js, timeout=10) as r_js:
            js = r_js.read().decode('utf-8')
            print('Has yellow emoji in JS?', '\U0001f4c1' in js)
            print('Has btn-history with SVG in JS?', 'btn-history' in js)
            print('Has history-backdrop in JS?', 'history-backdrop' in js)
    
    if css_m:
        req_css = urllib.request.Request('https://usetalla.pages.dev' + css_m.group(1), headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_css, timeout=10) as r_css:
            css = r_css.read().decode('utf-8')
            print('Has touch-action:manipulation?', 'touch-action:manipulation' in css)
            print('Has font-size:16px for input?', 'font-size:16px' in css)
            print('Has history-badge?', 'history-badge' in css)
            print('Has mobile history-dropdown?', 'max-height:75vh' in css)
