"""Exercise tablet rotation and offline rendering, restoring settings afterward."""
from pathlib import Path
import subprocess
import json

root = Path(__file__).resolve().parents[1]
adb = str(root / 'cache/android-diagnostics/platform-tools/adb.exe')
report_dir = root / 'cache/android-diagnostics'

def shell(*args):
    return subprocess.check_output([adb, '-P', '5038', '-s', 'd1cb526b', 'shell', *args], text=True, encoding='utf-8', timeout=20).strip()

def evaluate(expression):
    return json.loads(subprocess.check_output(['node', 'scripts/android-device-check.mjs', expression], cwd=root, text=True, encoding='utf-8', timeout=40))

rotation = shell('wm', 'user-rotation')
airplane = shell('cmd', 'connectivity', 'airplane-mode')
results = {}
try:
    for value, name in [('0', 'portrait'), ('1', 'landscape')]:
        shell('wm', 'user-rotation', 'lock', value)
        narrow = 'true' if name == 'portrait' else 'false'
        results[name] = evaluate("(async()=>{for(let i=0;i<100;i++){if((innerWidth<840)===" + narrow + ")break;await new Promise(r=>setTimeout(r,50));}return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,draft:document.getElementById('editor').value.includes('RECOVERY-20260912'),images:[...document.querySelectorAll('#viewer img')].filter(i=>i.alt.startsWith('验收')).map(i=>i.naturalWidth)};})()")
        assert results[name]['draft'] and not results[name]['overflow'], results[name]
        (report_dir / (name + '.png')).write_bytes(subprocess.check_output([adb, '-P', '5038', '-s', 'd1cb526b', 'exec-out', 'screencap', '-p']))
    shell('cmd', 'connectivity', 'airplane-mode', 'enable')
    results['airplane_state'] = shell('cmd', 'connectivity', 'airplane-mode')
    results['offline'] = evaluate("(async()=>{document.getElementById('theme').click();await new Promise(r=>setTimeout(r,1000));const i=[...document.querySelectorAll('#viewer img')].filter(i=>i.alt.startsWith('验收'));return {images:i.map(x=>({name:x.alt,loaded:x.naturalWidth>0})),formula:document.querySelectorAll('.katex').length,diagram:document.querySelectorAll('.mermaid-wrapper svg').length};})()")
    assert results['airplane_state'] == 'enabled'
    assert len(results['offline']['images']) == 3 and all(image['loaded'] for image in results['offline']['images'])
    assert results['offline']['formula'] >= 2 and results['offline']['diagram'] >= 1
    evaluate("document.getElementById('theme').click(); true")
finally:
    shell('cmd', 'connectivity', 'airplane-mode', 'enable' if airplane == 'enabled' else 'disable')
    if rotation.startswith('free'):
        shell('wm', 'user-rotation', 'free')
    else:
        shell('wm', 'user-rotation', 'lock', rotation.split()[-1])
results['restored'] = {'rotation': shell('wm', 'user-rotation'), 'airplane': shell('cmd', 'connectivity', 'airplane-mode')}
(report_dir / 'layout-offline.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False, indent=2))
