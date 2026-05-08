require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET; // In prod, use environment variable

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create MySQL connection
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ,
    database: process.env.DB_NAME || 'expense_tracker',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Using promise wrapper for easier async queries
const promisePool = db.promise();

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });
        req.user = user;
        next();
    });
};

/* --- AUTHENTICATION ROUTES --- */

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert User
        const [result] = await promisePool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
        const userId = result.insertId;

        // Give them a default budget of $1000
        await promisePool.query('INSERT INTO budgets (user_id, monthly_limit) VALUES (?, ?)', [userId, 1000.00]);

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const [users] = await promisePool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(400).json({ error: 'Invalid email or password' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid email or password' });

        // Generate JWT
        const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/* --- EXPENSE ROUTES --- */

// Get all expenses for logged in user
app.get('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC', [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Add an expense with Logic Validation (Budget Check)
app.post('/api/expenses', authenticateToken, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;
        const userId = req.user.id;

        if (!title || !amount || !category || !date) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const expenseAmount = parseFloat(amount);
        const expenseDate = new Date(date);
        const currentMonth = expenseDate.getMonth() + 1; // 1-12
        const currentYear = expenseDate.getFullYear();

        // Check budget
        const [budgetRows] = await promisePool.query('SELECT monthly_limit FROM budgets WHERE user_id = ?', [userId]);
        const monthlyLimit = budgetRows.length > 0 ? parseFloat(budgetRows[0].monthly_limit) : Infinity;

        // Get total spent this month
        const [spentRows] = await promisePool.query(
            'SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND MONTH(date) = ? AND YEAR(date) = ?',
            [userId, currentMonth, currentYear]
        );
        const totalSpent = spentRows[0].total ? parseFloat(spentRows[0].total) : 0;

        // Validation Checkpoint
        if (totalSpent + expenseAmount > monthlyLimit) {
            return res.status(400).json({ 
                error: 'Budget Exceeded', 
                message: `Adding this expense ($${expenseAmount}) would exceed your monthly budget of $${monthlyLimit}. You have already spent $${totalSpent} this month.` 
            });
        }

        // Insert if validated
        const [result] = await promisePool.query(
            'INSERT INTO expenses (title, amount, category, date, user_id) VALUES (?, ?, ?, ?, ?)',
            [title, expenseAmount, category, date, userId]
        );

        res.status(201).json({ id: result.insertId, title, amount: expenseAmount, category, date });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete an expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await promisePool.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Expense not found' });
        res.json({ message: 'Expense deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

/* --- REPORTS ROUTES --- */

// Get Daily Summary for Line Chart
app.get('/api/reports/daily_summary', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        const [rows] = await promisePool.query(`
            SELECT DATE(date) as day, SUM(amount) as total
            FROM expenses
            WHERE user_id = ? AND MONTH(date) = ? AND YEAR(date) = ?
            GROUP BY DATE(date)
            ORDER BY day ASC
        `, [userId, currentMonth, currentYear]);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Monthly Summary for Pie Chart
app.get('/api/reports/monthly_summary', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        const [rows] = await promisePool.query(`
            SELECT category, SUM(amount) as total
            FROM expenses
            WHERE user_id = ? AND MONTH(date) = ? AND YEAR(date) = ?
            GROUP BY category
        `, [userId, currentMonth, currentYear]);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

/* --- BUDGET ROUTES --- */
app.post('/api/budgets/update', authenticateToken, async (req, res) => {
    try {
        const { limit } = req.body;
        if (!limit || isNaN(limit)) return res.status(400).json({ error: 'Valid limit required' });
        
        await promisePool.query('UPDATE budgets SET monthly_limit = ? WHERE user_id = ?', [limit, req.user.id]);
        res.json({ message: 'Budget updated', limit });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/budgets', authenticateToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT monthly_limit FROM budgets WHERE user_id = ?', [req.user.id]);
        if (rows.length === 0) return res.json({ limit: 1000 }); // Default fallback
        res.json({ limit: rows[0].monthly_limit });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
