/* ============================================================
   DATA MODEL
   Defaults, coefficients and lookup tables for the simulator.
   Every number here is a documented planning assumption, not a
   hidden magic constant — see ARCHITECTURE.md for sourcing notes.
   ============================================================ */

const HABITAT_TYPES = {
  village:  { label: "Village",  basePopulation: 4000,   density: "low"    },
  ward:     { label: "City Ward", basePopulation: 18000,  density: "medium" },
  town:     { label: "Town",     basePopulation: 55000,  density: "medium" },
  city:     { label: "City",     basePopulation: 250000, density: "high"   }
};

// Grid cell types for the schematic zone overlay
const ZONE_TYPES = {
  residential_low:  { label: "Residential (low density)",  color: "#8FAF86", waste: 1.0 },
  residential_high: { label: "Residential (high density)", color: "#5E8A55", waste: 1.8 },
  commercial:       { label: "Commercial",                 color: "#C9A227", waste: 1.4 },
  industrial:       { label: "Industrial",                 color: "#B0562E", waste: 2.2 },
  institutional:    { label: "Institutional (school/clinic)", color: "#3C7A89", waste: 0.9 },
  slum_informal:    { label: "Informal settlement",         color: "#8A6E4B", waste: 0.7 },
  water:            { label: "Water body",                  color: "#2C5F72", waste: 0 },
  green:             { label: "Green cover / forest",        color: "#274A34", waste: 0 },
  road:             { label: "Road / transit corridor",     color: "#555C57", waste: 0.2 },
  empty:            { label: "Undeveloped",                 color: "#2A322C", waste: 0 }
};

const GRID_ROWS = 9;
const GRID_COLS = 12;

function buildDefaultGrid(habitatType) {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row = [];
    for (let c = 0; c < GRID_COLS; c++) row.push("empty");
    grid.push(row);
  }
  // Seed a plausible starting layout so the demo isn't a blank grid
  const seedByType = {
    village: [[2,2,'residential_low'],[3,3,'residential_low'],[4,2,'institutional'],
              [1,8,'water'],[2,8,'water'],[6,4,'green'],[6,5,'green'],[4,6,'road'],[4,7,'road'],[4,8,'road']],
    ward:    [[2,2,'residential_high'],[2,3,'residential_high'],[3,4,'commercial'],
              [5,7,'industrial'],[1,9,'water'],[6,2,'slum_informal'],[4,5,'road'],[4,6,'road'],[4,7,'road'],[4,8,'road']],
    town:    [[1,1,'residential_high'],[2,1,'residential_high'],[2,2,'commercial'],[3,2,'commercial'],
              [6,7,'industrial'],[6,8,'industrial'],[0,9,'water'],[1,9,'water'],[7,3,'green'],
              [4,0,'road'],[4,1,'road'],[4,2,'road'],[4,3,'road'],[4,4,'road'],[4,5,'road']],
    city:    [[1,1,'residential_high'],[1,2,'residential_high'],[2,1,'residential_high'],[2,2,'commercial'],
              [1,5,'commercial'],[2,5,'commercial'],[6,8,'industrial'],[7,8,'industrial'],[6,9,'industrial'],
              [0,10,'water'],[1,10,'water'],[7,1,'slum_informal'],[3,6,'institutional'],
              [4,0,'road'],[4,1,'road'],[4,2,'road'],[4,3,'road'],[4,4,'road'],[4,5,'road'],[4,6,'road'],[4,7,'road']]
  };
  (seedByType[habitatType] || seedByType.town).forEach(([r,c,t]) => { grid[r][c] = t; });
  return grid;
}

// Default full parameter set, organised into the 7 mandated categories
function buildDefaultParams(habitatType) {
  const base = HABITAT_TYPES[habitatType] || HABITAT_TYPES.town;
  return {
    demography: {
      population: base.basePopulation,
      growthRatePct: 2.1,
      floatingPopPct: 8,
      householdSize: 4.6,
      literacyPct: 78
    },
    infrastructure: {
      roadCoveragePct: 62,
      institutions: Math.round(base.basePopulation / 3500),
      collectionVehicles: Math.max(2, Math.round(base.basePopulation / 9000)),
      collectionPointDensity: 55, // % of habitation within 200m of a collection point
      existingLandfillCapacityTonnes: base.basePopulation * 6
    },
    industrial: {
      hasOrganizedIndustry: habitatType === "city" || habitatType === "town",
      industrialWasteTonnesPerDay: habitatType === "village" ? 0.4 : habitatType === "ward" ? 1.5 : habitatType === "town" ? 4 : 18,
      hazardousSharePct: 3
    },
    naturalResources: {
      annualRainfallMm: 3200, // coastal Karnataka-typical, adjustable
      waterBodies: habitatType === "village" ? 2 : habitatType === "city" ? 6 : 3,
      forestCoverPct: habitatType === "village" ? 35 : 12
    },
    terrain: {
      slope: "moderate",       // flat | moderate | hilly
      soilType: "impermeable", // permeable | impermeable
      floodProne: true
    },
    economic: {
      perCapitaIncomeAnnual: 118000,
      annualBudgetInr: base.basePopulation * 850,
      willingnessToPayPct: 46
    },
    cultural: {
      dietType: "mixed",           // veg | nonveg | mixed
      segregationAdherencePct: 34,
      festivalSpikePct: 22,
      localPracticeNotes: "Seasonal fish-market waste and temple-festival organic surges are common along this coast."
    }
  };
}

// Cost & rate assumptions (INR unless noted) — kept centralised for transparency
const ASSUMPTIONS = {
  baseGenerationKgPerCapita: 0.38,
  incomeGenerationSensitivity: 0.00000085, // extra kg/capita per INR of per-capita income above 60k
  collectionCostPerTonne: 620,
  compostCostPerTonne: 480,
  recycleCostPerTonne: 900,
  wteCostPerTonne: 2100,
  landfillCostPerTonne: 350,
  vehicleCapacityTonnes: 5,
  vehicleAnnualCost: 480000,
  facilityCapexComposting: 9000000,
  facilityCapexRecycling: 14000000,
  facilityCapexWTE: 65000000,
  methaneFactorTonnesCO2ePerTonneOrganic: 0.62,
  treeOffsetKgCO2ePerTree: 21,
  emergencyFloodCostPerAffectedTonne: 1450,
  landslideRoadRepairCost: 3200000,
  industrialAccidentCost: 5200000
};
