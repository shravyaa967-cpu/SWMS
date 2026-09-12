/* ============================================================
   CONVERSATIONAL LAYER
   Two tiers:
   1. Rule-based intent parser — fast, deterministic, works fully
      offline, and can both READ simulation results and WRITE to
      the simulation (trigger scenarios, change parameters).
   2. Optional AI fallback — if the user supplies an Anthropic API
      key in Settings, anything the rule-based parser doesn't
      recognise is handed to the model together with a compact
      summary of the current simulation, so answers stay grounded
      in this habitat's actual numbers rather than generic advice.
   Nothing here blocks on the AI tier: if no key is configured,
   the fallback returns a helpful clarifying response instead of
   failing silently.
   ============================================================ */

const Chatbot = (() => {
  let apiKey = null;
  function setApiKey(key) { apiKey = key && key.trim() ? key.trim() : null; }
  function hasApiKey() { return !!apiKey; }

  function fmtT(n) { return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " t"; }
  function fmtInr(n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

  function findYear(years, n) { return years.find(y => y.year === n) || years[years.length - 1]; }

  /**
   * @param message   raw user text
   * @param ctx       { params, grid, result, applyScenario(fn), applyParamChange(fn) }
   * returns { text, actions:[] } synchronously for rule matches,
   * or a Promise resolving the same shape when it falls through to AI.
   */
  function respond(message, ctx) {
    const msg = message.toLowerCase().trim();
    const { years } = ctx.result;

    // --- intent: waste after N years ---
    let m = msg.match(/waste.*after\s+(\d+)\s*year|(\d+)\s*year.*waste/);
    if (m) {
      const n = parseInt(m[1] || m[2], 10);
      const y = findYear(years, Math.min(20, Math.max(1, n)));
      return textResult(`In year ${y.year} (${y.calendarYear}), the habitat is projected to generate about ${fmtT(y.annualGeneratedTonnes)} of solid waste per year (≈${y.wasteTonnesDay.toFixed(1)} t/day), with a collection efficiency of ${y.collectionEff}%.`);
    }

    // --- intent: cost-effective strategy during floods ---
    if (/flood/.test(msg) && /(cost|cheap|effective|strategy)/.test(msg)) {
      const floodYears = years.filter(y => y.events.flood);
      if (floodYears.length === 0) {
        return textResult(`No flood scenario is currently active. Try "simulate a flood in year 6" and I'll compare treatment strategies under that stress.`);
      }
      const fy = floodYears[0];
      return textResult(`During the year ${fy.year} flood, diversion (composting + recycling + WTE) stays the most cost-effective route because landfilling debris costs ${fmtInr(ASSUMPTIONS.landfillCostPerTonne)}/t plus an emergency surcharge of ${fmtInr(ASSUMPTIONS.emergencyFloodCostPerAffectedTonne)}/t on flood debris — roughly ${(ASSUMPTIONS.emergencyFloodCostPerAffectedTonne/ASSUMPTIONS.compostCostPerTonne).toFixed(1)}× the cost of composting the same organic tonnage. That year's diverted share was ${fy.circularIndex}%.`);
    }

    // --- intent: run a flood/landslide/surge/accident scenario ---
    m = msg.match(/(flood|landslide|population surge|surge|industrial accident|accident)/);
    if (m && /(simulate|inject|run|add|trigger|what if|test)/.test(msg)) {
      const yearMatch = msg.match(/year\s*(\d+)/);
      const year = yearMatch ? Math.min(19, Math.max(0, parseInt(yearMatch[1], 10) - 1)) : 5;
      const kind = m[1].includes("flood") ? "flood" : m[1].includes("landslide") ? "landslide" : m[1].includes("accident") ? "accident" : "surge";
      ctx.applyScenario(kind, year);
      const label = { flood: "a monsoon flood", landslide: "a landslide", accident: "an industrial accident", surge: "a population surge" }[kind];
      return textResult(`Done — I've injected ${label} into year ${year + 1} and re-run the 20-year simulation. Check the updated charts and resilience score for the impact.`);
    }

    // --- intent: population increase what-if ---
    m = msg.match(/population\s*(increase|grow|rise)s?\s*by\s*(\d+)\s*%|(\d+)\s*%\s*population/);
    if (m) {
      const pct = parseInt(m[2] || m[3], 10);
      ctx.applyParamChange("demography.growthRatePct", (params) => params.demography.growthRatePct + pct / 4);
      return textResult(`Applied a population-growth uplift consistent with a ${pct}% surge and re-run the simulation. Watch the landfill-life and budget charts — that's usually where the strain shows up first.`);
    }

    // --- intent: landfill capacity / life ---
    if (/landfill/.test(msg) && /(life|capacity|remaining|left|full)/.test(msg)) {
      const last = years[years.length - 1];
      const criticalYear = years.find(y => y.landfillRemaining <= 0);
      return textResult(criticalYear
        ? `The current landfill runs out of capacity around year ${criticalYear.year} (${criticalYear.calendarYear}). I'd recommend commissioning the recommended treatment facility before then — see the Optimization panel.`
        : `The landfill still has ${fmtT(last.landfillRemaining)} of capacity remaining at year 20, with an estimated ${last.landfillLifeYears} years of life left at that point.`);
    }

    // --- intent: facility / route recommendation ---
    if (/(where|best|optimal).*(facility|plant|site)|facility.*(site|location)/.test(msg)) {
      const site = SimEngine.optimizeFacilitySite(ctx.grid);
      return textResult(site
        ? `The optimizer recommends siting the treatment facility near grid cell (row ${site.row + 1}, col ${site.col + 1}) — the waste-weighted centroid of the habitat, avoiding water bodies. See the highlighted cell on the zone map.`
        : `I need at least a few zoned cells on the map before I can recommend a site — try painting some residential or industrial zones first.`, { highlightFacility: true });
    }

    // --- intent: resilience / circular economy score ---
    if (/resilien/.test(msg)) {
      const last = years[years.length - 1];
      return textResult(`Resilience score is currently ${last.resilience}/100 by year 20. It weighs collection efficiency, landfill life, budget headroom and how much waste is diverted from landfill.`);
    }
    if (/circular/.test(msg)) {
      const last = years[years.length - 1];
      return textResult(`The circular-economy index — the share of waste diverted from landfill via composting, recycling and waste-to-energy — reaches ${last.circularIndex}% by year 20.`);
    }

    // --- intent: budget for year N ---
    m = msg.match(/budget.*year\s*(\d+)|year\s*(\d+).*budget/);
    if (m) {
      const y = findYear(years, parseInt(m[1] || m[2], 10));
      return textResult(`Year ${y.year} projected spend: ${fmtInr(y.opex)} operating + ${fmtInr(y.capex)} capital = ${fmtInr(y.totalCost)} total${y.budgetDeficit > 0 ? `, exceeding the annual budget by ${fmtInr(y.budgetDeficit)}` : ", within the annual budget"}.`);
    }

    // --- intent: report ---
    if (/(generate|create|give me).*(report|summary)|executive report/.test(msg)) {
      ctx.applyScenario && ctx.generateReport && ctx.generateReport();
      return textResult(`I've generated the executive report — open the Report tab to view or print it.`, { openReport: true });
    }

    // --- intent: help ---
    if (/^(help|what can you do|hi|hello)\b/.test(msg)) {
      return textResult(`I can answer questions about this habitat's plan — try things like "what will be the waste after 10 years?", "simulate a flood in year 6", "what if population increases by 20%?", "where should the treatment facility go?", or "generate an executive report".`);
    }

    // Nothing matched — fall through to AI if configured, else a graceful default
    if (hasApiKey()) return aiFallback(message, ctx);
    return textResult(`I didn't catch a specific figure to look up. Ask me about waste volumes, costs, landfill life, resilience, or say "simulate a flood in year N" — or add an API key in Settings to let me handle open-ended questions too.`);
  }

  function textResult(text, actions = {}) { return { text, actions }; }

  async function aiFallback(message, ctx) {
    const last = ctx.result.years[ctx.result.years.length - 1];
    const summary = `Habitat population now: ${ctx.params.demography.population}. Year-20 projections: waste ${last.annualGeneratedTonnes} t/yr, collection efficiency ${last.collectionEff}%, circular economy index ${last.circularIndex}%, resilience ${last.resilience}/100, landfill remaining ${last.landfillRemaining} t, cumulative 20yr spend ₹${last.cumulativeSpend}.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: "You are the conversational layer of a solid-waste-management simulator. Answer briefly and concretely using the provided simulation summary. If the question can't be answered from the summary, say what additional simulation query would help.",
          messages: [{ role: "user", content: `Simulation summary: ${summary}\n\nQuestion: ${message}` }]
        })
      });
      const data = await res.json();
      const text = (data.content || []).map(b => b.text || "").join(" ").trim();
      return textResult(text || "I couldn't reach the model for that one — try rephrasing, or ask about a specific year, cost, or scenario.");
    } catch (e) {
      return textResult("The AI fallback isn't reachable right now (check the API key or your connection). Meanwhile, ask me about a specific year, cost, scenario, or resilience score and I'll answer directly from the simulation.");
    }
  }

  return { respond, setApiKey, hasApiKey };
})();
