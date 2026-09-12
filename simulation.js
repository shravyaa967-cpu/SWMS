/* ============================================================
   SIMULATION ENGINE
   Pure functions: (params, grid, events) -> 20-year projection.
   No DOM access here — keeps the engine testable and reusable
   from both the UI and the conversational layer.
   ============================================================ */

const SimEngine = (() => {

  function perCapitaKg(params) {
    const income = params.economic.perCapitaIncomeAnnual;
    let kg = ASSUMPTIONS.baseGenerationKgPerCapita +
             Math.max(0, income - 60000) * ASSUMPTIONS.incomeGenerationSensitivity;
    if (params.cultural.dietType === "nonveg") kg *= 1.05;
    if (params.cultural.dietType === "veg") kg *= 0.96;
    return kg;
  }

  function compositionFractions(params) {
    let organic = 0.55, recyclable = 0.20, hazardous = 0.02;
    if (params.cultural.dietType === "veg") organic += 0.07;
    if (params.cultural.dietType === "nonveg") organic -= 0.04;
    if (params.industrial.hasOrganizedIndustry) {
      hazardous += params.industrial.hazardousSharePct / 100 * 0.5;
      recyclable += 0.04;
    }
    const inert = Math.max(0.08, 1 - organic - recyclable - hazardous);
    return { organic, recyclable, hazardous, inert };
  }

  function baseCollectionEfficiency(params) {
    const infra = params.infrastructure;
    const vehicleAdequacy = Math.min(1, infra.collectionVehicles / Math.max(1, params.demography.population / 9000));
    let eff = 40 + infra.roadCoveragePct * 0.28 + infra.collectionPointDensity * 0.22 + vehicleAdequacy * 12;
    if (params.terrain.slope === "hilly") eff -= 6;
    return Math.max(25, Math.min(96, eff));
  }

  /**
   * Run the full 20-year simulation.
   * @param params  full 7-category parameter object
   * @param grid    zone grid (for context; used by optimizer, not required here)
   * @param events  { floodYears:[], landslideYears:[], surgeYears:[{year,pct}], accidentYears:[] }
   */
  function run(params, grid, events = {}) {
    events = Object.assign({ floodYears: [], landslideYears: [], surgeYears: [], accidentYears: [] }, events);
    const perCapita = perCapitaKg(params);
    const comp = compositionFractions(params);
    const baseEff = baseCollectionEfficiency(params);

    let landfillRemaining = params.infrastructure.existingLandfillCapacityTonnes;
    let compostCapacity = params.demography.population * 0.00006 * 365; // tonnes/yr installed capacity
    let recycleCapacity = params.demography.population * 0.00004 * 365;
    let wteCapacity = 0;
    let population = params.demography.population;
    let cumulativeSpend = 0;
    const years = [];

    for (let y = 0; y < 20; y++) {
      const calendarYear = new Date().getFullYear() + y;

      // population surge events permanently rebase population
      const surge = events.surgeYears.find(s => s.year === y);
      if (surge) population = population * (1 + surge.pct / 100);
      if (y > 0) population = population * (1 + params.demography.growthRatePct / 100);
      const floatingAdj = population * (params.demography.floatingPopPct / 100);
      const effectivePop = population + floatingAdj;

      let wasteTonnesDay = (effectivePop * perCapita) / 1000 +
                            params.industrial.industrialWasteTonnesPerDay * Math.pow(1 + params.demography.growthRatePct / 200, y);

      const isFlood = events.floodYears.includes(y);
      const isLandslide = events.landslideYears.includes(y);
      const isAccident = events.accidentYears.includes(y);

      let debrisTonnesYear = 0;
      let emergencyCost = 0;
      let effModifier = 0;

      if (isFlood) {
        const debrisPct = params.terrain.floodProne ? 0.28 : 0.16;
        debrisTonnesYear = wasteTonnesDay * 365 * debrisPct;
        effModifier -= 18;
        emergencyCost += debrisTonnesYear * ASSUMPTIONS.emergencyFloodCostPerAffectedTonne;
      }
      if (isLandslide) {
        effModifier -= 26;
        emergencyCost += ASSUMPTIONS.landslideRoadRepairCost;
      }
      if (isAccident) {
        emergencyCost += ASSUMPTIONS.industrialAccidentCost;
        wasteTonnesDay *= 1.03;
      }

      const segregationBonus = (params.cultural.segregationAdherencePct - 34) * 0.15;
      const collectionEff = Math.max(20, Math.min(97, baseEff + effModifier + segregationBonus + y * 0.35));

      const annualGeneratedTonnes = wasteTonnesDay * 365 * (1 + params.cultural.festivalSpikePct / 100 * 0.06) + debrisTonnesYear;
      const collectedTonnes = annualGeneratedTonnes * (collectionEff / 100);
      const uncollectedTonnes = annualGeneratedTonnes - collectedTonnes;

      // route collected waste to treatment streams, respecting installed capacity
      const organicAvailable = collectedTonnes * comp.organic;
      const recyclableAvailable = collectedTonnes * comp.recyclable;

      const composted = Math.min(organicAvailable, compostCapacity);
      const recycled = Math.min(recyclableAvailable, recycleCapacity);
      let remainderAfterCR = collectedTonnes - composted - recycled;
      const wteProcessed = Math.min(remainderAfterCR * 0.4, wteCapacity);
      remainderAfterCR -= wteProcessed;
      const landfilled = remainderAfterCR + uncollectedTonnes * 0.5; // half of uncollected eventually dumped informally into system

      landfillRemaining -= landfilled;

      // capacity expansion triggers (simple capex rule)
      let capex = 0;
      if (organicAvailable > compostCapacity * 0.92) { compostCapacity *= 1.35; capex += ASSUMPTIONS.facilityCapexComposting; }
      if (recyclableAvailable > recycleCapacity * 0.92) { recycleCapacity *= 1.35; capex += ASSUMPTIONS.facilityCapexRecycling; }
      if (y === 4 || (landfillRemaining < params.infrastructure.existingLandfillCapacityTonnes * 0.25 && wteCapacity === 0)) {
        if (wteCapacity === 0 && (params.demography.population > 30000 || y >= 4)) {
          wteCapacity = collectedTonnes * 0.25;
          capex += ASSUMPTIONS.facilityCapexWTE;
        }
      }

      const vehiclesNeeded = Math.ceil((wasteTonnesDay * 1.15) / ASSUMPTIONS.vehicleCapacityTonnes);
      const fleetCost = vehiclesNeeded * ASSUMPTIONS.vehicleAnnualCost;

      const opex = collectedTonnes * ASSUMPTIONS.collectionCostPerTonne +
                   composted * ASSUMPTIONS.compostCostPerTonne +
                   recycled * ASSUMPTIONS.recycleCostPerTonne +
                   wteProcessed * ASSUMPTIONS.wteCostPerTonne +
                   landfilled * ASSUMPTIONS.landfillCostPerTonne +
                   fleetCost + emergencyCost;

      cumulativeSpend += opex + capex;

      const carbonTonnesCO2e = landfilled * comp.organic * ASSUMPTIONS.methaneFactorTonnesCO2ePerTonneOrganic;
      const circularIndex = ((composted + recycled + wteProcessed) / annualGeneratedTonnes) * 100;
      const landfillLifeYears = landfillRemaining > 0 ? landfillRemaining / Math.max(1, landfilled) : 0;

      const budgetDeficit = Math.max(0, opex + capex - params.economic.annualBudgetInr);
      const resilience = computeResilience({
        collectionEff, landfillLifeYears, budgetDeficit,
        annualBudgetInr: params.economic.annualBudgetInr,
        hadCalamity: isFlood || isLandslide || isAccident,
        circularIndex
      });

      years.push({
        year: y + 1, calendarYear, population: Math.round(population), effectivePop: Math.round(effectivePop),
        wasteTonnesDay: +wasteTonnesDay.toFixed(2), annualGeneratedTonnes: +annualGeneratedTonnes.toFixed(1),
        collectionEff: +collectionEff.toFixed(1), collectedTonnes: +collectedTonnes.toFixed(1),
        composted: +composted.toFixed(1), recycled: +recycled.toFixed(1), wteProcessed: +wteProcessed.toFixed(1),
        landfilled: +landfilled.toFixed(1), landfillRemaining: +Math.max(0, landfillRemaining).toFixed(0),
        landfillLifeYears: +landfillLifeYears.toFixed(1),
        opex: Math.round(opex), capex: Math.round(capex), totalCost: Math.round(opex + capex),
        cumulativeSpend: Math.round(cumulativeSpend), budgetDeficit: Math.round(budgetDeficit),
        carbonTonnesCO2e: +carbonTonnesCO2e.toFixed(1), circularIndex: +circularIndex.toFixed(1),
        resilience: +resilience.toFixed(0), vehiclesNeeded,
        events: { flood: isFlood, landslide: isLandslide, accident: isAccident, surge: !!surge }
      });
    }
    return { years, perCapita, comp, baseEff };
  }

  function computeResilience({ collectionEff, landfillLifeYears, budgetDeficit, annualBudgetInr, hadCalamity, circularIndex }) {
    let score = 0;
    score += Math.min(30, collectionEff * 0.3);
    score += Math.min(25, landfillLifeYears * 2.5);
    score += Math.min(20, circularIndex * 0.2);
    score += budgetDeficit === 0 ? 15 : Math.max(0, 15 - (budgetDeficit / Math.max(1, annualBudgetInr)) * 40);
    score += hadCalamity ? 5 : 10; // small credit for having weathered a shock without collapse is folded into eff/landfill terms already
    return Math.max(0, Math.min(100, score));
  }

  // ---- Sensitivity analysis: vary one parameter path by +/-20%, measure impact on 20yr total cost ----
  function sensitivity(params, grid, paramPaths) {
    const results = [];
    paramPaths.forEach(({ path, label }) => {
      const base = getPath(params, path);
      const low = cloneAndSet(params, path, base * 0.8);
      const high = cloneAndSet(params, path, base * 1.2);
      const baseTotal = totalCost(run(params, grid));
      const lowTotal = totalCost(run(low, grid));
      const highTotal = totalCost(run(high, grid));
      results.push({
        label,
        low: lowTotal, base: baseTotal, high: highTotal,
        range: Math.abs(highTotal - lowTotal)
      });
    });
    return results.sort((a, b) => b.range - a.range);
  }
  function totalCost(result) { return result.years.reduce((s, y) => s + y.totalCost, 0); }
  function getPath(obj, path) { return path.split(".").reduce((o, k) => o[k], obj); }
  function cloneAndSet(obj, path, value) {
    const clone = JSON.parse(JSON.stringify(obj));
    const keys = path.split(".");
    let cur = clone;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = value;
    return clone;
  }

  // ---- Optimization: facility siting (weighted centroid) + fleet sizing ----
  function optimizeFacilitySite(grid) {
    let sumX = 0, sumY = 0, sumW = 0;
    const excluded = new Set(["water"]);
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const type = grid[r][c];
        if (excluded.has(type)) continue;
        const w = ZONE_TYPES[type] ? ZONE_TYPES[type].waste : 0;
        if (w <= 0) continue;
        sumX += c * w; sumY += r * w; sumW += w;
      }
    }
    if (sumW === 0) return null;
    return { row: Math.round(sumY / sumW), col: Math.round(sumX / sumW) };
  }

  function optimizeRoutes(grid, vehicleCount) {
    // cluster waste-generating cells into `vehicleCount` groups by simple banding across columns
    const cells = [];
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++) {
        const w = ZONE_TYPES[grid[r][c]] ? ZONE_TYPES[grid[r][c]].waste : 0;
        if (w > 0) cells.push({ r, c, w });
      }
    const k = Math.max(1, Math.min(vehicleCount, 6));
    const bandWidth = GRID_COLS / k;
    const routes = Array.from({ length: k }, () => ({ cells: [], load: 0 }));
    cells.forEach(cell => {
      const idx = Math.min(k - 1, Math.floor(cell.c / bandWidth));
      routes[idx].cells.push(cell);
      routes[idx].load += cell.w;
    });
    return routes;
  }

  return { run, sensitivity, totalCost, optimizeFacilitySite, optimizeRoutes, perCapitaKg, compositionFractions, computeResilience };
})();
