// ======= autotrade-app.js =======
// Merged and fully updated JavaScript for Auto-Trading app
// Features included: markets, wallet, deposit, withdraw, trading (MT5 dashboard + simulation),
// swap (CoinGecko coin list, rates, Uniswap-like swap simulation), transfer from swap to wallet/trade,
// transactions & activity, settings, notifications, support, account & 2FA handling.
// NOTE: This file expects corresponding HTML elements with IDs referenced below to exist.


// ======= CONSTANTS =======
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
  "483921", "175064", "902718", "634285", "217509", "856430",
  "490127", "731694", "562803", "308417", "941256", "128374",
  "675820", "203519", "487960", "819432", "356701", "740528",
  "612947", "098135", "573864", "284691", "160738", "495260",
  "837514", "021693", "658407", "794135", "320586", "946172"
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

// ========== STORAGE KEYS ==========
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

// ========== UTILS ==========
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function fmtUsd(n) { return typeof n === 'number' ? n.toLocaleString('en-US', {style:'currency',currency:'USD'}) : n; }
function shortAddr(addr) {
  if (!addr || typeof addr !== 'string') return "";
  if (addr.startsWith('0x') && addr.length > 10)
    return addr.slice(0,6) + "..." + addr.slice(-4);
  if (addr.length > 12) return addr.slice(0,5)+"..."+addr.slice(-4);
  return addr;
}
function now() { return Math.floor(Date.now()/1000); }
function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getLS(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function delLS(key) { localStorage.removeItem(key); }
function show(el) { if (el) el.classList.remove('hide'); }
function hide(el) { if (el) el.classList.add('hide'); }
function copyToClipboard(txt) { if (navigator.clipboard) navigator.clipboard.writeText(txt); }
function daysBetween(a,b) { return Math.ceil((b-a)/86400); }
function formatCountdown(s) {
  let d = Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), sec=(s%60);
  return `${d>0?d+"d ":""}${h}h ${m}m ${sec}s`;
}
function setLastPage(page, activity = "") {
  saveLS(PAGE_STATE_KEY, page);
  saveLS(PAGE_STATE_ACTIVITY_KEY, activity);
}
function getLastPage() { return getLS(PAGE_STATE_KEY, null); }
function getLastPageActivity() { return getLS(PAGE_STATE_ACTIVITY_KEY, null); }

// ========== APP STATE ==========
let app = {
  user: null,
  walletMap: {},
  transactions: [],
  withdrawals: [],
  withdrawSusp: {},
  tradePositions: [],
  notif: {enabled:false},
  notifMsgs: [],
  twofa: {},
  twofaStatus: {},
  coinCache: [],
  marketTop: [],
  swap: { from: "tether", to: "bitcoin", amount: 0, rate: 0, coins: [], coinMap: {} },
  theme: "dark",
  isLoading: false
};
// Load all persistent state
function loadAppState() {
  app.user = getLS(LS.user,null);
  app.walletMap = getLS(LS.walletMap,{});
  app.transactions = getLS(LS.transactions,[]);
  app.withdrawals = getLS(LS.withdraws,[]);
  app.withdrawSusp = getLS(LS.withdrawSusp,{});
  app.tradePositions = getLS(LS.tradePositions,[]);
  app.notif = getLS(LS.notif,{enabled:false});
  app.notifMsgs = getLS(LS.notifMsgs,[]);
  app.twofa = getLS(LS.twofa,{});
  app.twofaStatus = getLS(LS.twofaStatus,{});
  app.theme = getLS(LS.theme,"dark");
}

// ========== PAGE NAV ==========
function switchPage(pageId, activityState = null, skipPersist = false) {
  $all('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');
  if (!skipPersist) setLastPage(pageId, activityState || "");
  if (pageId === 'markets') loadMarkets();
  if (pageId === 'home') createTV('tvchart','BINANCE:BTCUSDT');
  if (pageId === 'trade') {
    initializeTradingView(); renderTradeMainSection(); setupTradeButtons();
  }
  if (pageId === 'futures') createTV('futuresChart','BINANCE:BTCUSDT');
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
$all('.tab').forEach(t=>t.addEventListener('click',()=>{
  const tgt=t.dataset.target; if (tgt) switchPage(tgt);
  $all('.tab').forEach(x=>x.classList.remove('tab-active','opacity-100'));
  t.classList.add('tab-active');
}));

// ========== MARKETS ==========
async function loadMarkets() {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h';
    const res = await fetch(url); const data = await res.json();
    app.marketTop = data;
    if ($('#topCoinsList')) {
      $('#topCoinsList').innerHTML = data.slice(0,8).map(c=>`
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
      $('#marketsList').innerHTML = data.map(c=>`
        <div class="flex items-center justify-between p-2 border-b border-gray-800" data-coin="${c.id}">
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
    const sorted = data.slice().sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0));
    if ($('#gainers')) {
      $('#gainers').innerHTML = sorted.slice(0,4).map(c=>`
        <div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-green-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
    }
    if ($('#losers')) {
      $('#losers').innerHTML = sorted.slice(-4).reverse().map(c=>`
        <div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-red-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
    }
  } catch(e){console.warn('markets failed',e);}
}

// ========== USDT / WALLET ==========
async function loadUsdt() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/tether');
    const data = await res.json();
    if ($('#usdtLogo')) $('#usdtLogo').src = data.image.thumb;
    const market = await (await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether')).json();
    if (market && market[0] && $('#usdtPrice')) $('#usdtPrice').innerText = fmtUsd(market[0].current_price);
    if ($('#walletHoldings')) $('#walletHoldings').innerHTML = `<div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img src="${data.image.thumb}" class="w-6 h-6 rounded" />
        <div>
          <div class="font-medium">Tether USD (USDT)</div>
          <div class="text-xs text-gray-400">Balance</div>
        </div>
      </div>
      <div class="text-right font-semibold">${fmtUsd(TOTAL_BALANCE)}</div>
    </div>`;
  } catch(e){console.warn('usdt failed',e);}
}

// ========== TRADINGVIEW CHARTS ==========
function createTV(containerId, symbol='BINANCE:BTCUSDT') {
  const container = document.getElementById(containerId); if (container) container.innerHTML = '';
  if (typeof window.TradingView === 'undefined') return null;
  return new window.TradingView.widget({
    container_id: containerId,
    width: '100%',
    height: container?.clientHeight || 320,
    symbol,
    interval: '60',
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'en',
    toolbar_bg: '#0b0f14',
    enable_publishing: false,
    withdateranges: true,
    allow_symbol_change: true
  });
}

// ========== SWAP (CoinGecko + simulated Uniswap) ==========
async function loadSwapPage() {
  switchPage('SwapPage');
  // load coin list from CoinGecko A-Z if not cached
  if (!app.swap.coins.length) {
    try {
      let coins = await fetch('https://api.coingecko.com/api/v3/coins/list').then(r=>r.json());
      coins.sort((a,b)=>a.name.localeCompare(b.name));
      app.swap.coins = coins;
      app.swap.coinMap = {};
      coins.forEach(c=>app.swap.coinMap[c.id] = c);
    } catch(e) {
      console.warn("Failed to load coin list", e);
      app.swap.coins = [];
    }
  }
  // Populate selects if present
  const coinOptions = app.swap.coins.map(c=>`<option value="${c.id}">${c.name} (${c.symbol.toUpperCase()})</option>`).join('');
  if ($('#swapFromCoin')) $('#swapFromCoin').innerHTML = coinOptions;
  if ($('#swapToCoin')) $('#swapToCoin').innerHTML = coinOptions;
  if ($('#swapFromCoin')) $('#swapFromCoin').value = app.swap.from || "tether";
  if ($('#swapToCoin')) $('#swapToCoin').value = app.swap.to || "bitcoin";
  if ($('#swapAmount')) $('#swapAmount').value = app.swap.amount || "";
  if ($('#swapRate')) $('#swapRate').innerText = "";
  await loadSwapRate();

  // wire up controls (defensive)
  if ($('#swapSwitchBtn')) $('#swapSwitchBtn').onclick = function() {
    const f = $('#swapFromCoin').value, t = $('#swapToCoin').value;
    $('#swapFromCoin').value = t; $('#swapToCoin').value = f; loadSwapRate();
  };
  if ($('#swapFromCoin')) $('#swapFromCoin').onchange = loadSwapRate;
  if ($('#swapToCoin')) $('#swapToCoin').onchange = loadSwapRate;
  if ($('#swapAmount')) $('#swapAmount').oninput = loadSwapRate;

  // perform swap (simulated using CoinGecko prices)
  if ($('#swapBtnSwapPage')) {
    $('#swapBtnSwapPage').onclick = async function() {
      const fromId = $('#swapFromCoin').value, toId = $('#swapToCoin').value;
      const amount = parseFloat($('#swapAmount').value);
      if (!fromId || !toId || !amount || amount <= 0) { alert("Enter valid amount and coins."); return; }
      try {
        const prices = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${toId}&vs_currencies=usd`).then(r=>r.json());
        if (!prices[fromId] || !prices[toId]) { alert("Rate unavailable"); return; }
        const rate = prices[toId].usd / prices[fromId].usd;
        const received = amount * rate;
        app.swap.rate = rate;
        app.swap.amount = amount;
        app.swap.from = fromId;
        app.swap.to = toId;
        $('#swapRate').innerText = `Rate: 1 ${app.swap.coinMap[fromId]?.symbol?.toUpperCase() || fromId} ≈ ${rate.toFixed(6)} ${app.swap.coinMap[toId]?.symbol?.toUpperCase() || toId}`;
        const tx = { type: 'swap', from: fromId, to: toId, amount, received, time: now() };
        app.transactions.push(tx);
        saveLS(LS.transactions, app.transactions);
        if ($('#swapResult')) $('#swapResult').innerHTML = `<div class="text-sm">Swapped ${amount} ${app.swap.coinMap[fromId]?.symbol?.toUpperCase() || fromId} → ${received.toFixed(6)} ${app.swap.coinMap[toId]?.symbol?.toUpperCase() || toId}</div>`;
        displayActivitySection('swap');
      } catch (e) {
        console.warn('swap failed', e);
        alert('Swap failed');
      }
    };
  }

  // Transfer dropdown toggles & actions
  if ($('#swapTransferBtn')) {
    $('#swapTransferBtn').onclick = function() {
      const dd = $('#swapTransferDropdown');
      if (dd) dd.classList.toggle('hidden');
    };
  }
  if ($('#swapTransferToWallet')) {
    $('#swapTransferToWallet').onclick = async function() {
      const coinId = $('#swapToCoin').value;
      const amt = $('#swapAmount').value;
      if (!coinId || !amt) return alert('No coin/amount to transfer');
      try {
        const cgData = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`).then(r=>r.json());
        showWalletPageWithCoin(cgData.name, cgData.image.thumb, amt);
        // record transaction for transfer
        const tx = { type: 'transfer_to_wallet', coin: coinId, amount: amt, time: now() };
        app.transactions.push(tx); saveLS(LS.transactions, app.transactions);
        displayActivitySection('transfers');
      } catch(e) { console.warn(e); alert('Transfer failed'); }
    };
  }
  if ($('#swapTransferToTrade')) {
    $('#swapTransferToTrade').onclick = async function() {
      const coinId = $('#swapToCoin').value;
      const amt = $('#swapAmount').value;
      if (!coinId || !amt) return alert('No coin/amount to transfer');
      try {
        const cgData = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`).then(r=>r.json());
        // update trade assets display
        showTradePageAsset(cgData.name, cgData.image.thumb, amt);
        // record transaction
        const tx = { type: 'transfer_to_trade', coin: coinId, amount: amt, time: now() };
        app.transactions.push(tx); saveLS(LS.transactions, app.transactions);
        displayActivitySection('transfers');
      } catch(e){ console.warn(e); alert('Transfer failed'); }
    };
  }
}

async function loadSwapRate() {
  const fromId = $('#swapFromCoin') ? $('#swapFromCoin').value : null;
  const toId = $('#swapToCoin') ? $('#swapToCoin').value : null;
  const amount = $('#swapAmount') ? parseFloat($('#swapAmount').value) : NaN;
  if (!fromId || !toId || !amount || amount <= 0) { if ($('#swapRate')) $('#swapRate').innerText = ""; return; }
  try {
    const prices = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${toId}&vs_currencies=usd`).then(r=>r.json());
    if (!prices[fromId] || !prices[toId]) { if ($('#swapRate')) $('#swapRate').innerText = "Rate not available"; return; }
    const rate = prices[toId].usd / prices[fromId].usd;
    app.swap.rate = rate;
    if ($('#swapRate')) $('#swapRate').innerText = `Rate: 1 ${app.swap.coinMap[fromId]?.symbol?.toUpperCase() || fromId} ≈ ${rate.toFixed(6)} ${app.swap.coinMap[toId]?.symbol?.toUpperCase() || toId}`;
  } catch(e) {
    console.warn('loadSwapRate error', e);
    if ($('#swapRate')) $('#swapRate').innerText = "Rate unavailable";
  }
}

// Helpers to show asset in wallet/trade pages
function showWalletPageWithCoin(name, logo, amount) {
  switchPage('wallet');
  if ($('#walletAssetSection')) $('#walletAssetSection').innerHTML = `<div class="flex items-center gap-2"><img src="${logo}" class="w-6 h-6 rounded"/><div class="ml-1"><div class="font-medium">${name}</div><div class="text-xs text-gray-400">${amount}</div></div></div>`;
}
function showTradePageAsset(name, logo, amount) {
  switchPage('trade');
  if ($('#tradeAssetSection')) $('#tradeAssetSection').innerHTML = `<div class="flex items-center gap-2"><img src="${logo}" class="w-6 h-6 rounded"/><div class="ml-1"><div class="font-medium">${name}</div><div class="text-xs text-gray-400">${amount}</div></div></div>`;
}

// ========== TRADE: MT5 Dashboard + Simulation ==========
const TRADE_RETURNS_RATE = 0.1195; // 11.95% daily
const TRADE_DURATIONS = [1,2,3,4,5,6,7,8,9,10,11,12];
const TRADE_STATE_KEY = "autoTrade_tradeState";
const MAIN_PORTFOLIO_KEY = "autoTrade_mainPortfolio";

function getTradeState() {
  return getLS(TRADE_STATE_KEY, {
    trades: [],
    totalBalance: 5000,
    totalEarnings: 0,
    totalReturns: 0,
    lastSymbol: "BINANCE:BTCUSDT"
  });
}
function setTradeState(state) { saveLS(TRADE_STATE_KEY, state); }
function getMainPortfolio() { return getLS(MAIN_PORTFOLIO_KEY, { totalPortfolio: 8250.78 }); }
function setMainPortfolio(state) { saveLS(MAIN_PORTFOLIO_KEY, state); }

// TradingView initialization (defensive)
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
    console.error('TradingView initialization failed:', error);
    container.innerHTML = '<div class="flex items-center justify-center h-full text-muted-foreground">Chart loading...</div>';
  }
}
function embedTradeChart(symbol, containerId = "tradeChart") {
  if (typeof TradingView === 'undefined') return;
  let el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = '';
  let tvWidget = document.createElement('div');
  tvWidget.id = `tvChartEmbed_${containerId}`;
  tvWidget.style = "height:340px;";
  el.appendChild(tvWidget);
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
  updateBalanceDisplay();
  showTradingToast(`$${tradingSimulationData.initialAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} transferred to trading account`);
}

function showTradingToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 bg-accent text-accent-foreground px-4 py-2 rounded-lg shadow-lg z-[2000] transition-all duration-300';
  toast.textContent = message;
  toast.style.transform = 'translateX(400px)';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.transform = 'translateX(0)'; }, 10);
  setTimeout(() => { toast.style.transform = 'translateX(400px)'; setTimeout(() => { if (toast.parentNode) { toast.parentNode.removeChild(toast); } }, 300); }, 3000);
}

// MT5 Dashboard
function renderMT5Dashboard() {
  let state = getTradeState();
  let totalInvested = state.trades.reduce((a, t) => t.active ? a + (t.amount||0) : a, 0);
  let balance = (state.totalBalance || 0) + (state.totalEarnings || 0);
  let equity = balance + (state.totalReturns || 0);
  let freeMargin = balance - totalInvested;
  if ($('#mt5DashboardSection')) {
    $('#mt5DashboardSection').innerHTML = `
      <div class="mt5-dashboard bg-gray-900 p-4 rounded-lg mb-4">
        <div class="flex justify-between mb-2">
          <div class="font-bold">Balance</div>
          <div class="font-mono">${fmtUsd(balance)}</div>
        </div>
        <div class="flex justify-between mb-2">
          <div class="font-bold">Equity</div>
          <div class="font-mono">${fmtUsd(equity)}</div>
        </div>
        <div class="flex justify-between mb-2">
          <div class="font-bold">Free Margin</div>
          <div class="font-mono">${fmtUsd(freeMargin)}</div>
        </div>
      </div>
    `;
  }
}

// Balance UI update
function updateBalanceDisplay() {
  let state = getTradeState();
  if ($('#tradeTotalBalance')) $('#tradeTotalBalance').textContent = fmtUsd(state.totalBalance);
  if ($('#tradeTotalEarnings')) $('#tradeTotalEarnings').textContent = fmtUsd(state.totalEarnings);
  if ($('#tradeTotalReturns')) $('#tradeTotalReturns').textContent = fmtUsd(state.totalReturns);
  renderMT5Dashboard();
  const mainPortfolio = getMainPortfolio();
  if (document.getElementById('mainPortfolioBalance')) document.getElementById('mainPortfolioBalance').textContent = fmtUsd(mainPortfolio.totalPortfolio);
}

// Trade main rendering
function renderTradeMainSection() {
  let state = getTradeState();
  usdtAmount = state.totalBalance;
  updateBalanceDisplay();
  renderActiveTrades();
  if (state.lastSymbol) embedTradeChart(state.lastSymbol);
  document.getElementById('tradeMainSection') && (document.getElementById('tradeMainSection').style.display = '');
  document.getElementById('tradeDynamicSection') && (document.getElementById('tradeDynamicSection').style.display = 'none');
  renderMT5Dashboard();
}

function renderActiveTrades() {
  let state = getTradeState();
  let nowTs = now();
  let html = state.trades.length ?
    state.trades.map((t,i) => {
      let left = Math.max(0, t.end-nowTs);
      return `<div class="bg-gray-800 rounded p-2 mb-2">
        <div>Asset: ${t.symbol}</div>
        <div>Duration: ${t.duration} month(s) (${formatCountdown(left)})</div>
        <div>Status: ${left>0?"Active":"Completed"}</div>
        <div>Returns: ${fmtUsd(t.returns)}</div>
        <div>Earnings: ${fmtUsd(t.earnings)}</div>
      </div>`;
    }).join('')
    : '<div class="text-gray-400">No active trades</div>';
  if ($('#tradeActiveTradesList')) $('#tradeActiveTradesList').innerHTML = html;
}

// Trade UI wiring
function setupTradeButtons() {
  if ($('#loadSymbol')) $('#loadSymbol').onclick = function() {
    let symbol = document.getElementById('tradeSymbol').value;
    let state = getTradeState();
    state.lastSymbol = symbol;
    setTradeState(state);
    embedTradeChart(symbol);
  };
  if ($('#placeTradeBtn')) $('#placeTradeBtn').onclick = function() {
    let state = getTradeState();
    if (state.totalBalance < 100) return alert("You need at least $100 in your trade balance to place a trade.");
    renderPlaceTradeAssetPage();
  };
  if ($('#viewEarningsBtn')) $('#viewEarningsBtn').onclick = function() { renderEarningsPage(); };
  if ($('#convertBtn')) $('#convertBtn').onclick = function() { 
    // convert flow updated below; if HTML provides convert inputs, use the other handler which overrides.
    alert("Convert flow demo");
  };
  if ($('#placeOrderBtn')) $('#placeOrderBtn').onclick = function() {
    let state = getTradeState();
    if (state.totalBalance < 100) return alert("You need at least $100 in your trade balance to place a trade.");
    renderPlaceTradeAssetPage();
  };
  // Footer Buttons
  if ($('#tvTradeBtn')) $('#tvTradeBtn').onclick = function() { renderTradeMainSection(); };
  if ($('#tvEarningsBtn')) $('#tvEarningsBtn').onclick = function() { renderEarningsPage(); };
  if ($('#tvPortfolioBtn')) $('#tvPortfolioBtn').onclick = function() { switchPage('home'); };
  if ($('#tvDepositBtn')) $('#tvDepositBtn').onclick = function() { switchPage('depositPage'); };
  if ($('#tvTransferBtn')) $('#tvTransferBtn').onclick = function() { renderTransferPage(); };
  // Header Buttons
  if ($('#tvNotifBtn')) $('#tvNotifBtn').onclick = function() { switchPage('notifPage'); };
  if ($('#tvSettingsBtn')) $('#tvSettingsBtn').onclick = function() { switchPage('settingsPage'); };
  if ($('#tvBackBtn')) $('#tvBackBtn').onclick = function() { goBackPage(); };
}

// Place trade selection
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

// Activate trade (uses all available trade balance unless overwritten)
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

// Earnings page
function renderEarningsPage() {
  let state = getTradeState();
  const dyn = document.getElementById('tradeDynamicSection');
  if (!dyn) return;
  document.getElementById('tradeMainSection') && (document.getElementById('tradeMainSection').style.display = 'none');
  dyn.style.display = '';
  dyn.innerHTML = `
    <div class="tv-earnings">
      <div class="font-bold text-lg mb-2">Total Earnings: <span id="earningsTotalVal">${fmtUsd(state.totalEarnings)}</span></div>
      <div id="tvEarningsChart" style="height:350px;"></div>
      <button id="tvTransferBtnEarnings" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mt-3">Transfer</button>
      <button id="earningsBackBtn" class="px-4 py-2 bg-gray-800 text-white font-bold rounded mt-3">Back</button>
    </div>
  `;
  embedTradeChart(state.lastSymbol, "tvEarningsChart");
  const tvTransfer = document.getElementById('tvTransferBtnEarnings');
  const back = document.getElementById('earningsBackBtn');
  if (tvTransfer) tvTransfer.onclick = () => renderTransferPage();
  if (back) back.onclick = () => renderTradeMainSection();
}

// Transfer page
function renderTransferPage() {
  const dyn = document.getElementById('tradeDynamicSection');
  if (!dyn) return;
  document.getElementById('tradeMainSection') && (document.getElementById('tradeMainSection').style.display = 'none');
  dyn.style.display = '';
  dyn.innerHTML = `
    <div class="tv-transfer p-4">
      <label>Enter amount:</label>
      <input id="transferAmountInput" class="input-black-text border border-gray-800 px-3 py-2 rounded text-sm mb-2" type="number" />
      <div class="mt-2 mb-2">
        <button id="switchTransferBtn" class="px-3 py-2 bg-gray-800 rounded">Switch</button>
        <span id="transferToLabel" class="ml-2">Transfer to Main Wallet</span>
      </div>
      <button id="transferConfirmBtn" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mt-2">Transfer</button>
      <button id="transferBackBtn" class="px-4 py-2 bg-gray-800 text-white font-bold rounded mt-3">Back</button>
      <div id="transferMsg" class="mt-3"></div>
    </div>
  `;
  let transferTo = "main";
  const switchBtn = document.getElementById('switchTransferBtn');
  if (switchBtn) switchBtn.onclick = function() {
    transferTo = transferTo === "main" ? "trade" : "main";
    const lbl = document.getElementById('transferToLabel');
    if (lbl) lbl.innerText = transferTo === "main" ? "Transfer to Main Wallet" : "Transfer to Trade Account";
  };
  const confirm = document.getElementById('transferConfirmBtn');
  if (confirm) confirm.onclick = async function() {
    const amt = parseFloat(document.getElementById('transferAmountInput').value);
    const msgEl = document.getElementById('transferMsg');
    if (isNaN(amt) || amt <= 0) { if (msgEl) msgEl.innerText = "Enter valid amount."; return; }
    if (msgEl) msgEl.innerText = "Processing...";
    await sleep(1500);
    let state = getTradeState();
    let main = getMainPortfolio();
    if (transferTo === "main") {
      if (amt > state.totalBalance) { if (msgEl) msgEl.innerText = "Insufficient trade balance"; return; }
      state.totalBalance -= amt;
      main.totalPortfolio = (main.totalPortfolio||0) + amt;
      setMainPortfolio(main);
      if (msgEl) msgEl.innerText = "Transferred to Main Wallet!";
    } else {
      if (amt > main.totalPortfolio) { if (msgEl) msgEl.innerText = "Insufficient main wallet balance"; return; }
      state.totalBalance = (state.totalBalance||0) + amt;
      main.totalPortfolio -= amt;
      setMainPortfolio(main);
      if (msgEl) msgEl.innerText = "Transferred to Trade Account!";
    }
    setTradeState(state);
    renderTradeMainSection();
  };
  const back = document.getElementById('transferBackBtn');
  if (back) back.onclick = () => renderTradeMainSection();
}

// Returns generator
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

// ========== WITHDRAW & DEPOSIT RESTORE ==========
function restoreWithdrawProcessingModal() {
  let withdrawals = getLS(LS.withdraws, []);
  let ongoing = withdrawals.filter(wd=>wd.status==="processing" && now()<wd.end);
  if (ongoing.length) showWithdrawProcessing(ongoing[ongoing.length-1]);
}
function restoreWithdrawSuccessModal() {
  let withdrawals = getLS(LS.withdraws, []);
  let completed = withdrawals.filter(wd=>wd.status==="completed");
  if (completed.length) showWithdrawSuccessModal(completed[completed.length-1]);
}

// ========== INSTALL PROMPT & MORE MENU ==========
document.getElementById('getMobileAppBtn') && (document.getElementById('getMobileAppBtn').onclick = function() { show($('#installPrompt')); });
$('#installNowBtn') && ($('#installNowBtn').onclick = function() { hide($('#installPrompt')); });
$('#maybeLaterBtn') && ($('#maybeLaterBtn').onclick = function() { hide($('#installPrompt')); });
$('#moreBtn') && $('#moreBtn').addEventListener('click', ()=> $('#moreMenu') && $('#moreMenu').classList.toggle('hidden'));
document.addEventListener('click', (e)=> {
  if (!e.target.closest('#moreBtn') && !e.target.closest('#moreMenu')) {
    const mm = $('#moreMenu'); if (mm) mm.classList.add('hidden');
  }
});

// ========== NOTIFICATIONS ==========
function handleMarketNotif() {
  if (app.notif.enabled) {
    let lastPop = getLS("autoTrade_lastNotif",0);
    if (now()-lastPop > 43200) {
      fetch('https://api.coingecko.com/api/v3/status_updates?project_type=coin&per_page=1&page=1')
      .then(r=>r.json()).then(res=>{
        if (res?.status_updates?.length) {
          let news = res.status_updates[0].description;
          if ($('#homeMarketNotif')) $('#homeMarketNotif').innerText = news;
          show($('#homeMarketNotif'));
          setTimeout(()=>hide($('#homeMarketNotif')),9000);
          localStorage.setItem("autoTrade_lastNotif",now());
        }
      }).catch(e=>console.warn('notif fetch failed', e));
    }
  }
}
setInterval(handleMarketNotif, 60000);

// ========== WALLET CONNECT ==========
let currentProvider = null, connectedAddr = null;
$('#connectWalletBtn') && ($('#connectWalletBtn').onclick = async function() { show($('#walletModal')); });
$('#closeWalletModal') && ($('#closeWalletModal').onclick = function() { hide($('#walletModal')); });
$('#connectMetaMask') && ($('#connectMetaMask').onclick = async function() {
  hide($('#walletModal'));
  if (window.ethereum) {
    try {
      const [addr] = await window.ethereum.request({method:"eth_requestAccounts"});
      connectedAddr = addr; onWalletConnected(addr);
    } catch(e){alert("MetaMask error: "+(e.message||e));}
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
    connectedAddr = window.tronWeb.defaultAddress.base58; onWalletConnected(connectedAddr);
  } else alert("TronLink not detected.");
});
$('#manualAddress') && ($('#manualAddress').onclick = function() { show($('#manualAddressInput')); });
$('#manualConfirm') && ($('#manualConfirm').onclick = function() {
  let v = $('#manualInput').value.trim();
  if (v && v.length > 5) { hide($('#walletModal')); onWalletConnected(v); } else alert("Invalid address.");
});

function onWalletConnected(addr) {
  let map = getLS(LS.walletMap,{});
  let accId = map[addr];
  if (!accId) {
    let used = Object.values(map);
    accId = walletAccountIDs.find(id=>!used.includes(id));
    if (!accId) accId = String(Math.floor(1000000000+Math.random()*9000000000));
    map[addr] = accId;
    saveLS(LS.walletMap,map);
  }
  app.user = {address: addr, accountId: accId};
  saveLS(LS.user, app.user);
  if ($('#walletId')) $('#walletId').innerText = accId;
  if ($('#walletId2')) $('#walletId2').innerText = accId;
  if ($('#totalBalance')) $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  if ($('#totalBalance2')) $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  show($('#saveAccPopup'));
  switchPage('home');
}

// ========== LOGIN ID PAGE ==========
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
  let wmap = getLS(LS.walletMap,{});
  let found = Object.entries(wmap).find(([a,id])=>id===v);
  if (found) {
    app.user = {address: found[0], accountId: v};
    saveLS(LS.user, app.user);
    if ($('#walletId')) $('#walletId').innerText = v;
    if ($('#walletId2')) $('#walletId2').innerText = v;
    $('#loginMsg').innerText = "Success!";
    hide($('#loginModal'));
    switchPage('home');
  } else {
    $('#loginMsg').innerText = "Connect wallet to get a wallet id.";
  }
});
$('#loginModal') && $('#loginModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) hide($('#loginModal')); });

// ========== SAVE ACCOUNT POPUP ==========
$('#showAccountBtn') && ($('#showAccountBtn').onclick = function() {
  if ($('#accModalAddr')) $('#accModalAddr').innerText = app.user?.address||"";
  if ($('#accModalID')) $('#accModalID').innerText = app.user?.accountId||"";
  if ($('#accModalBal')) $('#accModalBal').innerText = fmtUsd(TOTAL_BALANCE);
  hide($('#saveAccPopup')); show($('#accountModal'));
});
$('#closeSaveAccPopup') && ($('#closeSaveAccPopup').onclick = function() { hide($('#saveAccPopup')); });

// ========== ACCOUNT MODAL ==========
$('#closeAccModal') && ($('#closeAccModal').onclick = function() { hide($('#accountModal')); });
$('#secureAccBtn') && ($('#secureAccBtn').onclick = function() { hide($('#accountModal')); showGoogleAuth(); });

// ========== GOOGLE AUTH (2FA) ==========
function showGoogleAuth() {
  const accId = app.user?.accountId;
  if (!accId) return;
  try {
    let secret = app.twofa[accId] || window.otplib.authenticator.generateSecret();
    app.twofa[accId] = secret; saveLS(LS.twofa, app.twofa);
    const uri = window.otplib.authenticator.keyuri(accId, "AutoTradeBot", secret);
    if ($('#authAccID')) $('#authAccID').innerText = accId;
    if ($('#gaSecret')) $('#gaSecret').innerText = secret;
    new QRious({element:$('#gaQR'), value:uri, size:120, background:"#fff", foreground:"#000"});
    if ($('#gaCode')) $('#gaCode').value = "";
    if ($('#gaMsg')) $('#gaMsg').innerText = "";
    show($('#authModal'));
  } catch (e) {
    console.warn('2FA setup error', e);
    alert('2FA setup unavailable');
  }
}
$('#gaVerifyBtn') && ($('#gaVerifyBtn').onclick = async function() {
  let code = $('#gaCode').value.trim();
  let accId = app.user?.accountId, secret = app.twofa[accId];
  if ($('#gaMsg')) $('#gaMsg').innerText = "Verifying...";
  await sleep(1500);
  try {
    if (window.otplib.authenticator.check(code,secret)) {
      app.twofaStatus[accId] = true; saveLS(LS.twofaStatus, app.twofaStatus); if ($('#gaMsg')) $('#gaMsg').innerText = "2FA enabled!";
    } else { if ($('#gaMsg')) $('#gaMsg').innerText = "Invalid code. Try again."; }
  } catch(e) { if ($('#gaMsg')) $('#gaMsg').innerText = "Verification failed."; }
});
$('#gaCloseBtn') && ($('#gaCloseBtn').onclick = function() { hide($('#authModal')); });

// ========== DEPOSIT ==========
$('#depositBtn') && ($('#depositBtn').onclick = async function() {
  if ($('#depositSearch')) $('#depositSearch').value = "";
  if (!app.coinCache.length) {
    try {
      let coins = await fetch('https://api.coingecko.com/api/v3/coins/list').then(r=>r.json());
      let mkts = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1').then(r=>r.json());
      app.coinCache = mkts.map(c=>({id:c.id,name:c.name,symbol:c.symbol,thumb:c.image}));
    } catch(e) { console.warn('coin cache failed', e); app.coinCache = []; }
  }
  if ($('#depositCoinList')) $('#depositCoinList').innerHTML = app.coinCache.slice(0,15).map(c=>`
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
  show($('#depositModal'));
}));
$('#closeDepositModal') && ($('#closeDepositModal').onclick = function() { hide($('#depositModal')); });
$('#depositSearch') && ($('#depositSearch').oninput = function() {
  let q=this.value.trim().toLowerCase();
  let coins=app.coinCache.filter(c=>c.name.toLowerCase().includes(q)||c.symbol.includes(q));
  if ($('#depositCoinList')) $('#depositCoinList').innerHTML = coins.slice(0,25).map(c=>`
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
});
$('#depositCoinList') && ($('#depositCoinList').onclick = function(e) {
  let row = e.target.closest('.coin-row'); if (!row) return;
  $('#depositModal') && $('#depositModal').classList.add('hide');
  if ($('#depositNetList')) $('#depositNetList').innerHTML = Object.keys(depositAddresses).map(net=>`
    <button class="btn btn-secondary w-full my-2 deposit-net-btn" data-net="${net}">${depositAddresses[net].label}</button>
  `).join('');
  show($('#depositNetworkModal'));
});
$('#closeDepositNetModal') && ($('#closeDepositNetModal').onclick = function() { hide($('#depositNetworkModal')); });
$('#depositNetList') && ($('#depositNetList').onclick = function(e) {
  let btn = e.target.closest('.deposit-net-btn');
  if (!btn) return;
  let net = btn.dataset.net;
  let addr = depositAddresses[net].addr;
  if ($('#depNetLabel')) $('#depNetLabel').innerText = depositAddresses[net].label;
  if ($('#depAddrLabel')) $('#depAddrLabel').innerText = addr;
  new QRious({element:$('#depQrCanvas'), value:addr, size:120, background:"#fff", foreground:"#000"});
  show($('#depositAddressModal'));
});
$('#copyDepAddr') && ($('#copyDepAddr').onclick = function() { copyToClipboard($('#depAddrLabel') ? $('#depAddrLabel').innerText : ""); alert("Address copied!"); });
$('#closeDepositAddrModal') && ($('#closeDepositAddrModal').onclick = function() { hide($('#depositAddressModal')); });

// ========== WITHDRAW ==========
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
  if (!addr || isNaN(amt) || amt<=0) { $('#wdDetailMsg').innerText="Enter valid address and amount"; return; }
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
    $('#wdCodeMsg').innerText = `Withdrawals suspended for ${formatCountdown(susp.until-now())}`; return;
  }
  if (validCodes.includes(code)) {
    let wd = { address: addr, amount: amt, network: net, start: now(), end: now()+86400, status: "processing", userId: app.user?.accountId };
    let withdrawals = getLS(LS.withdraws, []);
    withdrawals.push(wd); saveLS(LS.withdraws, withdrawals);
    let txs = getLS(LS.transactions, []); txs.push({type:'withdraw', ...wd}); saveLS(LS.transactions, txs);
    hide($('#withdrawCodeModal'));
    showWithdrawProcessing(wd);
    setLastPage('home', 'withdrawalProcessing');
    renderOngoingWithdrawals();
  } else {
    sendAttempts++;
    if (sendAttempts >= 5) {
      let suspObj = getLS(LS.withdrawSusp, {}); suspObj[app.user.accountId] = {until: now()+172800, count: sendAttempts}; saveLS(LS.withdrawSusp, suspObj);
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
      withdrawals = withdrawals.map(w=>{
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
  $('#wpViewDetails') && ($('#wpViewDetails').onclick = function() {
    switchPage('home'); hide($('#withdrawProcessModal')); setLastPage('home', 'withdrawalProcessing'); setTimeout(renderOngoingWithdrawals, 100);
  });
}

function showWithdrawSuccessModal(wd) {
  if ($('#wsDetails')) $('#wsDetails').innerHTML = `<div>Address: ${wd.address}</div><div>Amount: ${fmtUsd(wd.amount)}</div><div>Network: ${wd.network}</div>`;
  show($('#withdrawSuccessModal'));
  $('#wsCloseBtn') && ($('#wsCloseBtn').onclick = function() { hide($('#withdrawSuccessModal')); setLastPage('home'); renderOngoingWithdrawals(); });
}

// ========== PAGE ACTIVITY RESTORE & COUNTDOWNS ==========
function renderOngoingWithdrawals() {
  const ongoing = (getLS(LS.withdraws, []) || []).filter(wd => wd.status === "processing" && now() < wd.end);
  let list = ongoing.map(wd => {
    const left = wd.end-now();
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
  $all('.countdown').forEach(el=>{
    const end = parseInt(el.dataset.end,10);
    const left = end-now();
    el.innerText = formatCountdown(left>0?left:0);
  });
}
function restoreWithdrawalsUI() {
  let withdrawals = getLS(LS.withdraws, []);
  withdrawals.filter(wd=>wd.status==="processing" && now()<wd.end).forEach(wd => showWithdrawProcessing(wd));
  renderOngoingWithdrawals();
}
window.addEventListener('DOMContentLoaded', restoreWithdrawalsUI);
setInterval(() => { updateCountdownDisplays(); renderOngoingWithdrawals(); }, 1000);

// ========== TRANSACTIONS / ACTIVITY (UI) ==========
function displayActivitySection(pageType) {
  let txs = getLS(LS.transactions, []);
  let html = txs.slice(-20).reverse().map(tx=>{
    let icon = tx.type==='swap'?'<span class="text-blue-400">↔️</span>':tx.type==='withdraw'?'<span class="text-red-400">⬇️</span>':tx.type==='transfer_to_trade' || tx.type==='transfer_to_wallet'?'<span class="text-yellow-400">⇄</span>':'<span class="text-green-400">⬆️</span>';
    let details = tx.type==='swap'
      ? `Swapped ${tx.amount} ${tx.from} → ${tx.received} ${tx.to}`
      : tx.type==='withdraw'
      ? `Withdrew ${tx.amount} ${tx.network} to ${shortAddr(tx.address)}`
      : tx.type==='transfer_to_wallet'
      ? `Transferred ${tx.amount} ${tx.coin} to Main Wallet`
      : tx.type==='transfer_to_trade'
      ? `Transferred ${tx.amount} ${tx.coin} to Trade Account`
      : `Deposit ${tx.amount}`;
    return `<div class="flex items-center justify-between border-b border-gray-800 py-2">
      <div class="text-sm">${icon} ${details}</div>
      <div class="text-xs text-gray-400">${new Date((tx.time||now())*1000).toLocaleString()}</div>
    </div>`;
  }).join('');
  if ($('#activitySection')) $('#activitySection').innerHTML = html || `<div class="text-gray-400">No recent ${pageType} activities.</div>`;
}

// ========== SETTINGS ==========
$('#settingsBtn') && ($('#settingsBtn').onclick = function() { switchPage('settingsPage'); });
$('#closeAccountBtn') && ($('#closeAccountBtn').onclick = async function() {
  if (!app.twofaStatus[app.user?.accountId]) { alert("Enable 2FA first."); return; }
  alert("Deactivating..."); await sleep(1500);
  let map = getLS(LS.walletMap,{}); delete map[app.user.address]; saveLS(LS.walletMap, map);
  delLS(LS.user); app.user=null; switchPage('landingPage');
});
$('#settingsThemeBtn') && ($('#settingsThemeBtn').onclick = function(){ $('#themePanel') && $('#themePanel').classList.toggle('hidden'); });
$('#settingsNotifBtn') && ($('#settingsNotifBtn').onclick = function(){ $('#notifPanel') && $('#notifPanel').classList.toggle('hidden'); });
$('#settings2faBtn') && ($('#settings2faBtn').onclick = function(){ $('#twofaPanel') && $('#twofaPanel').classList.toggle('hidden'); });
$('#themeSelect') && ($('#themeSelect').onchange = function() { app.theme = this.value; saveLS(LS.theme, app.theme); document.body.className = app.theme==="light"?"bg-white text-black":"bg-black text-white"; });
$('#notifToggle') && ($('#notifToggle').onchange = function() { app.notif.enabled = this.checked; saveLS(LS.notif, app.notif); $('#notifToggleLabel') && ($('#notifToggleLabel').innerText = this.checked?"On":"Off"); });
$('#twofaToggle') && ($('#twofaToggle').onchange = function() { let status = this.checked; app.twofaStatus[app.user.accountId] = status; saveLS(LS.twofaStatus, app.twofaStatus); $('#twofaToggleLabel') && ($('#twofaToggleLabel').innerText = status?"On":"Off"); });

// ========== SUPPORT ==========
$('#supportBtn') && ($('#supportBtn').onclick = function() { switchPage('supportPage'); });
$('#supportSendBtn') && ($('#supportSendBtn').onclick = function() {
  let msg = $('#supportUserMsg').value.trim(); if (!msg) return;
  let box = $('#supportChatBox'); box && (box.innerHTML += `<div class="mb-2"><b>You:</b> ${msg}</div>`);
  if ($('#supportUserMsg')) $('#supportUserMsg').value = "";
  setTimeout(()=>{ box && (box.innerHTML += `<div class="mb-2 text-yellow-400"><b>Bot:</b> Thank you for your message. Our AI assistant will reply soon.</div>`); box && (box.scrollTop=box.scrollHeight); }, 1000);
});

// ========== NOTIFICATION UI ==========
$('#notifBtn') && ($('#notifBtn').onclick = function() { switchPage('notifPage'); });
$('#notifToggle') && ($('#notifToggle').onchange = function() { app.notif.enabled = this.checked; saveLS(LS.notif, app.notif); $('#notifToggleLabel') && ($('#notifToggleLabel').innerText = this.checked?"On":"Off"); });
if ($('#notifList')) $('#notifList').innerHTML = app.notifMsgs.slice(-10).map(msg=>`<div>${msg}</div>`).join("");

// ========== TRANSACTIONS / ACTIVITY SHORTCUTS ==========
$('#transactionsBtn') && ($('#transactionsBtn').onclick = function() { switchPage('home'); renderOngoingWithdrawals(); displayActivitySection('transactions'); });
$('#activityBtn') && ($('#activityBtn').onclick = function() { switchPage('home'); renderOngoingWithdrawals(); displayActivitySection('activity'); });
$('#disconnectBtn') && ($('#disconnectBtn').onclick = async function() { alert("Disconnecting..."); await sleep(1500); delLS(LS.user); app.user=null; switchPage('landingPage'); });

// ========== INITIAL LOAD ==========
(function init(){
  loadAppState();
  let lastPage = getLastPage();
  let lastActivity = getLastPageActivity();
  if (app.user?.accountId) {
    if ($('#walletId')) $('#walletId').innerText = app.user.accountId;
    if ($('#walletId2')) $('#walletId2').innerText = app.user.accountId;
  }
  if ($('#totalBalance')) $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  if ($('#totalBalance2')) $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  loadUsdt(); loadMarkets();
  setInterval(loadMarkets, 60000);
  setInterval(loadUsdt, 60000);
  setInterval(handleMarketNotif, 60000);
  initializeTradingView();
  if (lastPage) switchPage(lastPage, lastActivity, true);
  else if (app.user?.accountId) switchPage('home');
  else switchPage('landingPage');
  initializeTradingSimulation();
  // Wire swap button if present
  if ($('#swapBtn')) $('#swapBtn').onclick = loadSwapPage;
})();