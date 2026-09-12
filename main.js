/* ============================================================
   MAIN APPLICATION
   Owns App.state and wires every module together. Kept as one
   file (rather than a framework) so the whole prototype runs by
   opening index.html directly — no build step, no server.
   ============================================================ */

const App = (() => {
  const state = {
    habitat: { name: "", type: "town", lat: 12.9716, lng: 77.5946 },
    params: null,
    grid: null,
    result: null,
    baselineResult: null,
    events: { floodYears: [], landslideYears: [], surgeYears: [], accidentYears: [] },
    sensitivityResults: null,
    selectedYear: 20,
    chatHistory: []
  };

  const FIELD_MAP = [
    ["demography", "population", "number"], ["demography", "growthRatePct", "float"],
    ["demography", "floatingPopPct", "float"], ["demography", "householdSize", "float"],
    ["demography", "literacyPct", "float"],
    ["infrastructure", "roadCoveragePct", "float"], ["infrastructure", "institutions", "number"],
    ["infrastructure", "collectionVehicles", "number"], ["infrastructure", "collectionPointDensity", "float"],
    ["infrastructure", "existingLandfillCapacityTonnes", "number"],
    ["industrial", "hasOrganizedIndustry", "bool"], ["industrial", "industrialWasteTonnesPerDay", "float"],
    ["industrial", "hazardousSharePct", "float"],
    ["naturalResources", "annualRainfallMm", "number"], ["naturalResources", "waterBodies", "number"],
    ["naturalResources", "forestCoverPct", "float"],
    ["terrain", "slope", "string"], ["terrain", "soilType", "string"], ["terrain", "floodProne", "bool"],
    ["economic", "perCapitaIncomeAnnual", "number"], ["economic", "annualBudgetInr", "number"],
    ["economic", "willingnessToPayPct", "float"],
    ["cultural", "dietType", "string"], ["cultural", "segregationAdherencePct", "float"],
    ["cultural", "festivalSpikePct", "float"], ["cultural", "localPracticeNotes", "string"]
  ];
  const fieldId = (cat, key) => `param-${cat}-${key}`;

  function loadParamsToForm() {
    FIELD_MAP.forEach(([cat, key, type]) => {
      const el = document.getElementById(fieldId(cat, key));
      if (!el) return;
      const val = state.params[cat][key];
      if (type === "bool") el.checked = !!val; else el.value = val;
      const echo = document.getElementById(fieldId(cat, key) + "-echo");
      if (echo) echo.textContent = val;
    });
  }

  function readParamsFromForm() {
    FIELD_MAP.forEach(([cat, key, type]) => {
      const el = document.getElementById(fieldId(cat, key));
      if (!el) return;
      if (type === "bool") state.params[cat][key] = el.checked;
      else if (type === "number") state.params[cat][key] = parseInt(el.value, 10) || 0;
      else if (type === "float") state.params[cat][key] = parseFloat(el.value) || 0;
      else state.params[cat][key] = el.value;
      const echo = document.getElementById(fieldId(cat, key) + "-echo");
      if (echo) echo.textContent = el.value;
    });
  }

  // ---------- Tabs ----------
  function showTab(id) {
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + id));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.tab === id));
    if (id === "forecast") renderForecast();
    if (id === "budget") renderBudget();
    if (id === "optimization") renderOptimization();
    if (id === "sensitivity" && state.sensitivityResults) renderSensitivity();
  }

  // ---------- Simulation ----------
  function runSimulation(keepBaseline) {
    readParamsFromForm();
    state.result = SimEngine.run(state.params, state.grid, state.events);
    if (!keepBaseline || !state.baselineResult) {
      // baseline = same params, zero shocks, computed once per parameter set
      state.baselineResult = SimEngine.run(state.params, state.grid, {});
    }
    renderKpiDock();
    renderForecast();
    renderBudget();
  }

  function renderKpiDock() {
    const y = state.result.years[state.selectedYear - 1] || state.result.years[state.result.years.length - 1];
    document.getElementById("kpi-resilience").textContent = y.resilience + "/100";
    document.getElementById("kpi-circular").textContent = y.circularIndex + "%";
    document.getElementById("kpi-landfill").textContent = y.landfillLifeYears + " yrs";
    document.getElementById("kpi-cost").textContent = "₹" + (y.totalCost / 100000).toFixed(1) + "L";
    document.getElementById("year-badge").textContent = "Year " + y.year + " (" + y.calendarYear + ")";
  }

  function renderForecast() {
    if (!state.result) return;
    Charts.wasteTrend(document.getElementById("chart-waste-trend"), state.result.years, state.baselineResult && state.baselineResult.years);
    Charts.compositionDonut(document.getElementById("chart-composition"), state.result.comp);
    Charts.landfillLine(document.getElementById("chart-landfill"), state.result.years);
    Charts.carbonBars(document.getElementById("chart-carbon"), state.result.years);
    renderYearSnapshot();
  }

  function renderYearSnapshot() {
    const y = state.result.years[state.selectedYear - 1];
    const box = document.getElementById("year-snapshot");
    box.innerHTML = `
      <div><span>Population</span><strong>${y.population.toLocaleString("en-IN")}</strong></div>
      <div><span>Waste generated</span><strong>${y.annualGeneratedTonnes.toLocaleString("en-IN")} t/yr</strong></div>
      <div><span>Collection efficiency</span><strong>${y.collectionEff}%</strong></div>
      <div><span>Diverted from landfill</span><strong>${y.circularIndex}%</strong></div>
      <div><span>Landfill remaining</span><strong>${y.landfillRemaining.toLocaleString("en-IN")} t</strong></div>
      <div><span>Total cost this year</span><strong>₹${y.totalCost.toLocaleString("en-IN")}</strong></div>
      ${(y.events.flood || y.events.landslide || y.events.accident || y.events.surge) ?
        `<div class="snapshot-flag">⚠ ${Object.entries(y.events).filter(([,v])=>v).map(([k])=>k).join(", ")} this year</div>` : ""}
    `;
    const fillPct = Math.max(0, Math.min(100, 100 - (y.landfillRemaining / state.params.infrastructure.existingLandfillCapacityTonnes) * 100));
    document.getElementById("landfill-gauge-fill").style.height = fillPct + "%";
    document.getElementById("landfill-gauge-label").textContent = Math.round(fillPct) + "% full";
  }

  // ---------- Scenarios ----------
  function applyScenario(kind, yearIdx) {
    const map = { flood: "floodYears", landslide: "landslideYears", accident: "accidentYears" };
    if (kind === "surge") {
      state.events.surgeYears.push({ year: yearIdx, pct: 18 });
    } else {
      const key = map[kind];
      if (!state.events[key].includes(yearIdx)) state.events[key].push(yearIdx);
    }
    runSimulation(true);
    renderScenarioLog();
  }

  function clearScenarios() {
    state.events = { floodYears: [], landslideYears: [], surgeYears: [], accidentYears: [] };
    runSimulation(true);
    renderScenarioLog();
  }

  function renderScenarioLog() {
    const el = document.getElementById("scenario-log");
    const items = [];
    state.events.floodYears.forEach(y => items.push(`Flood — Year ${y + 1}`));
    state.events.landslideYears.forEach(y => items.push(`Landslide — Year ${y + 1}`));
    state.events.accidentYears.forEach(y => items.push(`Industrial accident — Year ${y + 1}`));
    state.events.surgeYears.forEach(s => items.push(`Population surge (+${s.pct}%) — Year ${s.year + 1}`));
    el.innerHTML = items.length ? items.map(i => `<li>${i}</li>`).join("") : `<li class="muted">No active scenarios — this is the baseline plan.</li>`;
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = value;
  }

  // ---------- Sensitivity ----------
  function runSensitivity() {
    readParamsFromForm();
    state.sensitivityResults = SimEngine.sensitivity(state.params, state.grid, [
      { path: "demography.growthRatePct", label: "Population growth rate" },
      { path: "naturalResources.annualRainfallMm", label: "Annual rainfall" },
      { path: "economic.perCapitaIncomeAnnual", label: "Per-capita income" },
      { path: "cultural.segregationAdherencePct", label: "Segregation adherence" },
      { path: "infrastructure.roadCoveragePct", label: "Road coverage" },
      { path: "infrastructure.collectionVehicles", label: "Collection fleet size" }
    ]);
    renderSensitivity();
  }
  function renderSensitivity() {
    Charts.tornado(document.getElementById("chart-tornado"), state.sensitivityResults);
  }

  // ---------- Optimization ----------
  function renderOptimization() {
    if (!state.result) return;
    const canvas = document.getElementById("opt-grid-canvas");
    const site = SimEngine.optimizeFacilitySite(state.grid);
    MapZones.renderGrid(canvas, state.grid, false, site);
    const last = state.result.years[state.result.years.length - 1];
    const routes = SimEngine.optimizeRoutes(state.grid, last.vehiclesNeeded);
    document.getElementById("opt-summary").innerHTML = `
      <div class="opt-card"><span>Recommended facility cell</span><strong>${site ? `Row ${site.row + 1}, Col ${site.col + 1}` : "Zone the map first"}</strong></div>
      <div class="opt-card"><span>Recommended fleet size (Y20)</span><strong>${last.vehiclesNeeded} vehicles</strong></div>
      <div class="opt-card"><span>Proposed collection routes</span><strong>${routes.length} zone-clustered routes</strong></div>
    `;
    document.getElementById("opt-routes").innerHTML = routes.map((r, i) =>
      `<li>Route ${i + 1}: ${r.cells.length} cells, relative load ${r.load.toFixed(1)}</li>`).join("");
  }

  // ---------- Budget ----------
  function renderBudget() {
    if (!state.result) return;
    Charts.budgetBars(document.getElementById("chart-budget"), state.result.years);
    const tbody = document.getElementById("budget-table-body");
    tbody.innerHTML = state.result.years.map(y => `
      <tr class="${y.budgetDeficit > 0 ? "row-deficit" : ""}">
        <td>${y.year}</td><td>₹${y.opex.toLocaleString("en-IN")}</td><td>₹${y.capex.toLocaleString("en-IN")}</td>
        <td>₹${y.totalCost.toLocaleString("en-IN")}</td><td>${y.budgetDeficit > 0 ? "₹" + y.budgetDeficit.toLocaleString("en-IN") : "—"}</td>
      </tr>`).join("");
  }

  // ---------- Report ----------
  function generateReport() {
    if (!state.result) return;
    const report = Report.build(state.habitat, state.params, state.result);
    document.getElementById("report-container").innerHTML = Report.renderHTML(report);
  }

  // ---------- Chat ----------
  function appendChatMessage(role, text) {
    state.chatHistory.push({ role, text });
    const log = document.getElementById("chat-log");
    const div = document.createElement("div");
    div.className = "chat-msg chat-" + role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  async function handleChatSubmit(text) {
    if (!text.trim()) return;
    appendChatMessage("user", text);
    const ctx = {
      params: state.params, grid: state.grid, result: state.result,
      applyScenario: (kind, yearIdx) => applyScenario(kind, yearIdx),
      applyParamChange: (path, fn) => { setPath(state.params, path, fn(state.params)); loadParamsToForm(); runSimulation(true); },
      generateReport
    };
    const outcome = await Promise.resolve(Chatbot.respond(text, ctx));
    appendChatMessage("bot", outcome.text);
    if (outcome.actions && outcome.actions.openReport) showTab("report");
    renderKpiDock();
  }

  // ---------- Wiring ----------
  function wireStaticUI() {
    document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

    document.getElementById("habitat-name").addEventListener("input", e => { state.habitat.name = e.target.value; });
    document.getElementById("habitat-type").addEventListener("change", e => {
      state.habitat.type = e.target.value;
      state.params = buildDefaultParams(state.habitat.type);
      state.grid = buildDefaultGrid(state.habitat.type);
      loadParamsToForm();
      MapZones.renderGrid(document.getElementById("zone-canvas"), state.grid, true);
      runSimulation(false);
    });
    document.getElementById("habitat-lat").addEventListener("change", e => { state.habitat.lat = parseFloat(e.target.value); MapZones.recenter(state.habitat.lat, state.habitat.lng); });
    document.getElementById("habitat-lng").addEventListener("change", e => { state.habitat.lng = parseFloat(e.target.value); MapZones.recenter(state.habitat.lat, state.habitat.lng); });

    MapZones.setLocationChangeHandler((lat, lng) => {
      state.habitat.lat = lat; state.habitat.lng = lng;
      document.getElementById("habitat-lat").value = lat.toFixed(5);
      document.getElementById("habitat-lng").value = lng.toFixed(5);
    });
    MapZones.setGridChangeHandler(() => {});

    document.getElementById("btn-run-simulation").addEventListener("click", () => { runSimulation(false); showTab("forecast"); });

    FIELD_MAP.forEach(([cat, key]) => {
      const el = document.getElementById(fieldId(cat, key));
      if (el) el.addEventListener("input", () => {
        const echo = document.getElementById(fieldId(cat, key) + "-echo");
        if (echo) echo.textContent = el.value;
      });
    });

    document.getElementById("year-slider").addEventListener("input", e => {
      state.selectedYear = parseInt(e.target.value, 10);
      document.getElementById("year-slider-label").textContent = "Year " + state.selectedYear;
      renderYearSnapshot();
      renderKpiDock();
    });

    document.querySelectorAll("[data-scenario]").forEach(btn => btn.addEventListener("click", () => {
      const yearInput = document.getElementById("scenario-year");
      const yearIdx = Math.min(19, Math.max(0, parseInt(yearInput.value, 10) - 1 || 5));
      applyScenario(btn.dataset.scenario, yearIdx);
    }));
    document.getElementById("btn-clear-scenarios").addEventListener("click", clearScenarios);

    document.getElementById("btn-run-sensitivity").addEventListener("click", runSensitivity);
    document.getElementById("btn-generate-report").addEventListener("click", () => { generateReport(); showTab("report"); });
    document.getElementById("btn-print-report").addEventListener("click", () => window.print());

    // chat
    document.getElementById("chat-toggle").addEventListener("click", () => document.getElementById("chat-panel").classList.toggle("open"));
    document.getElementById("chat-form").addEventListener("submit", e => {
      e.preventDefault();
      const input = document.getElementById("chat-input");
      handleChatSubmit(input.value);
      input.value = "";
    });
    document.getElementById("btn-save-api-key").addEventListener("click", () => {
      const key = document.getElementById("api-key-input").value;
      Chatbot.setApiKey(key);
      localStorage.setItem("swms_api_key", key || "");
      document.getElementById("api-key-status").textContent = key ? "AI fallback enabled." : "AI fallback off — rule-based only.";
    });
    const savedKey = localStorage.getItem("swms_api_key");
    if (savedKey) { document.getElementById("api-key-input").value = savedKey; Chatbot.setApiKey(savedKey); document.getElementById("api-key-status").textContent = "AI fallback enabled."; }

    // voice input (optional, degrades gracefully)
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById("chat-mic");
    if (Recognition) {
      const recog = new Recognition();
      recog.lang = "en-IN";
      recog.onresult = e => { document.getElementById("chat-input").value = e.results[0][0].transcript; };
      micBtn.addEventListener("click", () => recog.start());
    } else {
      micBtn.style.display = "none";
    }
  }

  function init() {
    state.params = buildDefaultParams(state.habitat.type);
    state.grid = buildDefaultGrid(state.habitat.type);
    wireStaticUI();
    loadParamsToForm();
    document.getElementById("habitat-type").value = state.habitat.type;
    document.getElementById("habitat-lat").value = state.habitat.lat;
    document.getElementById("habitat-lng").value = state.habitat.lng;
    MapZones.initMap("leaflet-map", state.habitat.lat, state.habitat.lng);
    MapZones.renderPalette(document.getElementById("zone-palette"));
    MapZones.renderGrid(document.getElementById("zone-canvas"), state.grid, true);
    runSimulation(false);
    appendChatMessage("bot", "Hi — I'm the planning assistant for this habitat. Ask me about waste volumes, costs, landfill life, or try \"simulate a flood in year 6\".");
    renderScenarioLog();
    showTab("setup");

    // Register the service worker so the app keeps working offline after first load,
    // and so it can be installed to a phone home screen from the manifest.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
