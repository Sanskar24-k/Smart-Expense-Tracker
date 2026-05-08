# Smart Expense Tracker v2

A full-stack, multi-user Expense Tracker built with Vanilla HTML/CSS/JS, Node.js/Express, and MySQL. Features an automated budget validation layer, smart auto-categorization, secure authentication (JWT & bcrypt), and dynamic Chart.js reporting.

## Setup Instructions

### 1. Prerequisites
- Node.js installed on your machine.
- MySQL Server installed and running.

### 2. Database Upgrades (If upgrading from v1)
1. Open your MySQL client (e.g., MySQL Workbench, DBeaver, or via command line).
2. Run the `update_db.sql` script to create the new `users` and `budgets` tables, and to flush/link the existing `expenses` table.
    ```shell
    mysql -u root -p < update_db.sql
    ```
*(If you are setting this up for the very first time without v1, run `database.sql` first, then `update_db.sql`)*

### 3. Backend Configuration
1. Open `server.js` and locate the database configuration block:
    ```javascript
    const db = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD // <--- Ensure this matches your local password!
        database: process.env.DB_NAME || 'expense_tracker',
        // ...
    });
    ```
2. Verify the `password` matches your local MySQL root password.

### 4. Install Dependencies
Run this in the project root to install the required packages (including the new `bcryptjs` and `jsonwebtoken` security packages):
```shell
npm install
```

### 5. Start the Application
1. Start the Express server:
    ```shell
    npm start
    ```
2. Open your browser and navigate to `http://localhost:3000/auth.html` to create your first account and log in!
