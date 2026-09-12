/* ============================================================
   EXECUTIVE REPORT
   Turns the current simulation state into a printable, plain-
   language summary — the kind of one-page brief a planning
   officer could actually hand upward. Pure string/DOM building,
   no external dependencies so it always works offline.
   ============================================================ */

const Report = (() => {
  function fmtT(n) { return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " t"; }
  function fmtInr(n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

  function build(habitat, params, result) {
    const years = result.years;
    const y1 = years[0], y10 = years[9], y20 = years[19];
    const criticalYear = years.find(y => y.landfillRemaining <= 0);
    const totalSpend = SimEngine.totalCost(result);
    const totalCarbon = years.reduce((s, y) => s + y.carbonTonnesCO2e, 0);
    const treesEquivalent = Math.round((totalCarbon * 1000) / ASSUMPTIONS.treeOffsetKgCO2ePerTree);
    const calamityYears = years.filter(y => y.events.flood || y.events.landslide || y.events.accident);

    return {
      generatedAt: new Date().toLocaleString("en-IN"),
      habitatName: habitat.name || "Unnamed habitat",
      habitatType: HABITAT_TYPES[habitat.type] ? HABITAT_TYPES[habitat.type].label : habitat.type,
      coordinates: `${habitat.lat.toFixed(4)}, ${habitat.lng.toFixed(4)}`,
      headline: `Over the next 20 years, waste generation is projected to grow from ${fmtT(y1.annualGeneratedTonnes)}/yr to ${fmtT(y20.annualGeneratedTonnes)}/yr, while the diverted (circular) share reaches ${y20.circularIndex}% by year 20.`,
      kpis: [
        { label: "Year-20 waste generated", value: fmtT(y20.annualGeneratedTonnes) },
        { label: "Year-20 collection efficiency", value: y20.collectionEff + "%" },
        { label: "Circular economy index (Y20)", value: y20.circularIndex + "%" },
        { label: "Resilience score (Y20)", value: y20.resilience + " / 100" },
        { label: "20-year total cost", value: fmtInr(totalSpend) },
        { label: "Landfill outlook", value: criticalYear ? `Reaches capacity in year ${criticalYear.year}` : "Sufficient through year 20" },
        { label: "Cumulative methane emissions", value: totalCarbon.toFixed(0) + " tCO2e (≈" + treesEquivalent.toLocaleString("en-IN") + " mature trees to offset)" }
      ],
      milestones: [
        `Year 1: ${fmtT(y1.annualGeneratedTonnes)}/yr generated, ${y1.collectionEff}% collected, resilience ${y1.resilience}/100.`,
        `Year 10: ${fmtT(y10.annualGeneratedTonnes)}/yr generated, ${y10.circularIndex}% diverted from landfill, cumulative spend ${fmtInr(y10.cumulativeSpend)}.`,
        `Year 20: ${fmtT(y20.annualGeneratedTonnes)}/yr generated, landfill remaining ${fmtT(y20.landfillRemaining)}, resilience ${y20.resilience}/100.`
      ],
      stressTests: calamityYears.length
        ? calamityYears.map(y => `Year ${y.year}: ${Object.entries(y.events).filter(([,v])=>v).map(([k])=>k).join(", ")} — collection efficiency dropped to ${y.collectionEff}%, that year's cost ${fmtInr(y.totalCost)}.`)
        : ["No extreme-event scenarios have been run yet — use the Scenarios panel or ask the assistant to \"simulate a flood in year N\" to pressure-test this plan."],
      recommendations: buildRecommendations(params, years, criticalYear)
    };
  }

  function buildRecommendations(params, years, criticalYear) {
    const recs = [];
    if (params.cultural.segregationAdherencePct < 60)
      recs.push("Source segregation adherence is below 60% — a household awareness programme would meaningfully raise the composting and recycling yield modelled here.");
    if (criticalYear)
      recs.push(`Commission additional treatment capacity before year ${Math.max(1, criticalYear.year - 2)} to avoid a landfill capacity breach.`);
    if (params.infrastructure.collectionVehicles < Math.ceil(params.demography.population / 9000))
      recs.push("The current collection fleet is undersized relative to projected daily waste volume; the Optimization panel proposes an updated fleet size.");
    if (params.terrain.floodProne)
      recs.push("This habitat is flood-prone — pre-positioning emergency debris-clearance contracts is cheaper than ad-hoc response during a monsoon event.");
    if (recs.length === 0) recs.push("Current parameters show a stable 20-year outlook; continue monitoring collection efficiency and landfill life annually.");
    return recs;
  }

  function renderHTML(report) {
    return `
      <div class="report-doc">
        <header><h2>Solid Waste Management Plan — Executive Summary</h2>
          <p class="report-meta">${report.habitatName} · ${report.habitatType} · ${report.coordinates} · generated ${report.generatedAt}</p>
        </header>
        <p class="report-headline">${report.headline}</p>
        <h3>Key indicators</h3>
        <div class="report-kpis">${report.kpis.map(k => `<div class="report-kpi"><span>${k.label}</span><strong>${k.value}</strong></div>`).join("")}</div>
        <h3>Trajectory</h3>
        <ul>${report.milestones.map(m => `<li>${m}</li>`).join("")}</ul>
        <h3>Stress tests</h3>
        <ul>${report.stressTests.map(s => `<li>${s}</li>`).join("")}</ul>
        <h3>Recommendations</h3>
        <ul>${report.recommendations.map(r => `<li>${r}</li>`).join("")}</ul>
      </div>`;
  }

  return { build, renderHTML };
})();
