import sys, types

src = open('modal/wan_app.py', encoding='utf-8').read()
# Wan checkpoint must be the verified A14B id, never the dead 14B id
assert 'Wan-AI/Wan2.2-I2V-A14B-Diffusers' in src, 'Wan A14B checkpoint missing'
assert 'Wan2.2-I2V-14B-Diffusers' not in src, 'dead Wan checkpoint id still present'
# LTX must be the verified 2.5 Diffusers checkpoint via the LTX2 I2V pipeline
assert 'Lightricks/LTX-2.5-Diffusers' in src, 'LTX-2.5 checkpoint missing'
assert 'LTX2ImageToVideoPipeline' in src, 'LTX2 I2V pipeline missing'
assert 'Lightricks/LTX-Video"' not in src, 'old LTX-Video checkpoint still present'

# mock modal so the module imports without the SDK
m = types.ModuleType('modal')
class _V:
    @staticmethod
    def from_name(*a, **k): return None
class _Img:
    @staticmethod
    def debian_slim(*a, **k): return _Img()
    def apt_install(self, *a, **k): return self
    def uv_pip_install(self, *a, **k): return self
    def env(self, *a, **k): return self
    def add_local_python_source(self, *a, **k): return self
class _App:
    def cls(self, *a, **k):
        def d(c): return c
        return d
    def function(self, *a, **k):
        def d(f): return f
        return d
    def local_entrypoint(self, *a, **k):
        def d(f): return f
        return d
class _Secret:
    @staticmethod
    def from_name(*a, **k): return None
m.Volume = _V; m.Image = _Img; m.App = lambda *a, **k: _App(); m.Secret = _Secret; m.functions = types.SimpleNamespace(FunctionCall=None)
m.enter = lambda *a, **k: (lambda f: f)
m.method = lambda *a, **k: (lambda f: f)
m.fastapi_endpoint = lambda *a, **k: (lambda f: f)
sys.modules['modal'] = m

g = {'__name__': 'wanmod'}
exec(compile(src, 'wan_app.py', 'exec'), g)
fc = g['_frame_count']
for secs, want in [(1, 25), (5, 121), (6.7, 161), (10, 161), (15, 161)]:
    got = fc({'seconds': secs}, 161); assert got == want, (secs, got, want)
for secs, want in [(5, 121), (10.7, 257), (15, 257)]:
    got = fc({'seconds': secs}, 257); assert got == want, (secs, got, want)
print('ENGINE_WIRING_OK')
