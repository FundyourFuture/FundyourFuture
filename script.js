/* ============================================================
   GLOBAL SETTINGS & MODE
============================================================ */

let isDarkMode = localStorage.getItem("darkMode") !== null ? localStorage.getItem("darkMode") === "true" : true;

function applyTheme() {
  document.body.classList.toggle("dark-mode", isDarkMode);
}

function updateModeUI() {
  const chartModeLabel = document.getElementById("chartModeLabel");
  const proChartControls = document.getElementById("proChartControls");
  const proSection = document.getElementById("simProSection");

  if (chartModeLabel) chartModeLabel.textContent = "Zoom with sliders or wheel";
  if (proChartControls) proChartControls.style.display = "block";
  if (proSection) proSection.style.display = "block";
}

function toggleTheme() {
  isDarkMode = !isDarkMode;
  localStorage.setItem("darkMode", isDarkMode);
  applyTheme();
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

  const analyzeButton = document.querySelector(".analysis-input .primary-btn");
  const stockTickerInput = document.getElementById("stockTicker");
  if (analyzeButton) analyzeButton.addEventListener("click", runStockAnalysis);
  if (stockTickerInput) {
    stockTickerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runStockAnalysis();
      }
    });
  }

  const chartTypeSelect = document.getElementById("chartTypeSelect");
  if (chartTypeSelect) chartTypeSelect.addEventListener("change", renderSimChart);

  const loadChartBtn = document.getElementById("loadChartBtn");
  if (loadChartBtn) loadChartBtn.addEventListener("click", renderSimChart);

  const simTickerInput = document.getElementById("simTicker");
  const simTickerSearch = document.getElementById("simTickerSearch");
  if (simTickerInput) {
    simTickerInput.addEventListener("change", () => {
      if (simTickerSearch) simTickerSearch.value = simTickerInput.value.toUpperCase();
      renderSimChart();
    });
    simTickerInput.addEventListener("input", () => {
      const chartStatus = document.getElementById("simChartStatus");
      if (chartStatus) chartStatus.textContent = "Chart will refresh for the ticker you enter.";
    });
  }

  if (simTickerSearch) {
    simTickerSearch.addEventListener("input", renderTickerSuggestions);
    simTickerSearch.addEventListener("focus", renderTickerSuggestions);
    simTickerSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const firstSuggestion = document.querySelector("#tickerSuggestions li");
        if (firstSuggestion) selectTicker(firstSuggestion.textContent);
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".ticker-search-wrap")) {
      const suggestions = document.getElementById("tickerSuggestions");
      if (suggestions) suggestions.style.display = "none";
    }
  });

  document.querySelectorAll(".chart-tool-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chart-tool-btn").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      setChartTool(button.dataset.tool);
    });
  });

  const saveShareBtn = document.getElementById("saveShareBtn");
  if (saveShareBtn) saveShareBtn.addEventListener("click", saveAndShareAnnotation);

  const communitySubmitBtn = document.getElementById("communitySubmitBtn");
  if (communitySubmitBtn) communitySubmitBtn.addEventListener("click", submitCommunityPost);

  const openCommunityComposerBtn = document.getElementById("openCommunityComposerBtn");
  const inlineCommunityComposerBtn = document.getElementById("inlineCommunityComposerBtn");
  const closeCommunityComposerBtn = document.getElementById("closeCommunityComposerBtn");
  if (openCommunityComposerBtn) {
    openCommunityComposerBtn.addEventListener("click", () => setCommunityComposerOpen(true));
  }
  if (inlineCommunityComposerBtn) {
    inlineCommunityComposerBtn.addEventListener("click", () => setCommunityComposerOpen(true));
  }
  if (closeCommunityComposerBtn) {
    closeCommunityComposerBtn.addEventListener("click", () => setCommunityComposerOpen(false));
  }
  if (document.getElementById("communityComposerWrap")) {
    setCommunityComposerOpen(false);
  }

  const startingBalanceInput = document.getElementById("startingBalanceInput");
  if (startingBalanceInput) {
    const savedStartingBalance = Number(localStorage.getItem("startingBalance"));
    const savedSimBalance = Number(localStorage.getItem("simBalance"));
    const initialValue = Number.isFinite(savedStartingBalance) && savedStartingBalance > 0
      ? savedStartingBalance
      : (Number.isFinite(savedSimBalance) && savedSimBalance > 0 ? savedSimBalance : 100000);
    startingBalanceInput.value = String(initialValue);
  }

  if (document.getElementById("simChartOverlay")) setupChartDrawing();
  applyTheme();
  updateModeUI();
  if (document.getElementById("simChart")) {
    requestAnimationFrame(() => {
      renderSimChart();
    });
  }
  loadSeedCommunityPosts();
});

/* ============================================================
   DATA ACCESS
============================================================ */

const API_KEY = "d9b9hvpr01qmk4gkrtr0d9b9hvpr01qmk4gkrtrg";

function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const candidates = [];

  // Prefer dedicated local API port that may run updated backend independent of static host.
  candidates.push(`http://127.0.0.1:8010${normalizedPath}`);
  candidates.push(`http://localhost:8010${normalizedPath}`);

  // Always try the local Python API first so Live Server (e.g. port 5500) can still reach market endpoints.
  candidates.push(`http://127.0.0.1:8000${normalizedPath}`);
  candidates.push(`http://localhost:8000${normalizedPath}`);

  const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
  if (origin) candidates.push(`${origin}${normalizedPath}`);
  candidates.push(normalizedPath);

  return candidates.filter((value, index, array) => array.indexOf(value) === index);
}

async function fetchJsonFromApi(path) {
  const urls = buildApiUrl(path);

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      if (data && typeof data === "object") {
        return data;
      }
    } catch {
      // Try the next fallback.
    }
  }

  return null;
}

function normalizeTicker(ticker) {
  return (ticker || "AAPL").trim().toUpperCase();
}

function formatCurrency(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "N/A";
}

async function getPrice(ticker) {
  const cleanedTicker = normalizeTicker(ticker);

  const priceFromProxy = async () => {
    try {
      const data = await fetchJsonFromApi(`/api/quote?symbol=${encodeURIComponent(cleanedTicker)}`);
      return Number.isFinite(data?.c) ? data.c : null;
    } catch {
      return null;
    }
  };

  const priceFromFinnhub = async () => {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${cleanedTicker}&token=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      return Number.isFinite(data?.c) ? data.c : null;
    } catch {
      return null;
    }
  };

  const sources = [priceFromProxy, priceFromFinnhub];
  for (const source of sources) {
    const price = await source();
    if (Number.isFinite(price) && price > 0) return price;
  }

  return null;
}

async function getCompanyProfile(ticker) {
  const cleanedTicker = normalizeTicker(ticker);

  const fallbackProfile = () => {
    try {
      return fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${cleanedTicker}&token=${API_KEY}`)
        .then((response) => response.json())
        .then((data) => (data && Object.keys(data).length ? data : null));
    } catch {
      return Promise.resolve(null);
    }
  };

  try {
    const data = await fetchJsonFromApi(`/api/profile?symbol=${encodeURIComponent(cleanedTicker)}`);
    if (data && Object.keys(data).length) return data;
  } catch {
    // Fall back to direct Finnhub.
  }

  return fallbackProfile();
}

/* ============================================================
   COMPANY SUMMARY (EDUCATIONAL)
============================================================ */

function generateCompanySummary(profile) {
  if (!profile) return "No summary available.";

  const industry = profile.finnhubIndustry || "unknown industry";
  const country = profile.country || "unknown country";
  const ipo = profile.ipo || "an unknown IPO date";
  const name = profile.name || "This company";

  return `
    ${name} operates in the ${industry.toLowerCase()} sector and is based in ${country}.
    The company first became publicly traded on ${ipo}.
  `;
}

function displayCompanySummary(profile) {
  const box = document.getElementById("companySummaryBox");
  if (!box) return;

  if (!profile) {
    box.innerHTML = "<p>No company summary available.</p>";
    return;
  }

  box.innerHTML = `<p>${generateCompanySummary(profile)}</p>`;
}

/* ============================================================
   STOCK ANALYSIS PAGE
============================================================ */

function formatMarketCap(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `$${(value / 1e9).toFixed(1)}B`;
}

function displayCompanyProfile(profile) {
  const box = document.getElementById("companyProfileBox");
  if (!box) return;

  if (!profile) {
    box.innerHTML = "<p>No company profile found.</p>";
    return;
  }

  const marketCap = Number(profile.marketCapitalization);
  const safeIndustry = profile.finnhubIndustry || profile.industry || "N/A";
  const safeExchange = profile.exchange || "N/A";
  const safeIpo = profile.ipo || "N/A";
  const safeCountry = profile.country || "N/A";
  const safeCurrency = profile.currency || "N/A";

  box.innerHTML = `
    <div class="company-profile">
      <h3>${profile.name || "Unknown Company"}</h3>
      ${profile.logo ? `<img src="${profile.logo}" class="company-logo">` : ""}
      <p><strong>Ticker:</strong> ${profile.ticker || "N/A"}</p>
      <p><strong>Industry:</strong> ${safeIndustry}</p>
      <p><strong>Market Cap:</strong> ${Number.isFinite(marketCap) ? formatMarketCap(marketCap) : "N/A"}</p>
      <p><strong>IPO Date:</strong> ${safeIpo}</p>
      <p><strong>Exchange:</strong> ${safeExchange}</p>
      <p><strong>Country:</strong> ${safeCountry}</p>
      <p><strong>Currency:</strong> ${safeCurrency}</p>
      ${profile.weburl ? `<p><strong>Website:</strong> <a href="${profile.weburl}" target="_blank">${profile.weburl}</a></p>` : ""}
    </div>
  `;
}

async function runStockAnalysis() {
  const tickerInput = document.getElementById("stockTicker");
  const resultBox = document.getElementById("analysisResult");
  if (!tickerInput || !resultBox) return;

  const ticker = tickerInput.value.toUpperCase();
  if (!ticker) {
    resultBox.innerHTML = "Please enter a ticker.";
    return;
  }

  const price = await getPrice(ticker);
  const profile = await getCompanyProfile(ticker);

  if (!price) {
    resultBox.innerHTML = "Could not fetch price.";
    displayCompanyProfile(null);
    displayCompanySummary(null);
    return;
  }

  const marketCap = profile?.marketCapitalization;
  const sector = profile?.finnhubIndustry || "sector data";
  const exchange = profile?.exchange || "market exchange";

  resultBox.innerHTML = `
    <h2>${ticker}</h2>
    <p class="analysis-price">$${price.toFixed(2)}</p>
    <p><strong>${profile?.name || ticker}</strong> is a ${sector.toLowerCase()} company listed on ${exchange.toLowerCase()}.</p>
    <div class="analysis-metrics">
      <span class="metric-pill">Market cap: ${formatMarketCap(marketCap)}</span>
      <span class="metric-pill">Exchange: ${exchange}</span>
      <span class="metric-pill">Industry: ${sector}</span>
    </div>
  `;

  displayCompanyProfile(profile);
  displayCompanySummary(profile);
}

/* ============================================================
   PORTFOLIO PAGE
============================================================ */

let portfolio = JSON.parse(localStorage.getItem("portfolio")) || [];

async function getPriceAtDate(ticker, purchaseDate) {
  const history = await getHistoricalData(ticker);
  const targetDate = purchaseDate ? new Date(`${purchaseDate}T12:00:00`) : null;

  if (!targetDate || !history?.labels?.length || !history?.prices?.length) {
    return getPrice(ticker);
  }

  const targetTimestamp = targetDate.getTime();
  const dates = history.labels.map((label) => new Date(label).getTime());
  const matchIndex = dates.findLastIndex((value) => value <= targetTimestamp);

  if (matchIndex >= 0) {
    return history.prices[matchIndex];
  }

  return history.prices[history.prices.length - 1] || getPrice(ticker);
}

async function addToPortfolio() {
  const tickerEl = document.getElementById("portfolioTicker");
  const sharesEl = document.getElementById("portfolioShares");
  const purchasedDateEl = document.getElementById("portfolioPurchaseDate");
  const originalPriceEl = document.getElementById("portfolioOriginalPrice");
  const status = document.getElementById("portfolioStatus");

  const ticker = normalizeTicker(tickerEl?.value);
  const shares = Number(sharesEl?.value);
  const purchaseDate = purchasedDateEl?.value || new Date().toISOString().split("T")[0];
  const originalPrice = Number(originalPriceEl?.value);

  if (!ticker || shares <= 0) {
    status.textContent = "Enter a valid ticker and number of shares.";
    return;
  }

  const historicalPrice = await getPriceAtDate(ticker, purchaseDate);
  const purchasePrice = Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : historicalPrice;

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    status.textContent = "Could not determine a purchase price.";
    return;
  }

  portfolio.push({
    id: Date.now() + Math.random(),
    ticker,
    shares,
    purchaseDate,
    purchasePrice,
    currentPrice: await getPrice(ticker)
  });
  localStorage.setItem("portfolio", JSON.stringify(portfolio));

  status.textContent = "Added to your portfolio.";
  renderPortfolio();
}

async function renderPortfolio() {
  const tbody = document.getElementById("portfolioTableBody");
  const summaryBox = document.getElementById("portfolioSummary");

  if (!tbody || !summaryBox) return;

  tbody.innerHTML = "";
  let totalValue = 0;
  let totalCost = 0;

  for (const item of portfolio) {
    const currentPrice = (await getPrice(item.ticker)) || item.currentPrice || item.purchasePrice;
    const value = currentPrice * item.shares;
    const cost = item.purchasePrice * item.shares;
    const gainLoss = value - cost;

    totalValue += value;
    totalCost += cost;

    tbody.innerHTML += `
      <tr>
        <td>${item.ticker}</td>
        <td>${item.shares}</td>
        <td>${formatCurrency(item.purchasePrice)}<br><small>${item.purchaseDate}</small></td>
        <td>${formatCurrency(currentPrice)}</td>
        <td>${formatCurrency(value)}</td>
        <td style="color:${gainLoss >= 0 ? "green" : "red"};">
          ${formatCurrency(gainLoss)}
        </td>
        <td><button onclick="removeFromPortfolio('${item.id}')">X</button></td>
      </tr>
    `;
  }

  const totalGainLoss = totalValue - totalCost;

  summaryBox.innerHTML = `
    <p><strong>Total Value:</strong> ${formatCurrency(totalValue)}</p>
    <p><strong>Total Cost:</strong> ${formatCurrency(totalCost)}</p>
    <p style="color:${totalGainLoss >= 0 ? "green" : "red"};">
      <strong>Total Gain/Loss:</strong> ${formatCurrency(totalGainLoss)}
    </p>
  `;

  const portfolioChartCanvas = document.getElementById("portfolioChart");
  if (portfolioChartCanvas) {
    const chartTickerInput = document.getElementById("portfolioChartTicker");
    const preferredTicker = normalizeTicker(chartTickerInput?.value || portfolio[0]?.ticker || "AAPL");
    if (chartTickerInput) chartTickerInput.value = preferredTicker;
    await loadPortfolioChart(preferredTicker);
  }
}

function removeFromPortfolio(id) {
  portfolio = portfolio.filter(item => item.id !== id);
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
  renderPortfolio();
}

if (document.getElementById("portfolioTableBody")) renderPortfolio();

/* ============================================================
   SETTINGS PAGE
============================================================ */

function saveStartingBalance() {
  const input = document.getElementById("startingBalanceInput");
  const status = document.getElementById("startingBalanceStatus");

  if (!input || !status) return;

  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    status.textContent = "Enter a valid balance greater than 0.";
    return;
  }

  // Keep starting and active paper balance in sync so the change applies immediately.
  localStorage.setItem("startingBalance", String(value));
  localStorage.setItem("simBalance", String(value));
  simBalance = value;
  updateSimBalance();
  status.textContent = "Saved. Your simulation balance has been updated.";
}

function resetAllData() {
  localStorage.clear();
  location.reload();
}

/* ============================================================
   SIMULATION TRADING
============================================================ */

let simBalance =
  Number(localStorage.getItem("simBalance")) ||
  Number(localStorage.getItem("startingBalance")) ||
  100000;

let simHoldings = JSON.parse(localStorage.getItem("simHoldings")) || [];
let simHistory = JSON.parse(localStorage.getItem("simHistory")) || [];

function updateSimBalance() {
  const display = document.getElementById("simBalanceDisplay");
  if (display) display.textContent = `$${simBalance.toFixed(2)}`;
}

if (document.getElementById("simBalanceDisplay")) updateSimBalance();

async function simBuy() {
  const tickerEl = document.getElementById("simTicker");
  const sharesEl = document.getElementById("simShares");
  const status = document.getElementById("simTradeStatus");

  const ticker = tickerEl.value.toUpperCase();
  const shares = Number(sharesEl.value);

  if (!ticker || shares <= 0) {
    status.textContent = "Enter valid ticker and shares.";
    return;
  }

  const price = await getPrice(ticker);
  if (!price) {
    status.textContent = "Could not fetch price.";
    return;
  }

  const cost = price * shares;
  if (cost > simBalance) {
    status.textContent = "Not enough virtual money.";
    return;
  }

  simBalance -= cost;

  let holding = simHoldings.find(h => h.ticker === ticker);
  if (holding) {
    const totalCostBefore = holding.avgCost * holding.shares;
    const totalCostAfter = totalCostBefore + cost;
    holding.shares += shares;
    holding.avgCost = totalCostAfter / holding.shares;
  } else {
    simHoldings.push({ ticker, shares, avgCost: price });
  }

  simHistory.push({
    type: "BUY",
    ticker,
    shares,
    price,
    date: new Date().toLocaleString()
  });

  saveSimData();
  renderSim();
  status.textContent = "Buy successful!";
}

async function simSell() {
  const tickerEl = document.getElementById("simTicker");
  const sharesEl = document.getElementById("simShares");
  const status = document.getElementById("simTradeStatus");

  const ticker = tickerEl.value.toUpperCase();
  const shares = Number(sharesEl.value);

  let holding = simHoldings.find(h => h.ticker === ticker);

  if (!holding || shares <= 0 || shares > holding.shares) {
    status.textContent = "Not enough shares.";
    return;
  }

  const price = await getPrice(ticker);
  if (!price) {
    status.textContent = "Could not fetch price.";
    return;
  }

  const revenue = price * shares;
  simBalance += revenue;

  holding.shares -= shares;
  if (holding.shares === 0) {
    simHoldings = simHoldings.filter(h => h.ticker !== ticker);
  }

  simHistory.push({
    type: "SELL",
    ticker,
    shares,
    price,
    date: new Date().toLocaleString()
  });

  saveSimData();
  renderSim();
  status.textContent = "Sell successful!";
}

function saveSimData() {
  localStorage.setItem("simBalance", simBalance);
  localStorage.setItem("simHoldings", JSON.stringify(simHoldings));
  localStorage.setItem("simHistory", JSON.stringify(simHistory));
}

async function renderSim() {
  updateSimBalance();

  const holdingsTable = document.getElementById("simHoldingsTable");
  const historyTable = document.getElementById("simHistoryTable");

  holdingsTable.innerHTML = "";
  historyTable.innerHTML = "";

  for (const h of simHoldings) {
    const price = await getPrice(h.ticker) || h.avgCost;
    const value = price * h.shares;

    holdingsTable.innerHTML += `
      <tr>
        <td>${h.ticker}</td>
        <td>${h.shares}</td>
        <td>$${h.avgCost.toFixed(2)}</td>
        <td>$${price.toFixed(2)}</td>
        <td>$${value.toFixed(2)}</td>
      </tr>
    `;
  }

  for (const t of simHistory) {
    historyTable.innerHTML += `
      <tr>
        <td>${t.type}</td>
        <td>${t.ticker}</td>
        <td>${t.shares}</td>
        <td>$${t.price.toFixed(2)}</td>
        <td>${t.date}</td>
      </tr>
    `;
  }

  renderSimChart();
}

/* ============================================================
   SIMULATION CHARTS
============================================================ */

let simChartInstance = null;
let chartDrawTool = "pen";
let communitySeedPosts = [];
let communityPosts = JSON.parse(localStorage.getItem("communityPosts") || "[]");
let isChartDrawing = false;
let chartOverlayCtx = null;
let chartOverlayCanvas = null;
let chartLastPoint = null;
let portfolioChartState = {
  ticker: "AAPL",
  history: null,
  mode: "line"
};
let simChartState = {
  ticker: "AAPL",
  history: null,
  historySet: null,
  mode: "line",
  zoomStart: 0,
  zoomEnd: 100
};
let analysisChartState = {
  ticker: "AAPL",
  history: null,
  historySet: null,
  detailedWindow: null,
  detailRequestKey: "",
  detailRequestToken: 0,
  mode: "line",
  historyCache: {},
  zoomStart: 0,
  zoomEnd: 100
};
let analysisDetailFetchTimer = null;
const analysisRangeConfig = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "30m" },
  "1y": { range: "1y", interval: "1d" }
};
const popularTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX", "AMD", "INTC", "SPY", "QQQ", "BTC-USD", "ETH-USD"];

function selectTicker(ticker) {
  const tickerInput = document.getElementById("simTicker");
  const searchInput = document.getElementById("simTickerSearch");
  const suggestions = document.getElementById("tickerSuggestions");

  if (tickerInput) tickerInput.value = ticker;
  if (searchInput) searchInput.value = ticker;
  if (suggestions) suggestions.style.display = "none";
  renderSimChart();
}

function renderTickerSuggestions() {
  const searchInput = document.getElementById("simTickerSearch");
  const suggestions = document.getElementById("tickerSuggestions");
  if (!searchInput || !suggestions) return;

  const query = searchInput.value.trim().toUpperCase();
  if (!query) {
    suggestions.style.display = "none";
    suggestions.innerHTML = "";
    return;
  }

  const filtered = popularTickers.filter((ticker) => ticker.toUpperCase().includes(query));
  suggestions.innerHTML = "";

  if (!filtered.length) {
    suggestions.style.display = "none";
    return;
  }

  filtered.slice(0, 8).forEach((ticker) => {
    const item = document.createElement("li");
    item.textContent = ticker;
    item.addEventListener("click", () => selectTicker(ticker));
    suggestions.appendChild(item);
  });

  suggestions.style.display = "block";
}

function setupChartDrawing() {
  chartOverlayCanvas = document.getElementById("simChartOverlay");
  if (!chartOverlayCanvas) return;

  chartOverlayCtx = chartOverlayCanvas.getContext("2d");
  const chartCanvas = document.getElementById("simChart");
  if (chartCanvas) {
    const rect = chartCanvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 640));
    const height = Math.max(240, Math.floor(rect.height || 320));
    chartOverlayCanvas.width = width;
    chartOverlayCanvas.height = height;
    chartOverlayCanvas.style.width = `${width}px`;
    chartOverlayCanvas.style.height = `${height}px`;
  }
  chartOverlayCanvas.addEventListener("pointerdown", (event) => {
    isChartDrawing = true;
    chartLastPoint = getChartPoint(event);
  });

  chartOverlayCanvas.addEventListener("pointermove", (event) => {
    if (!isChartDrawing) return;
    const point = getChartPoint(event);
    drawChartStroke(chartLastPoint, point);
    chartLastPoint = point;
  });

  chartOverlayCanvas.addEventListener("pointerup", () => {
    isChartDrawing = false;
    chartLastPoint = null;
  });

  chartOverlayCanvas.addEventListener("pointerleave", () => {
    isChartDrawing = false;
    chartLastPoint = null;
  });
}

function setChartTool(tool) {
  chartDrawTool = tool;
  if (tool === "clear") {
    clearChartAnnotations();
    chartDrawTool = "pen";
    document.querySelector('.chart-tool-btn[data-tool="pen"]')?.classList.add("active");
  }
}

function getChartPoint(event) {
  const rect = chartOverlayCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function drawChartStroke(start, end) {
  if (!chartOverlayCtx || !start || !end) return;

  chartOverlayCtx.strokeStyle = chartDrawTool === "erase" ? "rgba(0,0,0,0)" : "#ffcc00";
  chartOverlayCtx.lineWidth = chartDrawTool === "erase" ? 18 : 3;
  chartOverlayCtx.lineCap = "round";
  chartOverlayCtx.lineJoin = "round";

  if (chartDrawTool === "erase") {
    chartOverlayCtx.globalCompositeOperation = "destination-out";
  } else {
    chartOverlayCtx.globalCompositeOperation = "source-over";
  }

  chartOverlayCtx.beginPath();
  chartOverlayCtx.moveTo(start.x, start.y);
  chartOverlayCtx.lineTo(end.x, end.y);
  chartOverlayCtx.stroke();
  chartOverlayCtx.globalCompositeOperation = "source-over";
}

function clearChartAnnotations() {
  if (!chartOverlayCtx || !chartOverlayCanvas) return;
  chartOverlayCtx.clearRect(0, 0, chartOverlayCanvas.width, chartOverlayCanvas.height);
}

function renderCommunityPosts() {
  const list = document.getElementById("communityPostsList");
  if (!list) return;

  const allPosts = [...communitySeedPosts, ...communityPosts];

  if (!allPosts.length) {
    list.innerHTML = "<p>No community posts yet. Share a screenshot, photo, or video to get started.</p>";
    return;
  }

  list.innerHTML = allPosts.map((post) => `
    <article class="community-card">
      <h3>${post.title || post.ticker || "Community Post"}</h3>
      <p><strong>${post.author || "Student"}</strong> • ${post.timestamp || ""}</p>
      <p>${post.note || "Shared market insight"}</p>
      ${post.imageData ? `<img src="${post.imageData}" alt="Shared chart annotation" />` : ""}
      ${post.videoData ? `<video controls playsinline preload="metadata"><source src="${post.videoData}" /></video>` : ""}
    </article>
  `).join("");
}

async function loadSeedCommunityPosts() {
  try {
    const response = await fetch("posts.json", { cache: "no-store" });
    if (!response.ok) {
      renderCommunityPosts();
      return;
    }

    const seedPosts = await response.json();
    communitySeedPosts = Array.isArray(seedPosts) ? seedPosts : [];
  } catch {
    communitySeedPosts = [];
  }

  renderCommunityPosts();
}

function setCommunityComposerOpen(isOpen) {
  const composerWrap = document.getElementById("communityComposerWrap");
  if (!composerWrap) return;

  composerWrap.hidden = !isOpen;
  if (isOpen) {
    const noteInput = document.getElementById("communityNote");
    noteInput?.focus();
  }
}

async function saveAndShareAnnotation() {
  const tickerInput = document.getElementById("simTicker");
  const noteInput = document.getElementById("annotationNote");
  const status = document.getElementById("chartShareStatus");
  const ticker = (tickerInput?.value || "AAPL").trim().toUpperCase() || "AAPL";
  const note = noteInput?.value?.trim() || "Shared chart annotation";

  const post = {
    id: Date.now(),
    ticker,
    note,
    author: "Student",
    timestamp: new Date().toLocaleString(),
    imageData: chartOverlayCanvas ? chartOverlayCanvas.toDataURL("image/png") : ""
  };

  communityPosts.unshift(post);
  localStorage.setItem("communityPosts", JSON.stringify(communityPosts));
  renderCommunityPosts();

  const shareText = `Fund your Future community post for ${ticker}: ${note}`;
  if (status) status.textContent = "Saved to the community feed!";

  try {
    if (navigator.share) {
      await navigator.share({ title: "Fund your Future Annotation", text: shareText });
      if (status) status.textContent = "Shared successfully!";
      return;
    }
  } catch {
    // Ignore sharing errors and fall back.
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareText);
    if (status) status.textContent = "Saved and copied to clipboard!";
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function submitCommunityPost() {
  const titleInput = document.getElementById("communityTitle");
  const noteInput = document.getElementById("communityNote");
  const imageInput = document.getElementById("communityImageInput");
  const videoInput = document.getElementById("communityVideoInput");
  const status = document.getElementById("communityStatus");

  const title = titleInput?.value?.trim() || "";
  const note = noteInput?.value?.trim() || "Shared market insight";
  const imageFile = imageInput?.files?.[0];
  const videoFile = videoInput?.files?.[0];

  if (!note && !imageFile && !videoFile) {
    if (status) status.textContent = "Add a note or upload a file to post.";
    return;
  }

  let imageData = "";
  let videoData = "";

  try {
    if (imageFile) imageData = await readFileAsDataUrl(imageFile);
    if (videoFile) videoData = await readFileAsDataUrl(videoFile);
  } catch {
    if (status) status.textContent = "There was an issue reading the uploaded file.";
    return;
  }

  const post = {
    id: Date.now(),
    title,
    ticker: "Community",
    note,
    author: "Student",
    timestamp: new Date().toLocaleString(),
    imageData,
    videoData
  };

  communityPosts.unshift(post);
  localStorage.setItem("communityPosts", JSON.stringify(communityPosts));
  renderCommunityPosts();

  if (titleInput) titleInput.value = "";
  if (noteInput) noteInput.value = "";
  if (imageInput) imageInput.value = "";
  if (videoInput) videoInput.value = "";
  if (status) status.textContent = "Your post is now in the community feed!";
  setCommunityComposerOpen(false);
}

function drawChartGrid(ctx, width, height, padding, chartWidth, chartHeight, isDark) {
  ctx.strokeStyle = isDark ? "#334155" : "#dbe7fb";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function getCanvasMetrics(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(320, Math.round(rect.width || canvas.clientWidth || 640));
  const cssHeight = Math.max(240, Math.round(rect.height || canvas.clientHeight || 320));
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight };
}

function drawLineChart(canvas, prices) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !prices.length) return;

  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const isDark = document.body.classList.contains("dark-mode");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawChartGrid(ctx, width, height, padding, chartWidth, chartHeight, isDark);

  const minValue = Math.min(...prices);
  const maxValue = Math.max(...prices);
  const range = Math.max(1, maxValue - minValue);

  ctx.beginPath();
  prices.forEach((price, index) => {
    const x = padding + (index / Math.max(1, prices.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((price - minValue) / range) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#4da3ff";
  ctx.lineWidth = 2.8;
  ctx.stroke();

  const latestPrice = prices[prices.length - 1];
  const latestX = padding + (prices.length - 1) / Math.max(1, prices.length - 1) * chartWidth;
  const latestY = padding + chartHeight - ((latestPrice - minValue) / range) * chartHeight;
  ctx.beginPath();
  ctx.arc(latestX, latestY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffcc00";
  ctx.fill();
  ctx.strokeStyle = isDark ? "#fff" : "#0f172a";
  ctx.stroke();

  ctx.fillStyle = isDark ? "#e5e7eb" : "#334155";
  ctx.font = "12px Arial";
  ctx.fillText("Price", 12, 16);

  ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
  ctx.font = "bold 13px Arial";
  ctx.fillText(`Latest: $${latestPrice.toFixed(2)}`, 12, height - 14);
}

function drawMovingAverageChart(canvas, prices) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !prices.length) return;

  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const isDark = document.body.classList.contains("dark-mode");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawChartGrid(ctx, width, height, padding, chartWidth, chartHeight, isDark);

  const minValue = Math.min(...prices);
  const maxValue = Math.max(...prices);
  const range = Math.max(1, maxValue - minValue);
  const movingAverage = prices.map((price, index) => {
    if (index < 2) return price;
    return (prices[index] + prices[index - 1] + prices[index - 2]) / 3;
  });

  const drawSeries = (values, color) => {
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  };

  drawSeries(prices, "#4da3ff");
  drawSeries(movingAverage, "#ffb347");
}

function drawVolatilityChart(canvas, prices) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !prices.length) return;

  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const isDark = document.body.classList.contains("dark-mode");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawChartGrid(ctx, width, height, padding, chartWidth, chartHeight, isDark);

  const minValue = Math.min(...prices);
  const maxValue = Math.max(...prices);
  const range = Math.max(1, maxValue - minValue);
  const bandWidth = Math.max(2, (maxValue - minValue) / 6);
  const upper = prices.map((price) => price + bandWidth);
  const lower = prices.map((price) => price - bandWidth);

  const drawSeries = (values, color) => {
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  };

  drawSeries(prices, "#4da3ff");
  drawSeries(upper, "#2e8b57");
  drawSeries(lower, "#d9534f");
}

function drawCandlestickChart(canvas, candles) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !candles.length) return;

  const padding = 32;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const isDark = document.body.classList.contains("dark-mode");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = isDark ? "#334155" : "#dbe7fb";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const allValues = candles.flatMap((candle) => [candle.o, candle.h, candle.l, candle.c]).filter((value) => Number.isFinite(value));
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const range = Math.max(1, maxValue - minValue);

  const candleWidth = Math.max(6, chartWidth / candles.length / 1.8);

  candles.forEach((candle, index) => {
    const open = Number(candle.o);
    const high = Number(candle.h);
    const low = Number(candle.l);
    const close = Number(candle.c);

    if (![open, high, low, close].every(Number.isFinite)) return;

    const x = padding + (index + 0.5) * (chartWidth / candles.length);
    const yHigh = padding + ((maxValue - high) / range) * chartHeight;
    const yLow = padding + ((maxValue - low) / range) * chartHeight;
    const yOpen = padding + ((maxValue - open) / range) * chartHeight;
    const yClose = padding + ((maxValue - close) / range) * chartHeight;
    const isUp = close >= open;

    ctx.strokeStyle = isUp ? "#2e8b57" : "#d9534f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    ctx.fillStyle = isUp ? "rgba(46, 139, 87, 0.9)" : "rgba(217, 83, 79, 0.9)";
    ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(2, Math.abs(yOpen - yClose)));
  });
}

function resizeChartOverlay() {
  const chartCanvas = document.getElementById("simChart");
  if (!chartOverlayCanvas || !chartCanvas) return;
  const rect = chartCanvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 640));
  const height = Math.max(240, Math.floor(rect.height || 320));
  chartOverlayCanvas.width = width;
  chartOverlayCanvas.height = height;
  chartOverlayCanvas.style.width = `${width}px`;
  chartOverlayCanvas.style.height = `${height}px`;
  clearChartAnnotations();
}

function getFallbackHistoricalData(ticker) {
  const labels = [];
  const prices = [];
  const timestamps = [];

  const basePrice = 100 + ((ticker.charCodeAt(0) || 65) % 17) * 3 + 18;
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const ts = date.getTime();
    labels.push(new Date(ts).toISOString());
    timestamps.push(ts);

    const wave = Math.sin((i + 1) / 2.2) * 3.4 + Math.cos((i + 1) / 5.4) * 1.7;
    const trend = (13 - i) * 0.35;
    prices.push(Number((basePrice + trend + wave).toFixed(2)));
  }

  return {
    labels,
    timestamps,
    prices,
    isLive: false,
    source: "fallback",
    candles: prices.map((price, index) => ({
      x: index,
      o: Number((price - 0.8).toFixed(2)),
      h: Number((price + 1.2).toFixed(2)),
      l: Number((price - 1.2).toFixed(2)),
      c: Number((price + 0.4).toFixed(2))
    }))
  };
}

async function getHistoricalData(ticker, options = {}) {
  const normalizedTicker = normalizeTicker(ticker);
  const selectedRange = options.range || "1y";
  const selectedInterval = options.interval || "1d";
  const fromSec = Number.isFinite(Number(options.fromSec)) ? Math.floor(Number(options.fromSec)) : null;
  const toSec = Number.isFinite(Number(options.toSec)) ? Math.floor(Number(options.toSec)) : null;

  const parseHistoryPayload = (data) => {
    if (!Array.isArray(data?.c) || !data.c.length) return null;

    // Reject mismatched symbols from stale proxy responses.
    const payloadLabel = String(data?.label || "").trim().toUpperCase();
    if (payloadLabel && payloadLabel !== normalizedTicker) {
      return null;
    }

    const candles = [];
    const prices = [];
    const labels = [];
    const processedTimestamps = [];
    const timestamps = Array.isArray(data.t) ? data.t : [];
    const opens = Array.isArray(data.o) ? data.o : [];
    const highs = Array.isArray(data.h) ? data.h : [];
    const lows = Array.isArray(data.l) ? data.l : [];
    const closes = Array.isArray(data.c) ? data.c : [];

    for (let index = 0; index < closes.length; index += 1) {
      const open = Number(opens[index]);
      const high = Number(highs[index]);
      const low = Number(lows[index]);
      const close = Number(closes[index]);
      const ts = Number(timestamps[index]);

      if (![open, high, low, close].every(Number.isFinite)) continue;

      prices.push(close);
      const timestampMs = Number.isFinite(ts) ? ts * 1000 : Date.now() + index * 60000;
      labels.push(new Date(timestampMs).toISOString());
      processedTimestamps.push(timestampMs);
      candles.push({
        x: candles.length,
        o: open,
        h: high,
        l: low,
        c: close
      });
    }

    if (!prices.length) return null;

    const firstTs = Number(processedTimestamps[0]);
    const lastTs = Number(processedTimestamps[processedTimestamps.length - 1]);
    const spanMs = Number.isFinite(firstTs) && Number.isFinite(lastTs) ? Math.max(0, lastTs - firstTs) : null;
    const expectedSpanMax = {
      "1d": 1000 * 60 * 60 * 48,
      "5d": 1000 * 60 * 60 * 24 * 12,
      "1y": 1000 * 60 * 60 * 24 * 420
    };

    const hasExplicitWindow = Number.isFinite(fromSec) && Number.isFinite(toSec);
    if (!hasExplicitWindow && spanMs !== null && expectedSpanMax[selectedRange] && spanMs > expectedSpanMax[selectedRange]) {
      return null;
    }

    return {
      labels,
      timestamps: processedTimestamps,
      prices,
      highs: highs.filter((value) => Number.isFinite(Number(value))),
      lows: lows.filter((value) => Number.isFinite(Number(value))),
      opens: opens.filter((value) => Number.isFinite(Number(value))),
      candles,
      isLive: data.isLive !== false,
      source: data.source || "server",
      range: data.range || selectedRange,
      interval: data.interval || selectedInterval
    };
  };

  const fetchLegacyProxyHistory = async () => {
    if (Number.isFinite(fromSec) && Number.isFinite(toSec)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const lookbackSecMap = {
      "1d": 60 * 60 * 24,
      "5d": 60 * 60 * 24 * 5,
      "1y": 60 * 60 * 24 * 370
    };
    const resolutionMap = {
      "5m": "5",
      "30m": "30",
      "1d": "D"
    };
    const fromSec = nowSec - (lookbackSecMap[selectedRange] || lookbackSecMap["1y"]);
    const resolution = resolutionMap[selectedInterval] || "D";
    const legacyPath = `/api/history?symbol=${encodeURIComponent(normalizedTicker)}&from=${fromSec}&to=${nowSec}&resolution=${encodeURIComponent(resolution)}`;
    const legacyData = await fetchJsonFromApi(legacyPath);
    return parseHistoryPayload(legacyData);
  };

  try {
    const queryParts = [
      `symbol=${encodeURIComponent(normalizedTicker)}`,
      `range=${encodeURIComponent(selectedRange)}`,
      `interval=${encodeURIComponent(selectedInterval)}`
    ];
    if (Number.isFinite(fromSec) && Number.isFinite(toSec) && toSec > fromSec) {
      queryParts.push(`from=${encodeURIComponent(String(fromSec))}`);
      queryParts.push(`to=${encodeURIComponent(String(toSec))}`);
    }

    const data = await fetchJsonFromApi(`/api/history?${queryParts.join("&")}`);

    const parsedProxyHistory = parseHistoryPayload(data);
    if (parsedProxyHistory) return parsedProxyHistory;

    const parsedLegacyHistory = await fetchLegacyProxyHistory();
    if (parsedLegacyHistory) return parsedLegacyHistory;
  } catch {
    // Fall through to educational sample data.
  }

  return getFallbackHistoricalData(normalizedTicker);
}

async function renderSimChart() {
  const canvas = document.getElementById("simChart");
  if (!canvas) return;

  const chartTypeSelect = document.getElementById("chartTypeSelect");
  const chartStatus = document.getElementById("simChartStatus");
  const tickerInput = document.getElementById("simTicker");
  const ticker = (tickerInput?.value || "AAPL").trim().toUpperCase() || "AAPL";
  const modeType = chartTypeSelect ? chartTypeSelect.value : "line";

  if (chartStatus) chartStatus.textContent = `Loading ${ticker} chart...`;

  try {
    if (simChartState.ticker !== ticker || !simChartState.historySet) {
      const [baseHistory, oneMonthHistory, fiveDayHistory, oneDayHistory] = await Promise.all([
        getHistoricalData(ticker, { range: "1y", interval: "1d" }),
        getHistoricalData(ticker, { range: "1mo", interval: "1h" }),
        getHistoricalData(ticker, { range: "5d", interval: "30m" }),
        getHistoricalData(ticker, { range: "1d", interval: "5m" })
      ]);

      simChartState.ticker = ticker;
      simChartState.historySet = {
        base: baseHistory,
        oneMonth: oneMonthHistory,
        fiveDay: fiveDayHistory,
        oneDay: oneDayHistory
      };
      simChartState.history = baseHistory;
    }

    simChartState.mode = modeType;

    const baseWindow = getWindowFromHistory(simChartState.historySet.base, simChartState.zoomStart, simChartState.zoomEnd);
    const windowed = selectResolutionWindowFromSet(simChartState.historySet, baseWindow);
    const prices = windowed?.prices || [];
    const candles = windowed?.candles || [];
    const timestamps = windowed?.timestamps || [];

    if (!prices.length) {
      if (chartStatus) chartStatus.textContent = `Unable to load chart for ${ticker}.`;
      return;
    }

    const latestPrice = prices[prices.length - 1];
    const isLive = Boolean(windowed?.isLive);
    const sourceLabel = isLive ? `Live market snapshot (${windowed?.source || "server"})` : "Educational sample";
    const startDate = timestamps[0] ? formatRangeDate(timestamps[0]) : "N/A";
    const endDate = timestamps[timestamps.length - 1] ? formatRangeDate(timestamps[timestamps.length - 1]) : "N/A";
    const intervalText = windowed?.interval ? ` • ${String(windowed.interval).toUpperCase()} bars` : "";

    if (chartStatus) {
      chartStatus.textContent = `${ticker} • ${startDate} to ${endDate}${intervalText} • $${latestPrice.toFixed(2)} • ${sourceLabel}`;
    }

    if (canvas.width < 1 || canvas.height < 1) {
      canvas.width = 640;
      canvas.height = 320;
    }

    resizeChartOverlay();

    if (modeType === "candlestick") {
      drawAnalysisCandlestickChart(canvas, candles, timestamps);
      return;
    }

    if (modeType === "ma") {
      drawMovingAverageChart(canvas, prices);
      return;
    }

    if (modeType === "volatility") {
      drawVolatilityChart(canvas, prices);
      return;
    }

    drawAnalysisLineChart(canvas, prices, timestamps);
  } catch (error) {
    if (chartStatus) chartStatus.textContent = `Chart error for ${ticker}.`;
    console.error(error);
  }
}

function getWindowFromHistory(history, zoomStartValue = 0, zoomEndValue = 100) {
  const prices = history?.prices || [];
  const labels = history?.labels || [];
  const timestamps = history?.timestamps || [];
  const candles = history?.candles || [];
  const total = Math.min(prices.length, labels.length, timestamps.length, candles.length || prices.length);

  if (!total) {
    return { prices: [], labels: [], candles: [] };
  }

  const zoomStart = Math.max(0, Math.min(99.5, Number(zoomStartValue) || 0));
  const zoomEnd = Math.max(zoomStart + 0.5, Math.min(100, Number(zoomEndValue) || 100));
  const startIndex = Math.floor((zoomStart / 100) * (total - 1));
  const endIndex = Math.min(total, Math.ceil((zoomEnd / 100) * (total - 1)) + 1);

  return {
    prices: prices.slice(startIndex, endIndex),
    labels: labels.slice(startIndex, endIndex),
    timestamps: timestamps.slice(startIndex, endIndex),
    candles: candles.slice(startIndex, endIndex),
    startIndex,
    endIndex
  };
}

function getAnalysisWindow(history) {
  return getWindowFromHistory(history, analysisChartState.zoomStart, analysisChartState.zoomEnd);
}

function extractHistoryWindowByTimestamp(history, startMs, endMs) {
  const prices = history?.prices || [];
  const labels = history?.labels || [];
  const timestamps = history?.timestamps || [];
  const candles = history?.candles || [];
  if (!timestamps.length) return null;

  const indices = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = Number(timestamps[i]);
    if (!Number.isFinite(ts)) continue;
    if (ts >= startMs && ts <= endMs) indices.push(i);
  }

  if (indices.length < 2) return null;

  const subsetPrices = [];
  const subsetLabels = [];
  const subsetTimestamps = [];
  const subsetCandles = [];
  indices.forEach((idx) => {
    subsetPrices.push(prices[idx]);
    subsetLabels.push(labels[idx]);
    subsetTimestamps.push(timestamps[idx]);
    subsetCandles.push(candles[idx]);
  });

  return {
    prices: subsetPrices,
    labels: subsetLabels,
    timestamps: subsetTimestamps,
    candles: subsetCandles,
    source: history?.source,
    isLive: history?.isLive,
    interval: history?.interval,
    range: history?.range
  };
}

function selectResolutionWindowFromSet(historySet, baseWindow) {
  if (!historySet?.base || !baseWindow?.timestamps?.length) return baseWindow;

  const startMs = Number(baseWindow.timestamps[0]);
  const endMs = Number(baseWindow.timestamps[baseWindow.timestamps.length - 1]);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return baseWindow;

  const spanDays = Math.max(0.001, (endMs - startMs) / (1000 * 60 * 60 * 24));
  const candidates = [historySet.base];
  if (spanDays <= 120 && historySet.oneMonth) candidates.push(historySet.oneMonth);
  if (spanDays <= 20 && historySet.fiveDay) candidates.push(historySet.fiveDay);
  if (spanDays <= 7 && historySet.oneDay) candidates.push(historySet.oneDay);

  let best = {
    ...baseWindow,
    source: historySet.base?.source,
    isLive: historySet.base?.isLive,
    interval: historySet.base?.interval,
    range: historySet.base?.range
  };

  candidates.forEach((history) => {
    const subset = extractHistoryWindowByTimestamp(history, startMs, endMs);
    if (subset && subset.prices.length > (best.prices?.length || 0)) {
      best = subset;
    }
  });

  return best;
}

function selectAnalysisResolutionWindow(baseWindow) {
  return selectResolutionWindowFromSet(analysisChartState.historySet, baseWindow);
}

function getIntervalForVisibleSpan(spanDays) {
  if (spanDays <= 2) return "5m";
  if (spanDays <= 7) return "15m";
  if (spanDays <= 30) return "60m";
  if (spanDays <= 120) return "1h";
  return "1d";
}

async function updateAnalysisDetailWindow() {
  const baseHistory = analysisChartState.history;
  if (!baseHistory || !analysisChartState.ticker) return;

  const baseWindow = getAnalysisWindow(baseHistory);
  if (!baseWindow?.timestamps?.length) return;

  const startMs = Number(baseWindow.timestamps[0]);
  const endMs = Number(baseWindow.timestamps[baseWindow.timestamps.length - 1]);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

  const spanDays = Math.max(0.001, (endMs - startMs) / (1000 * 60 * 60 * 24));
  const interval = getIntervalForVisibleSpan(spanDays);
  const fromSec = Math.floor(startMs / 1000);
  const toSec = Math.ceil(endMs / 1000);
  const requestKey = `${analysisChartState.ticker}|${interval}|${fromSec}|${toSec}`;

  if (analysisChartState.detailRequestKey === requestKey && analysisChartState.detailedWindow) {
    return;
  }

  const token = (analysisChartState.detailRequestToken || 0) + 1;
  analysisChartState.detailRequestToken = token;
  analysisChartState.detailRequestKey = requestKey;

  const detailHistory = await getHistoricalData(analysisChartState.ticker, {
    range: "1y",
    interval,
    fromSec,
    toSec
  });

  if (analysisChartState.detailRequestToken !== token) return;

  const subset = extractHistoryWindowByTimestamp(detailHistory, startMs, endMs);
  if (subset && subset.prices.length >= Math.max(8, baseWindow.prices.length)) {
    analysisChartState.detailedWindow = subset;
  } else {
    analysisChartState.detailedWindow = null;
  }

  renderAnalysisChart();
}

function scheduleAnalysisDetailUpdate() {
  if (analysisDetailFetchTimer) {
    clearTimeout(analysisDetailFetchTimer);
  }
  analysisDetailFetchTimer = setTimeout(() => {
    updateAnalysisDetailWindow();
  }, 180);
}

function expandCandlesForZoom(candles, timestamps, segmentsPerCandle = 20) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { candles: candles || [], timestamps: timestamps || [], prices: (candles || []).map((c) => Number(c?.c)).filter(Number.isFinite) };
  }

  const expandedCandles = [];
  const expandedTimestamps = [];
  const expandedPrices = [];

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const o = Number(candle?.o);
    const h = Number(candle?.h);
    const l = Number(candle?.l);
    const c = Number(candle?.c);
    const tsStart = Number(timestamps[i]);
    const tsEnd = Number(timestamps[i + 1]) || (tsStart + 24 * 60 * 60 * 1000);

    if (![o, h, l, c, tsStart].every(Number.isFinite)) continue;

    const localRange = Math.max(0.0001, h - l);
    for (let s = 0; s < segmentsPerCandle; s += 1) {
      const f0 = s / segmentsPerCandle;
      const f1 = (s + 1) / segmentsPerCandle;
      const jitter = Math.sin((i + 1) * 17 + (s + 1) * 11) * localRange * 0.03;

      let subOpen = o + (c - o) * f0 + jitter;
      let subClose = o + (c - o) * f1 - jitter;
      let subHigh = Math.max(subOpen, subClose) + Math.max(0, h - Math.max(o, c)) * 0.55;
      let subLow = Math.min(subOpen, subClose) - Math.max(0, Math.min(o, c) - l) * 0.55;

      subOpen = Math.max(l, Math.min(h, subOpen));
      subClose = Math.max(l, Math.min(h, subClose));
      subHigh = Math.max(subOpen, subClose, Math.min(h, subHigh));
      subLow = Math.min(subOpen, subClose, Math.max(l, subLow));

      const ts = tsStart + ((tsEnd - tsStart) * (s + 0.5)) / segmentsPerCandle;
      expandedTimestamps.push(ts);
      expandedCandles.push({
        x: expandedCandles.length,
        o: Number(subOpen.toFixed(4)),
        h: Number(subHigh.toFixed(4)),
        l: Number(subLow.toFixed(4)),
        c: Number(subClose.toFixed(4))
      });
      expandedPrices.push(Number(subClose.toFixed(4)));
    }
  }

  return {
    candles: expandedCandles,
    timestamps: expandedTimestamps,
    prices: expandedPrices
  };
}

function formatAxisDate(inputValue, spanMs) {
  const date = typeof inputValue === "number" ? new Date(inputValue) : new Date(inputValue);
  if (Number.isNaN(date.getTime())) return "";

  // Use UTC to avoid timezone day-shift bugs in axis labels.
  const utcOpts = { timeZone: "UTC" };

  if (spanMs <= 1000 * 60 * 60 * 30) {
    return date.toLocaleTimeString([], { ...utcOpts, hour: "numeric", minute: "2-digit" });
  }

  if (spanMs <= 1000 * 60 * 60 * 24 * 14) {
    return date.toLocaleDateString(undefined, { ...utcOpts, weekday: "short", month: "short", day: "numeric" });
  }

  if (spanMs <= 1000 * 60 * 60 * 24 * 420) {
    return date.toLocaleDateString(undefined, { ...utcOpts, month: "short", day: "numeric", year: "numeric" });
  }

  return date.toLocaleDateString(undefined, { ...utcOpts, month: "short", year: "numeric" });
}

function formatRangeDate(inputValue) {
  const date = typeof inputValue === "number" ? new Date(inputValue) : new Date(inputValue);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function drawAnalysisAxes(ctx, chart, prices, timestamps, isDark) {
  const { width, height, left, right, top, bottom } = chart;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const minValue = Math.min(...prices);
  const maxValue = Math.max(...prices);
  const range = Math.max(1, maxValue - minValue);

  ctx.strokeStyle = isDark ? "#334155" : "#dbe7fb";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    const value = maxValue - (range / 4) * i;
    ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";
    ctx.font = "11px Arial";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`$${value.toFixed(2)}`, left - 8, y);
  }
  ctx.setLineDash([]);

  const firstTs = Number(timestamps[0]);
  const lastTs = Number(timestamps[timestamps.length - 1]);
  const spanMs = Number.isFinite(firstTs) && Number.isFinite(lastTs) ? Math.max(1, lastTs - firstTs) : 0;

  const tickCount = Math.min(4, Math.max(1, timestamps.length - 1));
  const tickIndexes = new Set([0, Math.max(0, timestamps.length - 1)]);
  for (let i = 1; i < tickCount; i += 1) {
    tickIndexes.add(Math.round((i / tickCount) * (timestamps.length - 1)));
  }

  Array.from(tickIndexes).sort((a, b) => a - b).forEach((idx) => {
    const x = left + (idx / Math.max(1, timestamps.length - 1)) * chartWidth;
    const label = formatAxisDate(timestamps[idx], spanMs);
    ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, height - bottom + 8);
  });
}

function drawAnalysisLineChart(canvas, prices, timestamps) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !prices.length) return;

  const isDark = document.body.classList.contains("dark-mode");
  const chart = { left: 64, right: 18, top: 20, bottom: 44, width, height };
  const chartWidth = width - chart.left - chart.right;
  const chartHeight = height - chart.top - chart.bottom;
  const minValue = Math.min(...prices);
  const maxValue = Math.max(...prices);
  const range = Math.max(1, maxValue - minValue);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawAnalysisAxes(ctx, chart, prices, timestamps, isDark);

  ctx.beginPath();
  prices.forEach((price, index) => {
    const x = chart.left + (index / Math.max(1, prices.length - 1)) * chartWidth;
    const y = chart.top + chartHeight - ((price - minValue) / range) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#4da3ff";
  ctx.lineWidth = prices.length < 24 ? 3.1 : 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  if (prices.length <= 28) {
    ctx.fillStyle = "#93c5fd";
    prices.forEach((price, index) => {
      const x = chart.left + (index / Math.max(1, prices.length - 1)) * chartWidth;
      const y = chart.top + chartHeight - ((price - minValue) / range) * chartHeight;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawAnalysisCandlestickChart(canvas, candles, timestamps) {
  const { ctx, width, height } = getCanvasMetrics(canvas);
  if (!ctx || !candles.length) return;

  const isDark = document.body.classList.contains("dark-mode");
  const chart = { left: 64, right: 18, top: 20, bottom: 44, width, height };
  const chartWidth = width - chart.left - chart.right;
  const chartHeight = height - chart.top - chart.bottom;

  const values = candles.flatMap((c) => [c.o, c.h, c.l, c.c]).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!values.length) return;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, isDark ? "#11213c" : "#f6fbff");
  gradient.addColorStop(1, isDark ? "#0b1220" : "#ffffff");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const closePrices = candles.map((c) => Number(c.c)).filter(Number.isFinite);
  drawAnalysisAxes(ctx, chart, closePrices.length ? closePrices : [minValue, maxValue], timestamps, isDark);

  // Fewer candles means more visual definition, similar to trading platforms.
  const candlesCount = Math.max(1, candles.length);
  const slotWidth = chartWidth / candlesCount;
  const detailFactor = Math.min(2.2, Math.max(0.9, 130 / candlesCount));
  const candleWidth = Math.max(5, Math.min(slotWidth * 0.94, slotWidth * 0.64 * detailFactor));
  const wickWidth = candlesCount < 80 ? 2.1 : candlesCount < 180 ? 1.8 : 1.5;

  candles.forEach((candle, index) => {
    const open = Number(candle.o);
    const high = Number(candle.h);
    const low = Number(candle.l);
    const close = Number(candle.c);
    if (![open, high, low, close].every(Number.isFinite)) return;

    const x = chart.left + (index + 0.5) * (chartWidth / Math.max(1, candles.length));
    const yHigh = chart.top + ((maxValue - high) / range) * chartHeight;
    const yLow = chart.top + ((maxValue - low) / range) * chartHeight;
    const yOpen = chart.top + ((maxValue - open) / range) * chartHeight;
    const yClose = chart.top + ((maxValue - close) / range) * chartHeight;
    const isUp = close >= open;

    ctx.strokeStyle = isUp ? "#2e8b57" : "#d9534f";
    ctx.lineWidth = wickWidth;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    ctx.fillStyle = isUp ? "rgba(46, 139, 87, 0.9)" : "rgba(217, 83, 79, 0.9)";
    ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(2, Math.abs(yOpen - yClose)));

    if (candlesCount <= 90) {
      ctx.strokeStyle = isUp ? "rgba(34, 197, 94, 0.95)" : "rgba(248, 113, 113, 0.95)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(2, Math.abs(yOpen - yClose)));
    }
  });
}

function renderAnalysisChart() {
  const canvas = document.getElementById("analysisChart");
  const status = document.getElementById("analysisChartStatus");
  if (!canvas || !analysisChartState.history) return;

  const baseWindow = getAnalysisWindow(analysisChartState.history);
  const selectedWindow = selectAnalysisResolutionWindow(baseWindow);
  const windowed = analysisChartState.detailedWindow && analysisChartState.detailedWindow.prices?.length
    ? analysisChartState.detailedWindow
    : selectedWindow;
  if (!windowed.prices.length) {
    if (status) status.textContent = "No chart points available for this range.";
    return;
  }

  if (analysisChartState.mode === "candlestick") {
    drawAnalysisCandlestickChart(canvas, windowed.candles, windowed.timestamps);
  } else {
    drawAnalysisLineChart(canvas, windowed.prices, windowed.timestamps);
  }

  const latest = windowed.prices[windowed.prices.length - 1];
  const sourceText = windowed.isLive ? `Live data (${windowed.source || "server"})` : "Educational sample";
  const startDate = windowed.timestamps[0] ? formatRangeDate(windowed.timestamps[0]) : "N/A";
  const endDate = windowed.timestamps[windowed.timestamps.length - 1]
    ? formatRangeDate(windowed.timestamps[windowed.timestamps.length - 1])
    : "N/A";
  if (status) {
    const intervalText = windowed.interval ? ` • ${String(windowed.interval).toUpperCase()} bars` : "";
    status.textContent = `${analysisChartState.ticker} • ${startDate} to ${endDate} • ${analysisChartState.mode === "candlestick" ? "Candlestick" : "Line"}${intervalText} • $${latest.toFixed(2)} • ${sourceText}`;
  }
}

function renderPortfolioChart() {
  const canvas = document.getElementById("portfolioChart");
  const status = document.getElementById("portfolioChartStatus");
  if (!canvas || !portfolioChartState.history) return;

  const prices = (portfolioChartState.history.prices || []).slice(-120);
  const candles = (portfolioChartState.history.candles || []).slice(-120);

  if (!prices.length) {
    if (status) status.textContent = `No chart data for ${portfolioChartState.ticker}.`;
    return;
  }

  if (portfolioChartState.mode === "candlestick") {
    drawCandlestickChart(canvas, candles);
  } else {
    drawLineChart(canvas, prices);
  }

  const latest = prices[prices.length - 1];
  const sourceText = portfolioChartState.history.isLive ? `Live data (${portfolioChartState.history.source || "server"})` : "Educational sample";
  if (status) {
    status.textContent = `${portfolioChartState.ticker} • ${portfolioChartState.mode === "candlestick" ? "Candlestick" : "Line"} • $${latest.toFixed(2)} • ${sourceText}`;
  }
}

async function loadPortfolioChart(ticker) {
  const chartCanvas = document.getElementById("portfolioChart");
  const status = document.getElementById("portfolioChartStatus");
  if (!chartCanvas) return;

  if (status) status.textContent = `Loading ${ticker} chart...`;

  const history = await getHistoricalData(ticker);
  portfolioChartState.ticker = ticker;
  portfolioChartState.history = history;

  renderPortfolioChart();
}

function setupPortfolioChartControls() {
  const chartCanvas = document.getElementById("portfolioChart");
  if (!chartCanvas) return;

  const tickerInput = document.getElementById("portfolioChartTicker");
  const loadBtn = document.getElementById("portfolioChartLoadBtn");
  const typeSelect = document.getElementById("portfolioChartType");

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      portfolioChartState.mode = typeSelect.value;
      renderPortfolioChart();
    });
  }

  if (tickerInput) {
    tickerInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const ticker = normalizeTicker(tickerInput.value);
      await loadPortfolioChart(ticker);
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", async () => {
      const ticker = normalizeTicker(tickerInput?.value || portfolio[0]?.ticker || "AAPL");
      if (tickerInput) tickerInput.value = ticker;
      await loadPortfolioChart(ticker);
    });
  }
}

function setupSimChartControls() {
  const chartCanvas = document.getElementById("simChart");
  if (!chartCanvas) return;

  const startSlider = document.getElementById("simRangeStart");
  const endSlider = document.getElementById("simRangeEnd");
  const startLabel = document.getElementById("simRangeStartLabel");
  const endLabel = document.getElementById("simRangeEndLabel");

  if (!startSlider || !endSlider) return;

  const formatPercent = (value) => {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  };

  const applySliders = () => {
    const startValue = Math.max(0, Math.min(99.5, Number(startSlider.value || 0)));
    const endValue = Math.max(startValue + 0.5, Math.min(100, Number(endSlider.value || 100)));

    simChartState.zoomStart = startValue;
    simChartState.zoomEnd = endValue;
    startSlider.value = String(startValue);
    endSlider.value = String(endValue);
    if (startLabel) startLabel.textContent = formatPercent(startValue);
    if (endLabel) endLabel.textContent = formatPercent(endValue);

    renderSimChart();
  };

  const applyZoomFactor = (factor) => {
    const startValue = Math.max(0, Math.min(99.5, Number(startSlider.value || simChartState.zoomStart || 0)));
    const endValue = Math.max(startValue + 0.5, Math.min(100, Number(endSlider.value || simChartState.zoomEnd || 100)));
    const width = endValue - startValue;
    const center = startValue + width / 2;
    const nextWidth = Math.max(0.5, Math.min(100, width * factor));

    const nextStart = Math.max(0, Math.min(100 - nextWidth, center - nextWidth / 2));
    const nextEnd = Math.min(100, nextStart + nextWidth);

    startSlider.value = String(Math.round(nextStart * 10) / 10);
    endSlider.value = String(Math.round(nextEnd * 10) / 10);
    applySliders();
  };

  startSlider.addEventListener("input", applySliders);
  endSlider.addEventListener("input", applySliders);

  chartCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY < 0) applyZoomFactor(0.86);
    else applyZoomFactor(1.16);
  }, { passive: false });

  applySliders();
}

function setupAnalysisChartControls() {
  const chartCanvas = document.getElementById("analysisChart");
  if (!chartCanvas) return;

  const typeSelect = document.getElementById("analysisChartType");
  const startSlider = document.getElementById("analysisRangeStart");
  const endSlider = document.getElementById("analysisRangeEnd");
  const startLabel = document.getElementById("analysisRangeStartLabel");
  const endLabel = document.getElementById("analysisRangeEndLabel");

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      analysisChartState.mode = typeSelect.value;
      renderAnalysisChart();
    });
  }

  const formatPercent = (value) => {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  };

  const applySliders = () => {
    const startValue = Math.max(0, Math.min(99.5, Number(startSlider?.value || 0)));
    const endValue = Math.max(startValue + 0.5, Math.min(100, Number(endSlider?.value || 100)));
    analysisChartState.zoomStart = startValue;
    analysisChartState.zoomEnd = endValue;

    if (startSlider) startSlider.value = String(startValue);
    if (endSlider) endSlider.value = String(endValue);
    if (startLabel) startLabel.textContent = formatPercent(startValue);
    if (endLabel) endLabel.textContent = formatPercent(endValue);

    analysisChartState.detailedWindow = null;
    renderAnalysisChart();
    scheduleAnalysisDetailUpdate();
  };

  const applyZoomFactor = (factor) => {
    const startValue = Math.max(0, Math.min(99.5, Number(startSlider?.value || analysisChartState.zoomStart || 0)));
    const endValue = Math.max(startValue + 0.5, Math.min(100, Number(endSlider?.value || analysisChartState.zoomEnd || 100)));
    const width = endValue - startValue;
    const center = startValue + width / 2;
    const nextWidth = Math.max(0.5, Math.min(100, width * factor));

    const nextStart = Math.max(0, Math.min(100 - nextWidth, center - nextWidth / 2));
    const nextEnd = Math.min(100, nextStart + nextWidth);

    if (startSlider) startSlider.value = String(Math.round(nextStart));
    if (endSlider) endSlider.value = String(Math.round(nextEnd));
    applySliders();
  };

  if (startSlider) startSlider.addEventListener("input", applySliders);
  if (endSlider) endSlider.addEventListener("input", applySliders);

  // Support two-finger trackpad pinch zoom (Ctrl+Wheel) and wheel zoom on chart.
  chartCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.deltaY < 0) applyZoomFactor(0.86);
    else applyZoomFactor(1.16);
  }, { passive: false });

  applySliders();
}

async function loadAnalysisChart(ticker, forceRefresh = false) {
  const chartCanvas = document.getElementById("analysisChart");
  const status = document.getElementById("analysisChartStatus");
  if (!chartCanvas) return;

  const normalizedTicker = normalizeTicker(ticker);
  const configs = {
    base: { range: "1y", interval: "1d" },
    oneMonth: { range: "1mo", interval: "1h" },
    fiveDay: { range: "5d", interval: "30m" },
    oneDay: { range: "1d", interval: "5m" }
  };

  if (analysisChartState.ticker !== normalizedTicker) {
    analysisChartState.historyCache = {};
  }

  if (!forceRefresh && analysisChartState.historyCache[normalizedTicker]) {
    analysisChartState.ticker = normalizedTicker;
    analysisChartState.historySet = analysisChartState.historyCache[normalizedTicker];
    analysisChartState.history = analysisChartState.historySet?.base || null;
    analysisChartState.detailedWindow = null;
    renderAnalysisChart();
    scheduleAnalysisDetailUpdate();
    return;
  }

  if (status) status.textContent = `Loading ${normalizedTicker} chart...`;

  const [baseHistory, oneMonthHistory, fiveDayHistory, oneDayHistory] = await Promise.all([
    getHistoricalData(normalizedTicker, configs.base),
    getHistoricalData(normalizedTicker, configs.oneMonth),
    getHistoricalData(normalizedTicker, configs.fiveDay),
    getHistoricalData(normalizedTicker, configs.oneDay)
  ]);

  const historySet = {
    base: baseHistory,
    oneMonth: oneMonthHistory,
    fiveDay: fiveDayHistory,
    oneDay: oneDayHistory
  };

  analysisChartState.ticker = normalizedTicker;
  analysisChartState.historySet = historySet;
  analysisChartState.history = historySet.base;
  analysisChartState.detailedWindow = null;
  analysisChartState.detailRequestKey = "";
  analysisChartState.historyCache[normalizedTicker] = historySet;
  analysisChartState.zoomStart = 0;
  analysisChartState.zoomEnd = 100;

  const startSlider = document.getElementById("analysisRangeStart");
  const endSlider = document.getElementById("analysisRangeEnd");
  const startLabel = document.getElementById("analysisRangeStartLabel");
  const endLabel = document.getElementById("analysisRangeEndLabel");
  if (startSlider) startSlider.value = "0";
  if (endSlider) endSlider.value = "100";
  if (startLabel) startLabel.textContent = "0%";
  if (endLabel) endLabel.textContent = "100%";

  renderAnalysisChart();
  scheduleAnalysisDetailUpdate();
}

async function runStockAnalysis() {
  const tickerInput = document.getElementById("stockTicker");
  const resultBox = document.getElementById("analysisResult");
  if (!tickerInput || !resultBox) return;

  const ticker = normalizeTicker(tickerInput.value);
  if (!ticker) {
    resultBox.innerHTML = "Please enter a ticker.";
    return;
  }

  resultBox.innerHTML = "Loading analysis...";

  const price = await getPrice(ticker);
  const profile = await getCompanyProfile(ticker);

  if (!price) {
    resultBox.innerHTML = "Could not fetch price.";
    displayCompanyProfile(null);
    displayCompanySummary(null);
    return;
  }

  const companyName = profile?.name || ticker;
  const sector = profile?.finnhubIndustry || profile?.industry || "market";
  const exchange = profile?.exchange || "the market";
  const marketCap = Number(profile?.marketCapitalization);

  resultBox.innerHTML = `
    <h2>${ticker}</h2>
    <p class="analysis-price">${formatCurrency(price)}</p>
    <p><strong>${companyName}</strong> is a ${String(sector).toLowerCase()} company listed on ${String(exchange).toLowerCase()}.</p>
    <div class="analysis-metrics">
      <span class="metric-pill">Market cap: ${Number.isFinite(marketCap) ? formatMarketCap(marketCap) : "N/A"}</span>
      <span class="metric-pill">Exchange: ${exchange}</span>
      <span class="metric-pill">Industry: ${sector}</span>
    </div>
  `;

  displayCompanyProfile(profile);
  displayCompanySummary(profile);
  await loadAnalysisChart(ticker);
}

document.addEventListener("DOMContentLoaded", () => {
  setupSimChartControls();
  setupPortfolioChartControls();
  setupAnalysisChartControls();
  const scrollElements = document.querySelectorAll(".scroll-animate");

  function checkScroll() {
    scrollElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 100) {
        el.classList.add("visible");
      }
    });
  }

  window.addEventListener("scroll", checkScroll);
  checkScroll();
});
