// app.js - Versión estable con desglose visual de compromisos y gastos
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
let isEditingSalary = false;
let folderHandle = null;

// Elementos DOM
let salaryDisplay, salaryDateDisplay, fortnightDisplay, mainBalanceDisplay;
let needsAlloc, wantsAlloc, savingsAlloc;
let needsAllocDetail, wantsAllocDetail;
let needsCommitted, wantsCommitted;
let needsSpent, wantsSpent;
let needsFree, wantsFree;
let expenseListContainer, alertsContainer, servicesListContainer;
let salaryInput, salaryDateInput, setSalaryBtn, editSalaryBtn;
let aiInput, aiProcessBtn, aiFeedback, coachText, refreshCoachBtn;

// ========== FUNCIONES AUXILIARES ==========
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

// ========== IA CON FECHAS ==========
function parseDateFromText(text) {
  const lower = text.toLowerCase();
  const today = new Date(); today.setHours(0,0,0,0);
  if (lower.includes('hoy')) return today;
  if (lower.includes('ayer')) { const ayer = new Date(today); ayer.setDate(today.getDate()-1); return ayer; }
  if (lower.includes('mañana')) { const manana = new Date(today); manana.setDate(today.getDate()+1); return manana; }
  const regex = /el (\d{1,2})(?: de)? (\w+)/i;
  const match = text.match(regex);
  if (match) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    let monthIndex = months.findIndex(m => m.startsWith(monthName));
    if (monthIndex === -1) monthIndex = new Date().getMonth();
    let date = new Date(today.getFullYear(), monthIndex, day);
    if (date < today && monthIndex <= today.getMonth()) date = new Date(today.getFullYear()+1, monthIndex, day);
    return date;
  }
  return null;
}

function processAIText(text) {
  const rawText = text.toLowerCase().trim();
  if (!rawText) return;
  let expenseDate = parseDateFromText(rawText);
  if (!expenseDate) expenseDate = new Date();
  const numberPattern = /\d+(?:[\.,]\d+)?/g;
  const matches = rawText.match(numberPattern);
  if (!matches) { showAIFeedback("⚠️ No detecté monto. Ej: 'gasté 35 en gasolina'", "text-red-600"); return; }
  const amount = parseFloat(matches[0].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) { showAIFeedback("Monto no válido", "text-red-600"); return; }
  let isIncome = false;
  const incomeKeywords = ["gané","ganancia","ingreso","recibí","sumar","extra","depósito","sueldo extra"];
  if (incomeKeywords.some(kw => rawText.includes(kw))) isIncome = true;
  let category = "Deseos";
  let subcategory = "🔄 Otros";
  let cleanDesc = text.replace(matches[0], "").replace(/gasté|gaste|gané|gane|en|un|una|unos|unas|hoy|ayer|mañana|el \d+ de \w+/gi, "").trim();
  if (!cleanDesc) cleanDesc = isIncome ? "Ingreso Extra" : "Gasto Inteligente";
  const keywordsMap = [
    { keywords: ["super","comida","despensa","walmart","restaurante","cenar","comer","almuerzo","tacos","pizza"], cat: "Necesidades", sub: "🍔 Comida y Súper" },
    { keywords: ["gas","gasolina","carro","auto","jetta","tuning","filtro","mantenimiento","taller","mecanico","aceite","reparacion"], cat: "Necesidades", sub: "🚗 Gasolina y Carro" },
    { keywords: ["medicina","doctor","clinica","farmacia","salud","consulta","dentista"], cat: "Necesidades", sub: "🏥 Salud" },
    { keywords: ["luz","agua","gas natural","internet","wifi","renta","alquiler","servicio"], cat: "Necesidades", sub: "🏠 Servicios" },
    { keywords: ["juego","steam","gamepass","ps plus","xbox","playstation","ocio","cine","pelicula","entretenimiento"], cat: "Deseos", sub: "🎮 Juegos y Ocio" },
    { keywords: ["cheve","antro","bar","salida","pisto","fiesta","cafecito","starbucks"], cat: "Deseos", sub: "🍽️ Salidas" },
    { keywords: ["ropa","tenis","amazon","aliexpress","compra","shoppear","reloj","regalo"], cat: "Deseos", sub: "🛍️ Compras" },
    { keywords: ["ahorro","guardar","inversion","crypto","bitcoin","fondo"], cat: "Ahorro/Deuda", sub: "💰 Fondo de Ahorro" },
    { keywords: ["tarjeta","credito","prestamo","deuda","abono","banco"], cat: "Ahorro/Deuda", sub: "💳 Pago Tarjeta/Prestamo" }
  ];
  for (const item of keywordsMap) {
    if (item.keywords.some(kw => rawText.includes(kw))) { category = item.cat; subcategory = item.sub; break; }
  }
  if (isIncome) {
    if (addExtraIncome(cleanDesc, amount, expenseDate)) showAIFeedback(`✨ Ingreso extra: +$${amount.toFixed(2)} (${expenseDate.toLocaleDateString()})`, "text-emerald-600");
  } else {
    if (addExpenseWithDate(cleanDesc, amount, category, subcategory, expenseDate)) showAIFeedback(`✅ Gasto: $${amount.toFixed(2)} en ${category} (${expenseDate.toLocaleDateString()})`, "text-indigo-600");
  }
  aiInput.value = "";
}

function showAIFeedback(msg, colorClass) {
  aiFeedback.textContent = msg;
  aiFeedback.className = `text-[11px] mt-1.5 px-1 font-semibold ${colorClass}`;
  aiFeedback.classList.remove('hidden');
  setTimeout(() => aiFeedback.classList.add('hidden'), 4000);
}

// ========== OPERACIONES FINANCIERAS ==========
function addExpenseWithDate(description, amount, category, subcategory, dateObj) {
  if (isNaN(amount) || amount <= 0) return false;
  if (amount > mainBalance) { alert(`Saldo insuficiente: $${mainBalance.toFixed(2)}`); return false; }
  mainBalance -= amount;
  expenses.push({ id: Date.now(), description: description.trim(), amount: parseFloat(amount), category, subcategory, date: dateObj.toISOString() });
  saveToLocalStorage();
  refreshUI();
  return true;
}

function addExtraIncome(description, amount, dateObj) {
  if (amount <= 0) return false;
  mainBalance += amount;
  expenses.push({ id: Date.now(), description: `✨ GANANCIA: ${description}`, amount: -amount, category: 'Ingreso', subcategory: 'Extra', date: dateObj.toISOString() });
  saveToLocalStorage();
  refreshUI();
  return true;
}

function addExpense(description, amount, category, subcategory) {
  return addExpenseWithDate(description, amount, category, subcategory, new Date());
}

function deleteExpenseById(id) {
  const target = expenses.find(exp => exp.id === id);
  if (target) { mainBalance += target.amount; expenses = expenses.filter(exp => exp.id !== id); saveToLocalStorage(); refreshUI(); }
}

function handleSalarySubmit(newSalary, newDate) {
  if (currentSalary > 0 && !isEditingSalary) {
    if (confirm('¿Nuevo período? Se limpiará el historial actual.')) { mainBalance = newSalary; currentSalary = newSalary; salaryDate = newDate; currentFortnight = getFortnightFromDate(newDate); expenses = []; paidServiceIds = []; }
    else return;
  } else if (isEditingSalary) {
    const diff = newSalary - currentSalary;
    mainBalance += diff; currentSalary = newSalary; salaryDate = newDate; currentFortnight = getFortnightFromDate(newDate); isEditingSalary = false;
  } else {
    mainBalance = newSalary; currentSalary = newSalary; salaryDate = newDate; currentFortnight = getFortnightFromDate(newDate);
  }
  saveToLocalStorage(); refreshUI();
}

// ========== EXPORTACIÓN ==========
function getExpensesForCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return expenses.filter(exp => {
    if (!exp.date) return false;
    const d = new Date(exp.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

async function exportToCSV() {
  const monthExpenses = getExpensesForCurrentMonth();
  const rows = [["Fecha","Descripción","Categoría","Subcategoría","Monto"]];
  monthExpenses.forEach(exp => rows.push([new Date(exp.date).toLocaleDateString(), exp.description, exp.category, exp.subcategory, exp.amount.toString()]));
  const csvContent = rows.map(row=>row.join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csvContent], {type:"text/csv;charset=utf-8"});
  const fileName = `resumen_${new Date().toISOString().slice(0,7)}.csv`;
  if ('showSaveFilePicker' in window && folderHandle) {
    try {
      const fileHandle = await folderHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      alert(`Guardado en carpeta: ${fileName}`);
      return;
    } catch(e) {}
  }
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click(); URL.revokeObjectURL(link.href);
}

async function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const monthExpenses = getExpensesForCurrentMonth();
  const tableData = monthExpenses.map(exp => [new Date(exp.date).toLocaleDateString(), exp.description, exp.category, exp.subcategory, `$${exp.amount.toFixed(2)}`]);
  doc.text(`Resumen ${new Date().toLocaleString('default',{month:'long',year:'numeric'})}`, 14, 16);
  doc.autoTable({ head:[["Fecha","Concepto","Categoría","Subcat","Monto"]], body:tableData, startY:25, styles:{fontSize:8}, headStyles:{fillColor:[79,70,229]} });
  const fileName = `resumen_${new Date().toISOString().slice(0,7)}.pdf`;
  if ('showSaveFilePicker' in window && folderHandle) {
    try {
      const fileHandle = await folderHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(doc.output('blob'));
      await writable.close();
      alert(`PDF guardado en carpeta: ${fileName}`);
      return;
    } catch(e) {}
  }
  doc.save(fileName);
}

async function selectExportFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      folderHandle = await window.showDirectoryPicker();
      alert("Carpeta seleccionada. Los reportes se guardarán ahí.");
    } catch(e) { console.warn(e); }
  } else alert("Tu navegador no soporta selección de carpetas.");
}

// ========== RENDERIZADO CON DESGLOSE VISUAL ==========
function renderServicesList() {
  if (!servicesListContainer) return;
  servicesListContainer.innerHTML = services.map(s => `<div class="bg-white/60 rounded-xl p-3 flex justify-between items-center text-xs"><div><div class="font-bold text-gray-700">${escapeHtml(s.name)}</div><div>$${s.amount.toFixed(2)} • ${s.category} • Día ${s.dueDay}</div></div><button class="delete-service text-red-400" data-id="${s.id}">🗑️</button></div>`).join('');
  document.querySelectorAll('.delete-service').forEach(btn => btn.addEventListener('click', () => { services = services.filter(item => item.id !== parseInt(btn.dataset.id)); saveToLocalStorage(); refreshUI(); }));
}

function renderExpenseList() {
  if (!expenseListContainer) return;
  if (expenses.length === 0) { expenseListContainer.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">📭 No hay movimientos aún.</div>'; return; }
  expenseListContainer.innerHTML = expenses.slice().reverse().map(exp => `
    <div class="bg-white/60 rounded-xl p-3 flex justify-between items-center shadow-sm text-sm">
      <div><div class="font-medium text-gray-800">${escapeHtml(exp.description)}</div><div class="text-[10px] text-gray-400">${exp.date ? new Date(exp.date).toLocaleDateString() : 'Sin fecha'} • ${exp.category} • ${exp.subcategory}</div></div>
      <div class="flex items-center gap-2"><span class="font-bold ${exp.amount < 0 ? 'text-emerald-600' : 'text-gray-800'}">${exp.amount < 0 ? `+$${Math.abs(exp.amount).toFixed(2)}` : `$${exp.amount.toFixed(2)}`}</span><button class="delete-expense text-red-400 p-1" data-id="${exp.id}">🗑️</button></div>
    </div>
  `).join('');
  document.querySelectorAll('.delete-expense').forEach(btn => btn.addEventListener('click', () => deleteExpenseById(parseInt(btn.dataset.id))));
}

function renderAlerts() {
  if (!alertsContainer) return;
  const todayDue = getTodaysDueServices();
  if (todayDue.length === 0) { alertsContainer.innerHTML = ''; return; }
  alertsContainer.innerHTML = todayDue.map(s => `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs"><div><span class="font-bold text-amber-800">⚠️ Vence hoy:</span> ${escapeHtml(s.name)} ($${s.amount.toFixed(2)})</div><button class="pay-service-btn bg-emerald-600 text-white px-2 py-1 rounded-lg" data-id="${s.id}" data-name="${s.name}" data-amount="${s.amount}" data-category="${s.category}">Pagar</button></div>`).join('');
  document.querySelectorAll('.pay-service-btn').forEach(btn => btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id); if (!paidServiceIds.includes(id)) { paidServiceIds.push(id); addExpense(`${btn.dataset.name} (Cobro Fijo)`, parseFloat(btn.dataset.amount), btn.dataset.category, "Automático"); } }));
}

function updateAICoachAnalysis() {
  if (!currentSalary || currentSalary <= 0) { coachText.innerHTML = "🧠 Coach IA: Configura tu sueldo en Ingresos."; return; }
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  const freeNeeds = alloc.needs - spentNeeds - committedNeeds;
  const freeWants = alloc.wants - spentWants - committedWants;
  let advice = "🧠 Coach IA: ";
  if (mainBalance <= 0) advice += "¡Alerta! Saldo real en cero. Evita gastos en Deseos.";
  else if (freeNeeds < 0) advice += "Sobrepasaste Necesidades. Reajusta gastos variables.";
  else if (freeWants < 0) advice += "Excediste Deseos. Pon límite al ocio.";
  else if (spentWants/alloc.wants > 0.75) advice += `Has gastado el ${Math.round(spentWants/alloc.wants*100)}% de Deseos. Controla salidas.`;
  else advice += `Finanzas estables. Cupo Necesidades $${freeNeeds.toFixed(0)} y Deseos $${freeWants.toFixed(0)}. Sigue así.`;
  coachText.innerHTML = advice;
}

function refreshUI() {
  if (!mainBalanceDisplay) return;
  const alloc = calculateAllocations(currentSalary);
  const { spentNeeds, spentWants, spentSavings } = getSpentByCategory();
  const committedNeeds = calculateCommittedByCategory('Necesidades');
  const committedWants = calculateCommittedByCategory('Deseos');
  salaryDisplay.textContent = currentSalary ? `$${currentSalary.toFixed(2)}` : '—';
  salaryDateDisplay.textContent = salaryDate ? `Depósito: ${salaryDate}` : 'Sin fecha';
  fortnightDisplay.textContent = currentFortnight === 'first' ? '📆 Primera Quincena (Días 1-15)' : (currentFortnight === 'second' ? '📆 Segunda Quincena (Días 16-31)' : '');
  mainBalanceDisplay.textContent = `$${mainBalance.toFixed(2)}`;
  needsAlloc.textContent = `$${alloc.needs.toFixed(2)}`;
  wantsAlloc.textContent = `$${alloc.wants.toFixed(2)}`;
  savingsAlloc.textContent = `$${alloc.savings.toFixed(2)}`;
  needsAllocDetail.textContent = `$${alloc.needs.toFixed(2)}`;
  wantsAllocDetail.textContent = `$${alloc.wants.toFixed(2)}`;
  needsCommitted.textContent = `$${committedNeeds.toFixed(2)}`;
  wantsCommitted.textContent = `$${committedWants.toFixed(2)}`;
  needsSpent.textContent = `$${spentNeeds.toFixed(2)}`;
  wantsSpent.textContent = `$${spentWants.toFixed(2)}`;
  
  const freeNeeds = currentSalary ? (alloc.needs - spentNeeds - committedNeeds) : 0;
  const freeWants = currentSalary ? (alloc.wants - spentWants - committedWants) : 0;
  
  // Obtener listas de servicios comprometidos para mostrar en el desglose
  const committedServicesNeeds = getCommittedServicesList('Necesidades');
  const committedServicesWants = getCommittedServicesList('Deseos');
  
  // Desglose de gastos manuales (excluyendo pagos automáticos)
  const getSubcategoryBreakdown = (category) => {
    const filtered = expenses.filter(exp => exp.category === category && exp.subcategory !== "Pago automático" && exp.amount > 0);
    const breakdown = {};
    filtered.forEach(exp => { breakdown[exp.subcategory] = (breakdown[exp.subcategory] || 0) + exp.amount; });
    return breakdown;
  };
  const needsBreakdown = getSubcategoryBreakdown('Necesidades');
  const wantsBreakdown = getSubcategoryBreakdown('Deseos');
  
  // Construir HTML para la caja de Libre Real (con detalles)
  const buildFreeBoxHTML = (freeAmount, committedServices, manualBreakdown) => {
    let html = `<div class="text-lg font-black text-emerald-700">$${Math.max(0, freeAmount).toFixed(2)}</div>`;
    if (committedServices.length > 0) {
      html += `<div class="border-t border-gray-300 my-2"></div><div class="bg-amber-50/60 p-2 rounded-xl mb-2 text-amber-900"><div class="text-xs font-semibold uppercase">📌 Próximos pagos (comprometidos)</div><div class="space-y-1 mt-1">`;
      committedServices.forEach(s => {
        html += `<div class="flex justify-between items-center text-xs"><span class="truncate">${escapeHtml(s.name)} (día ${s.dueDay})</span><span class="font-mono font-semibold">$${s.amount.toFixed(2)}</span></div>`;
      });
      html += `</div></div>`;
    }
    const manualEntries = Object.entries(manualBreakdown);
    if (manualEntries.length > 0) {
      html += `<div class="bg-blue-50/60 p-2 rounded-xl text-blue-900"><div class="text-xs font-semibold uppercase">✍️ Gastos variables realizados</div><div class="space-y-1 mt-1">`;
      manualEntries.forEach(([sub, amount]) => {
        html += `<div class="flex justify-between items-center text-xs"><span class="truncate">${escapeHtml(sub)}</span><span class="font-mono font-semibold">$${amount.toFixed(2)}</span></div>`;
      });
      html += `</div></div>`;
    }
    if (committedServices.length === 0 && manualEntries.length === 0) {
      html += `<div class="border-t border-gray-300 my-2"></div><div class="text-xs text-gray-400 italic text-center py-1">✨ Sin consumos ni pagos futuros.</div>`;
    }
    return html;
  };
  
  needsFree.innerHTML = buildFreeBoxHTML(freeNeeds, committedServicesNeeds, needsBreakdown);
  wantsFree.innerHTML = buildFreeBoxHTML(freeWants, committedServicesWants, wantsBreakdown);
  
  // Control de edición de sueldo
  if (currentSalary > 0 && !isEditingSalary) {
    salaryInput.value = currentSalary; salaryDateInput.value = salaryDate;
    salaryInput.disabled = true; salaryDateInput.disabled = true;
    setSalaryBtn.classList.add('hidden'); editSalaryBtn.classList.remove('hidden');
  } else {
    salaryInput.disabled = false; salaryDateInput.disabled = false;
    setSalaryBtn.classList.remove('hidden'); editSalaryBtn.classList.add('hidden');
    setSalaryBtn.textContent = isEditingSalary ? 'Guardar Corrección' : 'Iniciar Quincena';
  }
  renderExpenseList();
  renderServicesList();
  renderAlerts();
  updateAICoachAnalysis();
  if (budgetChart && currentSalary) {
    budgetChart.data.datasets[0].data = [Math.max(0, spentNeeds), Math.max(0, spentWants), Math.max(0, spentSavings)];
    budgetChart.data.datasets[1].data = [alloc.needs, alloc.wants, alloc.savings];
    budgetChart.update();
  }
}

function initChart() {
  const ctx = document.getElementById('budgetChart').getContext('2d');
  budgetChart = new Chart(ctx, { type: 'bar', data: { labels: ['Necesidades','Deseos','Ahorro'], datasets: [{ label: 'Gastado', data: [0,0,0], backgroundColor: '#6366f1', borderRadius: 6 }, { label: 'Presupuesto', data: [0,0,0], backgroundColor: '#e2e8f0', borderRadius: 6 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    contents.forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${target}`).classList.remove('hidden');
    tabs.forEach(t => { t.classList.remove('text-indigo-600'); t.classList.add('text-gray-500'); });
    btn.classList.add('text-indigo-600'); btn.classList.remove('text-gray-500');
  }));
}

// ========== EVENTOS Y ARRANQUE ==========
document.addEventListener('DOMContentLoaded', () => {
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
  salaryInput = document.getElementById('salaryInput');
  salaryDateInput = document.getElementById('salaryDateInput');
  setSalaryBtn = document.getElementById('setSalaryBtn');
  editSalaryBtn = document.getElementById('editSalaryBtn');
  aiInput = document.getElementById('aiInput');
  aiProcessBtn = document.getElementById('aiProcessBtn');
  aiFeedback = document.getElementById('aiFeedback');
  coachText = document.getElementById('coachText');
  refreshCoachBtn = document.getElementById('refreshCoachBtn');
  
  initChart();
  loadFromLocalStorage();
  initTabs();
  refreshUI();
  
  // Eventos IA
  aiProcessBtn.addEventListener('click', () => processAIText(aiInput.value));
  aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') processAIText(aiInput.value); });
  refreshCoachBtn.addEventListener('click', () => { updateAICoachAnalysis(); alert("Coach actualizado."); });
  
  // Sueldo
  setSalaryBtn.addEventListener('click', () => { const val = parseFloat(salaryInput.value), date = salaryDateInput.value; if (val>0 && date) { handleSalarySubmit(val, date); document.querySelector('.tab-btn[data-tab="dashboard"]').click(); } else alert('Sueldo y fecha válidos'); });
  editSalaryBtn.addEventListener('click', () => { isEditingSalary = true; refreshUI(); });
  
  // Exportación
  document.getElementById('exportCSVBtn').addEventListener('click', exportToCSV);
  document.getElementById('exportPDFBtn').addEventListener('click', exportToPDF);
  document.getElementById('selectFolderBtn').addEventListener('click', selectExportFolder);
  
  // Ingreso extra
  document.getElementById('addExtraIncomeBtn').addEventListener('click', () => { const desc = document.getElementById('extraIncomeDesc').value, amt = parseFloat(document.getElementById('extraIncomeAmount').value); if (addExtraIncome(desc, amt, new Date())) { document.getElementById('extraIncomeDesc').value = ''; document.getElementById('extraIncomeAmount').value = ''; document.querySelector('.tab-btn[data-tab="dashboard"]').click(); } });
  document.getElementById('addExpenseBtn').addEventListener('click', () => { const desc = document.getElementById('expenseDesc').value, amt = parseFloat(document.getElementById('expenseAmount').value), cat = document.getElementById('expenseCategory').value, sub = document.getElementById('expenseSubcategory').value; if (addExpense(desc, amt, cat, sub)) { document.getElementById('expenseDesc').value = ''; document.getElementById('expenseAmount').value = ''; document.querySelector('.tab-btn[data-tab="dashboard"]').click(); } });
  document.getElementById('clearExpensesBtn').addEventListener('click', () => { if (confirm('¿Reiniciar historial?')) { expenses = []; mainBalance = currentSalary; paidServiceIds = []; saveToLocalStorage(); refreshUI(); } });
  document.getElementById('resetBalanceBtn').addEventListener('click', () => { if (confirm('¿Poner saldo real a cero?')) { mainBalance = 0; saveToLocalStorage(); refreshUI(); } });
  document.getElementById('addServiceBtn').addEventListener('click', () => { const name = document.getElementById('serviceName').value, amount = parseFloat(document.getElementById('serviceAmount').value), cat = document.getElementById('serviceCategory').value, day = parseInt(document.getElementById('serviceDueDay').value); if (name && amount>0 && day>=1 && day<=31) { services.push({ id: Date.now(), name, amount, category: cat, dueDay: day }); saveToLocalStorage(); refreshUI(); document.getElementById('serviceName').value = ''; document.getElementById('serviceAmount').value = ''; document.getElementById('serviceDueDay').value = ''; } else alert('Datos válidos'); });
});

function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }