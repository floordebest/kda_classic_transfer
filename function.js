const NETWORK_ID = "mainnet01";
const API_HOST = "https://api.chainweb.com/chainweb/0.0/mainnet01";
const CHAIN_IDS = Array.from({ length: 20 }, (_, i) => i.toString());
const GAS_PRICE = 0.00000001;
const GAS_LIMIT = 1200;
const TTL = 28800;
const EXPLORER_BASE_URL = "https://explorer.chainweb.com/mainnet/tx/";

const state = {
  account: "",
  balances: new Map(),
};

const creationTime = () => Math.round(Date.now() / 1000) - 15;

document.addEventListener("DOMContentLoaded", () => {
  populateChainSelect();
  attachEventHandlers();
  enhanceExternalLinks();
});

function attachEventHandlers() {
  const balanceForm = document.getElementById("balanceForm");
  const transferForm = document.getElementById("transferForm");

  balanceForm.addEventListener("submit", handleBalanceSubmit);
  transferForm.addEventListener("submit", handleTransferSubmit);
}

function enhanceExternalLinks() {
  const externalLinks = document.querySelectorAll('a[data-open-tab="true"]');
  externalLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener");
    });
  });
}

function populateChainSelect() {
  const select = document.getElementById("chainSelect");
  select.innerHTML = "";
  CHAIN_IDS.forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `Chain ${id}`;
    select.appendChild(option);
  });
}

async function handleBalanceSubmit(event) {
  event.preventDefault();
  const addressInput = document.getElementById("addressInput");
  const balanceStatus = document.getElementById("balanceStatus");
  const balancesContainer = document.getElementById("balancesContainer");

  const account = addressInput.value.trim();
  if (!account) {
    balanceStatus.textContent = "Please enter a Kadena account.";
    balancesContainer.classList.add("hidden");
    return;
  }

  state.account = account;
  balanceStatus.textContent = "Fetching balances…";
  balancesContainer.classList.add("hidden");

  try {
    const balances = await fetchBalances(account);
    state.balances = balances;
    renderBalances(balances);
    balanceStatus.textContent = "";
  } catch (error) {
    console.error(error);
    balanceStatus.textContent =
      "We could not retrieve balances. Please verify the account and try again.";
  }
}

async function fetchBalances(account) {
  const results = await Promise.allSettled(
    CHAIN_IDS.map((chainId) => fetchChainBalance(account, chainId))
  );

  const balances = new Map();
  results.forEach((result, index) => {
    const chainId = CHAIN_IDS[index];
    if (result.status === "fulfilled") {
      balances.set(chainId, result.value);
    } else {
      balances.set(chainId, null);
    }
  });
  return balances;
}

async function fetchChainBalance(account, chainId) {
  const cmd = {
    networkId: NETWORK_ID,
    pactCode: `(coin.get-balance "${account}")`,
    meta: Pact.lang.mkMeta(
      "",
      chainId,
      GAS_PRICE,
      GAS_LIMIT,
      creationTime(),
      TTL
    ),
  };

  const response = await Pact.fetch.local(
    cmd,
    `${API_HOST}/chain/${chainId}/pact`
  );

  if (response.result.status === "success") {
    return Number(response.result.data);
  }

  if (
    response.result.error &&
    response.result.error.message &&
    response.result.error.message.includes("row found")
  ) {
    return 0;
  }

  throw new Error(response.result.error?.message || "Unknown error");
}

function renderBalances(balances) {
  const tbody = document.getElementById("balancesTable").querySelector("tbody");
  const totalBalance = document.getElementById("totalBalance");
  const balancesContainer = document.getElementById("balancesContainer");

  tbody.innerHTML = "";
  let total = 0;

  CHAIN_IDS.forEach((chainId) => {
    const balance = balances.get(chainId);
    const row = document.createElement("tr");

    const chainCell = document.createElement("td");
    chainCell.textContent = chainId;

    const balanceCell = document.createElement("td");
    if (balance === null) {
      balanceCell.textContent = "Error";
      balanceCell.style.color = "#d93025";
    } else {
      balanceCell.textContent = formatAmount(balance);
      total += balance || 0;
    }

    row.appendChild(chainCell);
    row.appendChild(balanceCell);
    tbody.appendChild(row);
  });

  totalBalance.textContent = `Total balance: ${formatAmount(total)} KDA`;
  balancesContainer.classList.remove("hidden");
}

function formatAmount(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "0";
  }
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

async function handleTransferSubmit(event) {
  event.preventDefault();

  const transferStatus = document.getElementById("transferStatus");
  const chainSelect = document.getElementById("chainSelect");
  const recipientInput = document.getElementById("recipientInput");
  const amountInput = document.getElementById("amountInput");
  const privateKeyInput = document.getElementById("privateKeyInput");
  const addressInput = document.getElementById("addressInput");

  const senderAccount = (state.account || addressInput.value || "").trim();
  const chainId = chainSelect.value;
  const recipient = recipientInput.value.trim();
  const amountValue = amountInput.value.trim();
  const privateKey = privateKeyInput.value.trim();

  if (!senderAccount) {
    transferStatus.textContent =
      "Please fetch balances first or enter the sender account.";
    return;
  }

  if (!recipient) {
    transferStatus.textContent = "Please enter a recipient account.";
    return;
  }

  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    transferStatus.textContent = "Please enter a valid transfer amount.";
    return;
  }

  if (!privateKey) {
    transferStatus.textContent =
      "Please enter the private key for the sender account.";
    return;
  }

  try {
    transferStatus.textContent = "Submitting transfer…";
    const requestKey = await submitTransfer({
      senderAccount,
      recipient,
      amount,
      chainId,
      privateKey,
    });
    if (requestKey) {
      const explorerUrl = `${EXPLORER_BASE_URL}${encodeURIComponent(
        requestKey
      )}`;
      transferStatus.textContent = "Transfer submitted. Request key: ";
      const link = document.createElement("a");
      link.href = explorerUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = requestKey;
      transferStatus.appendChild(link);
    } else {
      transferStatus.textContent =
        "Transfer submitted, but no request key was returned.";
    }
  } catch (error) {
    console.error(error);
    transferStatus.textContent = `Transfer failed: ${error.message || error}`;
  }
}

async function submitTransfer({
  senderAccount,
  recipient,
  amount,
  chainId,
  privateKey,
}) {
  const senderKey = extractPublicKey(senderAccount);
  if (!senderKey) {
    throw new Error("Could not extract a public key from the sender account.");
  }

  let finalPrivateKey = "";

  if (privateKey.length !== 64 && privateKey.length === 128) {
    const keypair = privateKey.split(senderKey);
    try {
      const keyPair = Pact.crypto.restoreKeyPairFromSecretKey(keypair[0]);
      if (keyPair.publicKey === senderKey) {
        finalPrivateKey = keyPair.secretKey;
      }
    } catch (error) {
      // No private key found
      console.log(error);
    }

    try {
      const keyPair = Pact.crypto.restoreKeyPairFromSecretKey(keypair[1]);
      if (keyPair.publicKey === senderKey) {
        finalPrivateKey = keyPair.secretKey;
      }
    } catch (error) {
      // No private key found
      console.log(error);
    }
  }

  if (finalPrivateKey.length !== 64) {
    if (privateKey.length !== 64) {
      throw new Error(
        "Invalid private key. Please enter the private key for the sender account."
      );
    }
    finalPrivateKey = privateKey;
  }

  if (!recipient.startsWith("k:")) {
    throw new Error(
      "Invalid recipient account. Please enter a valid Kadena account starting with 'k:'."
    );
  }

  const recipientGuard = {
    "recipient-keyset": {
      keys: [recipient.slice(2)],
      pred: "keys-all",
    },
  };

  const amountLiteral = formatAmountLiteral(amount);
  const pactCode = `(coin.transfer-create "${senderAccount}" "${recipient}" (read-keyset "recipient-keyset") ${amountLiteral})`;

  const gasCap = Pact.lang.mkCap("Gas payer", "Pay for gas", "coin.GAS", []);
  const transferCap = Pact.lang.mkCap(
    "Transfer",
    "Transfer coin",
    "coin.TRANSFER",
    [senderAccount, recipient, { decimal: amountLiteral }]
  );

  const cmd = [
    {
      keyPairs: {
        publicKey: senderKey,
        secretKey: finalPrivateKey,
        clist: [gasCap["cap"], transferCap["cap"]],
      },
      envData: recipientGuard,
      pactCode: pactCode,
      meta: Pact.lang.mkMeta(
        senderAccount,
        chainId,
        GAS_PRICE,
        GAS_LIMIT,
        creationTime(),
        TTL
      ),
      networkId: NETWORK_ID,
    },
  ];
  const response = await Pact.fetch.send(
    cmd,
    `${API_HOST}/chain/${chainId}/pact`
  );

  console.log(response);

  if (response.requestKeys && response.requestKeys.length > 0) {
    return response.requestKeys[0];
  }

  throw new Error("Unexpected response from the network.");
}

function extractPublicKey(account) {
  if (account.startsWith("k:")) {
    return account.slice(2);
  }
  if (/^[a-f0-9]{64}$/i.test(account)) {
    return account;
  }
  return null;
}

function formatAmountLiteral(amount) {
  const fixed = Number(amount).toFixed(8);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, ".0");
}

async function getRecipientGuard(recipient, chainId) {
  const cmd = {
    networkId: NETWORK_ID,
    pactCode: `(coin.details "${recipient}")`,
    meta: Pact.lang.mkMeta(
      "",
      chainId,
      GAS_PRICE,
      GAS_LIMIT,
      creationTime(),
      TTL
    ),
  };

  const response = await Pact.fetch.local(
    cmd,
    `${API_HOST}/chain/${chainId}/pact`
  );

  if (response.result.status === "success") {
    return Number(response.result.data);
  }
}
