const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'build', 'icons');
const src = path.join(root, 'icon.png');
const dest = path.join(dir, 'icon.png');

fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, dest);

if (process.platform === 'darwin') {
    const tmp = path.join(dir, '.tray_gray_tmp.png');
    const trayDest = path.join(dir, 'trayTemplate.png');
    const trayRoot = path.join(root, 'trayTemplate.png');
    const grayProfile = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc';
    try {
        execFileSync('sips', ['-s', 'format', 'png', '--matchTo', grayProfile, src, '--out', tmp], { stdio: 'ignore' });
        execFileSync('sips', ['-z', '64', '64', tmp, '--out', trayDest], { stdio: 'ignore' });
        fs.copyFileSync(trayDest, trayRoot);
    } catch (err) {
        console.error('trayTemplate generation failed:', err && err.message ? err.message : err);
    } finally {
        if (fs.existsSync(tmp)) {
            fs.unlinkSync(tmp);
        }
    }
}
