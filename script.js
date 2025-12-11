// Minimal JS for Expense Tracker (Dark Minimal Version)
// Features: lightweight Chart.js load, localStorage per-user, simple login modal, responsive rendering

const $ = id => document.getElementById(id);

// Dynamic load Chart.js (lightweight build)
function loadChartJs(callback){
  if(window.Chart) return callback();
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = callback; document.head.appendChild(s);
}

// Storage keys
const USERS_KEY = 'exp_users_v1';
const LAST_USER = 'exp_last_user_v1';
const BUDGET_KEY = 'daily_budget_v1';
const CATEGORY_BUDGET_KEY = 'category_budget_v1';

let currentUser = null;
let expenses = []; // in-memory
let filteredExpenses = []; // filtered expenses for display
let lineChart, pieChart;
let dailyBudget = 0;
let categoryBudgets = {};
let economyMode = false;
let editingId = null;

// Init
window.addEventListener('load', ()=>{
  ensureLogin();
  setupForm();
  setupFilters();
  setupEconomyMode();
  setupChartsToggle();
  loadBudget();
  loadChartJs(()=>{
    initCharts();
    renderAll();
  });
});

// ---------- AUTH (simple modal) ----------
function ensureLogin(){
  const last = localStorage.getItem(LAST_USER);
  if(last){ loginAs(last); return; }
  showLoginModal();
}

function showLoginModal(){
  // create overlay
  const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.id='loginOverlay';
  overlay.innerHTML = `\
    <div class="modal">\
      <h3>Login / Register</h3>\
      <input id="u_name" placeholder="Username" />\
      <input id="u_pass" type="password" placeholder="Password" />\
      <div style="display:flex;gap:8px;margin-top:8px">\
        <button id="loginBtn">Login</button>\
        <button id="regBtn">Register</button>\
      </div>\
      <div class="small" style="margin-top:8px">Data disimpan lokal di browser (untuk demo).</div>\
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('regBtn').addEventListener('click', doRegister);
}

function closeLoginModal(){ const el = document.getElementById('loginOverlay'); if(el) el.remove(); }

function loadUsers(){ try{ return JSON.parse(localStorage.getItem(USERS_KEY)||'{}'); }catch(e){return{}} }
function saveUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

function doRegister(){
  const user = document.getElementById('u_name').value.trim();
  const pass = document.getElementById('u_pass').value.trim();
  if(!user||!pass){ alert('Isi username & password'); return; }
  const users = loadUsers();
  if(users[user]){ alert('Username sudah ada'); return; }
  users[user] = {pass}; saveUsers(users); alert('Registrasi sukses, silakan login');
}

function doLogin(){
  const user = document.getElementById('u_name').value.trim();
  const pass = document.getElementById('u_pass').value.trim();
  if(!user||!pass){ alert('Isi username & password'); return; }
  const users = loadUsers();
  if(!users[user] || users[user].pass !== pass){ alert('Login gagal'); return; }
  loginAs(user);
  localStorage.setItem(LAST_USER, user);
  closeLoginModal();
}

function loginAs(user){ 
  currentUser = user; 
  expenses = loadExpenses(user); 
  filteredExpenses = [...expenses];
  loadBudget();
  renderAll(); 
}

// ---------- Expenses storage ----------
function expensesKey(user){ return 'expenses_' + user; }
function loadExpenses(user){ try{ return JSON.parse(localStorage.getItem(expensesKey(user))||'[]'); }catch(e){return[];} }
function saveExpenses(){ if(!currentUser) return; localStorage.setItem(expensesKey(currentUser), JSON.stringify(expenses)); }

// ---------- Form ----------
function setupForm(){
  // ensure date default to today
  const d = new Date().toISOString().slice(0,10);
  if($('date')) $('date').value = d;
  // add button
  const addBtn = document.querySelector('.form-card button');
  if(addBtn) addBtn.addEventListener('click', addExpense);
}

function addExpense(){
  if(!currentUser){ alert('Silakan login'); showLoginModal(); return; }
  const item = (document.getElementById('item').value || '').trim();
  const qty = parseInt(document.getElementById('qty').value||'0',10);
  const price = parseInt(document.getElementById('price').value||'0',10);
  const date = document.getElementById('date').value;
  const method = document.getElementById('method').value;
  const category = document.getElementById('category').value;
  if(!item || qty<=0 || price<=0 || !date){ alert('Isi semua form dengan benar'); return; }
  if(editingId){
    const idx = expenses.findIndex(e=>e.id === editingId);
    if(idx>=0){
      expenses[idx] = { ...expenses[idx], item, qty, price, total: qty*price, date, method, category };
      showNotification('Pengeluaran diperbarui', 'success');
    }
    editingId = null;
    resetFormState();
  } else {
    const entry = { id: Date.now().toString(), item, qty, price, total: qty*price, date, method, category };
    expenses.unshift(entry);
    checkBudgetWarning();
    showNotification('Pengeluaran ditambahkan', 'success');
  }
  saveExpenses();
  clearForm(); 
  applyFilters();
  renderAll();
}

function clearForm(){ ['item','qty','price'].forEach(id=>{ if($(id)) $(id).value=''; }); }
function resetFormState(){
  const submitBtn = $('submitBtn');
  const cancelBtn = $('cancelEditBtn');
  if(submitBtn) submitBtn.textContent = 'Tambah';
  if(cancelBtn) cancelBtn.style.display = 'none';
}

function cancelEdit(){
  editingId = null;
  resetFormState();
  clearForm();
}

// ---------- Render ----------
function renderAll(){ 
  renderSummaryCards(); 
  renderBudgetCard(); 
  renderCategoryCards(); 
  renderTable(); 
  renderSummary(); 
  updateCharts(); 
}

function renderSummaryCards(){
  const today = new Date().toISOString().slice(0,10);
  const todayTotal = expenses.filter(e=>e.date===today).reduce((s,e)=>s+e.total,0);
  
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23,59,59,999);
  const weekExpenses = expenses.filter(e=>{
    const d = new Date(e.date);
    return d >= weekStart && d <= weekEnd;
  });
  const weekTotal = weekExpenses.reduce((s,e)=>s+e.total,0);
  
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const monthExpenses = expenses.filter(e=>{
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const monthTotal = monthExpenses.reduce((s,e)=>s+e.total,0);
  
  // Calculate averages (average per day)
  const allDates = [...new Set(expenses.map(e=>e.date))];
  const avgPerDay = allDates.length > 0 ? expenses.reduce((s,e)=>s+e.total,0) / allDates.length : 0;
  
  const weekDays = [...new Set(weekExpenses.map(e=>e.date))].length || 1;
  const avgWeek = weekTotal / weekDays;
  
  const monthDays = [...new Set(monthExpenses.map(e=>e.date))].length || 1;
  const avgMonth = monthTotal / monthDays;
  
  if($('todayTotal')) $('todayTotal').textContent = formatRp(todayTotal);
  if($('weekTotal')) $('weekTotal').textContent = formatRp(weekTotal);
  if($('monthTotal')) $('monthTotal').textContent = formatRp(monthTotal);
  
  updateBadge('todayBadge', todayTotal, avgPerDay);
  updateBadge('weekBadge', weekTotal, avgWeek * 7);
  updateBadge('monthBadge', monthTotal, avgMonth * 30);
}

function updateBadge(id, value, avg){
  const el = $(id);
  if(!el) return;
  if(value > avg * 1.2){
    el.textContent = '⚠ Melebihi Rata-rata';
    el.className = 'summary-badge badge-danger';
  } else if(value > avg * 1.1){
    el.textContent = '⚡ Mendekati Batas';
    el.className = 'summary-badge badge-warning';
  } else {
    el.textContent = '✓ Normal';
    el.className = 'summary-badge badge-normal';
  }
}

function renderBudgetCard(){
  if(!dailyBudget) return;
  const today = new Date().toISOString().slice(0,10);
  const todaySpent = expenses.filter(e=>e.date===today).reduce((s,e)=>s+e.total,0);
  const percentage = Math.min((todaySpent / dailyBudget) * 100, 100);
  
  const progressFill = $('budgetProgress');
  const budgetUsed = $('budgetUsed');
  const budgetRemaining = $('budgetRemaining');
  
  if(progressFill){
    progressFill.style.width = percentage + '%';
    progressFill.className = 'progress-fill';
    if(percentage >= 90) progressFill.classList.add('danger');
    else if(percentage >= 70) progressFill.classList.add('warning');
  }
  
  if(budgetUsed) budgetUsed.textContent = formatRp(todaySpent);
  if(budgetRemaining) budgetRemaining.textContent = `dari ${formatRp(dailyBudget)}`;
}

function renderCategoryCards(){
  const container = $('categoryCards');
  if(!container) return;
  
  const categories = {};
  expenses.forEach(e=>{
    if(!categories[e.category]) categories[e.category] = {total: 0, count: 0};
    categories[e.category].total += e.total;
    categories[e.category].count += 1;
  });
  
  container.innerHTML = '';
  Object.keys(categories).forEach(cat=>{
    const catData = categories[cat];
    const budget = categoryBudgets[cat] || 0;
    const percentage = budget > 0 ? Math.min((catData.total / budget) * 100, 100) : 0;
    
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-card-header">
        <span class="category-name">${escapeHtml(cat)}</span>
        <span class="category-amount">${formatRp(catData.total)}</span>
      </div>
      <div class="category-progress-bar">
        <div class="category-progress-fill" style="width:${percentage}%"></div>
      </div>
      ${budget > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${formatRp(catData.total)} / ${formatRp(budget)}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

function renderTable(){
  const tbody = $('list'); if(!tbody) return;
  tbody.innerHTML = '';
  const dataToShow = filteredExpenses.length > 0 ? filteredExpenses : expenses;
  if(dataToShow.length===0){ 
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--muted);text-align:center">Tidak ada data</td></tr>'; 
    return; 
  }
  const frag = document.createDocumentFragment();
  dataToShow.forEach(e=>{
    const tr = document.createElement('tr');
    const isUnnecessary = economyMode && (e.category === 'Hiburan' || e.total > 100000);
    if(isUnnecessary) tr.classList.add('economy-highlight');
    tr.innerHTML = `
      <td>${escapeHtml(e.item)}</td>
      <td>${e.qty}</td>
      <td>${formatRp(e.price)}</td>
      <td>${formatRp(e.total)}</td>
      <td>${e.date}</td>
      <td>${e.method}</td>
      <td>${e.category}</td>
      <td>
        <button class="btn-edit" onclick="startEdit('${e.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteExpense('${e.id}')">Hapus</button>
      </td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

function startEdit(id){
  const entry = expenses.find(e=>e.id === id);
  if(!entry) return;
  editingId = id;
  if($('item')) $('item').value = entry.item;
  if($('qty')) $('qty').value = entry.qty;
  if($('price')) $('price').value = entry.price;
  if($('date')) $('date').value = entry.date;
  if($('method')) $('method').value = entry.method;
  if($('category')) $('category').value = entry.category;
  const submitBtn = $('submitBtn');
  const cancelBtn = $('cancelEditBtn');
  if(submitBtn) submitBtn.textContent = 'Simpan';
  if(cancelBtn) cancelBtn.style.display = 'inline-block';
  window.scrollTo({top:0, behavior:'smooth'});
}

function deleteExpense(id){
  if(!confirm('Hapus pengeluaran ini?')) return;
  expenses = expenses.filter(e=>e.id !== id);
  saveExpenses();
  applyFilters();
  renderAll();
  showNotification('Pengeluaran dihapus', 'success');
}

function renderSummary(){ 
  const dataToShow = filteredExpenses.length > 0 ? filteredExpenses : expenses;
  const sum = dataToShow.reduce((s,e)=>s+e.total,0); 
  const el = $('summary'); 
  if(el) el.textContent = 'Total Pengeluaran: ' + formatRp(sum); 
}

// ---------- Charts ----------
function initCharts(){
  // create small canvases dynamically to keep HTML light
  const lineCanv = document.createElement('canvas'); lineCanv.id = 'lineChart'; lineCanv.style.width='100%'; lineCanv.style.height='160px';
  const pieCanv = document.createElement('canvas'); pieCanv.id = 'pieChart'; pieCanv.style.width='100%'; pieCanv.style.height='160px';
  const container = document.createElement('div'); 
  container.id = 'chartsContainer';
  container.style.display='flex'; 
  container.style.gap='12px'; 
  container.style.marginTop='12px';
  container.style.marginBottom='20px';
  container.appendChild(lineCanv); 
  container.appendChild(pieCanv);
  document.querySelector('.container').insertBefore(container, document.querySelector('table'));
  lineChart = new Chart(lineCanv.getContext('2d'), { type:'bar', data:{labels:[],datasets:[{label:'Pengeluaran',data:[],backgroundColor:'#60a5fa'}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  pieChart = new Chart(pieCanv.getContext('2d'), { type:'pie', data:{labels:[],datasets:[{data:[],backgroundColor:['#60a5fa','#10b981','#f59e0b','#ef4444','#a78bfa']}]}, options:{responsive:true,maintainAspectRatio:false}});
}

function updateCharts(){ if(!window.Chart || !lineChart) return;
  // last 7 days
  const dates = [];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); dates.push(d.toISOString().slice(0,10)); }
  const totals = dates.map(day => expenses.filter(e=>e.date===day).reduce((s,e)=>s+e.total,0));
  lineChart.data.labels = dates.map(d=>d.slice(5)); lineChart.data.datasets[0].data = totals; lineChart.update();
  // pie
  const cats = {}; expenses.forEach(e=>cats[e.category]=(cats[e.category]||0)+e.total);
  pieChart.data.labels = Object.keys(cats); pieChart.data.datasets[0].data = Object.values(cats); pieChart.update();
}

// ---------- Budget Functions ----------
function loadBudget(){
  if(!currentUser) return;
  const budgetData = localStorage.getItem(BUDGET_KEY + '_' + currentUser);
  const catBudgetData = localStorage.getItem(CATEGORY_BUDGET_KEY + '_' + currentUser);
  if(budgetData) dailyBudget = parseInt(budgetData, 10);
  if(catBudgetData) categoryBudgets = JSON.parse(catBudgetData);
  if($('dailyBudget') && dailyBudget) $('dailyBudget').value = dailyBudget;
}

function setDailyBudget(){
  const input = $('dailyBudget');
  if(!input || !currentUser) return;
  dailyBudget = parseInt(input.value, 10) || 0;
  if(dailyBudget > 0){
    localStorage.setItem(BUDGET_KEY + '_' + currentUser, dailyBudget.toString());
    showNotification('Budget harian diset', 'success');
    renderBudgetCard();
    checkBudgetWarning();
  }
}

function checkBudgetWarning(){
  if(!dailyBudget) return;
  const today = new Date().toISOString().slice(0,10);
  const todaySpent = expenses.filter(e=>e.date===today).reduce((s,e)=>s+e.total,0);
  const percentage = (todaySpent / dailyBudget) * 100;
  
  if(percentage >= 90){
    showNotification('⚠️ Budget harian hampir habis!', 'danger');
  } else if(percentage >= 70){
    showNotification('⚡ Budget harian sudah 70%', 'warning');
  }
}

// ---------- Filter Functions ----------
function setupFilters(){
  const searchBox = $('searchBox');
  const filterDateFrom = $('filterDateFrom');
  const filterDateTo = $('filterDateTo');
  const filterCategory = $('filterCategory');
  const filterMethod = $('filterMethod');
  
  if(searchBox) searchBox.addEventListener('input', applyFilters);
  if(filterDateFrom) filterDateFrom.addEventListener('change', applyFilters);
  if(filterDateTo) filterDateTo.addEventListener('change', applyFilters);
  if(filterCategory) filterCategory.addEventListener('change', applyFilters);
  if(filterMethod) filterMethod.addEventListener('change', applyFilters);
}

function applyFilters(){
  let filtered = [...expenses];
  
  const search = ($('searchBox')?.value || '').toLowerCase();
  if(search){
    filtered = filtered.filter(e=>e.item.toLowerCase().includes(search));
  }
  
  const dateFrom = $('filterDateFrom')?.value;
  const dateTo = $('filterDateTo')?.value;
  if(dateFrom){
    filtered = filtered.filter(e=>e.date >= dateFrom);
  }
  if(dateTo){
    filtered = filtered.filter(e=>e.date <= dateTo);
  }
  
  const category = $('filterCategory')?.value;
  if(category){
    filtered = filtered.filter(e=>e.category === category);
  }
  
  const method = $('filterMethod')?.value;
  if(method){
    filtered = filtered.filter(e=>e.method === method);
  }
  
  filteredExpenses = filtered;
  renderTable();
  renderSummary();
}

function clearFilters(){
  if($('searchBox')) $('searchBox').value = '';
  if($('filterDateFrom')) $('filterDateFrom').value = '';
  if($('filterDateTo')) $('filterDateTo').value = '';
  if($('filterCategory')) $('filterCategory').value = '';
  if($('filterMethod')) $('filterMethod').value = '';
  filteredExpenses = [];
  renderTable();
  renderSummary();
}

// ---------- Economy Mode Functions ----------
function setupEconomyMode(){
  const toggle = $('economyMode');
  if(!toggle) return;
  
  toggle.addEventListener('change', ()=>{
    economyMode = toggle.checked;
    renderTable();
    if(economyMode){
      showNotification('Mode Hemat: Pengeluaran tidak perlu ditandai', 'warning');
    }
  });
}

// ---------- Charts Toggle Functions ----------
function setupChartsToggle(){
  const toggle = $('showCharts');
  if(!toggle) return;
  
  toggle.addEventListener('change', ()=>{
    const container = document.getElementById('chartsContainer');
    if(container){
      container.style.display = toggle.checked ? 'flex' : 'none';
    }
  });
}

// ---------- Notification Functions ----------
function showNotification(message, type='success'){
  const notif = $('notification');
  if(!notif) return;
  
  notif.textContent = message;
  notif.className = `notification ${type} show`;
  
  setTimeout(()=>{
    notif.classList.remove('show');
  }, 3000);
}

// ---------- Export Functions ----------
function exportToCSV(){
  if(expenses.length === 0){
    showNotification('Tidak ada data untuk diekspor', 'warning');
    return;
  }
  
  const headers = ['Nama', 'Qty', 'Harga', 'Total', 'Tanggal', 'Metode', 'Kategori'];
  const rows = expenses.map(e=>[
    e.item, e.qty, e.price, e.total, e.date, e.method, e.category
  ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(r=>r.map(c=>`"${c}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `pengeluaran_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showNotification('Data berhasil diekspor', 'success');
}

// ---------- Utils ----------
function formatRp(n){ return 'Rp ' + (n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

