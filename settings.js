let config;
let presets;
let isLoading = false;
let unsavedChanges = false;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showNotification('Failed to load settings', 'error');
    }
});

async function initializeApp() {
    showLoading(true);
    
    try {
        config = await pairkiller.invoke('get-config');
        presets = await pairkiller.invoke('get-presets');
        
        await Promise.all([
            loadPresets(),
            loadAppGroups(),
            loadSystemSettings()
        ]);
        
        setupEventListeners();
        updateUI();
        
        showLoading(false);
        showNotification('Settings loaded successfully', 'success');
        
    } catch (error) {
        showLoading(false);
        throw error;
    }
}

function setupEventListeners() {
    const addGroupButton = document.getElementById('addGroupButton');
    const saveButton = document.getElementById('saveSettingsButton');
    const autoStartToggle = document.getElementById('autoStartToggle');

    addGroupButton.addEventListener('click', () => {
        createGroupElement();
        markUnsavedChanges();
    });

    saveButton.addEventListener('click', saveSettings);
    
    if (autoStartToggle) {
        autoStartToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            showNotification('Updating auto-start setting...', 'info');
            
            try {
                const result = await pairkiller.invoke('set-auto-start', enabled);
                if (result.success) {
                    showNotification(`Auto-start ${enabled ? 'enabled' : 'disabled'}`, 'success');
                } else {
                    showNotification(`Failed to update auto-start: ${result.error}`, 'error');
                    e.target.checked = !enabled;
                }
            } catch (error) {
                console.error('Error updating auto-start:', error);
                showNotification('Failed to update auto-start setting', 'error');
                e.target.checked = !enabled;
            }
        });
    }

    const showInDockToggle = document.getElementById('showInDockToggle');
    if (showInDockToggle) {
        showInDockToggle.addEventListener('change', async (e) => {
            const showInDock = e.target.checked;
            const nextBackgroundMode = !showInDock;
            showNotification('Updating Dock preference...', 'info');
            try {
                const result = await pairkiller.invoke('set-background-mode', nextBackgroundMode);
                if (result.success) {
                    if (config && config.ui) {
                        config.ui.backgroundMode = result.backgroundMode;
                    }
                    showNotification(
                        showInDock ? 'Dock icon shown' : 'Menu bar only — Dock and App Switcher hidden',
                        'success'
                    );
                } else {
                    showNotification(result.error || 'Failed to update Dock preference', 'error');
                    e.target.checked = !showInDock;
                }
            } catch (error) {
                console.error('Error updating Dock preference:', error);
                showNotification('Failed to update Dock preference', 'error');
                e.target.checked = !showInDock;
            }
        });
    }

    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveSettings();
        }
    });
}

async function loadPresets() {
    const presetCardsMount = document.getElementById('preset-cards-mount');
    if (!presetCardsMount) {
        return;
    }
    presetCardsMount.innerHTML = '';

    const library = presets;
    if (!library || typeof library !== 'object' || typeof library.nodeType === 'number' || Array.isArray(library) || Object.keys(library).length === 0) {
        presetCardsMount.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-magic"></i>
                <h3>No Presets Available</h3>
                <p>Presets will appear here when available</p>
            </div>
        `;
        return;
    }

    Object.entries(library).forEach(([key, preset]) => {
        const card = document.createElement('div');
        card.className = 'preset-card fade-in';
        card.dataset.preset = key;
        
        card.innerHTML = `
            <div class="preset-title">${escapeHtml(preset.name)}</div>
            <div class="preset-description">${escapeHtml(preset.description || 'No description available')}</div>
        `;

        card.addEventListener('click', () => {
            createGroupElement({
                name: preset.name,
                condition: preset.condition || 'any',
                monitoredApps: [...preset.monitoredApps],
                controlledApps: [...preset.controlledApps]
            });
            markUnsavedChanges();
            showNotification(`Added preset: ${preset.name}`, 'success');
        });

        presetCardsMount.appendChild(card);
    });
}

function loadAppGroups() {
    const appGroupsContainer = document.getElementById('appGroups');
    appGroupsContainer.innerHTML = '';
    
    if (!config.appGroups || config.appGroups.length === 0) {
        showEmptyState(true);
        return;
    }
    
    showEmptyState(false);
    
    config.appGroups.forEach((group, index) => {
        setTimeout(() => {
            createGroupElement(group);
        }, index * 100);
    });
}

async function loadSystemSettings() {
    try {
        const autoStartToggle = document.getElementById('autoStartToggle');
        if (autoStartToggle) {
            const isEnabled = await pairkiller.invoke('get-auto-start');
            autoStartToggle.checked = isEnabled;
        }

        const dockRow = document.getElementById('macDockSettingRow');
        const showInDockToggle = document.getElementById('showInDockToggle');
        if (dockRow && showInDockToggle) {
            const mode = await pairkiller.invoke('get-background-mode');
            if (mode.isMacOS && !mode.isDev) {
                dockRow.style.display = 'flex';
                showInDockToggle.checked = !mode.backgroundMode;
            } else {
                dockRow.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to load system settings:', error);
    }
}

function createGroupElement(groupData = null) {
    const template = document.getElementById('groupTemplate');
    const groupElement = template.content.cloneNode(true);
    const group = groupElement.querySelector('.app-group');
    
    const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    group.dataset.groupId = groupId;

    if (groupData) {
        populateGroupData(group, groupData);
    }

    setupGroupEventListeners(group);
    
    const appGroupsContainer = document.getElementById('appGroups');
    appGroupsContainer.appendChild(group);
    
    showEmptyState(false);
    updateGroupCount();
    
    group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    const nameInput = group.querySelector('.group-name');
    if (!groupData) {
        nameInput.focus();
    }
    
    return group;
}

function populateGroupData(group, groupData) {
    group.querySelector('.group-name').value = groupData.name || '';
    group.querySelector('.condition-select').value = groupData.condition || 'any';
    
    if (groupData.monitoredApps) {
        groupData.monitoredApps.forEach(app => {
            addAppEntry(group.querySelector('.monitored-apps-list'), app);
        });
    }

    if (groupData.controlledApps) {
        groupData.controlledApps.forEach(app => {
            addAppEntry(group.querySelector('.controlled-apps-list'), app, true);
        });
    }
}

function setupGroupEventListeners(group) {
    const nameInput = group.querySelector('.group-name');
    const conditionSelect = group.querySelector('.condition-select');
    const addMonitoredBtn = group.querySelector('.add-monitored-app');
    const addControlledBtn = group.querySelector('.add-controlled-app');
    const duplicateBtn = group.querySelector('.duplicate-group');
    const deleteBtn = group.querySelector('.delete-group');

    nameInput.addEventListener('input', markUnsavedChanges);
    conditionSelect.addEventListener('change', markUnsavedChanges);

    addMonitoredBtn.addEventListener('click', () => {
        addAppEntry(group.querySelector('.monitored-apps-list'));
        markUnsavedChanges();
    });

    addControlledBtn.addEventListener('click', () => {
        addAppEntry(group.querySelector('.controlled-apps-list'), null, true);
        markUnsavedChanges();
    });

    duplicateBtn.addEventListener('click', () => {
        const groupData = getGroupData(group);
        groupData.name = `${groupData.name} (Copy)`;
        createGroupElement(groupData);
        markUnsavedChanges();
        showNotification('Group duplicated', 'success');
    });

    deleteBtn.addEventListener('click', () => {
        showConfirmDialog(
            'Delete Group',
            'Are you sure you want to delete this group? This action cannot be undone.',
            () => {
                group.style.opacity = '0';
                group.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    group.remove();
                    updateGroupCount();
                    showEmptyState(document.querySelectorAll('.app-group').length === 0);
                    markUnsavedChanges();
                    showNotification('Group deleted', 'success');
                }, 300);
            }
        );
    });
}

function addAppEntry(container, appData = null, isControlled = false) {
    const template = document.getElementById('appEntryTemplate');
    const appEntry = template.content.cloneNode(true);
    const entry = appEntry.querySelector('.app-entry');
    const actionContainer = entry.querySelector('.app-action-container');

    if (appData) {
        entry.querySelector('.app-name').value = appData.name || '';
        if (appData.path) {
            entry.querySelector('.app-path').value = appData.path;
        }
        if (isControlled && appData.action) {
            entry.querySelector('.app-action').value = appData.action;
        }
    }

    actionContainer.style.display = isControlled ? 'block' : 'none';

    setupAppEntryEventListeners(entry);
    container.appendChild(entry);
    
    const nameInput = entry.querySelector('.app-name');
    if (!appData) {
        nameInput.focus();
    }
}

function setupAppEntryEventListeners(entry) {
    const nameInput = entry.querySelector('.app-name');
    const pathInput = entry.querySelector('.app-path');
    const actionSelect = entry.querySelector('.app-action');
    const browseBtn = entry.querySelector('.browse-button');
    const deleteBtn = entry.querySelector('.delete-app');

    nameInput.addEventListener('input', markUnsavedChanges);
    pathInput.addEventListener('input', markUnsavedChanges);
    actionSelect.addEventListener('change', markUnsavedChanges);

    browseBtn.addEventListener('click', async () => {
        try {
            const result = await pairkiller.invoke('open-file-dialog');
            if (!result.canceled && result.filePath) {
                pathInput.value = result.filePath;
                if (!nameInput.value) {
                    nameInput.value = pairkiller.basename(result.filePath);
                }
                markUnsavedChanges();
            }
        } catch (error) {
            console.error('Error opening file dialog:', error);
            showNotification('Failed to open file dialog', 'error');
        }
    });

    deleteBtn.addEventListener('click', () => {
        entry.style.opacity = '0';
        entry.style.transform = 'scale(0.95)';
        setTimeout(() => {
            entry.remove();
            markUnsavedChanges();
        }, 200);
    });
}

function getGroupData(groupElement) {
    const group = {
        name: groupElement.querySelector('.group-name').value.trim(),
        condition: groupElement.querySelector('.condition-select').value,
        monitoredApps: [],
        controlledApps: []
    };

    groupElement.querySelectorAll('.monitored-apps-list .app-entry').forEach(appEntry => {
        const appData = getAppEntryData(appEntry);
        if (appData.name) {
            group.monitoredApps.push(appData);
        }
    });

    groupElement.querySelectorAll('.controlled-apps-list .app-entry').forEach(appEntry => {
        const appData = getAppEntryData(appEntry, true);
        if (appData.name) {
            group.controlledApps.push(appData);
        }
    });

    return group;
}

function getAppEntryData(appEntry, isControlled = false) {
    const appData = {
        name: appEntry.querySelector('.app-name').value.trim()
    };
    
    const path = appEntry.querySelector('.app-path').value.trim();
    if (path) {
        appData.path = path;
    }
    
    if (isControlled) {
        appData.action = appEntry.querySelector('.app-action').value;
    }
    
    return appData;
}

function validateConfiguration() {
    const errors = [];
    const groups = [];
    
    document.querySelectorAll('.app-group').forEach((groupElement, index) => {
        const groupData = getGroupData(groupElement);
        
        if (!groupData.name) {
            errors.push(`Group ${index + 1}: Name is required`);
        }
        
        if (groupData.monitoredApps.length === 0 && groupData.controlledApps.length === 0) {
            errors.push(`Group "${groupData.name}": At least one app (monitored or controlled) is required`);
        }
        
        groupData.monitoredApps.forEach((app, appIndex) => {
            if (!app.name) {
                errors.push(`Group "${groupData.name}", Monitored App ${appIndex + 1}: Name is required`);
            }
        });
        
        groupData.controlledApps.forEach((app, appIndex) => {
            if (!app.name) {
                errors.push(`Group "${groupData.name}", Controlled App ${appIndex + 1}: Name is required`);
            }
        });
        
        groups.push(groupData);
    });
    
    return { errors, groups };
}

async function saveSettings() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        
        const validation = validateConfiguration();
        
        if (validation.errors.length > 0) {
            showValidationErrors(validation.errors);
            return;
        }
        
        const newConfig = {
            ...config,
            appGroups: validation.groups
        };
        
        const result = await pairkiller.invoke('save-settings', newConfig);
        
        if (result.success) {
            config = newConfig;
            unsavedChanges = false;
            updateUI();
            showNotification('Settings saved successfully!', 'success');
            
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            throw new Error(result.error || 'Failed to save settings');
        }
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification(`Failed to save settings: ${error.message}`, 'error');
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

function showValidationErrors(errors) {
    const errorMessage = `Please fix the following errors:\n\n${errors.join('\n')}`;
    showConfirmDialog('Validation Errors', errorMessage, null, 'OK');
}

function markUnsavedChanges() {
    if (!unsavedChanges) {
        unsavedChanges = true;
        updateUI();
    }
}

function updateUI() {
    updateGroupCount();
    updateSaveButton();
}

function updateGroupCount() {
    const groupCount = document.querySelectorAll('.app-group').length;
    const groupCountElement = document.getElementById('groupCount');
    
    groupCountElement.innerHTML = `
        <i class="fas fa-circle"></i>
        ${groupCount} group${groupCount !== 1 ? 's' : ''}
    `;
    
    groupCountElement.className = `status-indicator ${groupCount > 0 ? 'status-active' : 'status-inactive'}`;
}

function updateSaveButton() {
    const saveButton = document.getElementById('saveSettingsButton');
    const hasChanges = unsavedChanges;
    
    if (hasChanges) {
        saveButton.innerHTML = `
            <i class="fas fa-save"></i>
            <span>Save Changes</span>
        `;
        saveButton.classList.add('pulse');
    } else {
        saveButton.innerHTML = `
            <i class="fas fa-save"></i>
            <span>Save & Close</span>
        `;
        saveButton.classList.remove('pulse');
    }
}

function showEmptyState(show) {
    const emptyState = document.getElementById('emptyState');
    emptyState.style.display = show ? 'block' : 'none';
}

function showLoading(show) {
    const saveButton = document.getElementById('saveSettingsButton');
    
    if (show) {
        saveButton.disabled = true;
        saveButton.innerHTML = `
            <div class="loading"></div>
            <span>Saving...</span>
        `;
    } else {
        saveButton.disabled = false;
        updateSaveButton();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: var(--shadow);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function showConfirmDialog(title, message, onConfirm, confirmText = 'Confirm', cancelText = 'Cancel') {
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        animation: fadeIn 0.2s ease-out;
    `;
    
    dialog.innerHTML = `
        <div class="dialog" style="
            background: var(--surface-elevated);
            border: 1px solid var(--border-color);
            border-radius: 1rem;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            box-shadow: var(--shadow);
            animation: scaleIn 0.2s ease-out;
        ">
            <h3 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1.25rem; font-weight: 600;">${escapeHtml(title)}</h3>
            <p style="margin: 0 0 2rem 0; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(message)}</p>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                ${onConfirm ? `<button class="btn btn-secondary cancel-btn">${escapeHtml(cancelText)}</button>` : ''}
                <button class="btn ${onConfirm ? 'btn-primary' : 'btn-secondary'} confirm-btn">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;
    
    const confirmBtn = dialog.querySelector('.confirm-btn');
    const cancelBtn = dialog.querySelector('.cancel-btn');
    
    confirmBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
        if (onConfirm) onConfirm();
    });
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
    }
    
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
    
    document.body.appendChild(dialog);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes scaleIn {
        from {
            transform: scale(0.9);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    .pulse {
        animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.02);
        }
    }
`;
document.head.appendChild(style);
