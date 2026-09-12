/* ============================================================
   MAP + ZONE GRID
   Two complementary GIS views:
   1. A real Leaflet map for picking the habitat's real location
      (grounds the simulation in an actual place on Earth).
   2. A schematic zone-grid editor for roads, settlements, water
      bodies and terrain — the level of detail the simulation
      engine and the facility-siting optimizer actually consume.
   ============================================================ */

const MapZones = (() => {
  let leafletMap = null;
  let marker = null;
  let currentGrid = null;
  let selectedTool = "residential_low";
  let onGridChange = () => {};
  let onLocationChange = () => {};

  function initMap(containerId, lat, lng) {
    if (leafletMap) { leafletMap.remove(); }
    leafletMap = L.map(containerId, { zoomControl: true }).setView([lat, lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18
    }).addTo(leafletMap);
    marker = L.marker([lat, lng], { draggable: true }).addTo(leafletMap);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      onLocationChange(p.lat, p.lng);
    });
    leafletMap.on("click", (e) => {
      marker.setLatLng(e.latlng);
      onLocationChange(e.latlng.lat, e.latlng.lng);
    });
    setTimeout(() => leafletMap.invalidateSize(), 200);
  }

  function setLocationChangeHandler(fn) { onLocationChange = fn; }

  function recenter(lat, lng) {
    if (leafletMap) { leafletMap.setView([lat, lng], leafletMap.getZoom()); marker.setLatLng([lat, lng]); }
  }

  function renderPalette(containerEl) {
    containerEl.innerHTML = "";
    Object.entries(ZONE_TYPES).forEach(([key, def]) => {
      const btn = document.createElement("button");
      btn.className = "zone-swatch" + (key === selectedTool ? " active" : "");
      btn.style.setProperty("--swatch-color", def.color);
      btn.title = def.label;
      btn.innerHTML = `<span class="swatch-chip"></span>${def.label}`;
      btn.addEventListener("click", () => {
        selectedTool = key;
        containerEl.querySelectorAll(".zone-swatch").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      containerEl.appendChild(btn);
    });
  }

  function renderGrid(canvas, grid, editable, highlightCell) {
    currentGrid = grid;
    const ctx = canvas.getContext("2d");
    const cw = canvas.width / GRID_COLS;
    const ch = canvas.height / GRID_ROWS;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const type = grid[r][c];
        ctx.fillStyle = ZONE_TYPES[type].color;
        ctx.fillRect(c * cw, r * ch, cw - 1, ch - 1);
      }
    }
    if (highlightCell) {
      ctx.strokeStyle = "#F2C14E";
      ctx.lineWidth = 3;
      ctx.strokeRect(highlightCell.col * cw + 1, highlightCell.row * ch + 1, cw - 3, ch - 3);
    }
    canvas.onclick = editable ? (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const col = Math.floor(x / cw), row = Math.floor(y / ch);
      if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        grid[row][col] = selectedTool;
        renderGrid(canvas, grid, editable, highlightCell);
        onGridChange(grid);
      }
    } : null;
  }

  function setGridChangeHandler(fn) { onGridChange = fn; }

  function floodProneCellCount(grid) {
    // cells adjacent to water are treated as flood-exposed for reporting
    let count = 0;
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c] === "water") continue;
        const neighbors = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
        if (neighbors.some(([nr,nc]) => grid[nr] && grid[nr][nc] === "water")) count++;
      }
    return count;
  }

  return { initMap, setLocationChangeHandler, recenter, renderPalette, renderGrid, setGridChangeHandler, floodProneCellCount };
})();
