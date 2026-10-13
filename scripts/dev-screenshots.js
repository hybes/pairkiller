// Renders every screen to PNG without putting a window on screen, for checking the design.
//
//   electron scripts/dev-screenshots.js <output-dir> [win32|darwin] [empty]
//
// Runs against a throwaway profile in dry-run mode, so it never touches the real config and
// never opens or closes an app. Live status in the shots reflects what is actually running.
const fs = require('fs');
const os = require('os');
const path = require('path');

const [outDir, look = process.platform, scenario = 'default'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!outDir) {
    console.error('Usage: electron scripts/dev-screenshots.js <output-dir> [win32|darwin] [empty]');
    process.exit(1);
}

// Chromium keeps the profile locked until the process ends, so it is cleared on the next run instead.
const profile = path.join(os.tmpdir(), `pairkiller-shots-${look}`);
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const rules = scenario === 'empty' ? [] : [
    {
        id: 'league',
        name: 'Blitz / League of Legends',
        enabled: true,
        condition: 'any',
        monitoredApps: [{ name: 'LeagueClient.exe' }, { name: 'League of Legends.exe' }],
        controlledApps: [{ name: 'Blitz.exe', path: path.join(local, 'Programs', 'Blitz', 'Blitz.exe'), action: 'sync' }],
    },
    {
        id: 'rocket',
        name: 'Rocket League + BakkesMod',
        enabled: true,
        condition: 'any',
        monitoredApps: [{ name: 'RocketLeague.exe' }],
        controlledApps: [{ name: 'BakkesMod.exe', path: 'C:\\Program Files\\BakkesMod\\BakkesMod.exe', action: 'sync' }],
    },
    {
        id: 'obs',
        name: 'Quiet while streaming',
        enabled: false,
        condition: 'any',
        monitoredApps: [{ name: 'obs64.exe' }],
        controlledApps: [{ name: 'Discord.exe', action: 'stop' }],
    },
];
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ schemaVersion: 2, appGroups: rules }));

process.env.PAIRKILLER_USER_DATA = profile;
process.env.PAIRKILLER_UI_PLATFORM = look;
process.env.PAIRKILLER_DRY_RUN = '1';
process.argv.push('--hidden');

const { app, nativeTheme } = require('electron');
// Started from a script rather than the package, Electron doesn't know the app's name or version.
const manifest = require('../package.json');
app.setName(manifest.productName);
if (typeof app.setVersion === 'function') app.setVersion(manifest.version);

const { ready, context } = require('../src/main/index.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ready.then(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const win = context.windows.open({ show: false });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const run = (script) => win.webContents.executeJavaScript(script, true);
    // A hidden window is throttled, which would freeze entrance animations halfway through a capture.
    win.webContents.setBackgroundThrottling(false);
    await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
    // Mica and vibrancy are composited by the OS and can't be captured; stand in a flat base colour.
    await run("document.documentElement.classList.remove('mica'); document.documentElement.classList.add('preview')");

    if (rules.length > 0) {
        const league = context.store.data.appGroups[0];
        const now = Date.now();
        context.engine.now = () => now - 3_725_000;
        context.engine.record(league, 'success', 'Opened Blitz');
        context.engine.now = () => now - 95_000;
        context.engine.record(league, 'info', 'LeagueClient closed');
        context.engine.now = () => now - 90_000;
        context.engine.record(league, 'success', 'Closed Blitz');
        context.engine.now = Date.now;
    }

    const shoot = async (name) => {
        await wait(450);
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `${look}-${name}.png`), image.toPNG());
        console.log(`${look}-${name}.png`);
    };

    for (const appearance of ['dark', 'light']) {
        nativeTheme.themeSource = appearance;
        await run("document.querySelector('[data-page=rules]').click()");
        await shoot(`${appearance}-rules`);
        if (rules.length > 0) {
            await run("document.querySelector('.rule-row').click()");
            await shoot(`${appearance}-rule`);
            await run("document.querySelector('[data-action=add-controlled]').click()");
            await wait(400);
            await shoot(`${appearance}-picker`);
            await run("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
            await run("document.querySelector('[data-page=rules]').click()");
            await run("document.querySelectorAll('.rule-row')[1].click()");
            await shoot(`${appearance}-rule-problem`);
        }
        await run("document.querySelector('[data-page=activity]').click()");
        await shoot(`${appearance}-activity`);
        await run("document.querySelector('[data-page=settings]').click()");
        await shoot(`${appearance}-settings`);
        await run("document.querySelector('.page-body').scrollTop = 1e6");
        await shoot(`${appearance}-settings-about`);
    }

    app.exit(0);
}).catch((error) => {
    console.error(error);
    app.exit(1);
});
