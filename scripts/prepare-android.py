"""Prepare portable Android build tools inside this repository's ignored cache."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / 'cache' / 'android-tools'
TOOLS.mkdir(parents=True, exist_ok=True)
PACKAGES = [
    ('jdk', 'https://aka.ms/download-jdk/microsoft-jdk-17.0.19-windows-x64.zip'),
    ('cmdline', 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip'),
    ('gradle', 'https://services.gradle.org/distributions/gradle-8.13-bin.zip'),
]

def prepare(package):
    name, url = package
    destination = TOOLS / name
    if destination.exists():
        return
    archive = TOOLS / (name + '.zip')
    subprocess.run(['curl.exe', '--fail', '-L', '--retry', '2', '--connect-timeout', '20',
                    '--max-time', '600', '-sS', url, '-o', str(archive)], check=True)
    with zipfile.ZipFile(archive) as zipped:
        zipped.extractall(destination)
    print(name + ' ready', flush=True)

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(prepare, PACKAGES))
    java = next((TOOLS / 'jdk').glob('*/bin/java.exe')).parents[1]
    env = dict(os.environ, JAVA_HOME=str(java), ANDROID_USER_HOME=str(TOOLS / 'android-user'))
    sdk = TOOLS / 'sdk'
    manager = TOOLS / 'cmdline/cmdline-tools/bin/sdkmanager.bat'
    result = subprocess.run([str(manager), '--sdk_root=' + str(sdk), '--licenses'],
                            input='y\n' * 100, text=True, env=env, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stdout[-2000:] + result.stderr[-2000:])
    result = subprocess.run([str(manager), '--sdk_root=' + str(sdk), 'platforms;android-36',
                             'build-tools;35.0.0', 'platform-tools'], env=env,
                            capture_output=True, text=True)
    print(result.stdout[-2000:], result.stderr[-2000:], flush=True)
    result.check_returncode()
    print('Android SDK ready', flush=True)
