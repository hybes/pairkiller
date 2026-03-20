let currentStatus = 'checking';
let removeUpdateStatus;
let removeUpdateProgress;

function updateStatus(status, message) {
    const statusIcon = document.getElementById('statusIcon');
    const updateMessage = document.getElementById('updateMessage');
    const progressContainer = document.getElementById('progressContainer');
    const actionButton = document.getElementById('actionButton');

    updateMessage.textContent = message;
    updateMessage.classList.add('fade-in');

    switch (status) {
        case 'checking':
            statusIcon.innerHTML = '<i class="fas fa-search spinning"></i>';
            statusIcon.className = 'status-icon status-downloading';
            progressContainer.style.display = 'none';
            actionButton.style.display = 'none';
            break;

        case 'downloading':
            statusIcon.innerHTML = '<i class="fas fa-download spinning"></i>';
            statusIcon.className = 'status-icon status-downloading';
            progressContainer.style.display = 'block';
            actionButton.style.display = 'none';
            break;

        case 'ready':
            statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            statusIcon.className = 'status-icon status-success';
            progressContainer.style.display = 'none';
            actionButton.style.display = 'inline-block';
            break;

        case 'up-to-date':
            statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            statusIcon.className = 'status-icon status-success';
            progressContainer.style.display = 'none';
            actionButton.style.display = 'none';
            setTimeout(() => closeUpdateWindow(), 2000);
            break;

        case 'error':
            statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            statusIcon.className = 'status-icon status-error';
            progressContainer.style.display = 'none';
            actionButton.style.display = 'none';
            break;
    }

    currentStatus = status;
}

function updateProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${Math.round(percent)}%`;
}

function closeUpdateWindow() {
    pairkiller.send('close-update-window');
    window.close();
}

function installUpdate() {
    pairkiller.send('install-update');
}

document.addEventListener('DOMContentLoaded', () => {
    removeUpdateStatus = pairkiller.on('update-status', (message) => {
        if (message.includes('available') && message.includes('Downloading')) {
            updateStatus('downloading', message);
        } else if (message.includes('latest version')) {
            updateStatus('up-to-date', message);
        } else if (message.includes('ready to install') || message.includes('downloaded')) {
            updateStatus('ready', 'Update downloaded and ready to install!');
        } else if (message.includes('Error')) {
            updateStatus('error', message);
        } else {
            updateStatus('checking', message);
        }
    });

    removeUpdateProgress = pairkiller.on('update-progress', (progress) => {
        updateProgress(progress);
    });

    updateStatus('checking', 'Checking for updates...');
});

window.addEventListener('beforeunload', () => {
    if (typeof removeUpdateStatus === 'function') removeUpdateStatus();
    if (typeof removeUpdateProgress === 'function') removeUpdateProgress();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeUpdateWindow();
    }

    if (e.key === 'Enter' && currentStatus === 'ready') {
        installUpdate();
    }
});
