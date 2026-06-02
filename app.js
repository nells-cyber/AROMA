/* ============================================
   AROMA EXPLORER V2 — Main Application
   ============================================ */

// --- Supabase Init ---
// WICHTIG: Hier deine eigenen Supabase-Daten einsetzen!
// Anleitung dazu in der Datei: 03b_SUPABASE_AROMA_SETUP.txt
const SUPABASE_URL = 'https://zugvmqjcfbwwfthsmxeh.supabase.com';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1Z3ZtcWpjZmJ3d2Z0aHNteGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjEzOTMsImV4cCI6MjA5NTc5NzM5M30.bDgObFS3KyzsqQEQhBBJkZBOmQITTosYnb9VsGcWomg';

// The Supabase UMD bundle exposes the createClient function on window.supabase
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Color Utility ---
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorWithAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Color 1 = full color (alpha 1.0)
// Color 2 = moderate (alpha 0.70)
// Color 3 = faded almost white (alpha 0.08)
function color1(hex) { return hex; }
function color2(hex) { return colorWithAlpha(hex, 0.70); }
function color3(hex) { return colorWithAlpha(hex, 0.08); }

// --- Global State ---
let allIngredients = [];
let allGroups = [];
let currentIngredient = null;
let currentMolecules = [];
let currentGroupTemps = [];
let currentPhases = [];
let allIngredientGroups = {}; // ingredientId -> [slot numbers]

// --- Navigation ---
function navigateTo(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  const target = document.getElementById('view-' + viewName);
  if (target) {
    // Full-screen centered views
    if (viewName === 'splash' || viewName === 'menu') {
      target.style.display = 'flex';
    } else {
      target.style.display = 'block';
    }
  }

  // Scroll to top
  window.scrollTo(0, 0);
}

// --- Auth ---
const AUTH_USER_HASH = 'b4a45bf73970cccbb03b61a7360caa012930b252ac05705b0025bc961a437acd';
const AUTH_PASS_HASH = 'abe2d17b763ddbbad0393541405d73771921e356a868fdcd4bc2ddb17154d386';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initApp() {
  try {
    await loadGroups();
    await loadIngredients();
    setupSectionToggles();
    setupNavigation();
    runSplashAnimation();
    console.log('App initialized. Groups:', allGroups.length, 'Ingredients:', allIngredients.length);
  } catch (err) {
    console.error('Init error:', err);
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('view-login');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  // Check if already authenticated
  if (sessionStorage.getItem('aroma-auth') === 'true') {
    loginView.style.display = 'none';
    initApp();
    return;
  }

  // Show login, hide splash
  document.getElementById('view-splash').style.display = 'none';

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const userHash = await sha256(user);
    const passHash = await sha256(pass);

    if (userHash === AUTH_USER_HASH && passHash === AUTH_PASS_HASH) {
      sessionStorage.setItem('aroma-auth', 'true');
      loginView.style.display = 'none';
      initApp();
    } else {
      loginError.textContent = 'Falscher Benutzername oder Passwort.';
    }
  });
});

// --- Navigation Setup ---
function setupNavigation() {
  // Menu options
  document.querySelectorAll('.menu-option').forEach(opt => {
    opt.addEventListener('click', () => {
      navigateTo(opt.dataset.target);
    });
  });

  // Page arrows (THEORIE/PRAXIS navigation)
  document.querySelectorAll('.page-arrow').forEach(arrow => {
    arrow.addEventListener('click', () => {
      navigateTo(arrow.dataset.target);
    });
  });

  // Back to ZUTATEN from ingredient view
  const backNav = document.getElementById('back-to-zutaten');
  if (backNav) {
    backNav.addEventListener('click', () => {
      navigateTo(backNav.dataset.target);
    });
  }

  // Back to menu links
  document.querySelectorAll('.page-back-to-menu').forEach(el => {
    el.addEventListener('click', () => {
      navigateTo(el.dataset.target);
    });
  });

  // ZUTATEN search
  const searchInput = document.getElementById('zutaten-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderZutatenGrid(searchInput.value.trim());
    });
  }
}

// --- Splash Animation ---
function runSplashAnimation() {
  const container = document.getElementById('splash-circles');
  container.innerHTML = '';

  // Default group colors if groups not loaded yet
  const defaultColors = [
    '#2F80ED', '#6F42C1', '#C2185B',
    '#E91E63', '#D32F2F', '#F57C00',
    '#B6A400', '#4CAF50', '#006064'
  ];

  const circles = [];
  for (let i = 0; i < 9; i++) {
    const hex = allGroups[i]?.color_hex || defaultColors[i];
    const circle = document.createElement('div');
    circle.className = 'splash-circle';
    circle.style.backgroundColor = color3(hex);
    circle.dataset.hex = hex;
    container.appendChild(circle);
    circles.push(circle);
  }

  // Shuffle order for random light-up
  const order = Array.from({ length: 9 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Light up one by one
  const delay = 200; // ms between each
  order.forEach((idx, step) => {
    setTimeout(() => {
      const c = circles[idx];
      c.style.backgroundColor = color2(c.dataset.hex);
    }, step * delay);
  });

  // After all lit up, fade out and show menu
  const totalTime = 9 * delay + 600;
  setTimeout(() => {
    const splash = document.getElementById('view-splash');
    splash.style.transition = 'opacity 0.5s ease';
    splash.style.opacity = '0';
    setTimeout(() => {
      navigateTo('menu');
    }, 500);
  }, totalTime);
}

// --- Data Loading ---
async function loadGroups() {
  const { data } = await sb.from('aroma_groups').select('*').order('slot');
  allGroups = data || [];
}

async function loadIngredients() {
  const { data } = await sb.from('ingredients').select('*').order('name_de');
  allIngredients = (data || []).filter(i => i.name_de && i.name_de !== '-');

  const select = document.getElementById('ingredient-select');
  allIngredients.forEach(ing => {
    const opt = document.createElement('option');
    opt.value = ing.id;
    opt.textContent = ing.name_de;
    select.appendChild(opt);
  });

  select.addEventListener('change', (e) => {
    if (e.target.value) loadIngredient(e.target.value);
  });

  // Render ZUTATEN grid
  renderZutatenGrid('');
}

// --- ZUTATEN Directory ---
function renderZutatenGrid(filter) {
  const grid = document.getElementById('zutaten-grid');
  grid.innerHTML = '';

  const lowerFilter = filter.toLowerCase();
  const filtered = allIngredients.filter(ing =>
    ing.name_de.toLowerCase().includes(lowerFilter)
  );

  filtered.forEach(ing => {
    const item = document.createElement('div');
    item.className = 'zutaten-item';
    item.addEventListener('click', () => {
      openIngredient(ing.id);
    });

    const name = document.createElement('div');
    name.className = 'zutaten-item-name';
    name.textContent = ing.name_de;
    item.appendChild(name);

    grid.appendChild(item);
  });
}

function openIngredient(id) {
  navigateTo('ingredient');
  document.getElementById('ingredient-select').value = id;
  loadIngredient(id);
}

async function loadIngredient(id) {
  const ingredient = allIngredients.find(i => i.id === id);
  if (!ingredient) return;
  currentIngredient = ingredient;

  // Show title and main desc
  const titleEl = document.getElementById('ingredient-title');
  titleEl.textContent = ingredient.name_de.toUpperCase();
  titleEl.style.display = 'block';

  const mainDescEl = document.getElementById('ingredient-main-desc');
  mainDescEl.textContent = ingredient.taste_description_de || '';
  mainDescEl.style.display = ingredient.taste_description_de ? 'block' : 'none';

  // Fetch all related data in parallel
  const [molRes, groupTempRes, phaseRes] = await Promise.all([
    sb.from('ingredient_molecules')
      .select('molecule_id, has_trigeminal_activation, molecules(id, name_de, group_id, descriptors_de, solubility_de, aroma_groups(slot, title_de, name_de, descriptor_de, color_hex))')
      .eq('ingredient_id', id),
    sb.from('ingredient_group_temperature')
      .select('group_id, temp_start_c, temp_end_c, behavior_description_de, aroma_groups(slot, color_hex, name_de)')
      .eq('ingredient_id', id),
    sb.from('ingredient_temperature_phases')
      .select('phase_name, temp_start_c, temp_end_c, description_de')
      .eq('ingredient_id', id)
      .order('temp_start_c')
  ]);

  currentMolecules = molRes.data || [];
  currentGroupTemps = groupTempRes.data || [];
  currentPhases = phaseRes.data || [];

  // Render all sections
  renderGeschmack(ingredient);
  renderMolekuele();
  renderAromaentfaltung();
  renderHarmonie();
  setHarmonieDescription();

  // All listing bodies are permanent now. Ensure no description is open initially
  document.querySelectorAll('.section-description').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.section-header').forEach(h => h.classList.remove('open'));
}

// --- Section Toggle ---
function setupSectionToggles() {
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const desc = header.parentElement.querySelector('.section-description');

      // Toggle description
      if (desc) desc.classList.toggle('open');
      header.classList.toggle('open');
    });
  });
}

// ============================================
// GESCHMACK
// ============================================
function renderGeschmack(ingredient) {
  const container = document.getElementById('geschmack-quarters');
  container.innerHTML = '';

  const tastes = [
    { key: 'taste_sweet', label: 'Süß' },
    { key: 'taste_sour', label: 'Sauer' },
    { key: 'taste_salty', label: 'Salzig' },
    { key: 'taste_bitter', label: 'Bitter' },
    { key: 'taste_umami', label: 'Umami' }
  ];

  /*
    Grey levels:
    0 = Inactive: Grey 3
    1 = Level 1 Active: Grey 2
    >= 2 = Level 2 Active: Grey 1
  */

  const squares = [];
  tastes.forEach(t => {
    const value = ingredient[t.key] || 0;

    let targetColor = 'var(--grey-3)';
    if (value === 1) {
      targetColor = 'var(--grey-2)';
    } else if (value >= 2) {
      targetColor = 'var(--grey-1)';
    }

    const item = document.createElement('div');
    item.className = 'quarter-item';

    const square = document.createElement('div');
    square.className = 'taste-square';
    square.style.transition = 'none';
    square.style.backgroundColor = 'var(--grey-3)';
    square.dataset.targetColor = targetColor;

    item.appendChild(square);

    const label = document.createElement('span');
    label.className = 'quarter-label';
    label.textContent = t.label;
    item.appendChild(label);

    container.appendChild(item);
    squares.push(square);
  });

  // Force paint with faded state, then animate
  requestAnimationFrame(() => {
    squares.forEach(sq => sq.offsetHeight); // force reflow
    requestAnimationFrame(() => {
      squares.forEach((sq, i) => {
        sq.style.transition = 'background-color 0.4s ease';
        setTimeout(() => {
          sq.style.backgroundColor = sq.dataset.targetColor;
        }, i * 100);
      });
    });
  });

  // Set description for GESCHMACK explicitly (if you ever need a sub-description, left blank for now so main desc shines below title)
  const descText = document.getElementById('geschmack-desc-text');
  descText.textContent = 'Dieses Schema zeigt an, welche der fünf Geschmacksrichtungen in dem Gewürz schwach - heller Grauton - oder stark - dunkler Grauton - aktiv sind. Ist ein Grundgeschmack nicht aktiv bleibt die Farbe ganz hell.';
}

// ============================================
// MOLEKÜLE
// ============================================
let currentMolSlot = null; // Track currently selected molecule group slot

function renderMolekuele() {
  const grid = document.getElementById('molekuele-circles');
  const detail = document.getElementById('molekuele-detail');
  grid.innerHTML = '';
  detail.innerHTML = '';
  detail.style.display = 'none';
  currentMolSlot = null;

  // Determine which groups are active
  const activeSlots = new Set();
  currentMolecules.forEach(m => {
    if (m.molecules?.aroma_groups?.slot) {
      activeSlots.add(m.molecules.aroma_groups.slot);
    }
    // Auto-activate Group 9 (Trigeminus) if any molecule has trigeminal activation
    if (m.has_trigeminal_activation) {
      activeSlots.add(9);
    }
  });

  // Render 9 circles
  const circleEls = [];
  allGroups.forEach(group => {
    const isActive = activeSlots.has(group.slot);
    const circle = document.createElement('div');
    circle.className = 'mol-circle';
    // Start all at faded color3, no transition initially
    circle.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    circle.style.backgroundColor = color3(group.color_hex);
    circle.dataset.slot = group.slot;
    circle.dataset.active = isActive ? '1' : '0';
    circle.dataset.targetBg = isActive ? color2(group.color_hex) : color3(group.color_hex);

    const num = document.createElement('span');
    num.className = 'mol-number';
    num.textContent = group.slot;
    circle.appendChild(num);

    circle.addEventListener('click', () => {
      if (isActive) {
        // Toggle: if already selected, deselect
        if (currentMolSlot === group.slot) {
          currentMolSlot = null;
          clearMolSelection(grid);
          detail.innerHTML = '';
          detail.style.display = 'none';
        } else {
          // Select this group
          currentMolSlot = group.slot;
          clearMolSelection(grid);
          circle.classList.add('selected');
          circle.style.boxShadow = `inset 0 0 0 4px ${color1(group.color_hex)}`;
          showMoleculeDetail(group);
        }
      } else {
        // Inactive circle clicked — close any open detail
        currentMolSlot = null;
        clearMolSelection(grid);
        detail.innerHTML = '';
        detail.style.display = 'none';
      }
    });

    grid.appendChild(circle);
    circleEls.push(circle);
  });

  // Staggered animation in random order
  const order = Array.from({ length: circleEls.length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  requestAnimationFrame(() => {
    circleEls.forEach(c => c.offsetHeight); // force reflow
    requestAnimationFrame(() => {
      order.forEach((idx, step) => {
        setTimeout(() => {
          circleEls[idx].style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.4s ease';
          circleEls[idx].style.backgroundColor = circleEls[idx].dataset.targetBg;
        }, step * 80);
      });
    });
  });

  // Set description
  const descText = document.getElementById('molekuele-desc-text');
  descText.textContent = 'Hier sind die aktiven Molekülgruppen der Zutat zu sehen. Die ausgeschlüsselten Duftnoten jedes Aromas und dessen Löslichkeit werden duch anklicken sichtbar. (Manche Aromen lösen "zusätzlich" einen trigeminalen Reiz aus, weshalb gelegentlich die 9.Gruppe ohne eigene Moleküle aktiv ist.)';
}

function clearMolSelection(grid) {
  grid.querySelectorAll('.mol-circle').forEach(c => {
    c.classList.remove('selected');
    c.style.boxShadow = 'none';
  });
}

function showMoleculeDetail(group) {
  const detail = document.getElementById('molekuele-detail');
  detail.innerHTML = '';
  detail.style.display = 'block';

  // Group title
  const title = document.createElement('div');
  title.className = 'mol-detail-group-title';
  title.textContent = group.title_de;
  detail.appendChild(title);

  // Descriptor
  const desc = document.createElement('div');
  desc.className = 'mol-detail-descriptor';
  desc.textContent = group.descriptor_de;
  detail.appendChild(desc);

  // Thick Color 1 underline (2/3 width)
  const underline = document.createElement('div');
  underline.className = 'mol-detail-underline';
  underline.style.backgroundColor = color1(group.color_hex);
  detail.appendChild(underline);

  // Filter molecules for this group
  const groupMols = currentMolecules.filter(m =>
    m.molecules?.aroma_groups?.slot === group.slot
  );

  // Check if this group has temperature behavior data (e.g., Group 9 Trigeminus)
  const groupTemp = currentGroupTemps.find(gt =>
    gt.aroma_groups?.slot === group.slot
  );

  // If no molecules but has temperature data, show the behavior description
  if (groupMols.length === 0 && groupTemp?.behavior_description_de) {
    const behaviorDiv = document.createElement('div');
    behaviorDiv.className = 'mol-detail-molecule';

    const behaviorText = document.createElement('div');
    behaviorText.className = 'mol-detail-prop-value';
    behaviorText.style.marginTop = '8px';
    behaviorText.textContent = groupTemp.behavior_description_de;
    behaviorDiv.appendChild(behaviorText);

    detail.appendChild(behaviorDiv);
  }

  groupMols.forEach(m => {
    const mol = m.molecules;
    const molDiv = document.createElement('div');
    molDiv.className = 'mol-detail-molecule';

    // Molecule name
    const name = document.createElement('div');
    name.className = 'mol-detail-mol-name';
    name.textContent = mol.name_de.toUpperCase();
    molDiv.appendChild(name);

    // Props row — values only, no sub-headlines
    const props = document.createElement('div');
    props.className = 'mol-detail-props';

    if (mol.descriptors_de) {
      const aromProp = document.createElement('div');
      aromProp.className = 'mol-detail-prop';
      const aromVal = document.createElement('div');
      aromVal.className = 'mol-detail-prop-value';
      aromVal.textContent = mol.descriptors_de;
      aromProp.appendChild(aromVal);
      props.appendChild(aromProp);
    }

    if (mol.solubility_de) {
      const solProp = document.createElement('div');
      solProp.className = 'mol-detail-prop';
      const solVal = document.createElement('div');
      solVal.className = 'mol-detail-prop-value';
      solVal.textContent = mol.solubility_de;
      solProp.appendChild(solVal);
      props.appendChild(solProp);
    }

    molDiv.appendChild(props);
    detail.appendChild(molDiv);
  });
}

// ============================================
// AROMAENTFALTUNG
// ============================================
function renderAromaentfaltung() {
  const chartContainer = document.getElementById('aroma-chart');
  const phaseInfo = document.getElementById('aroma-phase-info');
  chartContainer.innerHTML = '';
  phaseInfo.innerHTML = '';

  if (currentGroupTemps.length === 0) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'aroma-chart-inner';

  // --- Bar rows (rendered FIRST, scale goes below) ---
  const barsContainer = document.createElement('div');
  barsContainer.className = 'aroma-bars';

  // Sort by slot
  const sortedTemps = [...currentGroupTemps].sort((a, b) => a.aroma_groups.slot - b.aroma_groups.slot);

  const barElements = []; // Store references for slider interaction

  sortedTemps.forEach(gt => {
    const group = gt.aroma_groups;
    const hex = group.color_hex;
    const startSquare = Math.floor(gt.temp_start_c / 10);
    const endSquare = Math.floor(gt.temp_end_c / 10);

    const row = document.createElement('div');
    row.className = 'aroma-bar-row';
    row.dataset.slot = group.slot;
    row.dataset.start = startSquare;
    row.dataset.end = endSquare;

    const squares = [];
    for (let i = 0; i < 17; i++) {
      const sq = document.createElement('div');
      sq.className = 'aroma-bar-square';
      const isActiveSquare = (i >= startSquare && i < endSquare);
      sq.dataset.active = isActiveSquare ? '1' : '0';
      sq.dataset.index = i;
      sq.style.backgroundColor = isActiveSquare ? color2(hex) : color3(hex);
      sq.dataset.hex = hex;
      sq.dataset.color2 = color2(hex);
      sq.dataset.color3 = color3(hex);
      sq.dataset.color1 = color1(hex);
      // Subtle increment lines on inactive squares only
      if (!isActiveSquare && i < 16) {
        sq.style.borderRight = '1px solid rgba(255,255,255,0.3)';
      }
      row.appendChild(sq);
      squares.push(sq);
    }

    barsContainer.appendChild(row);
    barElements.push({ row, squares, hex, startSquare, endSquare, group });
  });

  wrapper.appendChild(barsContainer);

  // --- Scale row (BELOW the bars) ---
  const scaleRow = document.createElement('div');
  scaleRow.className = 'aroma-scale';
  scaleRow.style.display = 'flex';
  scaleRow.style.position = 'relative';
  scaleRow.style.padding = '0';
  scaleRow.style.marginTop = '6px';
  scaleRow.style.marginBottom = '0';

  const scaleLabels = [
    { value: 0, pos: 0 },
    { value: 50, pos: 50 / 170 * 100 },
    { value: 150, pos: 150 / 170 * 100 },
    { value: '°C', pos: 100 }
  ];

  scaleLabels.forEach(s => {
    const lab = document.createElement('span');
    lab.className = 'aroma-scale-label';
    lab.textContent = s.value;
    lab.style.position = 'absolute';
    lab.style.left = s.pos + '%';
    lab.style.transform = 'translateX(-50%)';
    scaleRow.appendChild(lab);
  });
  scaleRow.style.height = '16px';
  wrapper.appendChild(scaleRow);

  // --- Slider ---
  const slider = document.createElement('div');
  slider.className = 'aroma-slider';
  const sliderHandle = document.createElement('div');
  sliderHandle.className = 'aroma-slider-handle';
  slider.appendChild(sliderHandle);

  // Position slider initially at far left
  // Height = number of rows * (12px bar + 3px margin) - last margin
  const rowCount = sortedTemps.length;
  const sliderHeight = rowCount * 15 - 3; // 12px bar + 3px gap, minus last gap
  slider.style.left = '0%';
  slider.style.height = sliderHeight + 'px';

  wrapper.appendChild(slider);
  chartContainer.appendChild(wrapper);

  // --- Slider drag logic ---
  let isDragging = false;
  let sliderPosition = 0; // 0-170 degrees

  function updateSlider(clientX) {
    const rect = barsContainer.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const pct = x / rect.width;
    sliderPosition = Math.round(pct * 170);
    const squareIndex = Math.min(Math.floor(sliderPosition / 10), 16);

    slider.style.left = (pct * 100) + '%';

    // Update bar colors based on slider position
    // If slider touches active range → whole active segment = Color 1
    // If slider is outside active range → whole active segment = Color 2
    // Inactive squares → always Color 3
    barElements.forEach(({ squares, hex, startSquare, endSquare }) => {
      const sliderTouchesActive = squareIndex >= startSquare && squareIndex < endSquare;
      squares.forEach((sq, i) => {
        const isActive = sq.dataset.active === '1';
        if (isActive) {
          sq.style.backgroundColor = sliderTouchesActive ? color1(hex) : color2(hex);
          sq.style.borderRight = 'none';
        } else {
          sq.style.backgroundColor = color3(hex);
          if (i < 16) {
            sq.style.borderRight = '1px solid rgba(255,255,255,0.3)';
          }
        }
      });
    });

    // Show phase info
    updatePhaseInfo(sliderPosition);
  }

  function updatePhaseInfo(temp) {
    phaseInfo.innerHTML = '';
    const phase = currentPhases.find(p => temp >= p.temp_start_c && temp < p.temp_end_c);

    const tempLabel = document.createElement('div');
    tempLabel.className = 'aroma-temp-label';
    tempLabel.textContent = temp + '°C';
    phaseInfo.appendChild(tempLabel);

    if (phase) {
      const pName = document.createElement('div');
      pName.className = 'aroma-phase-name';
      pName.textContent = 'PHASE ' + phase.phase_name;
      phaseInfo.appendChild(pName);

      const pDesc = document.createElement('div');
      pDesc.className = 'aroma-phase-desc';
      pDesc.textContent = phase.description_de || '';
      phaseInfo.appendChild(pDesc);
    }
  }

  // Mouse events
  wrapper.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateSlider(e.clientX);
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) updateSlider(e.clientX);
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // Touch events
  wrapper.addEventListener('touchstart', (e) => {
    isDragging = true;
    updateSlider(e.touches[0].clientX);
  }, { passive: true });
  wrapper.addEventListener('touchmove', (e) => {
    if (isDragging) {
      e.preventDefault();
      updateSlider(e.touches[0].clientX);
    }
  }, { passive: false });
  wrapper.addEventListener('touchend', () => { isDragging = false; });

  // Set description
  const descText = document.getElementById('aromaentfaltung-desc-text');
  descText.textContent = 'Hier ist der optimale Temperaturbereich für den Einsatz der Zutat auf einen Blick zu sehen. Die einzelnen Zonen zeigen mitunter verschiedenen Charakteristika für ein und dasselbe Gewürz.';
}

// ============================================
// HARMONIE
// ============================================
let harmonieSelectedSlots = new Set();

async function renderHarmonie() {
  const mainContainer = document.getElementById('harmonie-main');
  const matchesContainer = document.getElementById('harmonie-matches');
  mainContainer.innerHTML = '';
  matchesContainer.innerHTML = '';
  harmonieSelectedSlots.clear();

  if (!currentIngredient) return;

  // Get active group slots for current ingredient
  const activeSlots = new Set();
  currentMolecules.forEach(m => {
    if (m.molecules?.aroma_groups?.slot) {
      activeSlots.add(m.molecules.aroma_groups.slot);
    }
    if (m.has_trigeminal_activation) {
      activeSlots.add(9);
    }
  });

  // Render main ingredient row
  const mainRow = createHarmonieRow(
    currentIngredient.name_de,
    activeSlots,
    true, // is main ingredient
    () => { } // no navigation for self
  );
  mainContainer.appendChild(mainRow);

  // Preload all ingredient group data for matching
  await preloadAllIngredientGroups();
}

async function preloadAllIngredientGroups() {
  // Fetch all ingredient molecules with their group slots and trigeminal flag
  const { data } = await sb
    .from('ingredient_molecules')
    .select('ingredient_id, has_trigeminal_activation, molecules(aroma_groups(slot))');

  allIngredientGroups = {};
  (data || []).forEach(row => {
    const slot = row.molecules?.aroma_groups?.slot;
    if (!slot) return;
    if (!allIngredientGroups[row.ingredient_id]) {
      allIngredientGroups[row.ingredient_id] = new Set();
    }
    allIngredientGroups[row.ingredient_id].add(slot);
    if (row.has_trigeminal_activation) {
      allIngredientGroups[row.ingredient_id].add(9);
    }
  });
}

function createHarmonieRow(name, activeSlots, isMain, onNavigate) {
  const row = document.createElement('div');
  row.className = 'harmonie-row';

  const nameEl = document.createElement('div');
  nameEl.className = `harmonie-name ${isMain ? 'main-ingredient' : 'match-ingredient'}`;
  nameEl.textContent = name.toUpperCase();
  if (!isMain) {
    nameEl.addEventListener('click', onNavigate);
  }
  row.appendChild(nameEl);

  const circlesRow = document.createElement('div');
  circlesRow.className = 'harmonie-circles';

  allGroups.forEach(group => {
    const isActive = activeSlots.has(group.slot);
    const circle = document.createElement('div');
    circle.className = 'harmonie-circle';
    circle.dataset.slot = group.slot;
    circle.dataset.groupActive = isActive ? '1' : '0';

    if (isActive) {
      circle.style.backgroundColor = color2(group.color_hex);
    } else {
      circle.style.backgroundColor = color3(group.color_hex);
    }

    // Main ingredient circles are interactive
    if (isMain) {
      circle.classList.add('main-interactive');
      circle.dataset.selected = '0';

      circle.addEventListener('click', () => {
        const isSelected = circle.dataset.selected === '1';

        if (isSelected) {
          // Deselect — remove outline, restore base color
          circle.dataset.selected = '0';
          harmonieSelectedSlots.delete(group.slot);
          circle.style.boxShadow = 'none';
          // Keep base color (Color 2 for active, Color 3 for inactive)
          circle.style.backgroundColor = isActive ? color2(group.color_hex) : color3(group.color_hex);
        } else {
          // Select — add Color 1 outline, inside retains base color
          circle.dataset.selected = '1';
          harmonieSelectedSlots.add(group.slot);
          circle.style.boxShadow = `inset 0 0 0 3px ${color1(group.color_hex)}`;
          // Keep base color inside (Color 2 for active, Color 3 for inactive)
          circle.style.backgroundColor = isActive ? color2(group.color_hex) : color3(group.color_hex);
        }

        updateHarmonieMatches();
      });
    }

    circlesRow.appendChild(circle);
  });

  row.appendChild(circlesRow);
  return row;
}

function updateHarmonieMatches() {
  const matchesContainer = document.getElementById('harmonie-matches');
  matchesContainer.innerHTML = '';

  if (harmonieSelectedSlots.size === 0) return;

  // Find ingredients that have ALL selected slots active
  const matches = [];

  allIngredients.forEach(ing => {
    if (ing.id === currentIngredient.id) return;
    const ingSlots = allIngredientGroups[ing.id] || new Set();

    let allMatch = true;
    harmonieSelectedSlots.forEach(slot => {
      if (!ingSlots.has(slot)) allMatch = false;
    });

    if (allMatch) {
      matches.push({ ingredient: ing, slots: ingSlots });
    }
  });

  // Render matches
  matches.forEach(({ ingredient, slots }) => {
    const row = createHarmonieRow(
      ingredient.name_de,
      slots,
      false,
      () => {
        // Navigate to this ingredient
        openIngredient(ingredient.id);
      }
    );
    matchesContainer.appendChild(row);
  });
}

// Set description
function setHarmonieDescription() {
  const descText = document.getElementById('harmonie-desc-text');
  descText.textContent = 'In diesem Abschnitt zeigen gleiche Farben an, dass sich das typischen Aroma dieser Gruppe in Kombination weiter verstärken würde. Sind die Farben im jewels anderen Gewürz nicht enthalten, findet in der Kombination der Gewürze eine gegenseitige Erweiterung um die jeweiligen Aromen statt.';
}

