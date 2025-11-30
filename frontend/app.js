// CoinTap - Telegram Mini App
const API_URL = 'http://localhost:3000/api'; // Change to your server URL

// State
let currentUser = null;
let tasks = [];
let history = [];
let currentTask = null;

// Telegram WebApp
const tg = window.Telegram?.WebApp;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTelegram();
    initNavigation();
    initModal();
});

// Telegram initialization
function initTelegram() {
    if (tg) {
        tg.ready();
        tg.expand();
        
        // Set theme
        if (tg.colorScheme === 'dark') {
            document.documentElement.style.setProperty('--bg-primary', '#000000');
            document.documentElement.style.setProperty('--bg-secondary', '#1c1c1e');
            document.documentElement.style.setProperty('--bg-tertiary', '#2c2c2e');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
        }
        
        // Get user data
        const user = tg.initDataUnsafe?.user;
        if (user) {
            initUser(user);
        } else {
            // Demo mode for testing
            initUser({ id: 123456789, first_name: 'Тест', username: 'testuser' });
        }
    } else {
        // Demo mode
        initUser({ id: 123456789, first_name: 'Тест', username: 'testuser' });
    }
}

// Initialize user
async function initUser(telegramUser) {
    try {
        const response = await fetch(`${API_URL}/user/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: telegramUser.id,
                username: telegramUser.username || '',
                firstName: telegramUser.first_name || '',
                lastName: telegramUser.last_name || '',
                initData: tg?.initData || ''
            })
        });
        
        const data = await response.json();
        
        if (data.banned) {
            showBannedScreen(data.banReason);
            return;
        }
        
        currentUser = data.user;
        updateUI();
        loadTasks();
        loadHistory();
    } catch (error) {
        console.error('Init error:', error);
        showToast('Помилка підключення до сервера', 'error');
    }
}

// Update UI with user data
function updateUI() {
    if (!currentUser) return;
    
    document.getElementById('username').textContent = currentUser.firstName || currentUser.username || 'Користувач';
    document.getElementById('userId').textContent = `ID: ${currentUser.telegramId}`;
    document.getElementById('balance').textContent = currentUser.balance;
    document.getElementById('withdrawBalance').textContent = `${currentUser.balance} 🪙`;
    
    // Avatar
    const avatar = document.getElementById('userAvatar');
    const initial = (currentUser.firstName || currentUser.username || 'U')[0].toUpperCase();
    avatar.textContent = initial;
    
    // Withdraw button
    const withdrawBtn = document.getElementById('withdrawBtn');
    withdrawBtn.disabled = currentUser.balance < 100;
}


// Navigation
function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show content
            document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`${tabName}-tab`).classList.remove('hidden');
            
            // Refresh data
            if (tabName === 'history') loadHistory();
        });
    });
    
    // Withdraw button
    document.getElementById('withdrawBtn').addEventListener('click', requestWithdraw);
}

// Load tasks
async function loadTasks() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    try {
        const response = await fetch(`${API_URL}/tasks?userId=${currentUser.id}`);
        const data = await response.json();
        tasks = data.tasks;
        renderTasks();
    } catch (error) {
        console.error('Load tasks error:', error);
        tasksList.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>Помилка завантаження</p></div>';
    }
}

// Render tasks
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    
    if (tasks.length === 0) {
        tasksList.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><p>Всі завдання виконано!</p></div>';
        return;
    }
    
    tasksList.innerHTML = tasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
            <div class="task-icon">${getTaskIcon(task.type)}</div>
            <div class="task-info">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-description">${escapeHtml(task.description)}</div>
            </div>
            ${task.completed 
                ? '<span class="task-status">✅</span>' 
                : '<span class="task-reward">+20 🪙</span>'}
        </div>
    `).join('');
    
    // Add click handlers
    tasksList.querySelectorAll('.task-card:not(.completed)').forEach(card => {
        card.addEventListener('click', () => {
            const taskId = parseInt(card.dataset.taskId);
            const task = tasks.find(t => t.id === taskId);
            if (task) openTaskModal(task);
        });
    });
}

// Get task icon
function getTaskIcon(type) {
    const icons = {
        'subscribe': '📢',
        'watch': '📺',
        'visit': '🔗',
        'default': '⭐'
    };
    return icons[type] || icons.default;
}

// Modal
function initModal() {
    const modal = document.getElementById('taskModal');
    const backdrop = modal.querySelector('.modal-backdrop');
    const closeBtn = document.getElementById('modalClose');
    const verifyBtn = document.getElementById('modalVerify');
    
    backdrop.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    verifyBtn.addEventListener('click', verifyTask);
}

function openTaskModal(task) {
    currentTask = task;
    
    document.getElementById('modalTitle').textContent = task.title;
    document.getElementById('modalDescription').textContent = task.description;
    document.getElementById('modalAction').href = task.link;
    document.getElementById('modalAction').textContent = getActionText(task.type);
    
    document.getElementById('taskModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('taskModal').classList.add('hidden');
    currentTask = null;
}

function getActionText(type) {
    const texts = {
        'subscribe': 'Підписатись',
        'watch': 'Переглянути',
        'visit': 'Перейти'
    };
    return texts[type] || 'Виконати';
}

// Verify task
async function verifyTask() {
    if (!currentTask) return;
    
    const verifyBtn = document.getElementById('modalVerify');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Перевірка...';
    
    try {
        const response = await fetch(`${API_URL}/tasks/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                taskId: currentTask.id,
                telegramId: currentUser.telegramId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser.balance = data.newBalance;
            updateUI();
            
            // Mark task as completed
            const task = tasks.find(t => t.id === currentTask.id);
            if (task) task.completed = true;
            renderTasks();
            
            closeModal();
            showToast('Завдання виконано! +20 🪙', 'success');
            
            // Haptic feedback
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } else {
            showToast(data.message || 'Підписка не знайдена', 'error');
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    } catch (error) {
        console.error('Verify error:', error);
        showToast('Помилка перевірки', 'error');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Перевірити';
    }
}


// Load history
async function loadHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    try {
        const response = await fetch(`${API_URL}/history?userId=${currentUser.id}`);
        const data = await response.json();
        history = data.history;
        renderHistory();
    } catch (error) {
        console.error('Load history error:', error);
        historyList.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>Помилка завантаження</p></div>';
    }
}

// Render history
function renderHistory() {
    const historyList = document.getElementById('historyList');
    
    if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>Історія поки порожня</p></div>';
        return;
    }
    
    historyList.innerHTML = history.map(item => {
        let amountClass = 'positive';
        let amountPrefix = '+';
        
        if (item.type === 'withdraw') {
            if (item.status === 'pending') {
                amountClass = 'pending';
                amountPrefix = '-';
            } else if (item.status === 'completed') {
                amountClass = 'negative';
                amountPrefix = '-';
            }
        }
        
        return `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-title">${escapeHtml(item.description)}</div>
                    <div class="history-date">${formatDate(item.createdAt)}</div>
                </div>
                <span class="history-amount ${amountClass}">${amountPrefix}${item.amount} 🪙</span>
            </div>
        `;
    }).join('');
}

// Request withdraw
async function requestWithdraw() {
    if (currentUser.balance < 100) {
        showToast('Мінімальна сума для виводу: 100 🪙', 'error');
        return;
    }
    
    const withdrawBtn = document.getElementById('withdrawBtn');
    withdrawBtn.disabled = true;
    withdrawBtn.textContent = 'Обробка...';
    
    try {
        const response = await fetch(`${API_URL}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                amount: currentUser.balance
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser.balance = data.newBalance;
            updateUI();
            showToast('Запит на вивід створено!', 'success');
            loadHistory();
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } else {
            showToast(data.message || 'Помилка створення запиту', 'error');
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        showToast('Помилка підключення', 'error');
    } finally {
        withdrawBtn.disabled = currentUser.balance < 100;
        withdrawBtn.textContent = 'Запросити вивід';
    }
}

// Show banned screen
function showBannedScreen(reason) {
    const overlay = document.createElement('div');
    overlay.className = 'banned-overlay';
    overlay.innerHTML = `
        <div class="banned-icon">🚫</div>
        <h1 class="banned-title">Акаунт заблоковано</h1>
        <p class="banned-message">${reason || 'Ваш акаунт було заблоковано за порушення правил.'}</p>
    `;
    document.body.appendChild(overlay);
}

// Toast notification
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}
