/**
 * 沙县外卖记账助手 - 核心业务与交互逻辑
 * 特性：
 * 1. 30天访问密码鉴权与安全退出
 * 2. 纯客户端高可用 LocalStorage + 云端 /api/takeout 双向自动同步
 * 3. 剪贴板一键备份代码复制/粘贴恢复 + 文件导入导出 + Excel CSV 导出
 * 4. 原生弹窗替换为触控友好的 App 内确认底栏（彻底解决移动端删除人员失效问题）
 * 5. 完整收录沙县小吃45+款菜品及多档离散规格支持
 */

// ==================== 1. 访问鉴权与密码安全 ====================
const AUTH_KEY = 'takeout_auth_token_v1';
const PWD_STORAGE_KEY = 'takeout_custom_password_v1';
const DEFAULT_PASSWORD = '8888';

function getStoredPassword() {
  return localStorage.getItem(PWD_STORAGE_KEY) || DEFAULT_PASSWORD;
}

function checkAuth() {
  const token = localStorage.getItem(AUTH_KEY);
  if (!token) {
    window.location.replace('./index.html?need_auth=1');
    return false;
  }
  try {
    const data = JSON.parse(token);
    // 30 天免密
    if (Date.now() - data.time > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(AUTH_KEY);
      window.location.replace('./index.html?need_auth=1');
      return false;
    }
    return true;
  } catch (e) {
    localStorage.removeItem(AUTH_KEY);
    window.location.replace('./index.html?need_auth=1');
    return false;
  }
}

function logoutAuth() {
  showConfirmModal('退出登录', '确定退出锁定状态吗？退出后再次进入需要输入访问密码。', '退出锁定', () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.replace('./index.html');
  }, false);
}

function openChangePasswordModal() {
  document.getElementById('pwd-current-input').value = '';
  document.getElementById('pwd-new-input').value = '';
  document.getElementById('change-pwd-modal').classList.add('show');
}

function closeChangePasswordModal() {
  document.getElementById('change-pwd-modal').classList.remove('show');
}

function saveNewPassword() {
  const cur = document.getElementById('pwd-current-input').value.trim();
  const next = document.getElementById('pwd-new-input').value.trim();
  const actualCur = getStoredPassword();
  if (cur !== actualCur) {
    showToast('原访问密码错误');
    return;
  }
  if (!next || next.length < 4) {
    showToast('新密码至少需要 4 位字符');
    return;
  }
  localStorage.setItem(PWD_STORAGE_KEY, next);
  closeChangePasswordModal();
  showToast('密码修改成功，请牢记新密码！');
}

// ==================== 2. 初始菜单与数据模型 ====================
const DEFAULT_MENU = [
  // 1. 特色小吃
  { id: 'tx-1', name: '鲜肉蒸饺', category: '特色小吃', specs: [{ name: '标配', price: 5 }] },
  { id: 'tx-2', name: '葱油拌面/米粉/粿条', category: '特色小吃', specs: [{ name: '葱油拌面', price: 5 }, { name: '葱油拌米粉', price: 5 }, { name: '葱油拌粿条', price: 5 }] },
  { id: 'tx-3', name: '飘香拌面/米粉/粿条', category: '特色小吃', specs: [{ name: '飘香拌面', price: 5 }, { name: '飘香拌米粉', price: 5 }, { name: '飘香拌粿条', price: 5 }] },
  { id: 'tx-4', name: '香脆汤馄饨', category: '特色小吃', specs: [{ name: '小份', price: 8 }, { name: '中份', price: 10 }, { name: '大份', price: 12 }, { name: '豪华份', price: 15 }] },
  { id: 'tx-5', name: '拌馄饨', category: '特色小吃', specs: [{ name: '小份', price: 8 }, { name: '中份', price: 10 }, { name: '大份', price: 12 }, { name: '豪华份', price: 15 }] },
  { id: 'tx-6', name: '馄饨汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '馄饨汤面', price: 10 }, { name: '馄饨汤米粉', price: 10 }, { name: '馄饨汤粿条', price: 10 }] },
  { id: 'tx-7', name: '馄饨拌面/米粉/粿条', category: '特色小吃', specs: [{ name: '馄饨拌面', price: 10 }, { name: '馄饨拌米粉', price: 10 }, { name: '馄饨拌粿条', price: 10 }] },
  { id: 'tx-8', name: '炸馄饨', category: '特色小吃', specs: [{ name: '标配', price: 10 }] },
  { id: 'tx-9', name: '炸饺', category: '特色小吃', specs: [{ name: '标配', price: 8 }] },
  { id: 'tx-10', name: '酸菜肉丝汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '汤面', price: 10 }, { name: '汤米粉', price: 10 }, { name: '汤粿条', price: 10 }] },
  { id: 'tx-11', name: '青菜肉丝汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '汤面', price: 10 }, { name: '汤米粉', price: 10 }, { name: '汤粿条', price: 10 }] },
  { id: 'tx-12', name: '螺蛳粉', category: '特色小吃', specs: [{ name: '标配', price: 11 }] },
  { id: 'tx-13', name: '酸辣粉', category: '特色小吃', specs: [{ name: '标配', price: 11 }] },
  { id: 'tx-14', name: '酸辣面/米粉/粿条/馄饨', category: '特色小吃', specs: [{ name: '酸辣面', price: 11 }, { name: '酸辣米粉', price: 11 }, { name: '酸辣粿条', price: 11 }, { name: '酸辣馄饨', price: 11 }] },
  { id: 'tx-15', name: '鸡蛋面/米粉/粿条', category: '特色小吃', specs: [{ name: '鸡蛋面', price: 8 }, { name: '鸡蛋米粉', price: 8 }, { name: '鸡蛋粿条', price: 8 }] },
  { id: 'tx-16', name: '红烧炸酱拌面/米粉/粿条', category: '特色小吃', specs: [{ name: '拌面小份', price: 10 }, { name: '拌面大份', price: 12 }, { name: '拌粉小份', price: 10 }, { name: '拌粉大份', price: 12 }, { name: '拌粿条小份', price: 10 }, { name: '拌粿条大份', price: 12 }] },
  { id: 'tx-17', name: '红烧炸酱汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '汤面小份', price: 10 }, { name: '汤面大份', price: 12 }, { name: '汤粉小份', price: 10 }, { name: '汤粉大份', price: 12 }, { name: '汤粿条小份', price: 10 }, { name: '汤粿条大份', price: 12 }] },
  { id: 'tx-18', name: '老北京炸酱面/粉/粿条', category: '特色小吃', specs: [{ name: '炸酱面', price: 13 }, { name: '炸酱米粉', price: 13 }, { name: '炸酱粿条', price: 13 }, { name: '桂林米粉', price: 13 }] },
  { id: 'tx-19', name: '牛腩拌面/米粉/粿条', category: '特色小吃', specs: [{ name: '牛腩拌面', price: 15 }, { name: '牛腩拌米粉', price: 15 }, { name: '牛腩拌粿条', price: 15 }, { name: '桂林米粉', price: 15 }] },
  { id: 'tx-20', name: '牛腩汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '牛腩汤面', price: 15 }, { name: '牛腩汤米粉', price: 15 }, { name: '牛腩汤粿条', price: 15 }, { name: '桂林米粉', price: 15 }] },
  { id: 'tx-21', name: '青菜汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '小份(6元)', price: 6 }, { name: '加量大份(8元)', price: 8 }] },
  { id: 'tx-22', name: '酸菜汤面/米粉/粿条', category: '特色小吃', specs: [{ name: '小份(6元)', price: 6 }, { name: '加量大份(8元)', price: 8 }] },
  { id: 'tx-23', name: '现蒸小笼包', category: '特色小吃', specs: [{ name: '标配一笼', price: 8 }] },

  // 2. 滋补炖品
  { id: 'dp-1', name: '虫草花排骨汤', category: '滋补炖品', specs: [{ name: '原盅', price: 9 }] },
  { id: 'dp-2', name: '茶树菇猪肚汤', category: '滋补炖品', specs: [{ name: '原盅', price: 9 }] },
  { id: 'dp-3', name: '花旗参乌鸡汤', category: '滋补炖品', specs: [{ name: '原盅', price: 9 }] },
  { id: 'dp-4', name: '花旗参鸽子汤', category: '滋补炖品', specs: [{ name: '原盅', price: 12 }] },

  // 3. 营养汤馄饨
  { id: 'th-1', name: '排骨汤馄饨', category: '营养汤馄饨', specs: [{ name: '标配', price: 15 }] },
  { id: 'th-2', name: '乌鸡汤馄饨', category: '营养汤馄饨', specs: [{ name: '标配', price: 15 }] },
  { id: 'th-3', name: '猪肚汤馄饨', category: '营养汤馄饨', specs: [{ name: '标配', price: 15 }] },
  { id: 'th-4', name: '鸽子汤馄饨', category: '营养汤馄饨', specs: [{ name: '标配', price: 20 }] },

  // 4. 营养汤面/粉
  { id: 'tm-1', name: '排骨汤面/粿条/米粉', category: '营养汤面/粉', specs: [{ name: '排骨汤面', price: 13 }, { name: '排骨汤米粉', price: 13 }, { name: '排骨汤粿条', price: 13 }] },
  { id: 'tm-2', name: '乌鸡汤面/粿条/米粉', category: '营养汤面/粉', specs: [{ name: '乌鸡汤面', price: 14 }, { name: '乌鸡汤米粉', price: 14 }, { name: '乌鸡汤粿条', price: 14 }] },
  { id: 'tm-3', name: '猪肚汤面/粿条/米粉', category: '营养汤面/粉', specs: [{ name: '猪肚汤面', price: 14 }, { name: '猪肚汤米粉', price: 14 }, { name: '猪肚汤粿条', price: 14 }] },
  { id: 'tm-4', name: '鸽子汤面/粿条/米粉', category: '营养汤面/粉', specs: [{ name: '鸽子汤面', price: 18 }, { name: '鸽子汤米粉', price: 18 }, { name: '鸽子汤粿条', price: 18 }] },

  // 5. 营养套餐饭
  { id: 'tc-1', name: '荷包蛋饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 13 }] },
  { id: 'tc-2', name: '酸菜肉丝饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 15 }] },
  { id: 'tc-3', name: '鸡腿饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 15 }] },
  { id: 'tc-4', name: '鸭腿饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 16 }] },
  { id: 'tc-5', name: '红烧牛腩饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 20 }] },
  { id: 'tc-6', name: '排骨汤饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 16 }] },
  { id: 'tc-7', name: '乌鸡汤饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 16 }] },
  { id: 'tc-8', name: '猪肚汤饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 16 }] },
  { id: 'tc-9', name: '鸽子汤饭', category: '营养套餐饭', specs: [{ name: '套餐', price: 20 }] },

  // 6. 卤味系列
  { id: 'lw-1', name: '豆干', category: '卤味系列', specs: [{ name: '1块', price: 1 }] },
  { id: 'lw-2', name: '茶叶蛋', category: '卤味系列', specs: [{ name: '1个', price: 2 }] },
  { id: 'lw-3', name: '香肠', category: '卤味系列', specs: [{ name: '1根', price: 2 }] },
  { id: 'lw-4', name: '荷包蛋', category: '卤味系列', specs: [{ name: '1个', price: 3 }] },
  { id: 'lw-5', name: '鸡腿', category: '卤味系列', specs: [{ name: '1只', price: 8 }] },
  { id: 'lw-6', name: '鸭腿', category: '卤味系列', specs: [{ name: '1只', price: 9 }] },
  { id: 'lw-7', name: '生馄饨 (斤)', category: '卤味系列', specs: [{ name: '1斤', price: 30 }] },
  { id: 'lw-8', name: '生水饺 (斤)', category: '卤味系列', specs: [{ name: '1斤', price: 18 }] },

  // 7. 现炒热卖 (多档离散规格)
  { id: 'xc-1', name: '鸡蛋炒米粉', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-2', name: '鸡蛋桂林米粉', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-3', name: '鸡蛋炒饭', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-4', name: '鸡蛋炒面', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-5', name: '鸡蛋炒粿条', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-6', name: '扬州炒饭', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] },
  { id: 'xc-7', name: '紫菜炒饭', category: '现炒热卖', specs: [{ name: '标配 (10元)', price: 10 }, { name: '加料 (12元)', price: 12 }, { name: '豪华/大份 (15元)', price: 15 }] }
];

const DEFAULT_PEOPLE = [
  { id: 'p-1', name: '自己' },
  { id: 'p-2', name: '张三' },
  { id: 'p-3', name: '李四' },
  { id: 'p-4', name: '王五' }
];

let state = {
  menu: [],
  people: [],
  orders: [], // [{ id, date, weekday, personId, personName, dishName, specName, price, remark, isSettled, createTime }]
  selectedDate: '',
  selectedPersonId: '',
  activeCategory: '全部',
  searchQuery: '',
  historyMode: 'person', // 'person' or 'date'
  currentModalDish: null,
  selectedSpecIndex: 0
};

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// ==================== 3. 弹窗与确认框系统 (解决删除Bug) ====================
let pendingConfirmCallback = null;

function showConfirmModal(title, message, confirmBtnText, onConfirm, isDanger = true) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-desc').textContent = message;
  const btn = document.getElementById('confirm-modal-action-btn');
  btn.textContent = confirmBtnText;
  btn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
  pendingConfirmCallback = onConfirm;
  modal.classList.add('show');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.remove('show');
  pendingConfirmCallback = null;
}

function executeConfirmAction() {
  if (typeof pendingConfirmCallback === 'function') {
    const cb = pendingConfirmCallback;
    pendingConfirmCallback = null;
    closeConfirmModal();
    cb();
  }
}

// ==================== 4. 数据加载与保存 (Local + Cloud) ====================
function init() {
  if (!checkAuth()) return;

  loadData();
  setTodayDate();
  renderPersonPills();
  renderCategoryFilter();
  renderMenu();
  renderTodayOrders();
  renderSettingsPeople();

  // 异步检查云端是否有更新
  fetchFromCloud();
}

function loadData() {
  try {
    const localMenu = localStorage.getItem('sx_menu');
    state.menu = localMenu ? JSON.parse(localMenu) : DEFAULT_MENU;

    const localPeople = localStorage.getItem('sx_people');
    state.people = localPeople ? JSON.parse(localPeople) : DEFAULT_PEOPLE;

    const localOrders = localStorage.getItem('sx_orders');
    state.orders = localOrders ? JSON.parse(localOrders) : [];
  } catch (e) {
    console.error('加载本地数据失败', e);
    state.menu = DEFAULT_MENU;
    state.people = DEFAULT_PEOPLE;
    state.orders = [];
  }

  if (state.people.length > 0 && !state.selectedPersonId) {
    state.selectedPersonId = state.people[0].id;
  }
}

function saveData(autoSync = true) {
  try {
    localStorage.setItem('sx_menu', JSON.stringify(state.menu));
    localStorage.setItem('sx_people', JSON.stringify(state.people));
    localStorage.setItem('sx_orders', JSON.stringify(state.orders));
  } catch (e) {
    console.warn('LocalStorage 保存出错:', e);
  }

  if (autoSync) {
    syncToCloud(false);
  }
}

// 云端同步
let isSyncing = false;
async function syncToCloud(isManual = false) {
  if (isSyncing) return;
  const badge = document.getElementById('cloud-sync-badge');
  if (badge) {
    badge.className = 'sync-badge syncing';
    badge.innerHTML = '<span>🔄</span> 正在同步...';
  }
  isSyncing = true;

  const payload = {
    updateTime: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders
  };

  try {
    const resp = await fetch('/api/takeout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (badge) {
        badge.className = 'sync-badge synced';
        badge.innerHTML = `<span>🟢</span> 云端已同步 (${timeStr})`;
      }
      if (isManual) showToast('云端数据同步成功！');
    } else {
      if (badge) {
        badge.className = 'sync-badge';
        badge.innerHTML = `<span>💾</span> 本地存储 (${state.orders.length}条)`;
      }
      if (isManual) showToast('已保存到本地存储');
    }
  } catch (err) {
    if (badge) {
      badge.className = 'sync-badge';
      badge.innerHTML = '<span>💾</span> 本地模式';
    }
    if (isManual) showToast('网络离线，已保存至本地');
  } finally {
    isSyncing = false;
  }
}

async function fetchFromCloud() {
  try {
    const resp = await fetch('/api/takeout');
    if (!resp.ok) return;
    const json = await resp.json();
    if (json && json.people && json.orders) {
      const localOrders = state.orders || [];
      // 若本地为空，或云端数据更多/更新，拉取并更新
      if (localOrders.length === 0 || json.orders.length >= localOrders.length) {
        state.people = json.people;
        state.orders = json.orders;
        if (json.menu) state.menu = json.menu;
        saveData(false);
        renderPersonPills();
        renderMenu();
        renderTodayOrders();
        renderSettingsPeople();
        const badge = document.getElementById('cloud-sync-badge');
        if (badge) {
          badge.className = 'sync-badge synced';
          badge.innerHTML = '<span>🟢</span> 云端已同步';
        }
      }
    }
  } catch (e) {
    // 忽略云端拉取失败，保持本地正常
  }
}

// ==================== 5. 日期与 Tab 管理 ====================
function getWeekdayString(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return WEEKDAYS[d.getDay()] || '';
}

function setTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  state.selectedDate = todayStr;
  const picker = document.getElementById('order-date-picker');
  if (picker) picker.value = todayStr;
  updateWeekdayBadge();
  renderTodayOrders();
}

function onDateChanged() {
  const picker = document.getElementById('order-date-picker');
  if (picker && picker.value) {
    state.selectedDate = picker.value;
    updateWeekdayBadge();
    renderTodayOrders();
  }
}

function updateWeekdayBadge() {
  const badge = document.getElementById('order-weekday-text');
  const titleDate = document.getElementById('order-list-title-date');
  const weekday = getWeekdayString(state.selectedDate);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (state.selectedDate === todayStr) {
    if (badge) badge.textContent = `${weekday} (今天)`;
    if (titleDate) titleDate.textContent = '今日';
  } else {
    if (badge) badge.textContent = weekday;
    if (titleDate) titleDate.textContent = state.selectedDate.slice(5) + ' ';
  }
}

function switchMainTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

  if (tab === 'order') {
    document.getElementById('tab-order').classList.add('active');
    document.querySelectorAll('.tab-item')[0].classList.add('active');
    renderTodayOrders();
  } else if (tab === 'history') {
    document.getElementById('tab-history').classList.add('active');
    document.querySelectorAll('.tab-item')[1].classList.add('active');
    renderHistory();
  } else if (tab === 'settings') {
    document.getElementById('tab-settings').classList.add('active');
    document.querySelectorAll('.tab-item')[2].classList.add('active');
    renderSettingsPeople();
  }
}

// ==================== 6. 人员选择与修复删除功能 ====================
function renderPersonPills() {
  const container = document.getElementById('person-pill-container');
  if (!state.selectedPersonId && state.people.length > 0) {
    state.selectedPersonId = state.people[0].id;
  }

  if (state.people.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--text-sub); padding:6px 0;">暂无订餐人员，请在右上角添加</div>';
    return;
  }

  let html = '';
  state.people.forEach(p => {
    const isSel = p.id === state.selectedPersonId;
    html += `
      <div class="person-pill ${isSel ? 'active' : ''}" onclick="selectPerson('${p.id}')">
        <span>👤 ${escapeHtml(p.name)}</span>
      </div>
    `;
  });
  container.innerHTML = html;
}

function selectPerson(id) {
  state.selectedPersonId = id;
  renderPersonPills();
  const p = state.people.find(item => item.id === id);
  if (p) {
    showToast(`当前订餐人：${p.name}`);
  }
}

function renderSettingsPeople() {
  const container = document.getElementById('settings-people-list');
  if (!container) return;

  if (state.people.length === 0) {
    container.innerHTML = `<div class="empty-state">暂无订餐人员</div>`;
    return;
  }

  let html = '';
  state.people.forEach(p => {
    html += `
      <div class="setting-item">
        <div style="font-weight:600; font-size:14px;">👤 ${escapeHtml(p.name)}</div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" style="color:var(--danger); border-color:#fecaca;" onclick="deletePerson('${p.id}')">删除</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function openAddPersonModal() {
  document.getElementById('person-name-input').value = '';
  document.getElementById('person-modal').classList.add('show');
}

function closePersonModal() {
  document.getElementById('person-modal').classList.remove('show');
}

function savePerson() {
  const name = document.getElementById('person-name-input').value.trim();
  if (!name) {
    showToast('请输入人员姓名');
    return;
  }
  if (state.people.some(p => p.name === name)) {
    showToast('该人员姓名已存在');
    return;
  }

  const newPerson = {
    id: 'p-' + Date.now(),
    name: name
  };
  state.people.push(newPerson);
  state.selectedPersonId = newPerson.id;
  saveData();
  closePersonModal();
  renderPersonPills();
  renderSettingsPeople();
  showToast(`已添加人员：${name}`);
}

// 核心修复：彻底废除原生 window.confirm，使用 App 内置确认底栏
function deletePerson(id) {
  const p = state.people.find(item => item.id === id);
  if (!p) return;

  showConfirmModal(
    '确认删除订餐人',
    `确定删除订餐人【${p.name}】吗？删除后其历史已记账单将继续保留。`,
    '确认删除',
    () => {
      state.people = state.people.filter(item => item.id !== id);
      if (state.selectedPersonId === id) {
        state.selectedPersonId = state.people.length > 0 ? state.people[0].id : '';
      }
      saveData();
      renderPersonPills();
      renderSettingsPeople();
      showToast(`已删除人员：${p.name}`);
    },
    true
  );
}

// ==================== 7. 菜品分类与菜单渲染 ====================
function renderCategoryFilter() {
  const categories = ['全部', '特色小吃', '滋补炖品', '营养汤馄饨', '营养汤面/粉', '营养套餐饭', '卤味系列', '现炒热卖'];
  const container = document.getElementById('category-filter-container');

  let html = '';
  categories.forEach(cat => {
    const isAct = cat === state.activeCategory;
    html += `
      <div class="menu-filter-pill ${isAct ? 'active' : ''}" onclick="setCategory('${cat}')">
        ${escapeHtml(cat)}
      </div>
    `;
  });
  container.innerHTML = html;
}

function setCategory(cat) {
  state.activeCategory = cat;
  renderCategoryFilter();
  renderMenu();
}

function filterMenu() {
  const input = document.getElementById('dish-search-input');
  state.searchQuery = input ? input.value.trim().toLowerCase() : '';
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById('dish-grid-container');
  let list = state.menu;

  if (state.activeCategory !== '全部') {
    list = list.filter(d => d.category === state.activeCategory);
  }

  if (state.searchQuery) {
    list = list.filter(d => d.name.toLowerCase().includes(state.searchQuery) || d.category.toLowerCase().includes(state.searchQuery));
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">未找到相关菜品</div>`;
    return;
  }

  let html = '';
  list.forEach(dish => {
    let priceText = '';
    if (dish.specs.length === 1) {
      priceText = `¥${dish.specs[0].price}`;
    } else {
      const prices = dish.specs.map(s => s.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      priceText = minP === maxP ? `¥${minP}` : `¥${minP} - ¥${maxP}`;
    }

    const specsPreview = dish.specs.map(s => s.name).join(' / ');

    html += `
      <div class="dish-card" onclick="openSpecModal('${dish.id}')">
        <div class="dish-top-row">
          <div>
            <span class="dish-name">${escapeHtml(dish.name)}</span>
            <span class="dish-category-tag">${escapeHtml(dish.category)}</span>
          </div>
          <div class="dish-specs-preview">${escapeHtml(specsPreview)}</div>
        </div>
        <div class="dish-bottom-row">
          <div class="dish-price">${priceText}</div>
          <button class="dish-add-btn">+</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ==================== 8. 菜品规格弹窗与下单 ====================
function openSpecModal(dishId) {
  const dish = state.menu.find(d => d.id === dishId);
  if (!dish) return;

  const currentPerson = state.people.find(p => p.id === state.selectedPersonId);
  const personName = currentPerson ? currentPerson.name : '未选订餐人';

  state.currentModalDish = dish;
  state.selectedSpecIndex = 0;

  document.getElementById('modal-dish-name').textContent = dish.name;
  document.getElementById('modal-target-person').textContent = `订餐人：${personName}`;
  document.getElementById('modal-dish-remark').value = '';

  renderModalSpecs();
  document.getElementById('spec-modal').classList.add('show');
}

function closeSpecModal() {
  document.getElementById('spec-modal').classList.remove('show');
  state.currentModalDish = null;
}

function renderModalSpecs() {
  const dish = state.currentModalDish;
  if (!dish) return;

  const container = document.getElementById('modal-specs-container');
  let html = '';

  dish.specs.forEach((spec, idx) => {
    const isAct = idx === state.selectedSpecIndex;
    html += `
      <div class="spec-option ${isAct ? 'active' : ''}" onclick="onSelectSpecIndex(${idx})">
        <span class="spec-name">${escapeHtml(spec.name)}</span>
        <span class="spec-price">¥${spec.price}</span>
      </div>
    `;
  });

  container.innerHTML = html;
  const currentSpec = dish.specs[state.selectedSpecIndex] || dish.specs[0];
  document.getElementById('modal-custom-price').value = currentSpec ? currentSpec.price : 10;
}

function onSelectSpecIndex(idx) {
  state.selectedSpecIndex = idx;
  renderModalSpecs();
}

function confirmAddDishToOrder() {
  const dish = state.currentModalDish;
  if (!dish) return;

  const currentPerson = state.people.find(p => p.id === state.selectedPersonId);
  if (!currentPerson) {
    showToast('请先选择订餐人');
    return;
  }

  const spec = dish.specs[state.selectedSpecIndex] || { name: '标配', price: 10 };
  const customPriceInput = document.getElementById('modal-custom-price').value;
  const finalPrice = parseFloat(customPriceInput) || spec.price;
  const remark = document.getElementById('modal-dish-remark').value.trim();

  const newOrder = {
    id: 'ord-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    date: state.selectedDate,
    weekday: getWeekdayString(state.selectedDate),
    personId: currentPerson.id,
    personName: currentPerson.name,
    dishId: dish.id,
    dishName: dish.name,
    specName: spec.name,
    price: finalPrice,
    remark: remark,
    isSettled: false,
    createTime: new Date().toISOString()
  };

  state.orders.push(newOrder);
  saveData();
  closeSpecModal();
  renderTodayOrders();
  showToast(`已为【${currentPerson.name}】添加：${dish.name}`);
}

// ==================== 9. 今日点单展示与汇总 ====================
function renderTodayOrders() {
  const container = document.getElementById('today-items-container');
  if (!container) return;

  const todays = state.orders.filter(o => o.date === state.selectedDate);

  let totalMoney = 0;
  todays.forEach(o => totalMoney += (o.price || 0));

  const totalEl = document.getElementById('today-total-price');
  const countEl = document.getElementById('today-item-count');
  if (totalEl) totalEl.textContent = `¥${totalMoney.toFixed(2)}`;
  if (countEl) countEl.textContent = todays.length;

  if (todays.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍜</div>
        <div>${state.selectedDate} 还没有点餐记录</div>
        <div style="font-size:11px; margin-top:4px;">请在上方选人后点击菜品添加</div>
      </div>
    `;
    return;
  }

  let html = '';
  todays.forEach((o) => {
    const specRemarkText = [o.specName, o.remark].filter(Boolean).join(' · ');

    html += `
      <div class="order-item-row">
        <div class="order-item-info">
          <span class="order-person-tag">👤 ${escapeHtml(o.personName)}</span>
          <div>
            <div class="order-dish-title">${escapeHtml(o.dishName)}</div>
            ${specRemarkText ? `<div class="order-dish-remark">${escapeHtml(specRemarkText)}</div>` : ''}
          </div>
        </div>
        <div class="order-item-right">
          <div class="order-item-price">¥${parseFloat(o.price || 0).toFixed(2)}</div>
          <div class="order-item-actions">
            <button class="order-action-link" onclick="toggleOrderSettle('${o.id}')">
              ${o.isSettled ? '<span style="color:var(--success)">已结</span>' : '<span style="color:var(--danger)">未结</span>'}
            </button>
            <button class="order-action-link" style="color:var(--text-sub);" onclick="deleteOrderItem('${o.id}')">删除</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function deleteOrderItem(orderId) {
  state.orders = state.orders.filter(o => o.id !== orderId);
  saveData();
  renderTodayOrders();
  showToast('已移除该条点餐');
}

function toggleOrderSettle(orderId) {
  const o = state.orders.find(item => item.id === orderId);
  if (!o) return;
  o.isSettled = !o.isSettled;
  saveData();
  renderTodayOrders();
  renderHistory();
  showToast(o.isSettled ? '已标记为结清' : '已标记为未结');
}

function clearDateConfirm() {
  const count = state.orders.filter(o => o.date === state.selectedDate).length;
  if (count === 0) {
    showToast('该日期暂无点单记录');
    return;
  }

  showConfirmModal(
    '清空当日账单',
    `确定清空【${state.selectedDate}】的全部 ${count} 条点餐记录吗？`,
    '确认清空',
    () => {
      state.orders = state.orders.filter(o => o.date !== state.selectedDate);
      saveData();
      renderTodayOrders();
      renderHistory();
      showToast('已清空当日账单记录');
    },
    true
  );
}

function copyTodaySummary() {
  const todays = state.orders.filter(o => o.date === state.selectedDate);
  if (todays.length === 0) {
    showToast('当前日期没有点单记录');
    return;
  }

  const weekday = getWeekdayString(state.selectedDate);
  let text = `【沙县外卖点餐清单】\n📅 日期：${state.selectedDate} (${weekday})\n--------------------\n`;

  const personMap = {};
  let totalSum = 0;

  todays.forEach(o => {
    if (!personMap[o.personName]) {
      personMap[o.personName] = [];
    }
    personMap[o.personName].push(o);
    totalSum += (o.price || 0);
  });

  for (const pName in personMap) {
    text += `👤 ${pName}：\n`;
    let pSum = 0;
    personMap[pName].forEach(item => {
      const specRemark = [item.specName, item.remark].filter(Boolean).join(' | ');
      text += `  · ${item.dishName} ${specRemark ? `(${specRemark})` : ''} - ¥${item.price}\n`;
      pSum += item.price;
    });
    text += `  小计：¥${pSum}\n\n`;
  }

  text += `--------------------\n💰 今日总计：¥${totalSum.toFixed(2)} (共 ${todays.length} 份)`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('已复制汇总文本到剪贴板！');
    }).catch(() => {
      promptCopyText(text);
    });
  } else {
    promptCopyText(text);
  }
}

function promptCopyText(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('已复制汇总文本！');
}

// ==================== 10. 历史与未结账单视图 ====================
function switchHistoryMode(mode) {
  state.historyMode = mode;
  document.getElementById('btn-hist-person').classList.toggle('active', mode === 'person');
  document.getElementById('btn-hist-date').classList.toggle('active', mode === 'date');
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-list-container');
  if (!container) return;

  const onlyUnpaid = document.getElementById('only-unpaid-check') ? document.getElementById('only-unpaid-check').checked : false;

  let allMoney = 0;
  let unpaidMoney = 0;
  let unpaidCount = 0;

  state.orders.forEach(o => {
    allMoney += (o.price || 0);
    if (!o.isSettled) {
      unpaidMoney += (o.price || 0);
      unpaidCount += 1;
    }
  });

  const unpaidValEl = document.getElementById('stat-total-unpaid');
  const allValEl = document.getElementById('stat-total-all');
  const unpaidCountEl = document.getElementById('stat-unpaid-count');

  if (unpaidValEl) unpaidValEl.textContent = `¥${unpaidMoney.toFixed(2)}`;
  if (allValEl) allValEl.textContent = `¥${allMoney.toFixed(2)}`;
  if (unpaidCountEl) unpaidCountEl.textContent = `${unpaidCount} 笔`;

  let list = state.orders;
  if (onlyUnpaid) {
    list = list.filter(o => !o.isSettled);
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">暂无符合条件的账单流水</div>`;
    return;
  }

  if (state.historyMode === 'person') {
    renderHistoryByPerson(container, list);
  } else {
    renderHistoryByDate(container, list);
  }
}

function renderHistoryByPerson(container, list) {
  const map = {};
  state.people.forEach(p => {
    map[p.name] = { person: p, items: [], unpaidTotal: 0, total: 0 };
  });

  list.forEach(o => {
    if (!map[o.personName]) {
      map[o.personName] = { person: { id: o.personId, name: o.personName }, items: [], unpaidTotal: 0, total: 0 };
    }
    map[o.personName].items.push(o);
    map[o.personName].total += (o.price || 0);
    if (!o.isSettled) {
      map[o.personName].unpaidTotal += (o.price || 0);
    }
  });

  let html = '';
  for (const name in map) {
    const data = map[name];
    if (data.items.length === 0) continue;

    html += `
      <div class="debt-person-card">
        <div class="debt-person-header">
          <div class="debt-person-name">
            <span>👤</span> ${escapeHtml(data.person.name)}
          </div>
          <div class="debt-person-amount">
            待结：¥${data.unpaidTotal.toFixed(2)}
          </div>
        </div>

        <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">
          累计消费：¥${data.total.toFixed(2)} · 共 ${data.items.length} 笔记录
        </div>

        <div class="debt-person-details">
          ${data.items.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed var(--border); font-size:12px;">
              <div>
                <span style="color:var(--text-muted); margin-right:6px;">${item.date} (${item.weekday || ''})</span>
                <span style="font-weight:600;">${escapeHtml(item.dishName)} ${item.specName ? `[${escapeHtml(item.specName)}]` : ''}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700;">¥${parseFloat(item.price || 0).toFixed(2)}</span>
                <button class="order-action-link" onclick="toggleOrderSettle('${item.id}')">
                  ${item.isSettled ? '<span style="color:var(--success)">已结</span>' : '<span style="color:var(--danger)">结清</span>'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        ${data.unpaidTotal > 0 ? `
          <div class="debt-actions">
            <button class="debt-action-btn btn-settle-all" onclick="settleAllForPerson('${escapeHtml(data.person.name)}')">
              一键全结清 (¥${data.unpaidTotal.toFixed(2)})
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  container.innerHTML = html;
}

function settleAllForPerson(personName) {
  showConfirmModal(
    '一键结清账单',
    `确定将订餐人【${personName}】的所有未结账单标记为【已结清】吗？`,
    '确认结清',
    () => {
      state.orders.forEach(o => {
        if (o.personName === personName) {
          o.isSettled = true;
        }
      });
      saveData();
      renderTodayOrders();
      renderHistory();
      showToast(`已结清【${personName}】的全部账单！`);
    },
    false
  );
}

function renderHistoryByDate(container, list) {
  const dateMap = {};
  list.forEach(o => {
    if (!dateMap[o.date]) {
      dateMap[o.date] = { date: o.date, weekday: o.weekday, items: [], total: 0 };
    }
    dateMap[o.date].items.push(o);
    dateMap[o.date].total += (o.price || 0);
  });

  const sortedDates = Object.keys(dateMap).sort().reverse();

  let html = '';
  sortedDates.forEach(date => {
    const group = dateMap[date];
    html += `
      <div class="record-group">
        <div class="record-group-header">
          <div class="record-group-title">
            <span>📅 ${group.date}</span>
            <span style="color:var(--primary); font-weight:700; margin-left:6px;">${group.weekday || getWeekdayString(group.date)}</span>
          </div>
          <div style="font-size:12px; font-weight:700;">
            小计：¥${group.total.toFixed(2)}
          </div>
        </div>

        <div>
          ${group.items.map(item => `
            <div class="record-row">
              <div class="record-desc">
                <div>
                  <span class="record-person-badge">👤 ${escapeHtml(item.personName)}</span>
                  <span style="font-weight:600; font-size:13px;">
                    ${escapeHtml(item.dishName)} ${item.specName ? `(${escapeHtml(item.specName)})` : ''}
                  </span>
                  ${item.remark ? `<span style="font-size:11px; color:var(--text-muted);">[${escapeHtml(item.remark)}]</span>` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="record-price">¥${parseFloat(item.price || 0).toFixed(2)}</span>
                <button class="order-action-link" onclick="toggleOrderSettle('${item.id}')">
                  ${item.isSettled ? '<span style="color:var(--success)">已结</span>' : '<span style="color:var(--danger)">未结</span>'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==================== 11. 自定义菜品添加 ====================
function openAddDishModal() {
  document.getElementById('new-dish-name').value = '';
  document.getElementById('new-dish-specs').value = '';
  document.getElementById('dish-modal').classList.add('show');
}

function closeDishModal() {
  document.getElementById('dish-modal').classList.remove('show');
}

function saveCustomDish() {
  const name = document.getElementById('new-dish-name').value.trim();
  const category = document.getElementById('new-dish-category').value;
  const rawSpecs = document.getElementById('new-dish-specs').value.trim();

  if (!name) {
    showToast('请输入菜品名称');
    return;
  }

  let specs = [];
  if (rawSpecs.includes(':') || rawSpecs.includes('：')) {
    const parts = rawSpecs.split(/[,，]/);
    parts.forEach(part => {
      const [sName, sPrice] = part.split(/[:：]/);
      if (sName && sPrice) {
        specs.push({ name: sName.trim(), price: parseFloat(sPrice.trim()) || 0 });
      }
    });
  } else {
    const fixedP = parseFloat(rawSpecs) || 10;
    specs.push({ name: '标配', price: fixedP });
  }

  if (specs.length === 0) {
    specs = [{ name: '标配', price: 10 }];
  }

  const newDish = {
    id: 'custom-' + Date.now(),
    name: name,
    category: category,
    specs: specs
  };

  state.menu.unshift(newDish);
  saveData();
  closeDishModal();
  renderMenu();
  showToast(`已成功添加新菜品：${name}`);
}

// ==================== 12. 全能快捷导入导出系统 ====================
function quickCopyBackup() {
  const backup = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders
  };
  const jsonStr = JSON.stringify(backup);

  const ta = document.getElementById('quick-backup-text');
  if (ta) ta.value = jsonStr;
  document.getElementById('quick-backup-modal').classList.add('show');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jsonStr).then(() => {
      showToast('已复制备份代码到剪贴板！');
    }).catch(() => {
      showToast('已生成备份代码，可长按文本框复制');
    });
  }
}

function closeQuickBackupModal() {
  document.getElementById('quick-backup-modal').classList.remove('show');
}

function copyAgainFromTextarea() {
  const ta = document.getElementById('quick-backup-text');
  if (ta) {
    ta.select();
    document.execCommand('copy');
    showToast('已重新复制到剪贴板！');
  }
}

function openQuickPasteModal() {
  document.getElementById('quick-paste-text').value = '';
  document.getElementById('quick-paste-modal').classList.add('show');
}

function closeQuickPasteModal() {
  document.getElementById('quick-paste-modal').classList.remove('show');
}

async function pasteFromClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      document.getElementById('quick-paste-text').value = text;
      showToast('已自动从剪贴板读取！');
    } else {
      showToast('请直接在输入框中长按粘贴');
    }
  } catch (e) {
    showToast('请手动在输入框中长按粘贴');
  }
}

// CSV 文本解析引擎（兼容引号转义与各类表头）
function parseCSVText(csvText) {
  if (!csvText) return null;
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  const rawLines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (rawLines.length < 2) return null;

  function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  const headers = parseCSVLine(rawLines[0]);

  let dateIdx = headers.findIndex(h => h.includes('日期'));
  let weekdayIdx = headers.findIndex(h => h.includes('星期'));
  let personIdx = headers.findIndex(h => h.includes('订餐人') || h.includes('人员') || h.includes('姓名'));
  let dishIdx = headers.findIndex(h => h.includes('菜品') || h.includes('名称'));
  let specIdx = headers.findIndex(h => h.includes('规格') || h.includes('变体'));
  let priceIdx = headers.findIndex(h => h.includes('实付金额') || h.includes('金额') || h.includes('价格'));
  let remarkIdx = headers.findIndex(h => h.includes('备注') || h.includes('口味'));
  let statusIdx = headers.findIndex(h => h.includes('状态') || h.includes('结清') || h.includes('结算'));
  let timeIdx = headers.findIndex(h => h.includes('时间'));

  if (dateIdx === -1) dateIdx = 0;
  if (personIdx === -1) personIdx = 2;
  if (dishIdx === -1) dishIdx = 3;
  if (priceIdx === -1) priceIdx = 5;

  const orders = [];
  const peopleMap = new Map();

  for (let r = 1; r < rawLines.length; r++) {
    const row = parseCSVLine(rawLines[r]);
    if (row.length < 3) continue;

    const date = row[dateIdx] || '';
    const weekday = weekdayIdx !== -1 ? row[weekdayIdx] : '';
    const personName = (personIdx !== -1 && row[personIdx]) ? row[personIdx] : '自己';
    const dishName = (dishIdx !== -1 && row[dishIdx]) ? row[dishIdx] : '未知菜品';
    const specName = specIdx !== -1 ? (row[specIdx] || '') : '';
    const priceStr = priceIdx !== -1 ? (row[priceIdx] || '0') : '0';
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
    const remark = remarkIdx !== -1 ? (row[remarkIdx] || '') : '';
    const isSettled = statusIdx !== -1 ? (row[statusIdx].includes('已结') || row[statusIdx].includes('是') || row[statusIdx].toLowerCase() === 'true') : false;
    const createTime = timeIdx !== -1 ? (row[timeIdx] || '') : new Date().toISOString();

    if (!peopleMap.has(personName)) {
      peopleMap.set(personName, {
        id: 'p-' + Date.now() + '-' + peopleMap.size,
        name: personName
      });
    }

    orders.push({
      id: 'ord-csv-' + Date.now() + '-' + r + '-' + Math.floor(Math.random() * 1000),
      date: date || new Date().toISOString().split('T')[0],
      weekday: weekday,
      personId: peopleMap.get(personName).id,
      personName: personName,
      dishId: 'dish-' + r,
      dishName: dishName,
      specName: specName,
      price: price,
      remark: remark,
      isSettled: isSettled,
      createTime: createTime
    });
  }

  if (orders.length === 0) return null;

  return {
    people: Array.from(peopleMap.values()),
    orders: orders
  };
}

function importFromCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const data = parseCSVText(text);
      if (!data || data.orders.length === 0) {
        showToast('未能识别出有效的 CSV 账单流水');
        return;
      }

      showConfirmModal(
        '导入 CSV 账单',
        `从 CSV 文件中成功识别出 ${data.orders.length} 条账单记录、${data.people.length} 位订餐人。确定导入吗？`,
        '确认导入并合并',
        () => {
          // 合并订餐人
          const existNames = new Set(state.people.map(p => p.name));
          data.people.forEach(p => {
            if (!existNames.has(p.name)) {
              state.people.push(p);
              existNames.add(p.name);
            }
          });

          // 保持 ID 映射一致
          const nameToId = {};
          state.people.forEach(p => nameToId[p.name] = p.id);
          data.orders.forEach(o => {
            if (nameToId[o.personName]) o.personId = nameToId[o.personName];
            state.orders.push(o);
          });

          saveData();
          init();
          showToast(`成功从 CSV 导入 ${data.orders.length} 条账单记录！`);
          syncToCloud(true);
        },
        false
      );
    } catch (err) {
      showToast('读取 CSV 文件出错: ' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function applyQuickPaste(mode) {
  const raw = document.getElementById('quick-paste-text').value.trim();
  if (!raw) {
    showToast('请先输入或粘贴备份代码');
    return;
  }

  let data = null;
  let isFromCSV = false;

  try {
    data = JSON.parse(raw);
  } catch (e) {
    // 智能容错：如果用户粘贴的是导出的 CSV 文本，自动转为 CSV 解析！
    data = parseCSVText(raw);
    if (data) isFromCSV = true;
  }

  if (!data || !data.people || !data.orders) {
    showToast('无法识别数据，请确认是 JSON 备份代码或 CSV 文本');
    return;
  }

  if (mode === 'overwrite') {
    state.people = data.people;
    state.orders = data.orders;
    if (data.menu) state.menu = data.menu;
  } else {
    // 合并模式
    const existPersonNames = new Set(state.people.map(p => p.name));
    (data.people || []).forEach(p => {
      if (!existPersonNames.has(p.name)) {
        state.people.push(p);
        existPersonNames.add(p.name);
      }
    });

    const existOrderIds = new Set(state.orders.map(o => o.id));
    (data.orders || []).forEach(o => {
      if (!existOrderIds.has(o.id)) {
        state.orders.push(o);
        existOrderIds.add(o.id);
      }
    });
  }

  saveData();
  init();
  closeQuickPasteModal();
  showToast(isFromCSV ? `成功从粘贴的 CSV 导入 ${data.orders.length} 条记录！` : (mode === 'overwrite' ? '已全量覆盖还原！' : '已成功合并导入数据！'));
  syncToCloud(true);
}

function exportBackupJSON() {
  const backup = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute('href', dataStr);
  dlAnchor.setAttribute('download', `沙县外卖完整备份_${state.selectedDate}.json`);
  dlAnchor.click();
  showToast('已导出备份 JSON 文件');
}

function importBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.people && data.orders) {
        state.people = data.people;
        state.orders = data.orders;
        if (data.menu) state.menu = data.menu;
        saveData();
        init();
        showToast('备份数据还原成功！');
        syncToCloud(true);
      } else {
        showToast('无效的备份文件结构');
      }
    } catch (err) {
      showToast('解析备份文件出错');
    }
  };
  reader.readAsText(file);
}

function exportToCSV() {
  if (state.orders.length === 0) {
    showToast('暂无点餐记录可导出');
    return;
  }

  let csvContent = '\uFEFF';
  csvContent += '点餐日期,星期,订餐人,菜品名称,规格/变体,金额(元),口味备注,结清状态,创建时间\n';

  state.orders.forEach(o => {
    const row = [
      o.date,
      o.weekday || '',
      `"${(o.personName || '').replace(/"/g, '""')}"`,
      `"${(o.dishName || '').replace(/"/g, '""')}"`,
      `"${(o.specName || '').replace(/"/g, '""')}"`,
      o.price || 0,
      `"${(o.remark || '').replace(/"/g, '""')}"`,
      o.isSettled ? '已结清' : '未结清',
      o.createTime || ''
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `沙县外卖记账流水_${state.selectedDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('已导出 Excel CSV 格式文件');
}

function resetToInitialData() {
  showConfirmModal(
    '重置所有数据',
    '确定要恢复为初始默认状态吗？注意：这会清空你录入的所有历史点单记录！',
    '确认重置',
    () => {
      state.menu = DEFAULT_MENU;
      state.people = DEFAULT_PEOPLE;
      state.orders = [];
      saveData();
      init();
      showToast('已恢复为初始数据');
      syncToCloud(true);
    },
    true
  );
}

// ==================== 13. 工具函数 ====================
function showToast(msg) {
  const toast = document.getElementById('toast-el');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 启动入口
window.addEventListener('DOMContentLoaded', init);
