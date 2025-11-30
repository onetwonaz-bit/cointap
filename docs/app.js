// CoinTap - Telegram Mini App
// ВАЖЛИВО: Зміни цей URL на свій сервер!
const API_URL = 'http://localhost:3000/api';
const ADMIN_ID = 5813570653;

let currentUser = null;
let isAdmin = false;
let tasks = [];
let history = [];
let currentTask = null;

const tg = window.Telegram?.WebApp;

document.addEventListener('DOMContentLoaded', () => {
    initTelegram();
    initNavigation();
    initModal();
    initAdmin();
});

function initTelegram() {
    if (tg) {
        tg.ready();
        tg.expand();
        if (tg.colorScheme === 'dark') {
            document.documentElement.style.setProperty('--bg-primary', '#000000');
            document.documentElement.style.setProperty('--bg-secondary', '#1c1c1e');
            document.documentElement.style.setProperty('--bg-tertiary', '#2c2c2e');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
        }
        const user = tg.initDataUnsafe?.user;
        initUser(user || { id: 123456789, first_name: 'Тест', username: 'testuser' });
    } else {
        initUser({ id: 123456789, first_name: 'Тест', username: 'testuser' });
    }
}

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
        if (data.banned) { showBannedScreen(data.banReason); return; }
        currentUser = data.user;
        updateUI();
        loadTasks();
    } catch (error) {
        console.error('Init error:', error);
        showToast('Помилка підключення', 'error');
    }
}

function updateUI() {
    if (!currentUser) return;
    document.getElementById('username').textContent = currentUser.firstName || currentUser.username || 'Користувач';
    document.getElementById('userId').textContent = `ID: ${currentUser.telegramId}`;
    document.getElementById('balance').textContent = currentUser.balance;
    document.getElementById('withdrawBalance').textContent = `${currentUser.balance} 🪙`;
    document.getElementById('userAvatar').textContent = (currentUser.firstName || currentUser.username || 'U')[0].toUpperCase();
    document.getElementById('withdrawBtn').disabled = currentUser.balance < 100;
    
    isAdmin = currentUser.telegramId === ADMIN_ID;
    if (isAdmin) document.getElementById('adminTab').classList.remove('hidden');
}

function initNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`${tabName}-tab`).classList.remove('hidden');
            if (tabName === 'history') loadHistory();
            if (tabName === 'admin' && isAdmin) loadAdminData();
        });
    });
    document.getElementById('withdrawBtn').addEventListener('click', requestWithdraw);
}

// ============ TASKS ============
async function loadTasks() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const response = await fetch(`${API_URL}/tasks?userId=${currentUser.id}`);
        const data = await response.json();
        tasks = data.tasks;
        renderTasks();
    } catch (error) {
        tasksList.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>Помилка завантаження</p></div>';
    }
}

function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    if (!tasks.length) {
        tasksList.innerHTML = '<div class="empty-state"><span class="empty-icon">✅</span><p>Всі завдання виконано!</p></div>';
        return;
    }
    tasksList.innerHTML = tasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
            <div class="task-icon">${{'subscribe':'📢','watch':'📺','visit':'🔗'}[task.type] || '⭐'}</div>
            <div class="task-info">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-description">${escapeHtml(task.description || '')}</div>
            </div>
            ${task.completed ? '<span class="task-status">✅</span>' : '<span class="task-reward">+20 🪙</span>'}
        </div>
    `).join('');
    
    tasksList.querySelectorAll('.task-card:not(.completed)').forEach(card => {
        card.addEventListener('click', () => {
            const task = tasks.find(t => t.id === parseInt(card.dataset.taskId));
            if (task) openTaskModal(task);
        });
    });
}

// ============ MODAL ============
function initModal() {
    document.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('modalVerify')?.addEventListener('click', verifyTask);
}

function openTaskModal(task) {
    currentTask = task;
    document.getElementById('modalTitle').textContent = task.title;
    document.getElementById('modalDescription').textContent = task.description || '';
    document.getElementById('modalAction').href = task.link;
    document.getElementById('modalAction').textContent = {'subscribe':'Підписатись','watch':'Переглянути','visit':'Перейти'}[task.type] || 'Виконати';
    document.getElementById('taskModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('taskModal').classList.add('hidden');
    currentTask = null;
}

async function verifyTask() {
    if (!currentTask) return;
    const btn = document.getElementById('modalVerify');
    btn.disabled = true;
    btn.textContent = 'Перевірка...';
    try {
        const response = await fetch(`${API_URL}/tasks/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, taskId: currentTask.id, telegramId: currentUser.telegramId })
        });
        const data = await response.json();
        if (data.success) {
            currentUser.balance = data.newBalance;
            updateUI();
            tasks.find(t => t.id === currentTask.id).completed = true;
            renderTasks();
            closeModal();
            showToast('Завдання виконано! +20 🪙', 'success');
            tg?.HapticFeedback?.notificationOccurred('success');
        } else {
            showToast(data.message || 'Підписка не знайдена', 'error');
        }
    } catch (error) {
        showToast('Помилка перевірки', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Перевірити';
    }
}

// ============ HISTORY ============
async function loadHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const response = await fetch(`${API_URL}/history?userId=${currentUser.id}`);
        const data = await response.json();
        history = data.history;
        if (!history.length) {
            list.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>Історія порожня</p></div>';
            return;
        }
        list.innerHTML = history.map(item => {
            const isWithdraw = item.type === 'withdraw';
            const cls = isWithdraw ? (item.status === 'pending' ? 'pending' : 'negative') : 'positive';
            const prefix = isWithdraw ? '-' : '+';
            return `<div class="history-item"><div class="history-info"><div class="history-title">${escapeHtml(item.description)}</div><div class="history-date">${formatDate(item.createdAt)}</div></div><span class="history-amount ${cls}">${prefix}${item.amount} 🪙</span></div>`;
        }).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>Помилка</p></div>';
    }
}

// ============ WITHDRAW ============
async function requestWithdraw() {
    if (currentUser.balance < 100) { showToast('Мінімум 100 🪙', 'error'); return; }
    const btn = document.getElementById('withdrawBtn');
    btn.disabled = true;
    btn.textContent = 'Обробка...';
    try {
        const response = await fetch(`${API_URL}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, amount: currentUser.balance })
        });
        const data = await response.json();
        if (data.success) {
            currentUser.balance = data.newBalance;
            updateUI();
            showToast('Запит створено!', 'success');
            loadHistory();
        } else {
            showToast(data.message || 'Помилка', 'error');
        }
    } catch (error) {
        showToast('Помилка', 'error');
    } finally {
        btn.disabled = currentUser.balance < 100;
        btn.textContent = 'Запросити вивід';
    }
}

// ============ ADMIN ============
function initAdmin() {
    document.getElementById('addTaskBtn')?.addEventListener('click', addTask);
}

async function loadAdminData() {
    if (!isAdmin) return;
    try {
        const response = await fetch(`${API_URL}/admin/data`);
        const data = await response.json();
        
        document.getElementById('statUsers').textContent = data.stats.totalUsers;
        document.getElementById('statBalance').textContent = data.stats.totalBalance;
        document.getElementById('statPending').textContent = data.stats.pendingWithdrawals;
        
        // Withdrawals
        const wList = document.getElementById('withdrawalsList');
        wList.innerHTML = data.withdrawals.length ? data.withdrawals.map(w => `
            <div class="admin-list-item">
                <div class="admin-list-info">
                    <div class="admin-list-name">${escapeHtml(w.firstName || w.username || 'User')}</div>
                    <div class="admin-list-sub">ID: ${w.telegramId}</div>
                </div>
                <span class="withdrawal-amount">${w.amount} 🪙</span>
                <div class="admin-list-actions">
                    <button class="btn btn-sm btn-success" onclick="approveWithdraw(${w.id})">✓</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectWithdraw(${w.id})">✕</button>
                </div>
            </div>
        `).join('') : '<div class="empty-state-small">Немає запитів</div>';
        
        // Users
        const uList = document.getElementById('usersList');
        uList.innerHTML = data.users.slice(0, 30).map(u => `
            <div class="admin-list-item">
                <div class="admin-list-info">
                    <div class="admin-list-name ${u.isBanned ? 'user-banned' : ''}">${u.isBanned ? '🚫 ' : ''}${escapeHtml(u.firstName || u.username || 'User')}</div>
                    <div class="admin-list-sub">ID: ${u.telegramId}</div>
                </div>
                <span class="user-balance-badge">${u.balance} 🪙</span>
                <div class="admin-list-actions">
                    ${u.isBanned 
                        ? `<button class="btn btn-sm btn-success" onclick="unbanUser(${u.id})">Розбан</button>`
                        : `<button class="btn btn-sm btn-danger" onclick="banUser(${u.id})">Бан</button>`}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Admin error:', error);
    }
}

async function addTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDesc').value.trim();
    const link = document.getElementById('taskLink').value.trim();
    const channelId = document.getElementById('taskChannel').value.trim();
    
    if (!title || !link) { showToast('Заповни назву і посилання', 'error'); return; }
    
    try {
        const response = await fetch(`${API_URL}/admin/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, link, channelId, type: 'subscribe' })
        });
        if ((await response.json()).success) {
            showToast('Завдання додано!', 'success');
            ['taskTitle', 'taskDesc', 'taskLink', 'taskChannel'].forEach(id => document.getElementById(id).value = '');
            loadTasks();
        }
    } catch (error) { showToast('Помилка', 'error'); }
}

async function approveWithdraw(id) {
    await fetch(`${API_URL}/admin/withdraw/${id}/approve`, { method: 'POST' });
    showToast('Підтверджено', 'success');
    loadAdminData();
}

async function rejectWithdraw(id) {
    await fetch(`${API_URL}/admin/withdraw/${id}/reject`, { method: 'POST' });
    showToast('Відхилено', 'success');
    loadAdminData();
}

async function banUser(id) {
    await fetch(`${API_URL}/admin/user/${id}/ban`, { method: 'POST' });
    showToast('Забанено', 'success');
    loadAdminData();
}

async function unbanUser(id) {
    await fetch(`${API_URL}/admin/user/${id}/unban`, { method: 'POST' });
    showToast('Розбанено', 'success');
    loadAdminData();
}

// ============ UTILS ============
function showBannedScreen(reason) {
    document.body.innerHTML = `<div class="banned-overlay"><div class="banned-icon">🚫</div><h1 class="banned-title">Заблоковано</h1><p class="banned-message">${reason || 'Порушення правил'}</p></div>`;
}

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
