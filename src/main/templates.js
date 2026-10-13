'use strict';

const path = require('path');

// Starting points offered by "New rule". Ones without a companion app open in the editor
// with the trigger filled in, ready for the user to add their own.
function buildTemplates({ platform, home, localAppData }) {
    const win = platform === 'win32';
    const mac = platform === 'darwin';
    const names = (...list) => list.map((name) => ({ name }));
    const templates = [];

    templates.push({
        id: 'league-blitz',
        name: 'League of Legends + Blitz',
        monitoredApps: win
            ? names('LeagueClient.exe', 'League of Legends.exe')
            : names('League of Legends'),
        controlledApps: [win
            ? { name: 'Blitz.exe', path: path.win32.join(localAppData || path.win32.join(home, 'AppData', 'Local'), 'Programs', 'Blitz', 'Blitz.exe'), action: 'sync' }
            : { name: 'Blitz', path: '/Applications/Blitz.app', action: 'sync' }],
    });

    if (win) {
        templates.push({
            id: 'rocket-league-bakkesmod',
            name: 'Rocket League + BakkesMod',
            monitoredApps: names('RocketLeague.exe'),
            controlledApps: [{ name: 'BakkesMod.exe', path: 'C:\\Program Files\\BakkesMod\\BakkesMod.exe', action: 'sync' }],
        });
        templates.push({ id: 'valorant', name: 'Valorant', monitoredApps: names('VALORANT-Win64-Shipping.exe'), controlledApps: [] });
    }

    templates.push({
        id: 'fortnite',
        name: 'Fortnite',
        monitoredApps: win ? names('FortniteClient-Win64-Shipping.exe') : names('FortniteClient-Mac-Shipping'),
        controlledApps: [],
    });
    templates.push({
        id: 'minecraft',
        name: 'Minecraft (Java)',
        monitoredApps: win ? names('javaw.exe') : names('java'),
        controlledApps: [],
    });
    templates.push({
        id: 'steam',
        name: 'Steam',
        monitoredApps: win ? names('steam.exe') : mac ? names('Steam') : names('steam'),
        controlledApps: [],
    });
    templates.push({
        id: 'obs',
        name: 'OBS Studio',
        monitoredApps: win ? names('obs64.exe') : mac ? names('OBS') : names('obs'),
        controlledApps: [],
    });
    templates.push({
        id: 'discord',
        name: 'Discord',
        monitoredApps: win ? names('Discord.exe') : names('Discord'),
        controlledApps: [],
    });

    return templates;
}

module.exports = { buildTemplates };
