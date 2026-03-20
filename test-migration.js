// Read current version from package.json
const packageJson = require('./package.json');
const CURRENT_VERSION = packageJson.version;

// Simple version comparison function (copied from main.js)
function compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;
        
        if (aPart < bPart) return -1;
        if (aPart > bPart) return 1;
    }
    
    return 0;
}

// Config migration system (copied from main.js)
async function migrateConfig(loadedConfig) {
    const configVersion = loadedConfig.configVersion || '1.0.0';
    
    let migratedConfig = { ...loadedConfig };
    
    console.log(`Migrating config from version ${configVersion} to ${CURRENT_VERSION}`);
    
    // Migration from versions before 2.0.0
    if (compareVersions(configVersion, '2.0.0') < 0) {
        console.log('Applying migration for v2.0.0');
        
        // Migrate old app structure if it exists
        if (migratedConfig.apps && Array.isArray(migratedConfig.apps)) {
            migratedConfig.appGroups = migratedConfig.apps.map(app => ({
                name: app.name || 'Migrated Group',
                enabled: app.enabled !== false,
                condition: 'any',
                monitoredApps: app.monitoredApps || [],
                controlledApps: app.controlledApps || []
            }));
            delete migratedConfig.apps;
        }
        
        // Add default monitoring settings if missing
        if (!migratedConfig.monitoring) {
            migratedConfig.monitoring = { interval: 2500, enabled: true };
        }
    }
    
    // Migration from versions before 3.0.0
    if (compareVersions(configVersion, '3.0.0') < 0) {
        console.log('Applying migration for v3.0.0');
        
        // Add UI settings if missing
        if (!migratedConfig.ui) {
            migratedConfig.ui = { theme: 'dark', animations: true };
        }
        
        // Ensure each app group has required fields
        if (migratedConfig.appGroups && Array.isArray(migratedConfig.appGroups)) {
            migratedConfig.appGroups = migratedConfig.appGroups.map(group => ({
                ...group,
                enabled: group.enabled !== false,
                condition: group.condition || 'any',
                monitoredApps: Array.isArray(group.monitoredApps) ? group.monitoredApps : [],
                controlledApps: Array.isArray(group.controlledApps) ? group.controlledApps : []
            }));
        }
    }
    
    // Migration from versions before 4.0.0
    if (compareVersions(configVersion, '4.0.0') < 0) {
        console.log('Applying migration for v4.0.0');
        
        // Validate controlled apps have all required fields
        if (migratedConfig.appGroups && Array.isArray(migratedConfig.appGroups)) {
            migratedConfig.appGroups = migratedConfig.appGroups.map(group => ({
                ...group,
                controlledApps: group.controlledApps.map(app => ({
                    name: app.name,
                    path: app.path || '',
                    action: app.action || 'sync'
                }))
            }));
        }
    }
    
    // Migration from versions before 4.1.0
    if (compareVersions(configVersion, '4.1.0') < 0) {
        console.log('Applying migration for v4.1.0');
        
        // Add any new v4.1.0 specific settings here if needed
        // For now, no specific changes required
    }
    
    // Update config version
    migratedConfig.configVersion = CURRENT_VERSION;
    
    console.log('Config migration completed');
    return migratedConfig;
}

async function testMigration() {
    console.log('=== Testing Configuration Migration ===\n');
    
    const testConfigs = [
        {
            name: 'v1.x config (with apps array)',
            config: {
                "apps": [
                    {
                        "name": "Test App",
                        "enabled": true,
                        "monitoredApps": [{"name": "test.exe"}],
                        "controlledApps": [{"name": "control.exe", "path": "/test", "action": "sync"}]
                    }
                ],
                "anonymousUsage": true
            }
        },
        {
            name: 'v2.x config (with appGroups)',
            config: {
                "appGroups": [
                    {
                        "name": "Test Group",
                        "enabled": true,
                        "monitoredApps": [{"name": "test.exe"}],
                        "controlledApps": [{"name": "control.exe", "path": "/test", "action": "sync"}]
                    }
                ],
                "anonymousUsage": true,
                "monitoring": {"interval": 2500, "enabled": true}
            }
        },
        {
            name: 'v3.x config (with UI settings)',
            config: {
                "appGroups": [
                    {
                        "name": "Test Group v3",
                        "enabled": true,
                        "condition": "any",
                        "monitoredApps": [{"name": "test.exe"}],
                        "controlledApps": [{"name": "control.exe", "path": "/test", "action": "sync"}]
                    }
                ],
                "anonymousUsage": true,
                "monitoring": {"interval": 2500, "enabled": true},
                "ui": {"theme": "dark", "animations": true},
                "configVersion": "3.0.0"
            }
        }
    ];
    
    let allTestsPassed = true;
    
    for (const test of testConfigs) {
        console.log(`Testing: ${test.name}`);
        console.log('Original config:', JSON.stringify(test.config, null, 2));
        
        try {
            const migratedConfig = await migrateConfig(test.config);
            console.log('Migrated config:', JSON.stringify(migratedConfig, null, 2));
            
            // Validate migration
            if (migratedConfig.configVersion !== CURRENT_VERSION) {
                throw new Error(`Config version not updated to ${CURRENT_VERSION}`);
            }
            
            if (!Array.isArray(migratedConfig.appGroups)) {
                throw new Error('appGroups not properly migrated');
            }
            
            if (!migratedConfig.monitoring || !migratedConfig.ui) {
                throw new Error('monitoring or ui settings missing');
            }
            
            console.log('✅ Migration test passed\n');
            
        } catch (error) {
            console.error('❌ Migration test failed:', error.message);
            allTestsPassed = false;
        }
    }
    
    if (allTestsPassed) {
        console.log('🎉 All migration tests passed!');
        process.exit(0);
    } else {
        console.log('💥 Some migration tests failed!');
        process.exit(1);
    }
}

// Run the test
testMigration().catch(error => {
    console.error('Test script failed:', error);
    process.exit(1);
}); 