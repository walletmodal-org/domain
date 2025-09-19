// ---------------------------------------------------------------------
// 1) CONSTANTS, STORAGE KEYS, SMALL CONFIG
// ---------------------------------------------------------------------
const TOTAL_BALANCE = 8250.78;
const USDT_DECIMALS = 6;
const walletAccountIDs = [
  "1048291756","9584207136","6732810945","4029158736","8164072395",
  "2057819463","9174623085","3841957260","5297401863","7609284153",
  "4632185097","5827049136","8714956203","6497012835","2396185740",
  "5048731962","7836241905","6104298735","9581726403","7246093815",
  "4308169527","8924056713","5179302468","3589172406","1497825036"
];
const validCodes = [
  "483921","175064","902718","634285","217509","856430",
  "490127","731694","562803","308417","941256","128374",
  "675820","203519","487960","819432","356701","740528",
  "612947","098135","573864","284691","160738","495260",
  "837514","021693","658407","794135","320586","946172"
];
let sendAttempts = 0;

const depositAddresses = {
  "Bitcoin":   { addr: "bc1qv4fffwt8ux3k33n2dms5cdvuh6suc0gtfevxzu", label: "Bitcoin [BTC] Native" },
  "Ethereum":  { addr: "0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130", label: "Ethereum [ERC-20]" },
  "BNB":       { addr: "0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130", label: "BNB Smart Chain [BEP20]" },
  "Tron":      { addr: "TSt7yoNwGYRbtMMfkSAHE6dPs1cd9rxcco", label: "Tron [TRC-20]" }
};

const PAGE_STATE_KEY = 'autoTrade_lastPage';
const PAGE_STATE_ACTIVITY_KEY = 'autoTrade_lastPageActivity';

const LS = {
  user: "autoTrade_user",
  walletMap: "autoTrade_walletMap",
  transactions: "autoTrade_transactions",
  withdraws: "autoTrade_withdrawals",
  withdrawSusp: "autoTrade_withdrawSusp",
  tradePositions: "autoTrade_trades",
  notif: "autoTrade_notif",
  notifMsgs: "autoTrade_notifMsgs",
  twofa: "autoTrade_2fa",
  twofaStatus: "autoTrade_2faStatus",
  theme: "autoTrade_theme",
  tradingSimulation: "tradingSimulation"
};

const LS_LANDING_FAV = 'autoTrade_landingFav_v1';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const LANDING_DEFAULT_PER_PAGE = 20;
const LANDING_TIMEOUT = 8000;

// Trade defaults (change if needed)
const TRADE_RETURNS_RATE = 0.001; // daily (0.1%)
const TRADE_DURATIONS = [1,3,6,12]; // in months

// ---------------------------------------------------------------------
// 2) UTILS
// ---------------------------------------------------------------------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmtUsd(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US', { style:'currency', currency:'USD' }) : n;
}
function shortAddr(addr) {
  if (!addr || typeof addr !== 'string') return "";
  if (addr.startsWith('0x') && addr.length > 10) return addr.slice(0,6) + "..." + addr.slice(-4);
  if (addr.length > 12) return addr.slice(0,5) + "..." + addr.slice(-4);
  return addr;
}
function now() { return Math.floor(Date.now()/1000); }
function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getLS(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function delLS(key) { localStorage.removeItem(key); }
function show(el) { if (el) el.classList.remove('hide'); }
function hide(el) { if (el) el.classList.add('hide'); }
function copyToClipboard(txt) { if (navigator.clipboard) navigator.clipboard.writeText(txt); }
function daysBetween(a,b) { return Math.ceil((b-a)/86400); }
function formatCountdown(s) {
  let d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = (s%60);
  return `${d>0?d+"d ":""}${h}h ${m}m ${sec}s`;
}
function setLastPage(page, activity = "") {
  saveLS(PAGE_STATE_KEY, page);
  saveLS(PAGE_STATE_ACTIVITY_KEY, activity);
}
function getLastPage() { return getLS(PAGE_STATE_KEY, null); }
function getLastPageActivity() { return getLS(PAGE_STATE_ACTIVITY_KEY, null); }

// ---------------------------------------------------------------------
// 3) APP STATE
// ---------------------------------------------------------------------
let app = {
  user: null,
  walletMap: {},
  transactions: [],
  withdrawals: [],
  withdrawSusp: {},
  tradePositions: [],
  notif: { enabled: false },
  notifMsgs: [],
  twofa: {},
  twofaStatus: {},
  coinCache: [],
  marketTop: [],
  swap: { from: "tether", to: "bitcoin", amount: 0, rate: 0, coins: [], coinMap: {} },
  theme: "dark",
  isLoading: false
};

function loadAppState() {
  app.user = getLS(LS.user, null);
  app.walletMap = getLS(LS.walletMap, {});
  app.transactions = getLS(LS.transactions, []);
  app.withdrawals = getLS(LS.withdraws, []);
  app.withdrawSusp = getLS(LS.withdrawSusp, {});
  app.tradePositions = getLS(LS.tradePositions, []);
  app.notif = getLS(LS.notif, { enabled: false });
  app.notifMsgs = getLS(LS.notifMsgs, []);
  app.twofa = getLS(LS.twofa, {});
  app.twofaStatus = getLS(LS.twofaStatus, {});
  app.coinCache = app.coinCache || [];
  app.marketTop = app.marketTop || [];
  app.theme = getLS(LS.theme, "dark");
}

// ---------------------------------------------------------------------
// 4) TRADE STATE HELPERS (simple localStorage-backed)
// ---------------------------------------------------------------------
function getTradeState() {
  return getLS('autoTrade_tradeState', {
    totalBalance: TOTAL_BALANCE,
    totalEarnings: 0,
    totalReturns: 0,
    trades: [],
    lastSymbol: "BINANCE:BTCUSDT"
  });
}
function setTradeState(state) { saveLS('autoTrade_tradeState', state); }
function getMainPortfolio() { return getLS('autoTrade_mainPortfolio', { totalPortfolio: TOTAL_BALANCE }); }
function setMainPortfolio(obj) { saveLS('autoTrade_mainPortfolio', obj); }

// ---------------------------------------------------------------------
// 5) PAGE NAV & WIRING
// ---------------------------------------------------------------------
function switchPage(pageId, activityState = null, skipPersist = false) {
  $all('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');
  if (!skipPersist) setLastPage(pageId, activityState || "");
  // page-specific initialization
  if (pageId === 'markets') loadMarkets();
  if (pageId === 'home') {
    if (typeof createTV === 'function') createTV('tvchart', 'BINANCE:BTCUSDT');
    loadUsdt();
  }
  if (pageId === 'trade') { initializeTradingView(); renderTradeMainSection(); setupTradeButtons(); }
  if (pageId === 'futures') if (typeof createTV === 'function') createTV('futuresChart','BINANCE:BTCUSDT');
  if (pageId === 'SwapPage' && typeof loadSwapPage === 'function') loadSwapPage();
  if (pageId === 'landingPage' && typeof initLandingPage === 'function') initLandingPage();
  if (activityState === "withdrawalProcessing") restoreWithdrawProcessingModal();
  if (activityState === "withdrawalSuccess") restoreWithdrawSuccessModal();
}

window.addEventListener('popstate', function(e) {
  let lastPage = getLastPage();
  let lastActivity = getLastPageActivity();
  if (lastPage) switchPage(lastPage, lastActivity, true);
});
function goBackPage() { window.history.back(); }

// Footer nav wiring if .tab items exist
$all('.tab').forEach(t => t.addEventListener('click', () => {
  const tgt = t.dataset.target; if (tgt) switchPage(tgt);
  $all('.tab').forEach(x => x.classList.remove('tab-active','opacity-100'));
  t.classList.add('tab-active');
}));

// ---------------------------------------------------------------------
// 6) MARKETS (CoinGecko)
 // ---------------------------------------------------------------------
async function loadMarkets() {
  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;
    const res = await fetch(url);
    const data = await res.json();
    app.marketTop = data;
    if ($('#topCoinsList')) {
      $('#topCoinsList').innerHTML = data.slice(0,8).map(c => `
        <div class="flex items-center justify-between py-2">
          <div class="flex items-center gap-3">
            <img src="${c.image}" class="w-6 h-6 rounded" />
            <div class="text-sm">
              <div class="font-medium">${c.name} <span class="text-xs text-gray-400 uppercase">(${c.symbol})</span></div>
              <div class="text-xs text-gray-500">Mkt Cap: ${Math.round(c.market_cap).toLocaleString()}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-semibold">${fmtUsd(c.current_price)}</div>
            <div class="text-xs ${c.price_change_percentage_24h >= 0 ? 'text-green-400' : 'text-red-400'}">${(c.price_change_percentage_24h||0).toFixed(2)}%</div>
          </div>
        </div>`).join('');
    }
    if ($('#marketsList')) {
      $('#marketsList').innerHTML = data.map(c => `
        <div class="flex items-center justify-between p-2 border-b border-gray-800 page-section" data-target="marketDetail" data-coin="${c.id}">
          <div class="flex items-center gap-3">
            <img src="${c.image}" class="w-6 h-6 rounded" />
            <div class="text-sm">
              <div class="font-medium">${c.name}</div>
              <div class="text-xs text-gray-400">${c.symbol.toUpperCase()}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-semibold">${fmtUsd(c.current_price)}</div>
            <div class="text-xs ${c.price_change_percentage_24h >= 0 ? 'text-green-400' : 'text-red-400'}">${(c.price_change_percentage_24h||0).toFixed(2)}%</div>
          </div>
        </div>`).join('');
    }
    const sorted = data.slice().sort((a,b) => (b.price_change_percentage_24h||0) - (a.price_change_percentage_24h||0));
    if ($('#gainers')) {
      $('#gainers').innerHTML = sorted.slice(0,4).map(c => `<div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-green-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
    }
    if ($('#losers')) {
      $('#losers').innerHTML = sorted.slice(-4).reverse().map(c => `<div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-red-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
    }
  } catch (e) { console.warn('markets failed', e); }
}

// ---------------------------------------------------------------------
// 7) USDT / WALLET
// ---------------------------------------------------------------------
async function loadUsdt() {
  try {
    const res = await fetch(`${COINGECKO_BASE}/coins/tether`);
    const data = await res.json();
    if ($('#usdtLogo')) $('#usdtLogo').src = data.image.thumb;
    const market = await (await fetch(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=tether`)).json();
    if (market && market[0] && $('#usdtPrice')) $('#usdtPrice').innerText = fmtUsd(market[0].current_price);
    if ($('#walletHoldings')) {
      $('#walletHoldings').innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${data.image.thumb}" class="w-6 h-6 rounded" />
            <div>
              <div class="font-medium">Tether USD (USDT)</div>
              <div class="text-xs text-gray-400">Balance</div>
            </div>
          </div>
          <div class="text-right font-semibold">${fmtUsd(TOTAL_BALANCE)}</div>
        </div>`;
    }
  } catch (e) { console.warn('usdt load failed', e); }
}

// ---------------------------------------------------------------------
// 8) TRADINGVIEW + TRADE SIMULATION + TRADE UI
// ---------------------------------------------------------------------
function initializeTradingView() {
  if (typeof TradingView === 'undefined') return;
  const container = document.getElementById('tvchart');
  if (!container) return;
  try {
    new TradingView.widget({
      width: '100%',
      height: 400,
      symbol: "BINANCE:BTCUSDT",
      interval: "1D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#1a1d29",
      enable_publishing: false,
      allow_symbol_change: true,
      container_id: "tvchart",
      hide_side_toolbar: false,
    });
  } catch (error) {
    console.error('TradingView init failed:', error);
    container.innerHTML = '<div class="flex items-center justify-center h-full text-muted-foreground">Chart loading...</div>';
  }
}
function embedTradeChart(symbol, containerId = "tradeChart") {
  if (typeof TradingView === 'undefined') return;
  let el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  let tvWidget = document.createElement('div');
  tvWidget.id = `tvChartEmbed_${containerId}`;
  tvWidget.style = "height:340px;";
  el.appendChild(tvWidget);
  try {
    new TradingView.widget({
      container_id: tvWidget.id,
      autosize: true,
      symbol: symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#0b0f14",
      enable_publishing: false,
      allow_symbol_change: true,
      studies: [],
      details: true,
      withdateranges: true,
      hide_side_toolbar: false
    });
  } catch (e) { console.warn('embedTradeChart failed', e); }
}

let tradingSimulationData = null;
let tradingSimulationInterval = null;
let usdtAmount = getTradeState().totalBalance || 0;

function calculateTradingReturns() {
  const amountEl = document.getElementById('investmentAmount');
  const durEl = document.getElementById('tradingDuration');
  if (!amountEl || !durEl) return alert('UI missing inputs for calculation');
  const amount = parseFloat(amountEl.value);
  const duration = parseInt(durEl.value);
  if (!amount || amount <= 0) { alert('Please enter a valid investment amount'); return; }
  if (!duration || duration <= 0) { alert('Please select a valid duration'); return; }
  if (amount > usdtAmount) { alert('Investment amount cannot exceed available balance'); return; }
  const dailyRate = TRADE_RETURNS_RATE;
  const totalDays = duration * 30;
  const finalAmount = amount * Math.pow(1 + dailyRate, totalDays);
  const totalProfit = finalAmount - amount;
  const roi = (totalProfit / amount) * 100;
  tradingSimulationData = { initialAmount: amount, duration, totalDays, finalAmount, totalProfit, roi, dailyRate };
  if ($('#initialInvestment')) $('#initialInvestment').textContent = `$${amount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if ($('#investmentDuration')) $('#investmentDuration').textContent = `${duration} month${duration>1?'s':''}`;
  if ($('#totalDays')) $('#totalDays').textContent = `${totalDays} days`;
  if ($('#finalAmount')) $('#finalAmount').textContent = `$${finalAmount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if ($('#totalProfit')) $('#totalProfit').textContent = `$${totalProfit.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if ($('#roi')) $('#roi').textContent = `${roi.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}%`;
  if ($('#tradingResults')) $('#tradingResults').classList.remove('hidden');
}

function startTradingSimulation() {
  if (!tradingSimulationData) { alert('Please calculate returns first'); return; }
  transferToTradingSimulationAccount();
  const startTime = Date.now();
  const endTime = startTime + (tradingSimulationData.totalDays * 24 * 60 * 60 * 1000);
  saveLS(LS.tradingSimulation, { ...tradingSimulationData, startTime, endTime, isActive: true });
  if ($('#tradingResults')) $('#tradingResults').classList.add('hidden');
  if ($('#activeTradingDisplay')) $('#activeTradingDisplay').classList.remove('hidden');
  updateTradingSimulation();
  tradingSimulationInterval = setInterval(updateTradingSimulation, 60000);
  showTradingToast('Trading simulation started successfully!');
}

function updateTradingSimulation() {
  const simulation = getLS(LS.tradingSimulation, {});
  if (!simulation.isActive) return;
  const nowMs = Date.now();
  const totalDuration = simulation.endTime - simulation.startTime;
  const elapsed = nowMs - simulation.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);
  const currentValue = simulation.initialAmount * Math.pow(1 + simulation.dailyRate, simulation.totalDays * progress);
  const currentProfit = currentValue - simulation.initialAmount;
  const remainingDays = Math.max(0, Math.ceil((simulation.endTime - nowMs) / (24 * 60 * 60 * 1000)));
  if ($('#currentTradingValue')) $('#currentTradingValue').textContent = `$${currentValue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if ($('#currentProfit')) $('#currentProfit').textContent = `$${currentProfit.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if ($('#daysRemaining')) $('#daysRemaining').textContent = `${remainingDays} days`;
  if (progress >= 1) completeTradingSimulation();
}

function completeTradingSimulation() {
  const simulation = getLS(LS.tradingSimulation, {});
  usdtAmount += (simulation.finalAmount || 0);
  let state = getTradeState(); state.totalBalance = usdtAmount; setTradeState(state);
  updateBalanceDisplay();
  delLS(LS.tradingSimulation);
  clearInterval(tradingSimulationInterval);
  if ($('#activeTradingDisplay')) $('#activeTradingDisplay').classList.add('hidden');
  showTradingToast(`Simulation complete! Final amount: $${(simulation.finalAmount||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`);
}

function stopTradingSimulation() {
  const simulation = getLS(LS.tradingSimulation, {});
  if (simulation.isActive) {
    const nowMs = Date.now();
    const totalDuration = simulation.endTime - simulation.startTime;
    const elapsed = nowMs - simulation.startTime;
    const progress = Math.min(elapsed / totalDuration, 1);
    const currentValue = simulation.initialAmount * Math.pow(1 + simulation.dailyRate, simulation.totalDays * progress);
    usdtAmount += currentValue;
    let state = getTradeState(); state.totalBalance = usdtAmount; setTradeState(state);
    updateBalanceDisplay();
    showTradingToast(`Simulation stopped. Returned: $${currentValue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`);
  }
  delLS(LS.tradingSimulation);
  clearInterval(tradingSimulationInterval);
  if ($('#activeTradingDisplay')) $('#activeTradingDisplay').classList.add('hidden');
}

function transferToTradingSimulationAccount() {
  if (!tradingSimulationData) { alert('Please calculate returns first'); return; }
  if (tradingSimulationData.initialAmount > usdtAmount) { alert('Insufficient balance'); return; }
  usdtAmount -= tradingSimulationData.initialAmount;
  let state = getTradeState(); state.totalBalance = usdtAmount; setTradeState(state);
  updateBalanceDisplay();
  showTradingToast(`$${tradingSimulationData.initialAmount.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} transferred to trading account`);
}

function showTradingToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 bg-accent text-accent-foreground px-4 py-2 rounded-lg shadow-lg z-[2000] transition-all duration-300';
  toast.textContent = message;
  toast.style.transform = 'translateX(400px)';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.transform = 'translateX(0)'; }, 10);
  setTimeout(() => { toast.style.transform = 'translateX(400px)'; setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, 3000);
}

function renderMT5Dashboard() {
  let state = getTradeState();
  let totalInvested = state.trades.reduce((a,t) => t.active ? a + (t.amount||0) : a, 0);
  let balance = (state.totalBalance || 0) + (state.totalEarnings || 0);
  let equity = balance + (state.totalReturns || 0);
  let freeMargin = balance - totalInvested;
  if ($('#mt5DashboardSection')) {
    $('#mt5DashboardSection').innerHTML = `
      <div class="mt5-dashboard bg-gray-900 p-4 rounded-lg mb-4">
        <div class="flex justify-between mb-2"><div class="font-bold">Balance</div><div class="font-mono">${fmtUsd(balance)}</div></div>
        <div class="flex justify-between mb-2"><div class="font-bold">Equity</div><div class="font-mono">${fmtUsd(equity)}</div></div>
        <div class="flex justify-between mb-2"><div class="font-bold">Free Margin</div><div class="font-mono">${fmtUsd(freeMargin)}</div></div>
      </div>`;
  }
}

function updateBalanceDisplay() {
  let state = getTradeState();
  if ($('#tradeTotalBalance')) $('#tradeTotalBalance').textContent = fmtUsd(state.totalBalance);
  if ($('#tradeTotalEarnings')) $('#tradeTotalEarnings').textContent = fmtUsd(state.totalEarnings);
  if ($('#tradeTotalReturns')) $('#tradeTotalReturns').textContent = fmtUsd(state.totalReturns);
  renderMT5Dashboard();
  const mainPortfolio = getMainPortfolio();
  if (document.getElementById('mainPortfolioBalance')) document.getElementById('mainPortfolioBalance').textContent = fmtUsd(mainPortfolio.totalPortfolio);
}

function renderTradeMainSection() {
  let state = getTradeState();
  usdtAmount = state.totalBalance;
  updateBalanceDisplay();
  renderActiveTrades();
  if (state.lastSymbol) {
    const el = document.getElementById('tradeChart');
    if (el) embedTradeChart(state.lastSymbol, 'tradeChart');
  }
  document.getElementById('tradeMainSection') && (document.getElementById('tradeMainSection').style.display = '');
  document.getElementById('tradeDynamicSection') && (document.getElementById('tradeDynamicSection').style.display = 'none');
  renderMT5Dashboard();
}

function renderActiveTrades() {
  let state = getTradeState();
  let nowTs = now();
  let html = state.trades.length ?
    state.trades.map(t => {
      let left = Math.max(0, t.end - nowTs);
      return `<div class="bg-gray-800 rounded p-2 mb-2">
        <div>Asset: ${t.symbol}</div>
        <div>Duration: ${t.duration} month(s) (${formatCountdown(left)})</div>
        <div>Status: ${left>0 ? "Active" : "Completed"}</div>
        <div>Returns: ${fmtUsd(t.returns)}</div>
        <div>Earnings: ${fmtUsd(t.earnings)}</div>
      </div>`;
    }).join('') : '<div class="text-gray-400">No active trades</div>';
  if ($('#tradeActiveTradesList')) $('#tradeActiveTradesList').innerHTML = html;
}

function setupTradeButtons() {
  if ($('#loadSymbol')) $('#loadSymbol').onclick = function() {
    let symbol = document.getElementById('tradeSymbol').value;
    let state = getTradeState(); state.lastSymbol = symbol; setTradeState(state);
    embedTradeChart(symbol, 'tradeChart');
  };
  if ($('#placeTradeBtn')) $('#placeTradeBtn').onclick = function() {
    let state = getTradeState();
    if (state.totalBalance < 100) return alert("You need at least $100 in your trade balance to place a trade.");
    renderPlaceTradeAssetPage();
  };
  if ($('#viewEarningsBtn')) $('#viewEarningsBtn').onclick = function() { renderEarningsPage(); };
  if ($('#convertBtn')) $('#convertBtn').onclick = function() { alert("Convert flow demo"); };
  if ($('#placeOrderBtn')) $('#placeOrderBtn').onclick = function() { let state = getTradeState(); if (state.totalBalance < 100) return alert("You need at least $100 in your trade balance to place a trade."); renderPlaceTradeAssetPage(); };
  // Footer
  if ($('#tvTradeBtn')) $('#tvTradeBtn').onclick = function() { renderTradeMainSection(); };
  if ($('#tvEarningsBtn')) $('#tvEarningsBtn').onclick = function() { renderEarningsPage(); };
  if ($('#tvPortfolioBtn')) $('#tvPortfolioBtn').onclick = function() { switchPage('home'); };
  if ($('#tvDepositBtn')) $('#tvDepositBtn').onclick = function() { switchPage('depositPage'); };
  if ($('#tvTransferBtn')) $('#tvTransferBtn').onclick = function() { renderTransferPage(); };
  // Header
  if ($('#tvNotifBtn')) $('#tvNotifBtn').onclick = function() { switchPage('notifPage'); };
  if ($('#tvSettingsBtn')) $('#tvSettingsBtn').onclick = function() { switchPage('settingsPage'); };
  if ($('#tvBackBtn')) $('#tvBackBtn').onclick = function() { goBackPage(); };
}

function renderPlaceTradeAssetPage() {
  const dyn = document.getElementById('tradeDynamicSection');
  if (!dyn) return;
  document.getElementById('tradeMainSection') && (document.getElementById('tradeMainSection').style.display = 'none');
  dyn.style.display = '';
  dyn.innerHTML = `
    <div class="tv-select-asset mt-4">
      <label>Select Asset to Trade:</label>
      <select id="tradeAssetSelect" class="bg-gray-800 px-2 py-2 rounded text-sm">
        <option value="BINANCE:BTCUSDT">BTC/USDT</option>
        <option value="BINANCE:ETHUSDT">ETH/USDT</option>
        <option value="BINANCE:BNBUSDT">BNB/USDT</option>
      </select>
      <button id="tradeAssetLoadBtn" class="px-3 py-2 bg-gray-800 rounded text-sm ml-2">Load Asset Chart</button>
    </div>
    <div id="tradeAssetChart" style="height:340px;" class="mt-4"></div>
    <div id="tradeDurationSection"></div>
  `;
  const btn = document.getElementById('tradeAssetLoadBtn');
  if (btn) btn.onclick = function() {
    let symbol = document.getElementById('tradeAssetSelect').value;
    embedTradeChart(symbol, "tradeAssetChart");
    setTimeout(() => renderTradeDurationSelect(symbol), 1500);
  };
}

function renderTradeDurationSelect(symbol) {
  const container = document.getElementById('tradeDurationSection');
  if (!container) return;
  container.innerHTML = `
    <div class="tv-trade-duration mt-4">
      <label>Select Trade Duration:</label>
      <select id="tradingDuration" class="bg-gray-800 px-2 py-2 rounded text-sm">
        ${TRADE_DURATIONS.map(d=>`<option value="${d}">${d} month${d>1?'s':''}</option>`).join('')}
      </select>
      <button id="tradeDurationBtn" class="px-3 py-2 bg-gray-800 rounded text-sm ml-2">Confirm Duration</button>
    </div>
  `;
  const btn = document.getElementById('tradeDurationBtn');
  if (btn) btn.onclick = function() {
    let duration = parseInt(document.getElementById('tradingDuration').value);
    setTimeout(() => renderTradeOrderPage(symbol, duration), 500);
  };
}

function renderTradeOrderPage(symbol, duration) {
  const dyn = document.getElementById('tradeDynamicSection');
  if (!dyn) return;
  dyn.innerHTML = `
    <div class="tv-trade-order mt-4">
      <div>Asset: <b>${symbol}</b></div>
      <div>Duration: <b>${duration} month${duration>1?'s':''}</b></div>
      <button id="tradeOrderBtn" class="px-4 py-2 bg-green-500 text-white font-bold rounded">Place Order</button>
    </div>
  `;
  const btn = document.getElementById('tradeOrderBtn');
  if (btn) btn.onclick = function() {
    activateTrade(symbol, duration);
    alert("Trade activated!");
    renderTradeMainSection();
  };
}

function activateTrade(symbol, duration) {
  let state = getTradeState();
  let tradeStart = now();
  let tradeEnd = tradeStart + duration*2592000;
  let amount = state.totalBalance || 0;
  if (amount <= 0) { alert("No trade balance available"); return; }
  let returns = 0, earnings = 0;
  let trade = { symbol, duration, start: tradeStart, end: tradeEnd, amount, returns, earnings, active: true };
  state.trades.push(trade);
  state.totalBalance = 0; // all invested
  setTradeState(state);
  startTradeReturnsGenerator();
}

// Returns generator (periodic update)
function startTradeReturnsGenerator() {
  let state = getTradeState();
  let nowTs = now();
  state.trades.forEach(trade => {
    if (trade.active && nowTs < trade.end) {
      let daysPassed = Math.floor((nowTs - trade.start)/86400);
      let returns = trade.amount * Math.pow(1 + TRADE_RETURNS_RATE, daysPassed) - trade.amount;
      trade.returns = returns;
      trade.earnings = trade.amount + returns;
      if (nowTs >= trade.end) trade.active = false;
    }
  });
  state.totalReturns = state.trades.reduce((a,t)=>a+(t.returns||0),0);
  state.totalEarnings = state.trades.reduce((a,t)=>a+(t.earnings||0),0);
  setTradeState(state);
  updateBalanceDisplay();
}
setInterval(startTradeReturnsGenerator, 60000);

// initialize trading simulation if active
function initializeTradingSimulation() {
  const simulation = getLS(LS.tradingSimulation, {});
  if (simulation.isActive) {
    const activeDisplay = document.getElementById('activeTradingDisplay');
    if (activeDisplay) activeDisplay.classList.remove('hidden');
    updateTradingSimulation();
    tradingSimulationInterval = setInterval(updateTradingSimulation, 60000);
  }
}

// ---------------------------------------------------------------------
// 9) WITHDRAW / DEPOSIT / WALLET CONNECT / LOGIN / 2FA
// ---------------------------------------------------------------------
function restoreWithdrawProcessingModal() {
  let withdrawals = getLS(LS.withdraws, []);
  let ongoing = withdrawals.filter(wd => wd.status === "processing" && now() < wd.end);
  if (ongoing.length) showWithdrawProcessing(ongoing[ongoing.length - 1]);
}
function restoreWithdrawSuccessModal() {
  let withdrawals = getLS(LS.withdraws, []);
  let completed = withdrawals.filter(wd => wd.status === "completed");
  if (completed.length) showWithdrawSuccessModal(completed[completed.length - 1]);
}

// Install prompt & more menu wiring
document.getElementById('getMobileAppBtn') && (document.getElementById('getMobileAppBtn').onclick = function() { show($('#installPrompt')); });
$('#installNowBtn') && ($('#installNowBtn').onclick = function() { hide($('#installPrompt')); });
$('#maybeLaterBtn') && ($('#maybeLaterBtn').onclick = function() { hide($('#installPrompt')); });
$('#moreBtn') && $('#moreBtn').addEventListener('click', ()=> $('#moreMenu') && $('#moreMenu').classList.toggle('hidden'));
document.addEventListener('click', (e)=> {
  if (!e.target.closest('#moreBtn') && !e.target.closest('#moreMenu')) {
    const mm = $('#moreMenu'); if (mm) mm.classList.add('hidden');
  }
});

// Notifications fetcher
function handleMarketNotif() {
  if (app.notif.enabled) {
    let lastPop = getLS("autoTrade_lastNotif", 0);
    if (now() - lastPop > 43200) {
      fetch(`${COINGECKO_BASE}/status_updates?project_type=coin&per_page=1&page=1`)
        .then(r => r.json())
        .then(res => {
          if (res?.status_updates?.length) {
            let news = res.status_updates[0].description;
            if ($('#homeMarketNotif')) $('#homeMarketNotif').innerText = news;
            show($('#homeMarketNotif'));
            setTimeout(()=>hide($('#homeMarketNotif')),9000);
            localStorage.setItem("autoTrade_lastNotif", now());
          }
        }).catch(e => console.warn('notif fetch failed', e));
    }
  }
}
setInterval(handleMarketNotif, 60000);

// Wallet connect and login flows
let currentProvider = null, connectedAddr = null;

$('#connectWalletBtn') && ($('#connectWalletBtn').onclick = async function() { show($('#walletModal')); });
$('#closeWalletModal') && ($('#closeWalletModal').onclick = function() { hide($('#walletModal')); });

$('#connectMetaMask') && ($('#connectMetaMask').onclick = async function() {
  hide($('#walletModal'));
  if (window.ethereum) {
    try {
      const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
      connectedAddr = addr;
      onWalletConnected(addr);
    } catch (e) { alert("MetaMask error: " + (e.message || e)); }
  } else alert("MetaMask not detected.");
});

$('#connectWalletConnect') && ($('#connectWalletConnect').onclick = async function() {
  hide($('#walletModal'));
  let addr = prompt("Enter your Ethereum address (WalletConnect simulation):");
  if (addr && addr.length > 5) onWalletConnected(addr);
});
$('#connectTron') && ($('#connectTron').onclick = async function() {
  hide($('#walletModal'));
  if (window.tronWeb && window.tronWeb.defaultAddress?.base58) {
    connectedAddr = window.tronWeb.defaultAddress.base58;
    onWalletConnected(connectedAddr);
  } else alert("TronLink not detected.");
});
$('#manualAddress') && ($('#manualAddress').onclick = function() { show($('#manualAddressInput')); });
$('#manualConfirm') && ($('#manualConfirm').onclick = function() {
  let v = $('#manualInput').value.trim();
  if (v && v.length > 5) { hide($('#walletModal')); onWalletConnected(v); } else alert("Invalid address.");
});

function onWalletConnected(addr) {
  let map = getLS(LS.walletMap, {});
  let accId = map[addr];
  if (!accId) {
    let used = Object.values(map);
    accId = walletAccountIDs.find(id => !used.includes(id));
    if (!accId) accId = String(Math.floor(1000000000 + Math.random()*9000000000));
    map[addr] = accId;
    saveLS(LS.walletMap, map);
  }
  app.user = { address: addr, accountId: accId };
  saveLS(LS.user, app.user);
  if ($('#walletId')) $('#walletId').innerText = accId;
  if ($('#walletId2')) $('#walletId2').innerText = accId;
  if ($('#totalBalance')) $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  if ($('#totalBalance2')) $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  show($('#saveAccPopup'));
  switchPage('home');
}

// Login by ID flow
$('#loginIdBtn') && ($('#loginIdBtn').onclick = function() {
  $('#loginInput') && ($('#loginInput').value = '');
  $('#loginMsg') && ($('#loginMsg').innerText = '');
  show($('#loginModal'));
});
$('#loginConfirm') && ($('#loginConfirm').onclick = async function() {
  let v = $('#loginInput').value.trim();
  if (!v.match(/^\d{10}$/)) { $('#loginMsg').innerText = "Enter a valid 10-digit Account ID."; return; }
  $('#loginMsg').innerText = "Logging in...";
  await sleep(1500);
  let wmap = getLS(LS.walletMap, {});
  let found = Object.entries(wmap).find(([a,id])=>id===v);
  if (found) {
    app.user = { address: found[0], accountId: v };
    saveLS(LS.user, app.user);
    $('#walletId') && ($('#walletId').innerText = v);
    $('#walletId2') && ($('#walletId2').innerText = v);
    $('#loginMsg').innerText = "Success!";
    hide($('#loginModal'));
    switchPage('home');
  } else {
    $('#loginMsg').innerText = "Connect wallet to get a wallet id.";
  }
});
$('#loginModal') && ($('#loginModal').addEventListener('click', e => { if (e.target === e.currentTarget) hide($('#loginModal')); }));

// Save account popup & account modal hooks
$('#showAccountBtn') && ($('#showAccountBtn').onclick = function() {
  $('#accModalAddr') && ($('#accModalAddr').innerText = app.user?.address || "");
  $('#accModalID') && ($('#accModalID').innerText = app.user?.accountId || "");
  $('#accModalBal') && ($('#accModalBal').innerText = fmtUsd(TOTAL_BALANCE));
  hide($('#saveAccPopup')); show($('#accountModal'));
});
$('#closeSaveAccPopup') && ($('#closeSaveAccPopup').onclick = function() { hide($('#saveAccPopup')); });
$('#closeAccModal') && ($('#closeAccModal').onclick = function() { hide($('#accountModal')); });
$('#secureAccBtn') && ($('#secureAccBtn').onclick = function() { hide($('#accountModal')); showGoogleAuth(); });

// Google Auth (2FA) — graceful fallback if otplib not present
function showGoogleAuth() {
  const accId = app.user?.accountId;
  if (!accId) return;
  try {
    let secret = app.twofa[accId] || (window.otplib ? window.otplib.authenticator.generateSecret() : ('SECR' + Math.random().toString(36).slice(2,10).toUpperCase()));
    app.twofa[accId] = secret; saveLS(LS.twofa, app.twofa);
    const uri = window.otplib ? window.otplib.authenticator.keyuri(accId, "AutoTradeBot", secret) : `otpauth://totp/AutoTradeBot:${accId}?secret=${secret}&issuer=AutoTradeBot`;
    if ($('#authAccID')) $('#authAccID').innerText = accId;
    if ($('#gaSecret')) $('#gaSecret').innerText = secret;
    if (window.QRious && $('#gaQR')) new QRious({ element: $('#gaQR'), value: uri, size: 120, background: "#fff", foreground: "#000" });
    if ($('#gaCode')) $('#gaCode').value = "";
    if ($('#gaMsg')) $('#gaMsg').innerText = "";
    show($('#authModal'));
  } catch (e) { console.warn('2FA setup error', e); alert('2FA setup unavailable'); }
}
$('#gaVerifyBtn') && ($('#gaVerifyBtn').onclick = async function() {
  let code = $('#gaCode').value.trim();
  let accId = app.user?.accountId, secret = app.twofa[accId];
  if ($('#gaMsg')) $('#gaMsg').innerText = "Verifying...";
  await sleep(1500);
  try {
    if (window.otplib && window.otplib.authenticator.check(code, secret)) {
      app.twofaStatus[accId] = true; saveLS(LS.twofaStatus, app.twofaStatus); if ($('#gaMsg')) $('#gaMsg').innerText = "2FA enabled!";
    } else { if ($('#gaMsg')) $('#gaMsg').innerText = "Invalid code. Try again."; }
  } catch (e) { if ($('#gaMsg')) $('#gaMsg').innerText = "Verification failed."; }
});
$('#gaCloseBtn') && ($('#gaCloseBtn').onclick = function() { hide($('#authModal')); });

// DEPOSIT modal logic (coins cache, networks, QR)
$('#depositBtn') && ($('#depositBtn').onclick = async function() {
  if ($('#depositSearch')) $('#depositSearch').value = "";
  if (!app.coinCache.length) {
    try {
      let mkts = await fetch(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1`).then(r => r.json());
      app.coinCache = mkts.map(c => ({ id: c.id, name: c.name, symbol: c.symbol, thumb: c.image }));
    } catch(e) { console.warn('coin cache failed', e); app.coinCache = []; }
  }
  if ($('#depositCoinList')) $('#depositCoinList').innerHTML = app.coinCache.slice(0,15).map(c => `
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
  show($('#depositModal'));
}));
$('#closeDepositModal') && ($('#closeDepositModal').onclick = function() { hide($('#depositModal')); });
$('#depositSearch') && ($('#depositSearch').oninput = function() {
  let q = this.value.trim().toLowerCase();
  let coins = app.coinCache.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  if ($('#depositCoinList')) $('#depositCoinList').innerHTML = coins.slice(0,25).map(c => `
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
});
$('#depositCoinList') && ($('#depositCoinList').onclick = function(e) {
  let row = e.target.closest('.coin-row'); if (!row) return;
  $('#depositModal') && $('#depositModal').classList.add('hide');
  if ($('#depositNetList')) $('#depositNetList').innerHTML = Object.keys(depositAddresses).map(net => `
    <button class="btn btn-secondary w-full my-2 deposit-net-btn" data-net="${net}">${depositAddresses[net].label}</button>
  `).join('');
  show($('#depositNetworkModal'));
});
$('#closeDepositNetModal') && ($('#closeDepositNetModal').onclick = function() { hide($('#depositNetworkModal')); });
$('#depositNetList') && ($('#depositNetList').onclick = function(e) {
  let btn = e.target.closest('.deposit-net-btn'); if (!btn) return;
  let net = btn.dataset.net; let addr = depositAddresses[net].addr;
  if ($('#depNetLabel')) $('#depNetLabel').innerText = depositAddresses[net].label;
  if ($('#depAddrLabel')) $('#depAddrLabel').innerText = addr;
  if (window.QRious && $('#depQrCanvas')) new QRious({ element: $('#depQrCanvas'), value: addr, size: 120, background: "#fff", foreground: "#000" });
  show($('#depositAddressModal'));
});
$('#copyDepAddr') && ($('#copyDepAddr').onclick = function() { copyToClipboard($('#depAddrLabel') ? $('#depAddrLabel').innerText : ""); alert("Address copied!"); });
$('#closeDepositAddrModal') && ($('#closeDepositAddrModal').onclick = function() { hide($('#depositAddressModal')); });

// WITHDRAW flows
$('#withdrawBtn') && ($('#withdrawBtn').onclick = function() { show($('#withdrawSheet')); setLastPage('home'); });
$('#closeWithdrawSheet') && ($('#closeWithdrawSheet').onclick = function() { hide($('#withdrawSheet')); });
$('#onChainTransferBtn') && ($('#onChainTransferBtn').onclick = function() {
  hide($('#withdrawSheet'));
  $('#wdAddr') && ($('#wdAddr').value = '');
  $('#wdAmt') && ($('#wdAmt').value = '');
  $('#wdDetailMsg') && ($('#wdDetailMsg').innerText = "");
  $('#wdNetwork') && ($('#wdNetwork').value = "Ethereum");
  show($('#withdrawDetailModal'));
});
$('#fillFromWallet') && ($('#fillFromWallet').onclick = function() { if ($('#wdAddr')) $('#wdAddr').value = app.user?.address || ""; });
$('#wdMaxBtn') && ($('#wdMaxBtn').onclick = function() { if ($('#wdAmt')) $('#wdAmt').value = TOTAL_BALANCE; });
$('#closeWithdrawDetail') && ($('#closeWithdrawDetail').onclick = function() { hide($('#withdrawDetailModal')); });
$('#wdSubmitBtn') && ($('#wdSubmitBtn').onclick = function() {
  let addr = $('#wdAddr').value.trim();
  let amt = parseFloat($('#wdAmt').value);
  if (!addr || isNaN(amt) || amt <= 0) { $('#wdDetailMsg').innerText = "Enter valid address and amount"; return; }
  hide($('#withdrawDetailModal'));
  $('#wdCodeInput') && ($('#wdCodeInput').value = "");
  $('#wdCodeMsg') && ($('#wdCodeMsg').innerText = "");
  show($('#withdrawCodeModal'));
});
$('#closeWithdrawCode') && ($('#closeWithdrawCode').onclick = function() { hide($('#withdrawCodeModal')); });

$('#wdCodeSubmit') && ($('#wdCodeSubmit').onclick = async function() {
  let code = $('#wdCodeInput').value.trim();
  let addr = $('#wdAddr').value.trim(), amt = parseFloat($('#wdAmt').value), net = $('#wdNetwork').value;
  $('#wdCodeMsg') && ($('#wdCodeMsg').innerText = "Processing...");
  await sleep(1500);
  let susp = getLS(LS.withdrawSusp, {})[app.user?.accountId];
  if (susp && now() < susp.until) {
    $('#wdCodeMsg').innerText = `Withdrawals suspended for ${formatCountdown(susp.until - now())}`; return;
  }
  if (validCodes.includes(code)) {
    let wd = { address: addr, amount: amt, network: net, start: now(), end: now()+86400, status: "processing", userId: app.user?.accountId };
    let withdrawals = getLS(LS.withdraws, []); withdrawals.push(wd); saveLS(LS.withdraws, withdrawals);
    let txs = getLS(LS.transactions, []); txs.push({ type: 'withdraw', time: now(), ...wd }); saveLS(LS.transactions, txs);
    hide($('#withdrawCodeModal'));
    showWithdrawProcessing(wd);
    setLastPage('home', 'withdrawalProcessing');
    renderOngoingWithdrawals();
  } else {
    sendAttempts++;
    if (sendAttempts >= 5) {
      let suspObj = getLS(LS.withdrawSusp, {}); suspObj[app.user.accountId] = { until: now() + 172800, count: sendAttempts }; saveLS(LS.withdrawSusp, suspObj);
      $('#wdCodeMsg').innerText = "Withdrawal suspended for 48 hours.";
    } else {
      $('#wdCodeMsg').innerText = "Validation failed please enter correct code";
    }
  }
}));

function showWithdrawProcessing(wd) {
  if ($('#wpAddr')) $('#wpAddr').innerText = wd.address;
  if ($('#wpNetwork')) $('#wpNetwork').innerText = wd.network;
  if ($('#wpAmt')) $('#wpAmt').innerText = fmtUsd(wd.amount);
  function update() {
    let cd = wd.end - now();
    if ($('#wpCountdown')) $('#wpCountdown').innerText = formatCountdown(cd>0?cd:0);
    if (cd <= 0) {
      clearInterval(timer);
      let withdrawals = getLS(LS.withdraws, []);
      withdrawals = withdrawals.map(w => {
        if (w.start === wd.start && w.userId === wd.userId && w.address === wd.address) {
          w.status = "completed"; w.completedAt = now();
        }
        return w;
      });
      saveLS(LS.withdraws, withdrawals);
      if ($('#usdtPrice')) $('#usdtPrice').innerText = fmtUsd(0.0680);
      showWithdrawSuccessModal(wd);
      setLastPage('home', 'withdrawalSuccess');
      renderOngoingWithdrawals();
    }
  }
  show($('#withdrawProcessModal'));
  update();
  let timer = setInterval(update, 1000);
  $('#wpCloseBtn') && ($('#wpCloseBtn').onclick = function() { hide($('#withdrawProcessModal')); clearInterval(timer); setLastPage('home'); });
  $('#wpViewDetails') && ($('#wpViewDetails').onclick = function() { switchPage('home'); hide($('#withdrawProcessModal')); setLastPage('home', 'withdrawalProcessing'); setTimeout(renderOngoingWithdrawals, 100); });
}

function showWithdrawSuccessModal(wd) {
  if ($('#wsDetails')) $('#wsDetails').innerHTML = `<div>Address: ${wd.address}</div><div>Amount: ${fmtUsd(wd.amount)}</div><div>Network: ${wd.network}</div>`;
  show($('#withdrawSuccessModal'));
  $('#wsCloseBtn') && ($('#wsCloseBtn').onclick = function() { hide($('#withdrawSuccessModal')); setLastPage('home'); renderOngoingWithdrawals(); });
}

function renderOngoingWithdrawals() {
  const ongoing = (getLS(LS.withdraws, []) || []).filter(wd => wd.status === "processing" && now() < wd.end);
  let list = ongoing.map(wd => {
    const left = wd.end - now();
    return `
      <div class="bg-gray-800 rounded p-2 mb-2">
        <div><b>Processing Withdrawal</b></div>
        <div>Address: <span>${wd.address}</span></div>
        <div>Network: <span>${wd.network}</span></div>
        <div>Amount: <span>${fmtUsd(wd.amount)}</span></div>
        <div>Time Remaining: <span class="countdown" data-end="${wd.end}">${formatCountdown(left)}</span></div>
      </div>
    `;
  }).join('');
  if ($('#recentTx')) $('#recentTx').innerHTML = list || '<div class="text-gray-400">No transactions — demo mode.</div>';
}
function updateCountdownDisplays() {
  $all('.countdown').forEach(el => {
    const end = parseInt(el.dataset.end, 10);
    const left = end - now();
    el.innerText = formatCountdown(left>0?left:0);
  });
}
function restoreWithdrawalsUI() {
  let withdrawals = getLS(LS.withdraws, []);
  withdrawals.filter(wd => wd.status === "processing" && now() < wd.end).forEach(wd => showWithdrawProcessing(wd));
  renderOngoingWithdrawals();
}
window.addEventListener('DOMContentLoaded', restoreWithdrawalsUI);
setInterval(() => { updateCountdownDisplays(); renderOngoingWithdrawals(); }, 1000);

// Activity / transactions UI
function displayActivitySection(pageType) {
  let txs = getLS(LS.transactions, []);
  let html = txs.slice(-20).reverse().map(tx => {
    let icon = tx.type === 'swap' ? '<span class="text-blue-400">↔️</span>' : tx.type === 'withdraw' ? '<span class="text-red-400">⬇️</span>' : tx.type === 'transfer_to_trade' || tx.type === 'transfer_to_wallet' ? '<span class="text-yellow-400">⇄</span>' : '<span class="text-green-400">⬆️</span>';
    let details = tx.type === 'swap' ? `Swapped ${tx.amount} ${tx.from} → ${tx.received} ${tx.to}`
      : tx.type === 'withdraw' ? `Withdrew ${tx.amount} ${tx.network} to ${shortAddr(tx.address)}`
      : tx.type === 'transfer_to_wallet' ? `Transferred ${tx.amount} ${tx.coin} to Main Wallet`
      : tx.type === 'transfer_to_trade' ? `Transferred ${tx.amount} ${tx.coin} to Trade Account`
      : `Deposit ${tx.amount || ''}`;
    return `<div class="flex items-center justify-between border-b border-gray-800 py-2">
      <div class="text-sm">${icon} ${details}</div>
      <div class="text-xs text-gray-400">${new Date((tx.time||now())*1000).toLocaleString()}</div>
    </div>`;
  }).join('');
  if ($('#activitySection')) $('#activitySection').innerHTML = html || `<div class="text-gray-400">No recent ${pageType} activities.</div>`;
}

// ---------------------------------------------------------------------
// 10) SETTINGS, SUPPORT, NOTIFICATIONS, TRANSACTIONS SHORTCUTS
// ---------------------------------------------------------------------
$('#settingsBtn') && ($('#settingsBtn').onclick = function() { switchPage('settingsPage'); });
$('#closeAccountBtn') && ($('#closeAccountBtn').onclick = async function() {
  if (!app.twofaStatus[app.user?.accountId]) { alert("Enable 2FA first."); return; }
  alert("Deactivating..."); await sleep(1500);
  let map = getLS(LS.walletMap, {}); delete map[app.user.address]; saveLS(LS.walletMap, map);
  delLS(LS.user); app.user = null; switchPage('landingPage');
});
$('#settingsThemeBtn') && ($('#settingsThemeBtn').onclick = function(){ $('#themePanel') && $('#themePanel').classList.toggle('hidden'); });
$('#settingsNotifBtn') && ($('#settingsNotifBtn').onclick = function(){ $('#notifPanel') && $('#notifPanel').classList.toggle('hidden'); });
$('#settings2faBtn') && ($('#settings2faBtn').onclick = function(){ $('#twofaPanel') && $('#twofaPanel').classList.toggle('hidden'); });

$('#themeSelect') && ($('#themeSelect').onchange = function() {
  app.theme = this.value; saveLS(LS.theme, app.theme);
  document.body.className = app.theme === "light" ? "bg-white text-black" : "bg-black text-white";
});

$('#notifToggle') && ($('#notifToggle').onchange = function() {
  app.notif.enabled = this.checked; saveLS(LS.notif, app.notif);
  $('#notifToggleLabel') && ($('#notifToggleLabel').innerText = this.checked ? "On" : "Off");
});

$('#twofaToggle') && ($('#twofaToggle').onchange = function() {
  let status = this.checked; if (!app.user?.accountId) return alert("No user session"); app.twofaStatus[app.user.accountId] = status; saveLS(LS.twofaStatus, app.twofaStatus);
  $('#twofaToggleLabel') && ($('#twofaToggleLabel').innerText = status ? "On" : "Off");
});

// SUPPORT
$('#supportBtn') && ($('#supportBtn').onclick = function() { switchPage('supportPage'); });
$('#supportSendBtn') && ($('#supportSendBtn').onclick = function() {
  let msg = $('#supportUserMsg').value.trim(); if (!msg) return;
  let box = $('#supportChatBox'); box && (box.innerHTML += `<div class="mb-2"><b>You:</b> ${msg}</div>`);
  if ($('#supportUserMsg')) $('#supportUserMsg').value = "";
  setTimeout(()=>{ box && (box.innerHTML += `<div class="mb-2 text-yellow-400"><b>Bot:</b> Thank you for your message. Our AI assistant will reply soon.</div>`); box && (box.scrollTop = box.scrollHeight); }, 1000);
});

// NOTIF PAGE / LIST
$('#notifBtn') && ($('#notifBtn').onclick = function() { switchPage('notifPage'); });
if ($('#notifList')) $('#notifList').innerHTML = app.notifMsgs.slice(-10).map(msg => `<div>${msg}</div>`).join("");

// TRANSACTIONS / ACTIVITY SHORTCUTS
$('#transactionsBtn') && ($('#transactionsBtn').onclick = function() { switchPage('home'); renderOngoingWithdrawals(); displayActivitySection('transactions'); });
$('#activityBtn') && ($('#activityBtn').onclick = function() { switchPage('home'); renderOngoingWithdrawals(); displayActivitySection('activity'); });
$('#disconnectBtn') && ($('#disconnectBtn').onclick = async function() { alert("Disconnecting..."); await sleep(1500); delLS(LS.user); app.user = null; switchPage('landingPage'); });

// ---------------------------------------------------------------------
// 11) LANDING PAGE (favorites/search/details) and generic
// ---------------------------------------------------------------------
function landing_getFavorites() {
  try { const raw = localStorage.getItem(LS_LANDING_FAV); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function landing_saveFavorites(obj) {
  try { localStorage.setItem(LS_LANDING_FAV, JSON.stringify(obj)); } catch {}
}
function landing_toggleFavorite(coinId) {
  const fav = landing_getFavorites();
  if (fav[coinId]) delete fav[coinId];
  else fav[coinId] = Date.now();
  landing_saveFavorites(fav);
  return !!fav[coinId];
}
function landing_isFavorite(coinId) { return !!landing_getFavorites()[coinId]; }

async function landing_fetchWithTimeout(url, opts = {}, timeout = LANDING_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return response;
  } finally { clearTimeout(id); }
}
async function landing_safeJson(resp) { return resp?.json?.().catch(()=>null); }

function landing_createCoinCard(c) {
  const id = c.id || c.coin_id || c.symbol || '';
  const coinId = id;
  const div = document.createElement('div');
  div.className = 'coin-card p-2 border-b border-gray-800 flex items-center justify-between page-section';
  div.dataset.id = coinId;
  div.dataset.target = 'coinDetail';
  div.innerHTML = `
    <div class="flex items-center gap-3">
      <img src="${c.image||c.thumb||''}" width="36" height="36" class="rounded" />
      <div class="text-sm">
        <div class="font-medium">${c.name||c.id||''} <span class="text-xs text-gray-400 uppercase">(${(c.symbol||'').toUpperCase()})</span></div>
        <div class="text-xs text-gray-500">${c.market_cap ? 'Mkt: '+Math.round(c.market_cap).toLocaleString() : ''}</div>
      </div>
    </div>
    <div class="text-right">
      <div class="font-semibold">${fmtUsd(c.current_price ?? c.price ?? 0)}</div>
      <div class="text-xs ${((c.price_change_percentage_24h||0) >= 0) ? 'text-green-400' : 'text-red-400'}">${(c.price_change_percentage_24h||0).toFixed(2)}%</div>
    </div>
    <button class="fav-btn ml-3 px-2" aria-label="toggle favorite">${landing_isFavorite(coinId)?'★':'☆'}</button>
  `;
  const favBtn = div.querySelector('.fav-btn');
  favBtn && favBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const nowFav = landing_toggleFavorite(coinId);
    favBtn.textContent = nowFav ? '★' : '☆';
    const statusEl = document.querySelector('#landingStatus');
    if (statusEl) { statusEl.textContent = nowFav ? `${c.name} added to favorites` : `${c.name} removed from favorites`; setTimeout(()=>{ if (statusEl.textContent) statusEl.textContent=''; }, 2000); }
  });
  return div;
}

let landing_currentPage = 1;
let landing_perPage = LANDING_DEFAULT_PER_PAGE;
let landing_loading = false;
let landing_lastQuery = null;

async function landing_loadTopCoins({ page = 1, perPage = LANDING_DEFAULT_PER_PAGE, append = false } = {}) {
  if (landing_loading) return;
  landing_loading = true;
  const statusEl = $('#landingStatus');
  if (statusEl) statusEl.textContent = 'Loading coins...';
  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;
    const resp = await landing_fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('CoinGecko markets error');
    const coins = await landing_safeJson(resp) || [];
    const container = $('#landingCoins');
    if (!container) throw new Error('Landing coins container not found');
    if (!append) container.innerHTML = '';
    coins.forEach(c => container.appendChild(landing_createCoinCard(c)));
    landing_currentPage = page; landing_perPage = perPage; landing_lastQuery = null;
    if (statusEl) statusEl.textContent = `Loaded ${coins.length} coins`;
    app.coinCache = app.coinCache && app.coinCache.length ? app.coinCache : coins.map(cc => ({ id: cc.id, name: cc.name, symbol: cc.symbol, thumb: cc.image }));
  } catch (err) {
    console.error('landing_loadTopCoins error', err);
    if (statusEl) statusEl.textContent = 'Failed to load coins';
  } finally {
    landing_loading = false;
  }
}
async function landing_loadMore() {
  if (landing_loading) return;
  await landing_loadTopCoins({ page: landing_currentPage + 1, perPage: landing_perPage, append: true });
}
async function landing_searchCoins(query) {
  if (!query || !query.trim()) return;
  if (landing_loading) return;
  landing_loading = true;
  const statusEl = $('#landingStatus');
  if (statusEl) statusEl.textContent = `Searching for "${query}"...`;
  try {
    const q = encodeURIComponent(query.trim());
    const url = `${COINGECKO_BASE}/search?query=${q}`;
    const resp = await landing_fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Search API failed');
    const data = await landing_safeJson(resp);
    const ids = (data?.coins || []).slice(0, 12).map(c => c.id).join(',');
    if (!ids) { if (statusEl) statusEl.textContent = 'No results'; landing_loading=false; return; }
    const marketsUrl = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=12&page=1&sparkline=false`;
    const mresp = await landing_fetchWithTimeout(marketsUrl);
    if (!mresp || !mresp.ok) throw new Error('Markets API failed for search');
    const marketData = await landing_safeJson(mresp) || [];
    const container = $('#landingCoins');
    if (!container) throw new Error('Landing coins container not found');
    container.innerHTML = '';
    marketData.forEach(c => container.appendChild(landing_createCoinCard(c)));
    landing_lastQuery = query;
    if (statusEl) statusEl.textContent = `Search results for "${query}"`;
  } catch (err) {
    console.error('landing_searchCoins error', err);
    const statusEl2 = $('#landingStatus'); if (statusEl2) statusEl2.textContent = 'Search failed';
  } finally {
    landing_loading = false;
  }
}

async function landing_loadCoinDetailsAndShow(coinId) {
  const statusEl = $('#landingStatus');
  if (statusEl) statusEl.textContent = 'Loading details...';
  try {
    const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
    const resp = await landing_fetchWithTimeout(url);
    if (!resp || !resp.ok) throw new Error('Details API failed');
    const details = await landing_safeJson(resp);
    if (statusEl) statusEl.textContent = `Loaded ${details?.name || coinId}`;
    const modal = document.querySelector('#coinModal');
    if (modal) {
      const title = modal.querySelector('.modal-title'); const body = modal.querySelector('.modal-body');
      if (title) title.textContent = details.name || coinId;
      if (body) {
        body.innerHTML = `
          <div style="display:flex;gap:12px;align-items:center">
            <img src="${details.image?.small || ''}" width="48" height="48" alt="${details.symbol}">
            <div>
              <div style="font-weight:600">${details.name} (${details.symbol?.toUpperCase()})</div>
              <div>Market Cap Rank: ${details.market_cap_rank ?? '—'}</div>
            </div>
          </div>
          <hr/>
          <div>Current Price: ${fmtUsd(details.market_data?.current_price?.usd)}</div>
          <div>24h Change: ${details.market_data?.price_change_percentage_24h?.toFixed(2) ?? '—'}%</div>
          <div>Homepage: ${details.links?.homepage?.[0] ? `<a href="${details.links.homepage[0]}" target="_blank" rel="noopener">${details.links.homepage[0]}</a>` : '—'}</div>
        `;
      }
      modal.classList.add('open');
      const close = modal.querySelector('.modal-close');
      if (close) close.addEventListener('click', () => modal.classList.remove('open'), { once: true });
    } else {
      window.open(`https://www.coingecko.com/en/coins/${coinId}`, '_blank', 'noopener');
    }
  } catch (e) {
    console.error('landing_loadCoinDetails error', e);
    const statusEl2 = $('#landingStatus'); if (statusEl2) statusEl2.textContent = 'Failed to load details';
  }
}

function initLandingPage(options = {}) {
  const refreshBtn = $('#landingRefresh'); if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); if (!landing_loading) landing_loadTopCoins({ page:1, perPage: landing_perPage, append:false }); });
  const loadMoreBtn = $('#landingLoadMore'); if (loadMoreBtn) loadMoreBtn.addEventListener('click', (e) => { e.preventDefault(); if (!landing_loading) landing_loadMore(); });
  const searchForm = $('#landingSearchForm'); const searchInput = $('#landingSearchInput');
  if (searchForm && searchInput) { searchForm.addEventListener('submit', (e) => { e.preventDefault(); const q = searchInput.value || ''; if (q.trim()) landing_searchCoins(q.trim()); }); }
  landing_loadTopCoins({ page:1, perPage: landing_perPage, append:false });
}

// Generic page-section click handling
function handlePageSectionClick(e) {
  const el = e.target.closest('.page-section');
  if (!el) return;
  e.preventDefault();
  const tgt = el.dataset.target;
  const coin = el.dataset.coin || el.dataset.id || null;
  if (!tgt) return;
  if (tgt === 'wallet') { switchPage('wallet'); return; }
  if (tgt === 'login' || tgt === 'loginPage') { switchPage('loginPage'); return; }
  if (tgt === 'marketDetail' && coin) {
    if (document.getElementById('marketDetailPage')) { const p = document.getElementById('marketDetailPage'); p.dataset.coin = coin; switchPage('marketDetailPage'); }
    else if (document.getElementById('coinModal')) { landing_loadCoinDetailsAndShow(coin); }
    else window.open(`https://www.coingecko.com/en/coins/${coin}`, '_blank', 'noopener');
    return;
  }
  if (tgt === 'coinDetail' && coin) { landing_loadCoinDetailsAndShow(coin); return; }
  if (document.getElementById(tgt)) { switchPage(tgt); return; }
  if (typeof window[tgt] === 'function') { try { window[tgt](el); } catch (err) { console.warn('action handler failed', err); } }
}
document.addEventListener('click', handlePageSectionClick);

// Direct data-target button wiring
function wireDirectDataTargetButtons() {
  $all('[data-target]').forEach(btn => {
    if (btn.__wired) return; btn.__wired = true;
    btn.addEventListener('click', (e) => {
      const tgt = btn.dataset.target;
      const coin = btn.dataset.coin || null;
      e.preventDefault();
      if (!tgt) return;
      if (tgt === 'wallet') return onWalletConnected && onWalletConnected(app.user?.address || '');
      if (tgt === 'login' || tgt === 'loginPage') return switchPage('loginPage');
      if (document.getElementById(tgt)) return switchPage(tgt);
      if ((tgt === 'coinDetail' || tgt === 'marketDetail') && coin) return landing_loadCoinDetailsAndShow(coin);
      if (typeof window[tgt] === 'function') try { window[tgt](btn); } catch (e) { console.warn('action call failed', e); }
    });
  });
}
// Observe DOM to wire buttons added later
const domObserver = new MutationObserver(() => wireDirectDataTargetButtons());
domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------
// 12) INITIALIZATION (single entry point)
// ---------------------------------------------------------------------
(function init() {
  loadAppState();
  if (app.user?.accountId) {
    if ($('#walletId')) $('#walletId').innerText = app.user.accountId;
    if ($('#walletId2')) $('#walletId2').innerText = app.user.accountId;
  }
  if ($('#totalBalance')) $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  if ($('#totalBalance2')) $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  // initial loads
  loadUsdt().catch(()=>{});
  loadMarkets().catch(()=>{});
  setInterval(loadMarkets, 60000);
  setInterval(loadUsdt, 60000);
  setInterval(handleMarketNotif, 60000);
  initializeTradingView();
  wireDirectDataTargetButtons();
  // restore last page or default
  let lastPage = getLastPage(); let lastActivity = getLastPageActivity();
  if (lastPage) switchPage(lastPage, lastActivity, true);
  else if (app.user?.accountId) switchPage('home');
  else switchPage('landingPage');
  initializeTradingSimulation();
  // wire swap button if present
  if ($('#swapBtn')) $('#swapBtn').onclick = () => typeof loadSwapPage === 'function' ? loadSwapPage() : null;
})();
