require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(express.json());

// ============ API Routes ============

// Ініціалізація користувача
app.post('/api/user/init', (req, res) => {
    try {
        const { telegramId, username, firstName, lastName } = req.body;
        
        // Створити або отримати користувача
        db.createUser.run(telegramId, username, firstName, lastName);
        const user = db.getUserByTelegramId.get(telegramId);
        
        if (user.isBanned) {
            return res.json({ banned: true, banReason: user.banReason });
        }
        
        res.json({ user });
    } catch (error) {
        console.error('Init error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Отримати завдання
app.get('/api/tasks', (req, res) => {
    try {
        const userId = parseInt(req.query.userId);
        const tasks = db.getActiveTasks.all();
        const completed = db.getCompletedTasks.all(userId).map(c => c.taskId);
        
        const tasksWithStatus = tasks.map(task => ({
            ...task,
            completed: completed.includes(task.id)
        }));
        
        res.json({ tasks: tasksWithStatus });
    } catch (error) {
        console.error('Tasks error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Перевірка завдання (підписка на канал)
app.post('/api/tasks/verify', async (req, res) => {
    try {
        const { userId, taskId, telegramId } = req.body;
        
        // Перевірити чи вже виконано
        if (db.isTaskCompleted.get(userId, taskId)) {
            return res.json({ success: false, message: 'Завдання вже виконано' });
        }
        
        const task = db.getTaskById.get(taskId);
        if (!task) {
            return res.json({ success: false, message: 'Завдання не знайдено' });
        }
        
        // Перевірка підписки на канал
        if (task.type === 'subscribe' && task.channelId) {
            try {
                const member = await bot.getChatMember(task.channelId, telegramId);
                const validStatuses = ['member', 'administrator', 'creator'];
                
                if (!validStatuses.includes(member.status)) {
                    return res.json({ success: false, message: 'Ви не підписані на канал' });
                }
            } catch (err) {
                console.error('Check subscription error:', err);
                return res.json({ success: false, message: 'Не вдалося перевірити підписку' });
            }
        }
        
        // Виконати завдання
        db.completeTask.run(userId, taskId);
        db.updateUserBalance.run(task.reward, userId);
        db.createTransaction.run(userId, 'task', task.reward, `Завдання: ${task.title}`, 'completed');
        
        const user = db.getUserById.get(userId);
        
        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Історія транзакцій
app.get('/api/history', (req, res) => {
    try {
        const userId = parseInt(req.query.userId);
        const history = db.getUserTransactions.all(userId);
        res.json({ history });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Запит на вивід
app.post('/api/withdraw', (req, res) => {
    try {
        const { userId, amount } = req.body;
        const user = db.getUserById.get(userId);
        
        if (!user || user.balance < 100) {
            return res.json({ success: false, message: 'Недостатньо коштів' });
        }
        
        const withdrawAmount = Math.min(amount, user.balance);
        
        // Створити запит на вивід
        db.createWithdrawal.run(userId, withdrawAmount);
        db.setUserBalance.run(0, userId);
        db.createTransaction.run(userId, 'withdraw', withdrawAmount, 'Запит на вивід', 'pending');
        
        // Повідомити адміна
        const dollarAmount = (withdrawAmount / 100).toFixed(2);
        bot.sendMessage(ADMIN_ID, 
            `💰 *Новий запит на вивід*\n\n` +
            `👤 Користувач: ${user.firstName || user.username} (@${user.username || 'немає'})\n` +
            `🆔 Telegram ID: \`${user.telegramId}\`\n` +
            `💵 Сума: ${withdrawAmount} 🪙 ($${dollarAmount})\n\n` +
            `Використай /withdrawals для перегляду всіх запитів`,
            { parse_mode: 'Markdown' }
        );
        
        res.json({ success: true, newBalance: 0 });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ Telegram Bot Commands ============

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = process.env.FRONTEND_URL || '';
    
    const messageText = 
        `👋 Привіт! Ласкаво просимо до *CoinTap*!\n\n` +
        `🪙 Виконуй завдання та заробляй монети\n` +
        `💰 100 монет = $1\n` +
        `📤 Мінімальний вивід: 100 монет`;
    
    // Якщо є HTTPS URL - показуємо кнопку Web App
    if (webAppUrl && webAppUrl.startsWith('https://')) {
        bot.sendMessage(chatId, messageText + `\n\nНатисни кнопку нижче, щоб почати:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🚀 Відкрити CoinTap', web_app: { url: webAppUrl } }
                ]]
            }
        });
    } else {
        // Без Web App - просто інформація
        bot.sendMessage(chatId, messageText + `\n\n⚠️ Web App ще не налаштовано (потрібен HTTPS)`, {
            parse_mode: 'Markdown'
        });
    }
});


// ============ Admin Commands ============

// Перевірка адміна
function isAdmin(userId) {
    return userId === ADMIN_ID;
}

// Список користувачів
bot.onText(/\/users/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const users = db.getAllUsers.all();
    let text = `👥 *Користувачі (${users.length}):*\n\n`;
    
    users.slice(0, 20).forEach((u, i) => {
        const status = u.isBanned ? '🚫' : '✅';
        text += `${i + 1}. ${status} ${u.firstName || u.username || 'Без імені'}\n`;
        text += `   ID: \`${u.telegramId}\` | Баланс: ${u.balance} 🪙\n\n`;
    });
    
    if (users.length > 20) {
        text += `\n... та ще ${users.length - 20} користувачів`;
    }
    
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// Запити на вивід
bot.onText(/\/withdrawals/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const withdrawals = db.getPendingWithdrawals.all();
    
    if (withdrawals.length === 0) {
        return bot.sendMessage(msg.chat.id, '✅ Немає активних запитів на вивід');
    }
    
    let text = `💰 *Запити на вивід (${withdrawals.length}):*\n\n`;
    
    withdrawals.forEach((w, i) => {
        const dollars = (w.amount / 100).toFixed(2);
        text += `${i + 1}. ${w.firstName || w.username}\n`;
        text += `   TG: \`${w.telegramId}\`\n`;
        text += `   Сума: ${w.amount} 🪙 ($${dollars})\n`;
        text += `   /approve_${w.id} | /reject_${w.id}\n\n`;
    });
    
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// Підтвердити вивід
bot.onText(/\/approve_(\d+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const withdrawalId = parseInt(match[1]);
    db.approveWithdrawal.run(withdrawalId);
    
    bot.sendMessage(msg.chat.id, `✅ Вивід #${withdrawalId} підтверджено`);
});

// Відхилити вивід
bot.onText(/\/reject_(\d+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const withdrawalId = parseInt(match[1]);
    db.rejectWithdrawal.run(withdrawalId);
    
    bot.sendMessage(msg.chat.id, `❌ Вивід #${withdrawalId} відхилено`);
});

// Забанити користувача
bot.onText(/\/ban (\d+) ?(.*)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const telegramId = parseInt(match[1]);
    const reason = match[2] || 'Порушення правил';
    
    const user = db.getUserByTelegramId.get(telegramId);
    if (!user) {
        return bot.sendMessage(msg.chat.id, '❌ Користувача не знайдено');
    }
    
    db.banUser.run(reason, user.id);
    bot.sendMessage(msg.chat.id, `🚫 Користувач ${user.firstName || telegramId} забанений\nПричина: ${reason}`);
});

// Розбанити користувача
bot.onText(/\/unban (\d+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const telegramId = parseInt(match[1]);
    const user = db.getUserByTelegramId.get(telegramId);
    
    if (!user) {
        return bot.sendMessage(msg.chat.id, '❌ Користувача не знайдено');
    }
    
    db.unbanUser.run(user.id);
    bot.sendMessage(msg.chat.id, `✅ Користувач ${user.firstName || telegramId} розбанений`);
});

// Додати завдання
bot.onText(/\/addtask/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    bot.sendMessage(msg.chat.id, 
        `📝 *Додати завдання*\n\n` +
        `Формат:\n` +
        `/newtask subscribe | Назва | Опис | https://t.me/channel | @channel_username\n\n` +
        `Приклад:\n` +
        `/newtask subscribe | Підписка на канал | Підпишись на наш канал | https://t.me/mychannel | @mychannel`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/newtask (.+)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    
    const parts = match[1].split('|').map(p => p.trim());
    
    if (parts.length < 4) {
        return bot.sendMessage(msg.chat.id, '❌ Неправильний формат. Використай /addtask для допомоги');
    }
    
    const [type, title, description, link, channelId] = parts;
    
    db.createTask.run(type, title, description, link, channelId || null, 20);
    bot.sendMessage(msg.chat.id, `✅ Завдання "${title}" додано!`);
});

// Статистика
bot.onText(/\/stats/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    const users = db.getAllUsers.all();
    const totalBalance = users.reduce((sum, u) => sum + u.balance, 0);
    const pendingWithdrawals = db.getPendingWithdrawals.all();
    const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    bot.sendMessage(msg.chat.id,
        `📊 *Статистика CoinTap*\n\n` +
        `👥 Користувачів: ${users.length}\n` +
        `🚫 Забанених: ${users.filter(u => u.isBanned).length}\n` +
        `💰 Загальний баланс: ${totalBalance} 🪙\n` +
        `📤 Очікують виводу: ${pendingWithdrawals.length} (${pendingAmount} 🪙)`,
        { parse_mode: 'Markdown' }
    );
});

// Допомога для адміна
bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) return;
    
    bot.sendMessage(msg.chat.id,
        `🔧 *Адмін команди:*\n\n` +
        `/stats - Статистика\n` +
        `/users - Список користувачів\n` +
        `/withdrawals - Запити на вивід\n` +
        `/addtask - Додати завдання\n` +
        `/ban <telegram_id> [причина] - Забанити\n` +
        `/unban <telegram_id> - Розбанити`,
        { parse_mode: 'Markdown' }
    );
});

// ============ Start Server ============

app.listen(PORT, () => {
    console.log(`🚀 CoinTap server running on port ${PORT}`);
    console.log(`🤖 Telegram bot started`);
});
