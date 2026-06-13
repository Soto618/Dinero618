// app.js - Presupuesto 50/30/20 con lógica quincenal y desglose completo
// CORREGIDO: Ahora los gastos se descuentan correctamente del Libre Real

// ======================== CLAVES LOCALSTORAGE ========================
const STORAGE_KEYS = {
  SALARY: 'budget_salary',
  SALARY_DATE: 'budget_salary_date',
  EXPENSES: 'budget_expenses',
  SERVICES: 'recurring_services',
  PAID_SERVICES_IDS: 'paid_services_ids'
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
  { id: 9, name: "Streaming", amount: 15, category: "Deseos", dueDay: 17 },
  { id: 10, name: "Google One", amount: 1.99, category: "Necesidades", dueDay: 23 }
];

// ======================== ESTADO GLOBAL ========================
let currentSalary = 0;
let salaryDate = '';
let currentFortnight = '';
let expenses = [];
let services = [];
let paidServiceIds = [];
let budgetChart = null;

// Referencias DOM
let salaryDisplay, salaryDateDisplay, fortnightDisplay;
let needsAlloc, wantsAlloc, savingsAlloc;
let needsAllocDetail, wantsAllocDetail;
let needsCommitted, wantsCommitted;
let needsSpent, wantsSpent;
let needsFree, wantsFree;
let expenseListContainer, alertsContainer, servicesListContainer, agendaContainer;

// ======================== FUNCIONES AUXILIARES ========================
function calculateAllocations(salary) {
  return {
    needs: salary * 0.5,
    wants: salary * 0.3,
    savings: salary * 0.2
  };
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

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEYS.SALARY, currentSalary.toString());
  localStorage.setItem(STORAGE_KEYS.SALARY_DATE, salaryDate);
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
  localStorage.setItem(STORAGE_KEYS.PAID_SERVICES_IDS, JSON.stringify(paidServiceIds));
}

function loadFromLocalStorage() {
  const savedSalary = localStorage.getItem(STORAGE_KEYS.SALARY);
  currentSalary = (savedSalary && !isNaN(parseFloat(savedSalary))) ? parseFloat(savedSalary) : 0;
  salaryDate = localStorage.getItem(STORAGE_KEYS.SALARY_DATE) || '';
  const savedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  expenses = savedExpenses ? JSON.parse(savedExpenses) : [];
  if (!Array.isArray(expenses)) expenses = [];
  const savedServices = localStorage.getItem(STORAGE_KEYS.SERVICES);
  if (savedServices) {
    services = JSON.parse(savedServices);
  } else {
    services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
  }
  const savedPaid = localStorage.getItem(STORAGE_KEYS.PAID_SERVICES_IDS);
  paidServiceIds = savedPaid ? JSON.parse(savedPaid) : [];
  currentFortnight = getFortnightFromDate(salaryDate);
}

function resetPeriod(newSalary, newDate) {
  currentSalary = newSalary;
  salaryDate = newDate;
  currentFortnight = getFortnightFromDate(newDate);
  expenses = [];
  paidServiceIds = [];
  saveToLocalStorage();
  refreshUI();
  renderAlerts();
}

function updateSalaryOnly(newSalary, newDate) {
  if (!newSalary || newSalary <= 0) {
    alert('El sueldo debe ser mayor a cero.');
    return false;
  }
  if (!newDate) {
    alert('Selecciona una fecha de sueldo.');
    return false;
  }
  currentSalary = newSalary;
  salaryDate = newDate;
  currentFortnight = getFortnightFromDate(newDate);
  
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  
  let warnings = [];
  if (spentNeeds + committedNeeds > alloc.needs) {
    warnings.push(`Necesidades: gastado+comprometido $${(spentNeeds+committedNeeds).toFixed(2)} > nuevo presupuesto $${alloc.needs.toFixed(2)}`);
  }
  if (spentWants + committedWants > alloc.wants) {
    warnings.push(`Deseos: gastado+comprometido $${(spentWants+committedWants).toFixed(2)} > nuevo presupuesto $${alloc.wants.toFixed(2)}`);
  }
  if (warnings.length > 0) {
    alert(`⚠️ El nuevo sueldo es muy bajo:\n${warnings.join('\n')}\n\nTe recomendamos reiniciar el período.`);
  }
  saveToLocalStorage();
  refreshUI();
  renderAlerts();
  return true;
}

// ======================== FUNCIONES DE GASTOS (CORREGIDAS) ========================
function addExpense(description, amount, category, subcategory = "Manual") {
  if (!currentSalary || currentSalary <= 0) {
    alert('⚠️ Primero establece un sueldo quincenal válido.');
    return false;
  }
  if (!description.trim() || amount <= 0) {
    alert('❌ Completa concepto y monto mayor a cero.');
    return false;
  }
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  
  let currentSpent = 0, limit = 0, committed = 0;
  if (category === 'Necesidades') {
    currentSpent = spentNeeds;
    limit = alloc.needs;
    committed = committedNeeds;
  } else if (category === 'Deseos') {
    currentSpent = spentWants;
    limit = alloc.wants;
    committed = committedWants;
  } else {
    // Ahorro
    currentSpent = spentSavings;
    limit = alloc.savings;
    if (currentSpent + amount > limit + 0.01) {
      alert(`⚠️ Excedes presupuesto de Ahorro. Disponible: $${(limit - currentSpent).toFixed(2)}`);
      return false;
    }
    expenses.push({ id: Date.now(), description: description.trim(), amount, category, subcategory });
    saveToLocalStorage();
    refreshUI();
    return true;
  }
  // Validar libre real (presupuesto - gastado - comprometido)
  const freeReal = limit - currentSpent - committed;
  if (amount > freeReal + 0.01) {
    alert(`⚠️ No tienes suficiente dinero libre en ${category}. Libre real actual: $${Math.max(0, freeReal).toFixed(2)}`);
    return false;
  }
  expenses.push({ id: Date.now(), description: description.trim(), amount, category, subcategory });
  saveToLocalStorage();
  refreshUI();
  console.log(`Gasto agregado: ${description} - $${amount} en ${category}. Nuevo libre real: ${(limit - (currentSpent+amount) - committed).toFixed(2)}`);
  return true;
}

function deleteExpenseById(id) {
  expenses = expenses.filter(exp => exp.id !== id);
  saveToLocalStorage();
  refreshUI();
}

function renderExpenseList() {
  if (!expenseListContainer) return;
  if (expenses.length === 0) {
    expenseListContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">📭 No hay gastos aún.</div>';
    return;
  }
  expenseListContainer.innerHTML = expenses.map(exp => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center shadow-sm">
      <div class="flex-1">
        <div class="font-medium text-gray-800 text-sm">${escapeHtml(exp.description)}</div>
        <div class="flex gap-2 text-[11px] text-gray-500">${exp.category} • ${exp.subcategory}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-bold">$${exp.amount.toFixed(2)}</span>
        <button class="delete-expense text-red-400" data-id="${exp.id}">🗑️</button>
      </div>
    </div>
  `).join('');
  document.querySelectorAll('.delete-expense').forEach(btn => {
    btn.addEventListener('click', () => deleteExpenseById(parseInt(btn.dataset.id)));
  });
}

// ======================== FUNCIONES DE SERVICIOS ========================
function renderServicesList() {
  if (!servicesListContainer) return;
  if (services.length === 0) {
    servicesListContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">📌 No hay servicios.</div>';
    return;
  }
  servicesListContainer.innerHTML = services.map(s => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center">
      <div>
        <div class="font-medium">${escapeHtml(s.name)}</div>
        <div class="text-xs text-gray-500">$${s.amount.toFixed(2)} • ${s.category} • Día ${s.dueDay}</div>
      </div>
      <button class="delete-service text-red-500 text-xl" data-id="${s.id}">🗑️</button>
    </div>
  `).join('');
  document.querySelectorAll('.delete-service').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      services = services.filter(s => s.id !== id);
      paidServiceIds = paidServiceIds.filter(pid => pid !== id);
      saveToLocalStorage();
      refreshUI();
    });
  });
}

function addService(name, amount, category, dueDay) {
  if (!name.trim() || amount <= 0 || dueDay < 1 || dueDay > 31) {
    alert('Completa nombre, monto >0 y día 1-31');
    return false;
  }
  services.push({ id: Date.now(), name: name.trim(), amount: parseFloat(amount), category, dueDay: parseInt(dueDay) });
  saveToLocalStorage();
  refreshUI();
  return true;
}

function resetToDefaultServices() {
  if (confirm('¿Restaurar servicios predeterminados? Se perderán los actuales.')) {
    services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
    const existingIds = services.map(s => s.id);
    paidServiceIds = paidServiceIds.filter(id => existingIds.includes(id));
    saveToLocalStorage();
    refreshUI();
  }
}

function renderAgenda() {
  if (!agendaContainer) return;
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  let upcoming = [];
  services.forEach(service => {
    let dueDate = new Date(currentYear, currentMonth, service.dueDay);
    if (dueDate < today) {
      dueDate = new Date(currentYear, currentMonth + 1, service.dueDay);
    }
    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    upcoming.push({ ...service, dueDate, daysLeft: daysDiff });
  });
  upcoming.sort((a,b) => a.daysLeft - b.daysLeft);
  if (upcoming.length === 0) {
    agendaContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">🎉 No hay pagos.</div>';
    return;
  }
  agendaContainer.innerHTML = upcoming.map(s => `
    <div class="bg-white/50 rounded-xl p-3 flex justify-between items-center">
      <div>
        <div class="font-medium">${escapeHtml(s.name)}</div>
        <div class="text-xs">${s.category} • $${s.amount.toFixed(2)}</div>
      </div>
      <div class="text-right">
        <span class="text-sm font-bold ${s.daysLeft === 0 ? 'text-red-600' : 'text-gray-600'}">
          ${s.daysLeft === 0 ? 'Hoy' : s.daysLeft === 1 ? 'Mañana' : `En ${s.daysLeft} días`}
        </span>
      </div>
    </div>
  `).join('');
}

function renderAlerts() {
  if (!alertsContainer) return;
  const dueToday = getTodaysDueServices();
  if (dueToday.length === 0) {
    alertsContainer.innerHTML = '';
    return;
  }
  alertsContainer.innerHTML = dueToday.map(s => `
    <div class="alert-card rounded-xl p-4 flex justify-between items-center">
      <div>
        <div class="font-bold text-amber-800">⚠️ Hoy vence: ${escapeHtml(s.name)}</div>
        <div class="text-sm">$${s.amount.toFixed(2)} • ${s.category}</div>
      </div>
      <button class="pay-service-btn bg-emerald-500 text-white px-3 py-2 rounded-xl text-sm shadow-md" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-amount="${s.amount}" data-category="${s.category}">✅ Pagar</button>
    </div>
  `).join('');
  document.querySelectorAll('.pay-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const name = btn.dataset.name;
      const amount = parseFloat(btn.dataset.amount);
      const category = btn.dataset.category;
      if (confirm(`Registrar pago de "${name}" por $${amount.toFixed(2)}?`)) {
        if (!paidServiceIds.includes(id)) {
          paidServiceIds.push(id);
          expenses.push({
            id: Date.now(),
            description: `${name} (pago recurrente)`,
            amount: amount,
            category: category,
            subcategory: "Pago automático"
          });
          saveToLocalStorage();
          refreshUI();
          renderAlerts();
        } else {
          alert('Ya pagado este período.');
        }
      }
    });
  });
}

function refreshUI() {
  if (!salaryDisplay) return;
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  
  salaryDisplay.textContent = currentSalary ? `$${currentSalary.toFixed(2)}` : '—';
  salaryDateDisplay.textContent = salaryDate ? `Período: ${salaryDate}` : 'Sin fecha';
  fortnightDisplay.textContent = currentFortnight === 'first' ? '📆 Primera quincena (días 1-15)' : (currentFortnight === 'second' ? '📆 Segunda quincena (días 16-31)' : '');
  
  needsAlloc.textContent = wantsAlloc.textContent = savingsAlloc.textContent = '—';
  needsAllocDetail.textContent = wantsAllocDetail.textContent = '—';
  if (currentSalary) {
    needsAlloc.textContent = `$${alloc.needs.toFixed(2)}`;
    wantsAlloc.textContent = `$${alloc.wants.toFixed(2)}`;
    savingsAlloc.textContent = `$${alloc.savings.toFixed(2)}`;
    needsAllocDetail.textContent = `$${alloc.needs.toFixed(2)}`;
    wantsAllocDetail.textContent = `$${alloc.wants.toFixed(2)}`;
  }
  needsCommitted.textContent = `$${committedNeeds.toFixed(2)}`;
  wantsCommitted.textContent = `$${committedWants.toFixed(2)}`;
  needsSpent.textContent = `$${spentNeeds.toFixed(2)}`;
  wantsSpent.textContent = `$${spentWants.toFixed(2)}`;
  
  const freeNeeds = currentSalary ? (alloc.needs - spentNeeds - committedNeeds) : 0;
  const freeWants = currentSalary ? (alloc.wants - spentWants - committedWants) : 0;
  
  const committedServicesNeeds = getCommittedServicesList('Necesidades');
  const committedServicesWants = getCommittedServicesList('Deseos');
  
  const getSubcategoryBreakdown = (category) => {
    const filtered = expenses.filter(exp => exp.category === category && exp.subcategory !== "Pago automático");
    const breakdown = {};
    filtered.forEach(exp => { breakdown[exp.subcategory] = (breakdown[exp.subcategory] || 0) + exp.amount; });
    return breakdown;
  };
  const needsBreakdown = getSubcategoryBreakdown('Necesidades');
  const wantsBreakdown = getSubcategoryBreakdown('Deseos');
  
  const buildFreeBoxHTML = (freeAmount, committedServices, manualBreakdown) => {
    let html = `<div class="text-lg font-black text-emerald-700">$${Math.max(0, freeAmount).toFixed(2)}</div>`;
    if (committedServices.length > 0) {
      html += `<div class="border-t border-gray-300 my-2"></div><div class="text-xs font-semibold text-gray-600">📌 Próximos pagos (comprometidos):</div><ul class="text-xs space-y-1 mt-1">`;
      committedServices.forEach(s => { html += `<li class="flex justify-between"><span>• ${escapeHtml(s.name)} (día ${s.dueDay})</span><span>$${s.amount.toFixed(2)}</span></li>`; });
      html += `</ul>`;
    }
    const manualEntries = Object.entries(manualBreakdown);
    if (manualEntries.length > 0) {
      html += `<div class="border-t border-gray-300 my-2"></div><div class="text-xs font-semibold text-gray-600">✍️ Gastos variables realizados:</div><ul class="text-xs space-y-1 mt-1">`;
      manualEntries.forEach(([sub, amount]) => { html += `<li class="flex justify-between"><span>• ${escapeHtml(sub)}</span><span>$${amount.toFixed(2)}</span></li>`; });
      html += `</ul>`;
    }
    if (committedServices.length === 0 && manualEntries.length === 0) {
      html += `<div class="border-t border-gray-300 my-2"></div><div class="text-xs text-gray-400 italic">Sin consumos ni pagos futuros.</div>`;
    }
    return html;
  };
  
  needsFree.innerHTML = buildFreeBoxHTML(freeNeeds, committedServicesNeeds, needsBreakdown);
  wantsFree.innerHTML = buildFreeBoxHTML(freeWants, committedServicesWants, wantsBreakdown);
  
  if (budgetChart && currentSalary) {
    budgetChart.data.datasets[0].data = [spentNeeds, spentWants, spentSavings];
    budgetChart.data.datasets[1].data = [alloc.needs, alloc.wants, alloc.savings];
    budgetChart.update();
  }
  renderExpenseList();
  renderServicesList();
  renderAgenda();
  renderAlerts();
}

function initChart() {
  const ctx = document.getElementById('budgetChart').getContext('2d');
  budgetChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Necesidades', 'Deseos', 'Ahorro/Deuda'],
      datasets: [
        { label: '💰 Gastado real', data: [0,0,0], backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 8 },
        { label: '🎯 Presupuesto', data: [0,0,0], backgroundColor: 'rgba(156,163,175,0.4)', borderRadius: 8, borderWidth: 1, borderColor: '#6b7280' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.raw.toFixed(2)}` } } },
      scales: { y: { ticks: { callback: (val) => '$' + val }, beginAtZero: true } }
    }
  });
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  function showTab(tabId) {
    contents.forEach(c => c.classList.add('hidden'));
    const active = document.getElementById(`tab-${tabId}`);
    if (active) active.classList.remove('hidden');
    tabs.forEach(btn => {
      if (btn.dataset.tab === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    if (tabId === 'dashboard' && budgetChart) setTimeout(() => { budgetChart.resize(); budgetChart.update(); }, 50);
  }
  tabs.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
  salaryDisplay = document.getElementById('salaryDisplay');
  salaryDateDisplay = document.getElementById('salaryDateDisplay');
  fortnightDisplay = document.getElementById('fortnightDisplay');
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
  agendaContainer = document.getElementById('agendaContainer');
  
  initChart();
  loadFromLocalStorage();
  refreshUI();
  initTabs();
  
  document.getElementById('setSalaryBtn').addEventListener('click', () => {
    const raw = parseFloat(document.getElementById('salaryInput').value);
    const date = document.getElementById('salaryDateInput').value;
    if (isNaN(raw) || raw <= 0) { alert('Sueldo válido'); return; }
    if (!date) { alert('Selecciona fecha'); return; }
    resetPeriod(raw, date);
    document.getElementById('salaryInput').value = '';
    document.getElementById('salaryDateInput').value = '';
    document.querySelector('.tab-btn[data-tab="dashboard"]').click();
  });
  
  document.getElementById('updateSalaryOnlyBtn').addEventListener('click', () => {
    const raw = parseFloat(document.getElementById('salaryInput').value);
    const date = document.getElementById('salaryDateInput').value;
    if (isNaN(raw) || raw <= 0) { alert('Sueldo válido'); return; }
    if (!date) { alert('Selecciona fecha'); return; }
    updateSalaryOnly(raw, date);
    document.getElementById('salaryInput').value = '';
    document.getElementById('salaryDateInput').value = '';
    document.querySelector('.tab-btn[data-tab="dashboard"]').click();
  });
  
  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    const desc = document.getElementById('expenseDesc').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const cat = document.getElementById('expenseCategory').value;
    const sub = document.getElementById('expenseSubcategory').value;
    if (addExpense(desc, amount, cat, sub)) {
      document.getElementById('expenseDesc').value = '';
      document.getElementById('expenseAmount').value = '';
      // Forzar actualización visual adicional (opcional)
      setTimeout(() => refreshUI(), 10);
    }
  });
  
  document.getElementById('clearExpensesBtn').addEventListener('click', () => {
    if (confirm('¿Eliminar todos los gastos?')) { expenses = []; saveToLocalStorage(); refreshUI(); }
  });
  
  document.getElementById('addServiceBtn').addEventListener('click', () => {
    const name = document.getElementById('serviceName').value;
    const amount = parseFloat(document.getElementById('serviceAmount').value);
    const category = document.getElementById('serviceCategory').value;
    const dueDay = parseInt(document.getElementById('serviceDueDay').value);
    if (addService(name, amount, category, dueDay)) {
      document.getElementById('serviceName').value = '';
      document.getElementById('serviceAmount').value = '';
      document.getElementById('serviceDueDay').value = '';
    }
  });
  
  document.getElementById('resetDefaultServicesBtn').addEventListener('click', resetToDefaultServices);
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}