"""Create a persistent local signing key without printing its password."""
from pathlib import Path
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
signing = root / 'android/signing'
signing.mkdir(parents=True, exist_ok=True)
keystore = signing / 'release.jks'
properties = signing / 'release.properties'
if keystore.exists() or properties.exists():
    if not (keystore.exists() and properties.exists()):
        raise RuntimeError('Incomplete signing material; restore the missing file instead of replacing the key.')
    print('Existing local signing key retained.')
else:
    password = secrets.token_urlsafe(36)
    secret_file = signing / 'password.tmp'
    secret_file.write_text(password, encoding='utf-8')
    tool = next((root / 'cache/android-tools/jdk').glob('*/bin/keytool.exe'))
    try:
        subprocess.run([str(tool), '-genkeypair', '-keystore', str(keystore), '-storetype', 'JKS',
                        '-storepass:file', str(secret_file), '-keypass:file', str(secret_file),
                        '-alias', 'simple-mdv', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
                        '-dname', 'CN=Simple Markdown Viewer, OU=Local Android, O=MAXLII, C=CN'],
                       check=True, capture_output=True)
        properties.write_text(f'storePassword={password}\nkeyPassword={password}\n', encoding='utf-8')
    finally:
        secret_file.unlink(missing_ok=True)
    print('Persistent signing key created in ignored android/signing/. Back up this directory securely.')
