/* ============================================================
   CHARTS
   Thin wrappers around Chart.js so main.js stays declarative.
   Each function destroys/recreates its chart so re-simulation
   (after a scenario or parameter change) always reflects fresh
   state — no stale datasets left behind.
   ============================================================ */

const Charts = (() => {
  const instances = {};
  const palette = {
    grid: "rgba(232,230,222,0.08)",
    text: "#C9CCC3",
    organic: "#7A9B76",
    recycled: "#3C7A89",
    wte: "#C9A227",
    landfill: "#B0562E",
    cost: "#C9A227",
    resilience: "#7A9B76",
    carbon: "#8A6E4B"
  };
  Chart.defaults.color = palette.text;
  Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
  Chart.defaults.borderColor = palette.grid;

  function destroy(id) { if (instances[id]) { instances[id].destroy(); delete instances[id]; } }

  function wasteTrend(canvas, years, baselineYears) {
    destroy(canvas.id);
    const datasets = [
      { label: "Generated (t/yr)", data: years.map(y => y.annualGeneratedTonnes), borderColor: "#E8E6DE", backgroundColor: "transparent", tension: 0.3 },
      { label: "Landfilled (t/yr)", data: years.map(y => y.landfilled), borderColor: palette.landfill, backgroundColor: "transparent", tension: 0.3 },
      { label: "Diverted (compost+recycle+WTE)", data: years.map(y => y.composted + y.recycled + y.wteProcessed), borderColor: palette.organic, backgroundColor: "transparent", tension: 0.3 }
    ];
    if (baselineYears) {
      datasets.push({ label: "Baseline generated (no shocks)", data: baselineYears.map(y => y.annualGeneratedTonnes), borderColor: "#7A7F76", borderDash: [5, 4], backgroundColor: "transparent", pointRadius: 0 });
    }
    instances[canvas.id] = new Chart(canvas, {
      type: "line",
      data: { labels: years.map(y => "Y" + y.year), datasets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12 } } },
        scales: { y: { grid: { color: palette.grid } }, x: { grid: { display: false } } } }
    });
  }

  function compositionDonut(canvas, comp) {
    destroy(canvas.id);
    instances[canvas.id] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Organic", "Recyclable", "Hazardous", "Inert / other"],
        datasets: [{ data: [comp.organic, comp.recyclable, comp.hazardous, comp.inert].map(v => +(v * 100).toFixed(1)),
          backgroundColor: [palette.organic, palette.recycled, palette.landfill, "#5A5F58"], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } } }
    });
  }

  function budgetBars(canvas, years) {
    destroy(canvas.id);
    instances[canvas.id] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: years.map(y => "Y" + y.year),
        datasets: [
          { label: "Opex (₹)", data: years.map(y => y.opex), backgroundColor: palette.cost },
          { label: "Capex (₹)", data: years.map(y => y.capex), backgroundColor: "#B0562E" }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: palette.grid } } } }
    });
  }

  function landfillLine(canvas, years) {
    destroy(canvas.id);
    instances[canvas.id] = new Chart(canvas, {
      type: "line",
      data: { labels: years.map(y => "Y" + y.year), datasets: [
        { label: "Landfill capacity remaining (t)", data: years.map(y => y.landfillRemaining), borderColor: palette.landfill, fill: true, backgroundColor: "rgba(176,86,46,0.15)", tension: 0.3 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: palette.grid } }, x: { grid: { display: false } } } }
    });
  }

  function carbonBars(canvas, years) {
    destroy(canvas.id);
    instances[canvas.id] = new Chart(canvas, {
      type: "bar",
      data: { labels: years.map(y => "Y" + y.year), datasets: [
        { label: "Landfill methane (tCO2e/yr)", data: years.map(y => y.carbonTonnesCO2e), backgroundColor: palette.carbon }
      ] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: palette.grid } }, x: { grid: { display: false } } } }
    });
  }

  function tornado(canvas, sensitivityResults) {
    destroy(canvas.id);
    instances[canvas.id] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: sensitivityResults.map(r => r.label),
        datasets: [
          { label: "-20%", data: sensitivityResults.map(r => r.low - r.base), backgroundColor: palette.recycled },
          { label: "+20%", data: sensitivityResults.map(r => r.high - r.base), backgroundColor: palette.landfill }
        ]
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        scales: { x: { grid: { color: palette.grid }, title: { display: true, text: "Δ 20-yr total cost (₹)" } }, y: { grid: { display: false } } }
      }
    });
  }

  return { wasteTrend, compositionDonut, budgetBars, landfillLine, carbonBars, tornado, destroy };
})();
