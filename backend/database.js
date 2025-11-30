const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'cointap.db'));

// Ініціалізація таблиць
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegramId INTEGER UNIQUE NOT NULL,
        username TEXT,
        firstName TEXT,
        lastName TEXT,
        balance INTEGER DEFAULT 0,
        isBanned INTEGER DEFAULT 0,
        banReason TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        link TEXT NOT NULL,
        channelId TEXT,
        reward INTEGER DEFAULT 20,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS completedTasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        taskId INTEGER NOT NULL,
        completedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (taskId) REFERENCES tasks(id),
        UNIQUE(userId, taskId)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'completed',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        processedAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id)
    );
`);

module.exports = {
    // Users
    createUser: db.prepare(`
        INSERT OR IGNORE INTO users (telegramId, username, firstName, lastName)
        VALUES (?, ?, ?, ?)
    `),
    
    getUserByTelegramId: db.prepare(`
        SELECT * FROM users WHERE telegramId = ?
    `),
    
    getUserById: db.prepare(`
        SELECT * FROM users WHERE id = ?
    `),
    
    updateUserBalance: db.prepare(`
        UPDATE users SET balance = balance + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    setUserBalance: db.prepare(`
        UPDATE users SET balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    banUser: db.prepare(`
        UPDATE users SET isBanned = 1, banReason = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    unbanUser: db.prepare(`
        UPDATE users SET isBanned = 0, banReason = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    getAllUsers: db.prepare(`
        SELECT * FROM users ORDER BY createdAt DESC
    `),

    // Tasks
    createTask: db.prepare(`
        INSERT INTO tasks (type, title, description, link, channelId, reward)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    
    getActiveTasks: db.prepare(`
        SELECT * FROM tasks WHERE isActive = 1
    `),
    
    getTaskById: db.prepare(`
        SELECT * FROM tasks WHERE id = ?
    `),
    
    deactivateTask: db.prepare(`
        UPDATE tasks SET isActive = 0 WHERE id = ?
    `),
    
    // Completed Tasks
    completeTask: db.prepare(`
        INSERT OR IGNORE INTO completedTasks (userId, taskId) VALUES (?, ?)
    `),
    
    getCompletedTasks: db.prepare(`
        SELECT taskId FROM completedTasks WHERE userId = ?
    `),
    
    isTaskCompleted: db.prepare(`
        SELECT 1 FROM completedTasks WHERE userId = ? AND taskId = ?
    `),

    // Transactions
    createTransaction: db.prepare(`
        INSERT INTO transactions (userId, type, amount, description, status)
        VALUES (?, ?, ?, ?, ?)
    `),
    
    getUserTransactions: db.prepare(`
        SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
    `),

    // Withdrawals
    createWithdrawal: db.prepare(`
        INSERT INTO withdrawals (userId, amount) VALUES (?, ?)
    `),
    
    getPendingWithdrawals: db.prepare(`
        SELECT w.*, u.telegramId, u.username, u.firstName 
        FROM withdrawals w 
        JOIN users u ON w.userId = u.id 
        WHERE w.status = 'pending'
        ORDER BY w.createdAt ASC
    `),
    
    approveWithdrawal: db.prepare(`
        UPDATE withdrawals SET status = 'completed', processedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    rejectWithdrawal: db.prepare(`
        UPDATE withdrawals SET status = 'rejected', processedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),

    db
};
