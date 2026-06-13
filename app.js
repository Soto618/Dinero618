// app_3.js - Administrador de presupuesto quincenal con control de Saldo Real Activo
const STORAGE_KEYS = {
  SALARY: 'budget_salary',
  SALARY_DATE: 'budget_salary_date',
  EXPENSES: 'budget_expenses',
  SERVICES: 'recurring_services',
  PAID_SERVICES_IDS: 'paid_services_ids',
  MAIN_BALANCE: 'main_balance'
};

const DEFAULT_SERVICES = [
  { id: 1, name: "PS Plus", amount: 9.99, category: "Deseos", dueDay: 4 },
  { id: 2, name: "Internet Wifi", amount: 50, category: "Necesidades", dueDay: 5 },
  { id: 3, name: "Pago del terreno", amount: 150, category: "Necesidades", dueDay: 5 },
  { id: 4, name: "Game Pass", amount: 16.49, category: "Deseos", dueDay: 6 },
  { id: 5, name: "Tidal", amount: 16.99, category: "Deseos", dueDay: 11 },
  { id: 6, name: "Prime Video", amount: 14.99, category: "Deseos", dueDay: 13 },
  { id: 7, name: "Wifi", amount: 70, category: "Necesidades", dueDay: 14 },
  { id: 8, name: "Seguro de Carro", amount: 170, category: "Necesidades", dueDay: 16 },
  { id: 10, name: "Google One", amount: 1.99, category: "Necesidades", dueDay: 23 }
];

let currentSalary = 0;
let salaryDate = '';
let currentFortnight = '';
let expenses = [];
let services = [];
let paidServiceIds = [];
let mainBalance = 0;
let budgetChart = null;

// Referencias DOM globales
let salaryDisplay, salaryDateDisplay, fortnightDisplay, mainBalanceDisplay;
let needsAlloc, wantsAlloc, savingsAlloc;
let needsAllocDetail, wantsAllocDetail;
let needsCommitted, wantsCommitted;
let needsSpent, wantsSpent;
let needsFree, wantsFree;
let expenseListContainer, alertsContainer, servicesListContainer;

function calculateAllocations(salary) {
  return { needs: salary * 0.5, wants: salary * 0.3, savings: salary * 0.2 };
}

function getSpentByCategory() {
  let spentNeeds = 0, spentWants = 0, spentSavings = 0;
  expenses.forEach(exp => {
    if (exp.category === 'Necesidades') spentNeeds += exp.amount;
    else if (exp.category === 'Deseos') spentWants += exp.amount;
    else if (exp.category === 'Ahorro/Deuda') spentSavings += exp.amount;
  });
  return { spentNeeds, spentWants, spentSavings };
}

function getFortnightFromDate(dateStr) {
  if (!dateStr) return '';
  const day = new Date(dateStr).getDate();
  return day <= 15 ? 'first' : 'second';
}

function getDueDayRange(fortnight) {
  return fortnight === 'first' ? { min: 1, max: 15 } : { min: 16, max: 31 };
}

function calculateCommittedByCategory(category) {
  if (!currentFortnight) return 0;
  const range = getDueDayRange(currentFortnight);
  return services
    .filter(s => s.category === category && s.dueDay >= range.min && s.dueDay <= range.max && !paidServiceIds.includes(s.id))
    .reduce((sum, s) => sum + s.amount, 0);
}

function getCommittedServicesList(category) {
  if (!currentFortnight) return [];
  const range = getDueDayRange(currentFortnight);
  return services
    .filter(s => s.category === category && s.dueDay >= range.min && s.dueDay <= range.max && !paidServiceIds.includes(s.id))
    .sort((a,b) => a.dueDay - b.dueDay);
}

function getTodaysDueServices() {
  const today = new Date().getDate();
  if (!currentFortnight) return [];
  const range = getDueDayRange(currentFortnight);
  return services.filter(s => s.dueDay === today && s.dueDay >= range.min && s.dueDay <= range.max && !paidServiceIds.includes(s.id));
}

// Persistencia
function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEYS.SALARY, currentSalary.toString());
  localStorage.setItem(STORAGE_KEYS.SALARY_DATE, salaryDate);
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
  localStorage.setItem(STORAGE_KEYS.PAID_SERVICES_IDS, JSON.stringify(paidServiceIds));
  localStorage.setItem(STORAGE_KEYS.MAIN_BALANCE, mainBalance.toString());
}

function loadFromLocalStorage() {
  const savedSalary = localStorage.getItem(STORAGE_KEYS.SALARY);
  currentSalary = savedSalary ? parseFloat(savedSalary) : 0;
  salaryDate = localStorage.getItem(STORAGE_KEYS.SALARY_DATE) || '';
  const savedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  expenses = savedExpenses ? JSON.parse(savedExpenses) : [];
  const savedServices = localStorage.getItem(STORAGE_KEYS.SERVICES);
  services = savedServices ? JSON.parse(savedServices) : JSON.parse(JSON.stringify(DEFAULT_SERVICES));
  const savedPaid = localStorage.getItem(STORAGE_KEYS.PAID_SERVICES_IDS);
  paidServiceIds = savedPaid ? JSON.parse(savedPaid) : [];
  const savedBalance = localStorage.getItem(STORAGE_KEYS.MAIN_BALANCE);
  mainBalance = savedBalance ? parseFloat(savedBalance) : 0;
  currentFortnight = getFortnightFromDate(salaryDate);
}

// Acciones principales
function resetPeriod(newSalary, newDate) {
  mainBalance = newSalary; // Al iniciar quincena, el saldo real se vuelve igual al sueldo base
  currentSalary = newSalary;
  salaryDate = newDate;
  currentFortnight = getFortnightFromDate(newDate);
  expenses = [];
  paidServiceIds = [];
  saveToLocalStorage();
  refreshUI();
}

function addExtraIncome(description, amount) {
  if (isNaN(amount) || amount <= 0) {
    alert('Ingresa un monto válido mayor a 0.');
    return false;
  }
  const desc = description.trim() || "Ingreso Extra";
  mainBalance += amount; // SUMA AL SALDO REAL DISPONIBLE
  
  // Guardamos el ingreso extra como un gasto "negativo" para rastrearlo visualmente si deseas, 
  // o simplemente actualizamos el balance. Lo dejaremos registrado en el historial como abono.
  expenses.push({ id: Date.now(), description: `✨ GANANCIA: ${desc}`, amount: -amount, category: 'Ingreso', subcategory: 'Extra' });
  
  saveToLocalStorage();
  refreshUI();
  return true;
}

function addExpense(description, amount, category, subcategory = "Manual") {
  if (isNaN(amount) || amount <= 0) {
    alert('Ingresa un monto válido.');
    return false;
  }
  if (amount > mainBalance) {
    alert(`⚠️ Saldo insuficiente en tu cuenta real. Tienes: $${mainBalance.toFixed(2)}`);
    return false;
  }

  mainBalance -= amount; // RESTA DE TU CAJA DE DINERO REAL
  expenses.push({ id: Date.now(), description: description.trim(), amount: parseFloat(amount), category, subcategory });
  
  saveToLocalStorage();
  refreshUI();
  return true;
}

function deleteExpenseById(id) {
  const target = expenses.find(exp => exp.id === id);
  if (target) {
    // Si era un gasto normal devuelve, si era ingreso extra resta al borrarlo
    mainBalance += (target.amount); 
    expenses = expenses.filter(exp => exp.id !== id);
    saveToLocalStorage();
    refreshUI();
  }
}

function refreshUI() {
  if (!salaryDisplay) return;
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');

  // Mantener fijo tu recordatorio de depósito
  salaryDisplay.textContent = currentSalary ? `$${currentSalary.toFixed(2)}` : '—';
  salaryDateDisplay.textContent = salaryDate ? `Fecha de depósito: ${salaryDate}` : 'Sin fecha registrada';
  fortnightDisplay.textContent = currentFortnight === 'first' ? '📆 Primera Quincena (Días 1-15)' : (currentFortnight === 'second' ? '📆 Segunda Quincena (Días 16-31)' : '');
  
  // Mostrar saldo real de caja actualizable
  mainBalanceDisplay.textContent = `$${mainBalance.toFixed(2)}`;

  // Distribución teórica
  needsAlloc.textContent = `$${alloc.needs.toFixed(2)}`;
  wantsAlloc.textContent = `$${alloc.wants.toFixed(2)}`;
  savingsAlloc.textContent = `$${alloc.savings.toFixed(2)}`;
  needsAllocDetail.textContent = `$${alloc.needs.toFixed(2)}`;
  wantsAllocDetail.textContent = `$${alloc.wants.toFixed(2)}`;

  needsCommitted.textContent = `$${committedNeeds.toFixed(2)}`;
  wantsCommitted.textContent = `$${committedWants.toFixed(2)}`;
  needsSpent.textContent = `$${spentNeeds.toFixed(2)}`;
  wantsSpent.textContent = `$${spentWants.toFixed(2)}`;

  // Cálculos de disponibles internos
  const freeNeeds = currentSalary ? (alloc.needs - spentNeeds - committedNeeds) : 0;
  const freeWants = currentSalary ? (alloc.wants - spentWants - committedWants) : 0;

  needsFree.textContent = `$${Math.max(0, freeNeeds).toFixed(2)}`;
  wantsFree.textContent = `$${Math.max(0, freeWants).toFixed(2)}`;

  // Renderizar listas auxiliares
  renderExpenseList();
  renderServicesList();
  renderAlerts();

  if (budgetChart && currentSalary) {
    budgetChart.data.datasets[0].data = [Math.max(0, spentNeeds), Math.max(0, spentWants), Math.max(0, spentSavings)];
    budgetChart.data.datasets[1].data = [alloc.needs, alloc.wants, alloc.savings];
    budgetChart.update();
  }
}

function renderExpenseList() {
  if (!expenseListContainer) return;
  if (expenses.length === 0) {
    expenseListContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">📭 No hay movimientos registrados.</div>';
    return;
  }
  expenseListContainer.innerHTML = expenses.map(exp => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center shadow-sm">
      <div>
        <div class="font-medium text-gray-800 text-sm">${escapeHtml(exp.description)}</div>
        <div class="text-[11px] text-gray-400">${exp.category} • ${exp.subcategory}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-bold ${exp.amount < 0 ? 'text-emerald-600' : 'text-gray-800'}">
          ${exp.amount < 0 ? `+$${Math.abs(exp.amount).toFixed(2)}` : `$${exp.amount.toFixed(2)}`}
        </span>
        <button class="delete-expense text-red-400 p-1" data-id="${exp.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.delete-expense').forEach(btn => {
    btn.addEventListener('click', () => deleteExpenseById(parseInt(btn.dataset.id)));
  });
}

function renderServicesList() {
  if (!servicesListContainer) return;
  servicesListContainer.innerHTML = services.map(s => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center text-xs">
      <div>
        <div class="font-bold text-gray-700">${escapeHtml(s.name)}</div>
        <div>$${s.amount.toFixed(2)} • ${s.category} • Cobro el día ${s.dueDay}</div>
      </div>
      <button class="delete-service text-red-400" data-id="${s.id}">🗑️</button>
    </div>
  `).join('');
  document.querySelectorAll('.delete-service').forEach(btn => {
    btn.addEventListener('click', () => {
      services = services.filter(item => item.id !== parseInt(btn.dataset.id));
      saveToLocalStorage();
      refreshUI();
    });
  });
}

function renderAlerts() {
  if (!alertsContainer) return;
  const todayDue = getTodaysDueServices();
  if (todayDue.length === 0) {
    alertsContainer.innerHTML = '';
    return;
  }
  alertsContainer.innerHTML = todayDue.map(s => `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs">
      <div><span class="font-bold text-amber-800">⚠️ Hoy vence:</span> ${escapeHtml(s.name)} ($${s.amount.toFixed(2)})</div>
      <button class="pay-service-btn bg-emerald-600 text-white px-2 py-1 rounded-lg" data-id="${s.id}" data-name="${s.name}" data-amount="${s.amount}" data-category="${s.category}">Pagar ya</button>
    </div>
  `).join('');
  document.querySelectorAll('.pay-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      if (!paidServiceIds.includes(id)) {
        paidServiceIds.push(id);
        addExpense(`${btn.dataset.name} (Cobro Fijo)`, parseFloat(btn.dataset.amount), btn.dataset.category, "Automático");
      }
    });
  });
}

function initChart() {
  const ctx = document.getElementById('budgetChart').getContext('2d');
  budgetChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Necesidades', 'Deseos', 'Ahorro'],
      datasets: [
        { label: 'Gastado', data: [0,0,0], backgroundColor: '#6366f1', borderRadius: 6 },
        { label: 'Presupuestado', data: [0,0,0], backgroundColor: '#e2e8f0', borderRadius: 6 }
      ]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    contents.forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${target}`).classList.remove('hidden');
    tabs.forEach(t => t.classList.remove('text-indigo-600'));
    btn.classList.add('text-indigo-600');
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  // Enlazar DOM
  salaryDisplay = document.getElementById('salaryDisplay');
  salaryDateDisplay = document.getElementById('salaryDateDisplay');
  fortnightDisplay = document.getElementById('fortnightDisplay');
  mainBalanceDisplay = document.getElementById('mainBalanceDisplay');
  needsAlloc = document.getElementById('needsAlloc');
  wantsAlloc = document.getElementById('wantsAlloc');
  savingsAlloc = document.getElementById('savingsAlloc');
  needsAllocDetail = document.getElementById('needsAllocDetail');
  wantsAllocDetail = document.getElementById('wantsAllocDetail');
  needsCommitted = document.getElementById('needsCommitted');
  wantsCommitted = document.getElementById('wantsCommitted');
  needsSpent = document.getElementById('needsSpent');
  wantsSpent = document.getElementById('wantsSpent');
  needsFree = document.getElementById('needsFree');
  wantsFree = document.getElementById('wantsFree');
  expenseListContainer = document.getElementById('expenseListContainer');
  alertsContainer = document.getElementById('alertsContainer');
  servicesListContainer = document.getElementById('servicesListContainer');

  initChart();
  loadFromLocalStorage();
  initTabs();
  refreshUI();

  // Escuchadores de eventos
  document.getElementById('setSalaryBtn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('salaryInput').value);
    const date = document.getElementById('salaryDateInput').value;
    if (val > 0 && date) {
      resetPeriod(val, date);
      document.getElementById('salaryInput').value = '';
    } else { alert('Escribe un monto y selecciona una fecha'); }
  });

  document.getElementById('addExtraIncomeBtn').addEventListener('click', () => {
    const desc = document.getElementById('extraIncomeDesc').value;
    const amt = parseFloat(document.getElementById('extraIncomeAmount').value);
    if (addExtraIncome(desc, amt)) {
      document.getElementById('extraIncomeDesc').value = '';
      document.getElementById('extraIncomeAmount').value = '';
    }
  });

  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    const desc = document.getElementById('expenseDesc').value;
    const amt = parseFloat(document.getElementById('expenseAmount').value);
    const cat = document.getElementById('expenseCategory').value;
    const sub = document.getElementById('expenseSubcategory').value;
    if (addExpense(desc, amt, cat, sub)) {
      document.getElementById('expenseDesc').value = '';
      document.getElementById('expenseAmount').value = '';
    }
  });

  document.getElementById('clearExpensesBtn').addEventListener('click', () => {
    if (confirm('¿Limpiar todo el historial? El saldo regresará a su estado inicial.')) {
      expenses = [];
      mainBalance = currentSalary;
      paidServiceIds = [];
      saveToLocalStorage();
      refreshUI();
    }
  });
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}