// app.js — Dinero618 v2.1 | Quincenas: 1-14 / 15-31 | IA con aprendizaje
'use strict';

// ═══════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════
const STORAGE_KEYS = {
  SALARY:             'budget_salary',
  SALARY_DATE:        'budget_salary_date',
  EXPENSES:           'budget_expenses',
  SERVICES:           'recurring_services',
  PAID_SERVICES_IDS:  'paid_services_ids',
  MAIN_BALANCE:       'main_balance',
  ARCHIVED_FORTNIGHTS:'archived_fortnights',
  IA_CORRECTIONS:     'ia_corrections'        // aprendizaje de IA
};

const DEFAULT_SERVICES = [
  { id: 1,  name: "PS Plus",          amount: 9.99,  category: "Deseos",       dueDay: 4  },
  { id: 2,  name: "Internet Wifi",    amount: 50,    category: "Necesidades",  dueDay: 5  },
  { id: 3,  name: "Pago del terreno", amount: 150,   category: "Necesidades",  dueDay: 5  },
  { id: 4,  name: "Game Pass",        amount: 16.49, category: "Deseos",       dueDay: 6  },
  { id: 5,  name: "Tidal",            amount: 16.99, category: "Deseos",       dueDay: 11 },
  { id: 6,  name: "Prime Video",      amount: 14.99, category: "Deseos",       dueDay: 13 },
  { id: 7,  name: "Wifi",             amount: 70,    category: "Necesidades",  dueDay: 14 },
  { id: 8,  name: "Seguro de Carro",  amount: 170,   category: "Necesidades",  dueDay: 16 },
  { id: 10, name: "Google One",       amount: 1.99,  category: "Necesidades",  dueDay: 23 }
];

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let currentSalary      = 0;
let salaryDate         = '';
let currentFortnight   = '';
let expenses           = [];
let services           = [];
let paidServiceIds     = [];
let mainBalance        = 0;
let archivedFortnights = [];
let budgetChart        = null;
let isEditingSalary    = false;
let folderHandle       = null;
let activeFilter       = 'all';

// Aprendizaje de IA
let iaCorrections = {};   // { "palabra clave": { category, subcategory } }

// DOM refs
let salaryDisplay, salaryDateDisplay, fortnightDisplay, mainBalanceDisplay;
let needsAlloc, wantsAlloc, savingsAlloc;
let needsAllocDetail, wantsAllocDetail, savingsAllocDetail;
let needsCommitted, wantsCommitted;
let needsSpent, wantsSpent, savingsSpent;
let needsFree, wantsFree, savingsFree;
let expenseListContainer, alertsContainer, servicesListContainer;
let salaryInput, salaryDateInput, setSalaryBtn, editSalaryBtn;
let aiInput, aiProcessBtn, aiFeedback, coachText, refreshCoachBtn;
let expenseError, archivedFortnightsContainer;

// ═══════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════
// CONFIRM MODAL
// ═══════════════════════════════════════════════
function showConfirm(msg) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    if (!overlay) { resolve(confirm(msg)); return; }
    document.getElementById('confirm-msg').textContent = msg;
    overlay.classList.add('show');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    function cleanup(result) {
      overlay.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ═══════════════════════════════════════════════
// VIBRACIÓN
// ═══════════════════════════════════════════════
function vibrate(pattern = 50) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}
function fmt(amount) {
  return `$${Math.abs(amount).toFixed(2)}`;
}
function pulseBalance() {
  if (!mainBalanceDisplay) return;
  mainBalanceDisplay.classList.remove('balance-pulse');
  void mainBalanceDisplay.offsetWidth;
  mainBalanceDisplay.classList.add('balance-pulse');
  mainBalanceDisplay.addEventListener('animationend', () => {
    mainBalanceDisplay.classList.remove('balance-pulse');
  }, { once: true });
}

function calculateAllocations(salary) {
  return { needs: salary * 0.5, wants: salary * 0.3, savings: salary * 0.2 };
}

function getSpentByCategory() {
  let spentNeeds = 0, spentWants = 0, spentSavings = 0;
  expenses.forEach(exp => {
    if (exp.amount <= 0) return; // solo gastos
    if (exp.category === 'Necesidades')  spentNeeds   += exp.amount;
    else if (exp.category === 'Deseos')  spentWants   += exp.amount;
    else if (exp.category === 'Ahorro/Deuda') spentSavings += exp.amount;
  });
  return { spentNeeds, spentWants, spentSavings };
}

// ═══════════════════════════════════════════════
// LÓGICA DE QUINCENAS (CORREGIDA)
// Primera quincena: días 1 al 14
// Segunda quincena: días 15 al 31
// ═══════════════════════════════════════════════
function getFortnightFromDate(dateStr) {
  if (!dateStr) return '';
  const day = new Date(dateStr).getDate();
  return day >= 15 ? 'second' : 'first';
}

function getDueDayRange(fortnight) {
  if (fortnight === 'first') {
    return { min: 1, max: 14 };
  } else {
    return { min: 15, max: 31 };
  }
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
    .sort((a, b) => a.dueDay - b.dueDay);
}

function getTodaysDueServices() {
  const today = new Date().getDate();
  if (!currentFortnight) return [];
  const range = getDueDayRange(currentFortnight);
  return services.filter(s =>
    s.dueDay === today &&
    s.dueDay >= range.min &&
    s.dueDay <= range.max &&
    !paidServiceIds.includes(s.id)
  );
}

// ═══════════════════════════════════════════════
// LOCAL STORAGE (incluye correcciones IA)
// ═══════════════════════════════════════════════
function loadCorrections() {
  const saved = localStorage.getItem(STORAGE_KEYS.IA_CORRECTIONS);
  if (saved) iaCorrections = JSON.parse(saved);
}
function saveCorrection(originalText, category, subcategory) {
  let key = originalText.toLowerCase()
    .replace(/\d+(?:[\.,]\d+)?/g, '')
    .replace(/gasté|gaste|en|un|una|el|la|los|las|de|para|por|con|pagué|pague|compré|compre/gi, '')
    .trim();
  if (key.length < 3) return;
  iaCorrections[key] = { category, subcategory };
  localStorage.setItem(STORAGE_KEYS.IA_CORRECTIONS, JSON.stringify(iaCorrections));
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEYS.SALARY,              currentSalary.toString());
  localStorage.setItem(STORAGE_KEYS.SALARY_DATE,         salaryDate);
  localStorage.setItem(STORAGE_KEYS.EXPENSES,            JSON.stringify(expenses));
  localStorage.setItem(STORAGE_KEYS.SERVICES,            JSON.stringify(services));
  localStorage.setItem(STORAGE_KEYS.PAID_SERVICES_IDS,   JSON.stringify(paidServiceIds));
  localStorage.setItem(STORAGE_KEYS.MAIN_BALANCE,        mainBalance.toString());
  localStorage.setItem(STORAGE_KEYS.ARCHIVED_FORTNIGHTS, JSON.stringify(archivedFortnights));
}

function loadFromLocalStorage() {
  const savedSalary   = localStorage.getItem(STORAGE_KEYS.SALARY);
  currentSalary       = savedSalary ? parseFloat(savedSalary) : 0;
  salaryDate          = localStorage.getItem(STORAGE_KEYS.SALARY_DATE) || '';
  const savedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  expenses            = savedExpenses ? JSON.parse(savedExpenses) : [];
  const savedServices = localStorage.getItem(STORAGE_KEYS.SERVICES);
  services            = savedServices ? JSON.parse(savedServices) : JSON.parse(JSON.stringify(DEFAULT_SERVICES));
  const savedPaid     = localStorage.getItem(STORAGE_KEYS.PAID_SERVICES_IDS);
  paidServiceIds      = savedPaid ? JSON.parse(savedPaid) : [];
  const savedBalance  = localStorage.getItem(STORAGE_KEYS.MAIN_BALANCE);
  mainBalance         = savedBalance ? parseFloat(savedBalance) : 0;
  const savedArchived = localStorage.getItem(STORAGE_KEYS.ARCHIVED_FORTNIGHTS);
  archivedFortnights  = savedArchived ? JSON.parse(savedArchived) : [];
  currentFortnight = getFortnightFromDate(salaryDate);
}

// ═══════════════════════════════════════════════
// ARCHIVO DE QUINCENAS
// ═══════════════════════════════════════════════
function archiveCurrentFortnight() {
  if (!currentSalary || expenses.length === 0) return;
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const totalSpent = spentNeeds + spentWants + spentSavings;
  const extraIncome = expenses
    .filter(e => e.amount < 0)
    .reduce((sum, e) => sum - e.amount, 0);
  archivedFortnights.unshift({
    salary:       currentSalary,
    salaryDate,
    fortnight:    currentFortnight,
    archivedAt:   new Date().toISOString(),
    totalSpent,
    extraIncome,
    spentNeeds,
    spentWants,
    spentSavings,
    expenseCount: expenses.filter(e => e.amount > 0).length
  });
  if (archivedFortnights.length > 12) archivedFortnights.length = 12;
}

// ═══════════════════════════════════════════════
// IA: PARSEO DE FECHAS Y PROCESAMIENTO CON APRENDIZAJE
// ═══════════════════════════════════════════════
function parseDateFromText(text) {
  const lower = text.toLowerCase();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (lower.includes('hoy'))    return today;
  if (lower.includes('ayer'))   { const d = new Date(today); d.setDate(today.getDate() - 1); return d; }
  if (lower.includes('mañana')) { const d = new Date(today); d.setDate(today.getDate() + 1); return d; }
  const regex = /el (\d{1,2})(?: de)? (\w+)/i;
  const match = text.match(regex);
  if (match) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                    'septiembre','octubre','noviembre','diciembre'];
    let monthIndex = months.findIndex(m => m.startsWith(monthName));
    if (monthIndex === -1) monthIndex = new Date().getMonth();
    let date = new Date(today.getFullYear(), monthIndex, day);
    if (date < today && monthIndex <= today.getMonth()) date = new Date(today.getFullYear() + 1, monthIndex, day);
    return date;
  }
  return null;
}

function processAIText(text) {
  const rawText = text.toLowerCase().trim();
  if (!rawText) return;

  let expenseDate = parseDateFromText(rawText) || new Date();

  const numberPattern = /\d+(?:[\.,]\d+)?/g;
  const matches = rawText.match(numberPattern);
  if (!matches) {
    showAIFeedback("⚠️ No detecté monto. Ej: 'gasté 35 en gasolina'", "text-red-600");
    return;
  }
  const amount = parseFloat(matches[0].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    showAIFeedback("Monto no válido", "text-red-600");
    return;
  }

  const incomeKeywords = ["gané","ganancia","ingreso","recibí","sumar","extra","depósito","sueldo extra"];
  const isIncome = incomeKeywords.some(kw => rawText.includes(kw));

  let category    = "Deseos";
  let subcategory = "🔄 Otros";
  let cleanDesc = text
    .replace(matches[0], "")
    .replace(/gasté|gaste|gané|gane|en|un|una|unos|unas|hoy|ayer|mañana|el \d+ de \w+/gi, "")
    .trim();
  if (!cleanDesc) cleanDesc = isIncome ? "Ingreso Extra" : "Gasto Inteligente";

  // 1. Verificar si hay una corrección guardada para esta descripción
  let correction = null;
  for (let [pattern, data] of Object.entries(iaCorrections)) {
    if (cleanDesc.toLowerCase().includes(pattern)) {
      correction = data;
      break;
    }
  }
  if (correction) {
    category = correction.category;
    subcategory = correction.subcategory;
  } else {
    // 2. Mapeo por palabras clave (fallback)
    const keywordsMap = [
      { keywords: ["super","comida","despensa","walmart","restaurante","cenar","comer","almuerzo","tacos","pizza"], cat: "Necesidades", sub: "🍔 Comida y Súper" },
      { keywords: ["gas","gasolina","carro","auto","jetta","tuning","filtro","mantenimiento","taller","mecanico","aceite","reparacion"], cat: "Necesidades", sub: "🚗 Gasolina y Carro" },
      { keywords: ["medicina","doctor","clinica","farmacia","salud","consulta","dentista"], cat: "Necesidades", sub: "🏥 Salud" },
      { keywords: ["luz","agua","gas natural","internet","wifi","renta","alquiler","servicio"], cat: "Necesidades", sub: "🏠 Servicios" },
      { keywords: ["juego","steam","gamepass","ps plus","xbox","playstation","ocio","cine","pelicula","entretenimiento"], cat: "Deseos", sub: "🎮 Juegos y Ocio" },
      { keywords: ["cheve","antro","bar","salida","pisto","fiesta","cafecito","starbucks"], cat: "Deseos", sub: "🍽️ Salidas" },
      { keywords: ["ropa","tenis","amazon","aliexpress","compra","shoppear","reloj","regalo"], cat: "Deseos", sub: "🛍️ Compras" },
      { keywords: ["ahorro","guardar","inversion","crypto","bitcoin","fondo"], cat: "Ahorro/Deuda", sub: "💰 Fondo de Ahorro" },
      { keywords: ["tarjeta","credito","prestamo","deuda","abono","banco"], cat: "Ahorro/Deuda", sub: "💳 Pago Tarjeta/Préstamo" }
    ];
    for (const item of keywordsMap) {
      if (item.keywords.some(kw => rawText.includes(kw))) {
        category = item.cat;
        subcategory = item.sub;
        break;
      }
    }
  }

  if (isIncome) {
    if (addExtraIncome(cleanDesc, amount, expenseDate)) {
      showAIFeedback(`✨ Ingreso: +${fmt(amount)} (${expenseDate.toLocaleDateString()})`, "text-emerald-600");
    }
  } else {
    if (addExpenseWithDate(cleanDesc, amount, category, subcategory, expenseDate)) {
      showAIFeedback(`✅ Gasto: ${fmt(amount)} en ${category} (${expenseDate.toLocaleDateString()})`, "text-indigo-600");
    }
  }
  aiInput.value = "";
}

function showAIFeedback(msg, colorClass) {
  aiFeedback.textContent = msg;
  aiFeedback.className = `text-[11px] mt-1.5 px-1 font-semibold ${colorClass}`;
  aiFeedback.classList.remove('hidden');
  setTimeout(() => aiFeedback.classList.add('hidden'), 4000);
}

// ═══════════════════════════════════════════════
// OPERACIONES FINANCIERAS
// ═══════════════════════════════════════════════
function addExpenseWithDate(description, amount, category, subcategory, dateObj) {
  if (isNaN(amount) || amount <= 0) return false;
  if (amount > mainBalance) {
    showExpenseError(`Saldo insuficiente (disponible: ${fmt(mainBalance)})`);
    vibrate([30, 30, 30]);
    return false;
  }
  hideExpenseError();
  mainBalance -= amount;
  expenses.push({
    id:          Date.now(),
    description: description.trim(),
    amount:      parseFloat(amount),
    category,
    subcategory,
    date:        dateObj.toISOString(),
    fortnight:   currentFortnight,
    salaryDate
  });
  saveToLocalStorage();
  refreshUI();
  vibrate(50);
  pulseBalance();
  return true;
}

function showExpenseError(msg) {
  if (!expenseError) return;
  expenseError.textContent = msg;
  expenseError.classList.remove('hidden');
}
function hideExpenseError() {
  if (!expenseError) return;
  expenseError.classList.add('hidden');
}

function addExtraIncome(description, amount, dateObj) {
  if (amount <= 0) return false;
  mainBalance += amount;
  expenses.push({
    id:          Date.now(),
    description: `✨ GANANCIA: ${description}`,
    amount:      -amount,
    category:    'Ingreso',
    subcategory: 'Extra',
    date:        dateObj.toISOString(),
    fortnight:   currentFortnight,
    salaryDate
  });
  saveToLocalStorage();
  refreshUI();
  vibrate(50);
  pulseBalance();
  return true;
}

function addExpense(description, amount, category, subcategory) {
  return addExpenseWithDate(description, amount, category, subcategory, new Date());
}

function deleteExpenseById(id) {
  const target = expenses.find(exp => exp.id === id);
  if (!target) return;
  mainBalance -= target.amount;  // si es gasto (+) se suma, si es ingreso (-) se resta
  expenses = expenses.filter(exp => exp.id !== id);
  saveToLocalStorage();
  refreshUI();
  vibrate(30);
  pulseBalance();
}

async function handleSalarySubmit(newSalary, newDate) {
  if (currentSalary > 0 && !isEditingSalary) {
    const ok = await showConfirm('¿Iniciar nueva quincena? El historial actual se archivará y limpiará.');
    if (!ok) return;
    archiveCurrentFortnight();
    mainBalance      = newSalary;
    currentSalary    = newSalary;
    salaryDate       = newDate;
    currentFortnight = getFortnightFromDate(newDate);
    expenses         = [];
    paidServiceIds   = [];
  } else if (isEditingSalary) {
    const diff   = newSalary - currentSalary;
    mainBalance     += diff;
    currentSalary    = newSalary;
    salaryDate       = newDate;
    currentFortnight = getFortnightFromDate(newDate);
    isEditingSalary  = false;
    showToast('Quincena actualizada ✓', 'info');
  } else {
    mainBalance      = newSalary;
    currentSalary    = newSalary;
    salaryDate       = newDate;
    currentFortnight = getFortnightFromDate(newDate);
    showToast(`Quincena iniciada: ${fmt(newSalary)} ✓`, 'success');
  }
  saveToLocalStorage();
  refreshUI();
  pulseBalance();
}

// ═══════════════════════════════════════════════
// FILTRO Y EXPORTACIÓN
// ═══════════════════════════════════════════════
function getFilteredExpenses() {
  switch (activeFilter) {
    case 'all':       return expenses;
    case 'quincena':  return expenses.filter(e => e.salaryDate === salaryDate);
    case 'Ingreso':   return expenses.filter(e => e.category === 'Ingreso');
    default:          return expenses.filter(e => e.category === activeFilter);
  }
}

function getExpensesForCurrentMonth() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  return expenses.filter(exp => {
    if (!exp.date) return false;
    const d = new Date(exp.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

async function saveFile(blob, fileName) {
  if ('showSaveFilePicker' in window && folderHandle) {
    try {
      const fileHandle = await folderHandle.getFileHandle(fileName, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) { console.warn('folder save failed, fallback', e); }
  }
  const link = document.createElement('a');
  link.href  = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportToCSV() {
  const monthExpenses = getExpensesForCurrentMonth();
  const rows = [["Fecha","Descripción","Categoría","Subcategoría","Monto"]];
  monthExpenses.forEach(exp => rows.push([
    new Date(exp.date).toLocaleDateString(),
    exp.description, exp.category, exp.subcategory,
    exp.amount.toString()
  ]));
  const csvContent = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const fileName = `dinero618_${new Date().toISOString().slice(0, 7)}.csv`;
  await saveFile(blob, fileName);
  showToast(`CSV guardado: ${fileName}`, 'success');
}

async function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const monthExpenses = getExpensesForCurrentMonth();
  const tableData = monthExpenses.map(exp => [
    new Date(exp.date).toLocaleDateString(),
    exp.description, exp.category, exp.subcategory,
    `$${exp.amount.toFixed(2)}`
  ]);
  doc.text(`Dinero618 — ${new Date().toLocaleString('es', { month: 'long', year: 'numeric' })}`, 14, 16);
  doc.autoTable({
    head: [["Fecha","Concepto","Categoría","Subcat","Monto"]],
    body: tableData,
    startY: 25,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229] }
  });
  const fileName = `dinero618_${new Date().toISOString().slice(0, 7)}.pdf`;
  await saveFile(doc.output('blob'), fileName);
  showToast(`PDF guardado: ${fileName}`, 'success');
}

async function selectExportFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      folderHandle = await window.showDirectoryPicker();
      showToast('Carpeta seleccionada ✓', 'success');
    } catch (e) { console.warn(e); }
  } else {
    showToast('Tu navegador no soporta selección de carpetas', 'warning');
  }
}

// ═══════════════════════════════════════════════
// RENDERIZADO
// ═══════════════════════════════════════════════
function renderServicesList() {
  if (!servicesListContainer) return;
  if (services.length === 0) {
    servicesListContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">Sin servicios registrados.</p>';
    return;
  }
  servicesListContainer.innerHTML = services
    .sort((a, b) => a.dueDay - b.dueDay)
    .map(s => `
      <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center text-xs shadow-sm">
        <div>
          <div class="font-bold text-gray-700">${escapeHtml(s.name)}</div>
          <div class="text-gray-500">${fmt(s.amount)} · ${s.category} · Día ${s.dueDay}</div>
        </div>
        <button class="delete-service text-red-400 p-1 active:scale-90" data-id="${s.id}">🗑️</button>
      </div>
    `).join('');
  document.querySelectorAll('.delete-service').forEach(btn =>
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este servicio?');
      if (!ok) return;
      services = services.filter(item => item.id !== parseInt(btn.dataset.id));
      saveToLocalStorage();
      refreshUI();
      showToast('Servicio eliminado', 'info');
    })
  );
}

function renderExpenseList() {
  if (!expenseListContainer) return;
  const filtered = getFilteredExpenses();
  if (filtered.length === 0) {
    expenseListContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-6">📭 Sin movimientos aquí.</div>';
    return;
  }
  expenseListContainer.innerHTML = filtered.slice().reverse().map(exp => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center shadow-sm text-sm">
      <div class="flex-1 min-w-0 pr-2">
        <div class="font-medium text-gray-800 truncate">${escapeHtml(exp.description)}</div>
        <div class="text-[10px] text-gray-400 mt-0.5">
          ${exp.date ? new Date(exp.date).toLocaleDateString() : 'Sin fecha'}
          · ${exp.category} · ${exp.subcategory}
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="font-bold ${exp.amount < 0 ? 'text-emerald-600' : 'text-gray-800'}">
          ${exp.amount < 0 ? `+${fmt(exp.amount)}` : fmt(exp.amount)}
        </span>
        <button class="edit-expense text-blue-400 p-1 active:scale-90" data-id="${exp.id}">✏️</button>
        <button class="delete-expense text-red-400 p-1 active:scale-90" data-id="${exp.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  // Botones eliminar
  document.querySelectorAll('.delete-expense').forEach(btn =>
    btn.addEventListener('click', () => deleteExpenseById(parseInt(btn.dataset.id)))
  );
  // Botones editar (aprendizaje)
  document.querySelectorAll('.edit-expense').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const expense = expenses.find(e => e.id === id);
      if (!expense) return;
      const newCat = prompt('Nueva categoría (Necesidades/Deseos/Ahorro/Deuda/Ingreso):', expense.category);
      if (!newCat) return;
      const newSub = prompt('Nueva subcategoría:', expense.subcategory);
      if (!newSub) return;
      // Guardar corrección para la IA (solo si es gasto, no ingreso)
      if (expense.amount > 0 && expense.category !== 'Ingreso') {
        saveCorrection(expense.description, newCat, newSub);
        showToast('Corrección guardada. La IA aprenderá para futuros gastos similares.', 'info');
      }
      expense.category = newCat;
      expense.subcategory = newSub;
      saveToLocalStorage();
      refreshUI();
    })
  );
}

function renderAlerts() {
  if (!alertsContainer) return;
  const todayDue = getTodaysDueServices();
  if (todayDue.length === 0) { alertsContainer.innerHTML = ''; return; }
  alertsContainer.innerHTML = todayDue.map(s => `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs">
      <div>
        <span class="font-bold text-amber-800">⚠️ Vence hoy:</span>
        ${escapeHtml(s.name)} (${fmt(s.amount)})
      </div>
      <button class="pay-service-btn bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95"
        data-id="${s.id}" data-name="${escapeHtml(s.name)}"
        data-amount="${s.amount}" data-category="${s.category}">
        Pagar
      </button>
    </div>
  `).join('');
  document.querySelectorAll('.pay-service-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      if (!paidServiceIds.includes(id)) {
        paidServiceIds.push(id);
        addExpense(
          `${btn.dataset.name} (Cobro Fijo)`,
          parseFloat(btn.dataset.amount),
          btn.dataset.category,
          "Automático"
        );
        showToast(`${btn.dataset.name} pagado ✓`, 'success');
      }
    })
  );
}

function renderArchivedFortnights() {
  if (!archivedFortnightsContainer) return;
  if (archivedFortnights.length === 0) {
    archivedFortnightsContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Sin quincenas archivadas.</p>';
    return;
  }
  archivedFortnightsContainer.innerHTML = archivedFortnights.map((q, i) => {
    const label = q.fortnight === 'first' ? '1ª Quincena (1-14)' : '2ª Quincena (15-31)';
    const date  = q.salaryDate ? new Date(q.salaryDate).toLocaleDateString('es', { month: 'short', year: 'numeric' }) : '';
    return `
      <div class="bg-white/60 rounded-xl p-3 text-xs shadow-sm">
        <div class="flex justify-between items-center mb-1">
          <span class="font-bold text-violet-800">${label} ${date}</span>
          <span class="text-gray-500">Sueldo: ${fmt(q.salary)}</span>
        </div>
        <div class="flex justify-between text-gray-500">
          <span>Gastado: <b class="text-red-500">${fmt(q.totalSpent)}</b></span>
          <span>Extra: <b class="text-emerald-600">+${fmt(q.extraIncome)}</b></span>
          <span>${q.expenseCount} movimientos</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateAICoachAnalysis() {
  if (!currentSalary || currentSalary <= 0) {
    coachText.innerHTML = "🧠 Configura tu sueldo en <b>Ingresos</b> para activar el coach.";
    return;
  }
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  const freeNeeds = alloc.needs - spentNeeds - committedNeeds;
  const freeWants = alloc.wants - spentWants - committedWants;
  const balancePct = (mainBalance / currentSalary) * 100;
  let advice = "🧠 ";
  if (mainBalance <= 0) {
    advice += "⚠️ <b>Saldo real en cero.</b> Evita nuevos gastos hasta el próximo ingreso.";
  } else if (freeNeeds < 0) {
    advice += `<b>Necesidades excedidas</b> en ${fmt(Math.abs(freeNeeds))}. Revisa gastos variables.`;
  } else if (freeWants < 0) {
    advice += `<b>Deseos excedidos</b> en ${fmt(Math.abs(freeWants))}. Ponle freno al ocio.`;
  } else if (spentWants / alloc.wants > 0.75) {
    advice += `Has usado el <b>${Math.round(spentWants / alloc.wants * 100)}%</b> de Deseos. Controla las salidas.`;
  } else if (balancePct < 20) {
    advice += `Saldo bajo (<b>${balancePct.toFixed(0)}%</b> del sueldo). Prioriza solo lo necesario.`;
  } else {
    advice += `Finanzas estables ✅. Cupo libre Necesidades: <b>${fmt(freeNeeds)}</b> · Deseos: <b>${fmt(freeWants)}</b>. ¡Sigue así!`;
  }
  coachText.innerHTML = advice;
}

function buildFreeBoxHTML(freeAmount, committedServices, manualBreakdown) {
  const isNegative = freeAmount < 0;
  let html = `<div class="text-lg font-black ${isNegative ? 'text-red-500' : 'text-emerald-700'}">
    ${isNegative ? '-' : ''}${fmt(freeAmount)}
  </div>`;
  if (committedServices.length > 0) {
    html += `<div class="border-t border-gray-300 my-2"></div>
      <div class="bg-amber-50/60 p-2 rounded-xl mb-2 text-amber-900">
        <div class="text-xs font-semibold uppercase tracking-wide">📌 Próximos pagos</div>
        <div class="space-y-1 mt-1">`;
    committedServices.forEach(s => {
      html += `<div class="flex justify-between items-center text-xs">
        <span class="truncate">${escapeHtml(s.name)} <span class="text-amber-600">(día ${s.dueDay})</span></span>
        <span class="font-mono font-semibold">${fmt(s.amount)}</span>
      </div>`;
    });
    html += `</div></div>`;
  }
  const manualEntries = Object.entries(manualBreakdown);
  if (manualEntries.length > 0) {
    html += `<div class="bg-blue-50/60 p-2 rounded-xl text-blue-900">
        <div class="text-xs font-semibold uppercase tracking-wide">✍️ Gastos realizados</div>
        <div class="space-y-1 mt-1">`;
    manualEntries.forEach(([sub, amount]) => {
      html += `<div class="flex justify-between items-center text-xs">
        <span class="truncate">${escapeHtml(sub)}</span>
        <span class="font-mono font-semibold">${fmt(amount)}</span>
      </div>`;
    });
    html += `</div></div>`;
  }
  if (committedServices.length === 0 && manualEntries.length === 0) {
    html += `<div class="border-t border-gray-300 my-2"></div>
      <div class="text-xs text-gray-400 italic text-center py-1">✨ Sin consumos ni pagos futuros.</div>`;
  }
  return html;
}

function refreshUI() {
  if (!mainBalanceDisplay) return;
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');

  salaryDisplay.textContent     = currentSalary ? fmt(currentSalary) : '—';
  salaryDateDisplay.textContent = salaryDate ? `Depósito: ${salaryDate}` : 'Sin fecha configurada';
  fortnightDisplay.textContent  = currentFortnight === 'first'
    ? '📆 Primera Quincena (Días 1–14)'
    : currentFortnight === 'second'
      ? '📆 Segunda Quincena (Días 15–31)'
      : '';
  mainBalanceDisplay.textContent = fmt(mainBalance);
  mainBalanceDisplay.className = `text-xl font-black ${mainBalance <= 0 ? 'text-red-500' : 'text-emerald-700'}`;

  needsAlloc.textContent   = fmt(alloc.needs);
  wantsAlloc.textContent   = fmt(alloc.wants);
  savingsAlloc.textContent = fmt(alloc.savings);
  needsAllocDetail.textContent   = fmt(alloc.needs);
  wantsAllocDetail.textContent   = fmt(alloc.wants);
  savingsAllocDetail.textContent = fmt(alloc.savings);
  needsCommitted.textContent     = fmt(committedNeeds);
  wantsCommitted.textContent     = fmt(committedWants);
  needsSpent.textContent         = fmt(spentNeeds);
  wantsSpent.textContent         = fmt(spentWants);
  savingsSpent.textContent       = fmt(spentSavings);

  const freeNeeds   = currentSalary ? (alloc.needs   - spentNeeds   - committedNeeds) : 0;
  const freeWants   = currentSalary ? (alloc.wants   - spentWants   - committedWants) : 0;
  const freeSavings = currentSalary ? (alloc.savings - spentSavings) : 0;
  savingsFree.textContent = fmt(freeSavings);
  savingsFree.className   = `text-sm font-bold ${freeSavings < 0 ? 'text-red-500' : 'text-emerald-700'}`;

  const committedServicesNeeds = getCommittedServicesList('Necesidades');
  const committedServicesWants = getCommittedServicesList('Deseos');
  const getSubcategoryBreakdown = (category) => {
    const filtered = expenses.filter(exp => exp.category === category && exp.subcategory !== "Automático" && exp.amount > 0);
    const breakdown = {};
    filtered.forEach(exp => { breakdown[exp.subcategory] = (breakdown[exp.subcategory] || 0) + exp.amount; });
    return breakdown;
  };
  needsFree.innerHTML = buildFreeBoxHTML(freeNeeds, committedServicesNeeds, getSubcategoryBreakdown('Necesidades'));
  wantsFree.innerHTML = buildFreeBoxHTML(freeWants, committedServicesWants, getSubcategoryBreakdown('Deseos'));

  // Control edición sueldo
  if (currentSalary > 0 && !isEditingSalary) {
    salaryInput.value        = currentSalary;
    salaryDateInput.value    = salaryDate;
    salaryInput.disabled     = true;
    salaryDateInput.disabled = true;
    setSalaryBtn.classList.add('hidden');
    editSalaryBtn.classList.remove('hidden');
  } else {
    salaryInput.disabled     = false;
    salaryDateInput.disabled = false;
    setSalaryBtn.classList.remove('hidden');
    editSalaryBtn.classList.add('hidden');
    setSalaryBtn.textContent = isEditingSalary ? '💾 Guardar Corrección' : '✨ Iniciar Quincena';
  }

  renderExpenseList();
  renderServicesList();
  renderAlerts();
  renderArchivedFortnights();
  updateAICoachAnalysis();

  if (budgetChart && currentSalary) {
    budgetChart.data.datasets[0].data = [
      Math.max(0, spentNeeds),
      Math.max(0, spentWants),
      Math.max(0, spentSavings)
    ];
    budgetChart.data.datasets[1].data = [alloc.needs, alloc.wants, alloc.savings];
    budgetChart.update();
  }
}

function initChart() {
  const ctx = document.getElementById('budgetChart').getContext('2d');
  budgetChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Necesidades', 'Deseos', 'Ahorro'],
      datasets: [
        { label: 'Gastado',      data: [0, 0, 0], backgroundColor: '#6366f1', borderRadius: 6 },
        { label: 'Presupuesto', data: [0, 0, 0], backgroundColor: '#e2e8f0', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } } }
    }
  });
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    contents.forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${target}`).classList.remove('hidden');
    tabs.forEach(t => { t.classList.remove('text-indigo-600'); t.classList.add('text-gray-500'); });
    btn.classList.add('text-indigo-600');
    btn.classList.remove('text-gray-500');
  }));
}

// ═══════════════════════════════════════════════
// EVENTOS Y ARRANQUE
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Asignar referencias DOM
  salaryDisplay              = document.getElementById('salaryDisplay');
  salaryDateDisplay          = document.getElementById('salaryDateDisplay');
  fortnightDisplay           = document.getElementById('fortnightDisplay');
  mainBalanceDisplay         = document.getElementById('mainBalanceDisplay');
  needsAlloc                 = document.getElementById('needsAlloc');
  wantsAlloc                 = document.getElementById('wantsAlloc');
  savingsAlloc               = document.getElementById('savingsAlloc');
  needsAllocDetail           = document.getElementById('needsAllocDetail');
  wantsAllocDetail           = document.getElementById('wantsAllocDetail');
  savingsAllocDetail         = document.getElementById('savingsAllocDetail');
  needsCommitted             = document.getElementById('needsCommitted');
  wantsCommitted             = document.getElementById('wantsCommitted');
  needsSpent                 = document.getElementById('needsSpent');
  wantsSpent                 = document.getElementById('wantsSpent');
  savingsSpent               = document.getElementById('savingsSpent');
  needsFree                  = document.getElementById('needsFree');
  wantsFree                  = document.getElementById('wantsFree');
  savingsFree                = document.getElementById('savingsFree');
  expenseListContainer       = document.getElementById('expenseListContainer');
  alertsContainer            = document.getElementById('alertsContainer');
  servicesListContainer      = document.getElementById('servicesListContainer');
  salaryInput                = document.getElementById('salaryInput');
  salaryDateInput            = document.getElementById('salaryDateInput');
  setSalaryBtn               = document.getElementById('setSalaryBtn');
  editSalaryBtn              = document.getElementById('editSalaryBtn');
  aiInput                    = document.getElementById('aiInput');
  aiProcessBtn               = document.getElementById('aiProcessBtn');
  aiFeedback                 = document.getElementById('aiFeedback');
  coachText                  = document.getElementById('coachText');
  refreshCoachBtn            = document.getElementById('refreshCoachBtn');
  expenseError               = document.getElementById('expenseError');
  archivedFortnightsContainer= document.getElementById('archivedFortnightsContainer');

  loadCorrections();
  initChart();
  loadFromLocalStorage();
  initTabs();
  refreshUI();

  // IA
  aiProcessBtn.addEventListener('click', () => processAIText(aiInput.value));
  aiInput.addEventListener('keypress', e => { if (e.key === 'Enter') processAIText(aiInput.value); });
  aiInput.addEventListener('focus', () => {
    setTimeout(() => aiInput.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  });
  refreshCoachBtn.addEventListener('click', () => {
    updateAICoachAnalysis();
    showToast('Coach actualizado ✓', 'info');
  });

  // Sueldo
  setSalaryBtn.addEventListener('click', async () => {
    const val = parseFloat(salaryInput.value);
    const date = salaryDateInput.value;
    if (val > 0 && date) {
      await handleSalarySubmit(val, date);
      document.querySelector('.tab-btn[data-tab="dashboard"]').click();
    } else {
      showToast('Ingresa sueldo y fecha válidos', 'error');
    }
  });
  editSalaryBtn.addEventListener('click', () => { isEditingSalary = true; refreshUI(); });

  // Exportación
  document.getElementById('exportCSVBtn').addEventListener('click', exportToCSV);
  document.getElementById('exportPDFBtn').addEventListener('click', exportToPDF);
  document.getElementById('selectFolderBtn').addEventListener('click', selectExportFolder);

  // Ingreso extra
  document.getElementById('addExtraIncomeBtn').addEventListener('click', () => {
    const desc = document.getElementById('extraIncomeDesc').value.trim();
    const amt = parseFloat(document.getElementById('extraIncomeAmount').value);
    if (!desc || isNaN(amt) || amt <= 0) {
      showToast('Concepto y monto válidos requeridos', 'error');
      return;
    }
    if (addExtraIncome(desc, amt, new Date())) {
      document.getElementById('extraIncomeDesc').value = '';
      document.getElementById('extraIncomeAmount').value = '';
      showToast(`+${fmt(amt)} sumado al saldo ✓`, 'success');
      document.querySelector('.tab-btn[data-tab="dashboard"]').click();
    }
  });

  // Gasto manual
  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    const desc = document.getElementById('expenseDesc').value.trim();
    const amt = parseFloat(document.getElementById('expenseAmount').value);
    const cat = document.getElementById('expenseCategory').value;
    const sub = document.getElementById('expenseSubcategory').value;
    if (!desc || isNaN(amt) || amt <= 0) {
      showExpenseError('Completa concepto y monto');
      return;
    }
    if (addExpense(desc, amt, cat, sub)) {
      document.getElementById('expenseDesc').value = '';
      document.getElementById('expenseAmount').value = '';
      showToast(`Gasto registrado: ${fmt(amt)} ✓`, 'success');
      document.querySelector('.tab-btn[data-tab="dashboard"]').click();
    }
  });

  // Limpiar historial
  document.getElementById('clearExpensesBtn').addEventListener('click', async () => {
    const ok = await showConfirm('¿Borrar todo el historial de esta quincena?\nEl saldo se recalculará.');
    if (!ok) return;
    const extraTotal = expenses
      .filter(e => e.amount < 0)
      .reduce((sum, e) => sum - e.amount, 0);
    expenses       = [];
    mainBalance    = currentSalary + extraTotal;
    paidServiceIds = [];
    saveToLocalStorage();
    refreshUI();
    showToast('Historial limpiado. Saldo recalculado ✓', 'info');
  });

  // Reset saldo
  document.getElementById('resetBalanceBtn').addEventListener('click', async () => {
    const ok = await showConfirm('¿Poner el saldo real a $0?');
    if (!ok) return;
    mainBalance = 0;
    saveToLocalStorage();
    refreshUI();
    pulseBalance();
    showToast('Saldo reiniciado a $0', 'warning');
  });

  // Agregar servicio
  document.getElementById('addServiceBtn').addEventListener('click', () => {
    const name = document.getElementById('serviceName').value.trim();
    const amount = parseFloat(document.getElementById('serviceAmount').value);
    const cat = document.getElementById('serviceCategory').value;
    const day = parseInt(document.getElementById('serviceDueDay').value);
    if (!name || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 31) {
      showToast('Datos del servicio no válidos', 'error');
      return;
    }
    services.push({ id: Date.now(), name, amount, category: cat, dueDay: day });
    saveToLocalStorage();
    refreshUI();
    document.getElementById('serviceName').value = '';
    document.getElementById('serviceAmount').value = '';
    document.getElementById('serviceDueDay').value = '';
    showToast(`${name} agregado ✓`, 'success');
  });

  // Filtros
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderExpenseList();
    });
  });
});