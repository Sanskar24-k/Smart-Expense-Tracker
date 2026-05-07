document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('userName');
    if (!token) {
        window.location.href = '/auth.html';
        return;
    }

    const API_URL = 'http://localhost:3000/api';
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // DOM Elements
    const expenseForm = document.getElementById('expenseForm');
    const titleInput = document.getElementById('expenseTitle');
    const categorySelect = document.getElementById('expenseCategory');
    const expenseList = document.getElementById('expenseTableBody');
    const totalBalanceEl = document.getElementById('budgetSpent');
    const emptyState = document.getElementById('empty-state');
    const welcomeText = document.getElementById('welcome-text');
    const logoutBtn = document.getElementById('logout-btn');
    const budgetAlert = document.getElementById('budget-alert');
    const budgetLimitDisplay = document.getElementById('budgetLimitDisplay');
    const editBudgetBtn = document.getElementById('edit-budget');

    let expenses = [];
    let myChart = null;
    let dailyChart = null;
    let currentBudgetLimit = 0;

    // Set Welcome text
    if (userName) welcomeText.textContent = `Welcome, ${userName.split(' ')[0]}!`;

    // Logout
    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '/auth.html';
    });

    // Smart Categorization logic
    titleInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if (val.includes('dominos') || val.includes('mcdonald') || val.includes('food') || val.includes('grocery')) {
            categorySelect.value = 'food';
        } else if (val.includes('uber') || val.includes('lyft') || val.includes('train') || val.includes('bus')) {
            categorySelect.value = 'transport';
        } else if (val.includes('movie') || val.includes('netflix') || val.includes('spotify')) {
            categorySelect.value = 'entertainment';
        } else if (val.includes('amazon') || val.includes('walmart')) {
            categorySelect.value = 'shopping';
        }
    });

    // Formatting tools
    const formatMoney = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    const formatDate = (dateString) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(dateString));

    // Core Init Load
    const init = async () => {
        const dateEl = document.getElementById('expenseDate');
        if (dateEl) dateEl.valueAsDate = new Date();
        await loadBudget();
        await loadExpenses();
        await renderChart();
    };

    // Load User Budget
    const loadBudget = async () => {
        try {
            const res = await fetch(`${API_URL}/budgets`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                currentBudgetLimit = parseFloat(data.limit) || 0;
                budgetLimitDisplay.textContent = `/ ${formatMoney(currentBudgetLimit)}`;
            }
        } catch (error) {
            console.error(error);
        }
    };

    // Edit Budget
    editBudgetBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newLimit = prompt("Enter your new monthly budget limit ($):");
        if (newLimit && !isNaN(newLimit)) {
            try {
                const res = await fetch(`${API_URL}/budgets/update`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ limit: parseFloat(newLimit) })
                });
                if (res.ok) {
                    await loadBudget();
                    alert("Budget updated!");
                }
            } catch (err) {
                console.error(err);
            }
        }
    });

    // Load & Render Expenses
    const loadExpenses = async () => {
        try {
            const res = await fetch(`${API_URL}/expenses`, { headers: authHeaders });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    localStorage.clear();
                    window.location.href = '/auth.html';
                }
                throw new Error('Failed');
            }
            expenses = await res.json();
            renderExpenses();
            updateTotal();
        } catch (err) {
            console.error(err);
        }
    };

    const updateBudgetProgress = (spent, total) => {
        const progressBar = document.getElementById('progressBar');
        const budgetStatus = document.getElementById('budgetStatus');
        const progressPercent = document.getElementById('progressPercent');

        if (!progressBar || !budgetStatus || !progressPercent) return;
        
        const effectiveTotal = total > 0 ? total : 1;
        const percentage = (spent / effectiveTotal) * 100;
        
        progressBar.style.width = `${Math.min(percentage, 100)}%`;
        progressPercent.textContent = `${Math.round(percentage)}% used`;

        progressBar.classList.remove('under', 'warning', 'over');
        budgetStatus.classList.remove('under', 'warning', 'over');
        
        if (percentage >= 100) {
            progressBar.classList.add('over');
            budgetStatus.classList.add('over');
            budgetStatus.innerHTML = `
                <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
                <span>${formatMoney(spent - total)} over budget</span>
            `;
        } else if (percentage >= 80) {
            progressBar.classList.add('warning');
            budgetStatus.classList.add('warning');
            budgetStatus.innerHTML = `
                <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
                <span>${formatMoney(total - spent)} remaining</span>
            `;
        } else {
            progressBar.classList.add('under');
            budgetStatus.classList.add('under');
            budgetStatus.innerHTML = `
                <i data-lucide="trending-down" style="width: 16px; height: 16px;"></i>
                <span>${formatMoney(total - spent)} remaining</span>
            `;
        }
        lucide.createIcons();
    };

    const updateTotal = () => {
        // Only calculate total for the CURRENT month for the dashboard
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const currentMonthExpenses = expenses.filter(ex => {
            const exDate = new Date(ex.date);
            return exDate.getMonth() === currentMonth && exDate.getFullYear() === currentYear;
        });

        const monthlyTotal = currentMonthExpenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        const transactionCount = currentMonthExpenses.length;
        
        // Avg per day calculation
        const today = new Date().getDate();
        const avgPerDay = monthlyTotal / today;

        // Top category calculation
        const categories = {};
        currentMonthExpenses.forEach(ex => {
            categories[ex.category] = (categories[ex.category] || 0) + parseFloat(ex.amount);
        });
        
        let topCat = '-';
        let maxAmt = 0;
        for (const [cat, amt] of Object.entries(categories)) {
            if (amt > maxAmt) { maxAmt = amt; topCat = cat; }
        }
        if (topCat !== '-') topCat = topCat.charAt(0).toUpperCase() + topCat.slice(1);
            
        // DOM Updates
        totalBalanceEl.textContent = formatMoney(monthlyTotal);
        
        const statTotal = document.getElementById('statTotalExpenses');
        const statTrans = document.getElementById('statTransactions');
        const statAvg = document.getElementById('statAvgPerDay');
        const statTop = document.getElementById('statTopCategory');

        if (statTotal) statTotal.textContent = formatMoney(monthlyTotal);
        if (statTrans) statTrans.textContent = transactionCount;
        if (statAvg) statAvg.textContent = formatMoney(avgPerDay);
        if (statTop) statTop.textContent = topCat;

        updateBudgetProgress(monthlyTotal, currentBudgetLimit);
    };

    const renderExpenses = () => {
        expenseList.innerHTML = '';
        if (expenses.length === 0) {
            if (emptyState) emptyState.style.display = '';
            return;
        }
        if (emptyState) emptyState.style.display = 'none';

        const categoryConfig = {
            'food': { icon: 'utensils', badgeClass: 'food' },
            'transport': { icon: 'car', badgeClass: 'transport' },
            'shopping': { icon: 'shopping-bag', badgeClass: 'shopping' },
            'bills': { icon: 'file-text', badgeClass: 'bills' },
            'entertainment': { icon: 'tv', badgeClass: 'entertainment' },
            'Food': { icon: 'utensils', badgeClass: 'food' },
            'Transport': { icon: 'car', badgeClass: 'transport' },
            'Shopping': { icon: 'shopping-bag', badgeClass: 'shopping' },
            'Entertainment': { icon: 'tv', badgeClass: 'entertainment' },
            'Other': { icon: 'more-horizontal', badgeClass: 'other' },
            'other': { icon: 'more-horizontal', badgeClass: 'other' }
        };

        expenses.forEach(expense => {
            const tr = document.createElement('tr');
            const cat = categoryConfig[expense.category] || categoryConfig.other;
            
            // Format category name for display
            const displayCat = expense.category.charAt(0).toUpperCase() + expense.category.slice(1);

            tr.innerHTML = `
                <td>
                    <p class="expense-title">${expense.title}</p>
                    <p class="expense-date">${formatDate(expense.date)}</p>
                </td>
                <td><span class="category-badge ${cat.badgeClass}">
                    <i data-lucide="${cat.icon}" style="width: 12px; height: 12px;"></i> ${displayCat}
                </span></td>
                <td><span class="expense-amount">${formatMoney(expense.amount)}</span></td>
                <td>
                    <button class="btn btn-destructive" onclick="deleteExpense(${expense.id})">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </td>
            `;
            expenseList.appendChild(tr);
        });
        
        lucide.createIcons();
    };

    // Render Chart.js Line Chart (Daily Spending)
    const renderDailyChart = async () => {
        try {
            const res = await fetch(`${API_URL}/reports/daily_summary`, { headers: authHeaders });
            if (!res.ok) return;
            const data = await res.json();

            const canvas = document.getElementById('dailyExpenseChart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (dailyChart) dailyChart.destroy();

            if (!data || data.length === 0) {
                dailyChart = new Chart(ctx, {
                    type: 'line',
                    data: { labels: ['No Data'], datasets: [{ data: [], borderColor: '#1e1e2d' }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
                return;
            }

            const formattedLabels = data.map(d => formatDate(d.day).split(',')[0]);
            const values = data.map(d => parseFloat(d.total));

            dailyChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: formattedLabels,
                    datasets: [{
                        label: 'Daily Spent',
                        data: values,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#6366f1'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        } catch (err) {
            console.error("Error drawing daily chart:", err);
        }
    };

    // Render Chart.js Pie Chart
    const renderChart = async () => {
        try {
            const res = await fetch(`${API_URL}/reports/monthly_summary`, { headers: authHeaders });
            if (!res.ok) return;
            const data = await res.json();

            const ctx = document.getElementById('expenseChart').getContext('2d');
            const tableBody = document.getElementById('categorySummaryTable');
            if (tableBody) tableBody.innerHTML = '';
            
            if (myChart) myChart.destroy();

            if (!data || data.length === 0) {
                if (tableBody) {
                    tableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--muted-foreground);">No data for this month</td></tr>`;
                }

                myChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['No Expenses'],
                        datasets: [{
                            data: [1],
                            backgroundColor: ['#1e1e2d'],
                            borderWidth: 0
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
                });
                await renderDailyChart();
                return;
            }
            
            if (tableBody) {
                data.forEach(d => {
                    const tr = document.createElement('tr');
                    const cat = d.category.charAt(0).toUpperCase() + d.category.slice(1);
                    tr.innerHTML = `
                        <td>${cat}</td>
                        <td style="text-align: right; font-weight: 500;">${formatMoney(d.total)}</td>
                    `;
                    tableBody.appendChild(tr);
                });
            }

            const labels = data.map(d => d.category);
            const values = data.map(d => parseFloat(d.total));

            myChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
            await renderDailyChart();
        } catch (err) {
            console.error("Error charting:", err);
        }
    };

    // Add Expense (Validates budget logic)
    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (budgetAlert) budgetAlert.style.display = 'none'; // reset alert

        const newExpense = {
            title: titleInput.value,
            amount: document.getElementById('expenseAmount').value,
            category: categorySelect.value,
            date: document.getElementById('expenseDate').value
        };

        try {
            const response = await fetch(`${API_URL}/expenses`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(newExpense)
            });

            const data = await response.json();

            // CHECKPOINT WARNING
            if (response.status === 400 && data.error === 'Budget Exceeded') {
                if (budgetAlert) {
                    budgetAlert.textContent = '❌ ' + data.message;
                    budgetAlert.style.display = 'block';
                } else {
                    alert('❌ ' + data.message);
                }
                return; // Stop processing
            }

            if (!response.ok) throw new Error(data.error);

            expenses.unshift(data);
            renderExpenses();
            updateTotal();
            expenseForm.reset();
            const expDate = document.getElementById('expenseDate');
            if (expDate) expDate.valueAsDate = new Date();
            
            // Close modal if exists
            const expenseModal = document.getElementById('expenseModal');
            if (expenseModal) {
                 expenseModal.classList.remove('active');
                 document.body.style.overflow = '';
            }
            
            await renderChart();

        } catch (error) {
            console.error(error);
        }
    });

    // Delete Expense
    window.deleteExpense = async (id) => {
        if (!confirm('Delete this expense?')) return;
        try {
            const response = await fetch(`${API_URL}/expenses/${id}`, {
                method: 'DELETE',
                headers: authHeaders
            });
            if (!response.ok) throw new Error('Failed to delete');

            expenses = expenses.filter(expense => expense.id !== id);
            renderExpenses();
            updateTotal();
            await renderChart();
        } catch (error) {
            console.error(error);
        }
    };

    init();

    // Ensure icons load
    lucide.createIcons();
});
