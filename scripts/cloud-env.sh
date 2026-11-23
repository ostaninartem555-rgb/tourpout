# Source this file in the prepared Codex cloud workspace.
export npm_config_cache=/workspace/.npm-cache
export JAVA_HOME=/workspace/toolchains/jdk-21.0.13.1+2
export ANDROID_HOME=/workspace/android-sdk
export ANDROID_USER_HOME=/workspace/.android
export GRADLE_USER_HOME=/workspace/.gradle
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
# Refresh the proxy hostname for this instance and retain system TLS trust.
python3 - <<'PY'
import os
from pathlib import Path
from urllib.parse import urlparse
root = Path(os.environ['GRADLE_USER_HOME'])
root.mkdir(exist_ok=True)
proxy = urlparse(os.environ.get('HTTPS_PROXY', ''))
lines = ['org.gradle.jvmargs=-Xmx2048m', 'org.gradle.workers.max=4']
if proxy.hostname:
    for scheme in ['https', 'http']:
        lines += [f'systemProp.{scheme}.proxyHost={proxy.hostname}', f'systemProp.{scheme}.proxyPort={proxy.port or 80}']
if Path('/etc/ssl/certs/java/cacerts').exists():
    lines += ['systemProp.javax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts']
(root / 'gradle.properties').write_text('\n'.join(lines) + '\n')
PY
