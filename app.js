/**
 * Toastmasters "Self Timer" Single Page Application Logic
 * Implements state management, Screen Wake Lock API, custom preset validation,
 * immersive dynamic background triggers, and a persistent session logger.
 */

// ==========================================================================
// Application State
// ==========================================================================
const state = {
  isRunning: false,
  isPaused: false,
  startTime: null,      // Date.now() timestamp when timer started
  accumulatedTime: 0,   // Elapsed time in milliseconds from previous runs (if paused)
  elapsedSeconds: 0,    // Integer seconds elapsed
  timerInterval: null,  // Interval reference
  wakeLockSentinel: null,
  
  // Active timing thresholds (in seconds)
  thresholds: {
    green: 300,         // Default: 5 minutes
    yellow: 360,        // Default: 6 minutes
    red: 420            // Default: 7 minutes
  },
  
  activePreset: 'prepared', // 'prepared', 'topics', 'evaluation', 'icebreaker', 'custom'
  
  /* CUSTOMIZATION GUIDE: DEFAULT SPEAKER NAME
     Change the string below to set a different default speaker placeholder (e.g., 'Competitor'). */
  speakerName: 'Speaker',
  
  /* CUSTOMIZATION GUIDE: PRESETS & TIMING PARAMETERS
     Modify the times in the presets object below. All numbers (green, yellow, red, minQualify, maxQualify)
     are in seconds (e.g., 300 seconds = 5 minutes).
     - green: when background turns green
     - yellow: when background turns yellow
     - red: when background turns red (time limit)
     - minQualify: min time to qualify (30 seconds before green is Toastmasters standard)
     - maxQualify: max time allowed before disqualification (30 seconds after red is Toastmasters standard) */
  presets: {
    prepared: { name: 'Prepared Speech', green: 300, yellow: 360, red: 420, minQualify: 270, maxQualify: 450 },
    topics: { name: 'Table Topics', green: 60, yellow: 90, red: 120, minQualify: 60, maxQualify: 150 },
    evaluation: { name: 'Evaluation', green: 120, yellow: 150, red: 180, minQualify: 90, maxQualify: 210 },
    icebreaker: { name: 'Ice Breaker', green: 240, yellow: 300, red: 360, minQualify: 210, maxQualify: 390 }
  }
};

// ==========================================================================
// DOM Elements Selection
// ==========================================================================
const elements = {
  // Views
  setupView: document.getElementById('setup-view'),
  timerView: document.getElementById('timer-view'),
  
  // Setup elements
  speakerInput: document.getElementById('speaker-name'),
  presetBtns: document.querySelectorAll('.preset-btn'),
  customPresetBtn: document.getElementById('custom-preset-btn'),
  customTimingForm: document.getElementById('custom-timing-form'),
  btnStartSpeech: document.getElementById('btn-start-speech'),
  
  // Custom timing inputs
  customGreenMin: document.getElementById('custom-green-min'),
  customGreenSec: document.getElementById('custom-green-sec'),
  customYellowMin: document.getElementById('custom-yellow-min'),
  customYellowSec: document.getElementById('custom-yellow-sec'),
  customRedMin: document.getElementById('custom-red-min'),
  customRedSec: document.getElementById('custom-red-sec'),
  customValidationError: document.getElementById('custom-validation-error'),
  
  // Preferences settings
  settingShowTimer: document.getElementById('setting-show-timer'),
  settingWakeLock: document.getElementById('setting-wake-lock'),
  settingDemoMode: document.getElementById('setting-demo-mode'),
  
  // Header badges
  wakelockStatus: document.getElementById('wakelock-status'),
  fullscreenBadge: document.getElementById('fullscreen-badge'),
  
  // History
  historyBody: document.getElementById('history-body'),
  historyEmptyRow: document.getElementById('history-empty-row'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  
  // Timer Canvas elements
  immersiveBg: document.getElementById('immersive-bg'),
  immersiveSpeakerBadge: document.getElementById('immersive-speaker-badge'),
  immersivePresetBadge: document.getElementById('immersive-preset-badge'),
  timerDigitsContainer: document.getElementById('timer-digits-container'),
  displayTime: document.getElementById('display-time'),
  speechStatus: document.getElementById('speech-status'),
  hiddenDigitsIndicator: document.getElementById('hidden-digits-indicator'),
  
  // Control Panel Buttons
  btnPause: document.getElementById('btn-pause'),
  btnStop: document.getElementById('btn-stop'),
  btnReset: document.getElementById('btn-reset'),
  btnToggleFullscreen: document.getElementById('btn-toggle-fullscreen'),
  
  // Parent layout container
  appContainer: document.getElementById('app-container')
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadHistoryFromStorage();
  checkWakeLockSupport();
  syncTimingThresholds();
});

// Check if browser supports Wake Lock API
function checkWakeLockSupport() {
  if ('wakeLock' in navigator) {
    elements.wakelockStatus.classList.remove('badge-inactive');
    elements.wakelockStatus.classList.add('badge-secondary');
    elements.wakelockStatus.innerHTML = '<span class="badge-dot"></span> Wake Lock: Supported';
  } else {
    elements.wakelockStatus.classList.add('badge-inactive');
    elements.wakelockStatus.innerHTML = '⚠️ Wake Lock: Unsupported';
    // Disable switch since it's unsupported
    elements.settingWakeLock.checked = false;
    elements.settingWakeLock.disabled = true;
  }
}

// ==========================================================================
// Event Listeners Setup
// ==========================================================================
function setupEventListeners() {
  
  // Preset Button Selection
  elements.presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.presetBtns.forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      
      const presetType = targetBtn.dataset.preset;
      state.activePreset = presetType;
      
      if (presetType === 'custom') {
        elements.customTimingForm.classList.remove('collapsed');
        validateCustomInputs();
      } else {
        elements.customTimingForm.classList.add('collapsed');
        elements.customValidationError.classList.add('hidden');
        elements.btnStartSpeech.disabled = false;
      }
      
      syncTimingThresholds();
    });
  });
  
  // Custom Form Input Listeners for Auto-validation
  const customInputs = [
    elements.customGreenMin, elements.customGreenSec,
    elements.customYellowMin, elements.customYellowSec,
    elements.customRedMin, elements.customRedSec
  ];
  customInputs.forEach(input => {
    input.addEventListener('input', () => {
      validateCustomInputs();
      syncTimingThresholds();
    });
  });
  
  // Start Button Click
  elements.btnStartSpeech.addEventListener('click', startSpeech);
  
  // Timer Controls
  elements.btnPause.addEventListener('click', togglePause);
  elements.btnStop.addEventListener('click', stopSpeech);
  elements.btnReset.addEventListener('click', resetTimer);
  elements.btnToggleFullscreen.addEventListener('click', toggleFullscreenMode);
  
  // Clear history logs
  elements.btnClearHistory.addEventListener('click', clearSpeechLogs);
  
  // Watch fullscreen changes to update UI elements
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  
  // Page visibility listener: Re-lock wake sentinel if page becomes visible again
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Add key listener for space/escape inside active timer view for easy control
  document.addEventListener('keydown', handleKeyPress);
}

// ==========================================================================
// Custom Form Validation
// ==========================================================================
function validateCustomInputs() {
  if (state.activePreset !== 'custom') return true;
  
  const greenSecs = (parseInt(elements.customGreenMin.value) || 0) * 60 + (parseInt(elements.customGreenSec.value) || 0);
  const yellowSecs = (parseInt(elements.customYellowMin.value) || 0) * 60 + (parseInt(elements.customYellowSec.value) || 0);
  const redSecs = (parseInt(elements.customRedMin.value) || 0) * 60 + (parseInt(elements.customRedSec.value) || 0);
  
  const isValid = (greenSecs > 0) && (greenSecs < yellowSecs) && (yellowSecs < redSecs);
  
  if (isValid) {
    elements.customValidationError.classList.add('hidden');
    elements.btnStartSpeech.disabled = false;
  } else {
    elements.customValidationError.classList.remove('hidden');
    elements.btnStartSpeech.disabled = true;
  }
  
  return isValid;
}

// Synchronize timings based on active preset / custom input
function syncTimingThresholds() {
  if (state.activePreset === 'custom') {
    state.thresholds.green = (parseInt(elements.customGreenMin.value) || 0) * 60 + (parseInt(elements.customGreenSec.value) || 0);
    state.thresholds.yellow = (parseInt(elements.customYellowMin.value) || 0) * 60 + (parseInt(elements.customYellowSec.value) || 0);
    state.thresholds.red = (parseInt(elements.customRedMin.value) || 0) * 60 + (parseInt(elements.customRedSec.value) || 0);
  } else {
    const config = state.presets[state.activePreset];
    state.thresholds.green = config.green;
    state.thresholds.yellow = config.yellow;
    state.thresholds.red = config.red;
  }
}

// ==========================================================================
// Timer Core Operations
// ==========================================================================
async function startSpeech() {
  // Pull speaker details
  const inputName = elements.speakerInput.value.trim();
  state.speakerName = inputName ? inputName : 'Speaker';
  
  // Synchronize thresholds
  syncTimingThresholds();
  
  // Configure display states
  elements.immersiveSpeakerBadge.textContent = state.speakerName;
  
  let presetLabel = '';
  if (state.activePreset === 'custom') {
    presetLabel = `Custom (${formatSeconds(state.thresholds.green)} - ${formatSeconds(state.thresholds.red)})`;
  } else {
    presetLabel = `${state.presets[state.activePreset].name} (${formatSeconds(state.thresholds.green)} - ${formatSeconds(state.thresholds.red)})`;
  }
  elements.immersivePresetBadge.textContent = presetLabel;
  
  // Set Digits Display Setting
  if (elements.settingShowTimer.checked) {
    elements.timerDigitsContainer.classList.remove('hidden');
    elements.hiddenDigitsIndicator.classList.add('hidden');
  } else {
    elements.timerDigitsContainer.classList.add('hidden');
    elements.hiddenDigitsIndicator.classList.remove('hidden');
  }
  
  // Swap Views
  elements.setupView.classList.remove('view-active');
  elements.setupView.classList.add('view-hidden');
  elements.timerView.classList.remove('view-hidden');
  elements.timerView.classList.add('view-active');
  
  // Initialize states
  state.isRunning = true;
  state.isPaused = false;
  state.elapsedSeconds = 0;
  state.accumulatedTime = 0;
  state.startTime = Date.now();
  
  updateDisplay(0);
  
  // Request wake lock if selected and supported
  if (elements.settingWakeLock.checked) {
    await requestWakeLock();
  }
  
  // Start the background tracking interval
  const tickRate = elements.settingDemoMode.checked ? 1000 / 60 : 1000; // Accelerated demo mode multiplies time by 60!
  state.timerInterval = setInterval(() => {
    if (!state.isPaused) {
      let delta;
      if (elements.settingDemoMode.checked) {
        // Fast-forward demo mode: increment 1 minute per real-world second
        state.accumulatedTime += 60 * 1000;
        delta = state.accumulatedTime;
      } else {
        // Real accurate timer: delta against standard timestamps
        delta = Date.now() - state.startTime + state.accumulatedTime;
      }
      
      state.elapsedSeconds = Math.floor(delta / 1000);
      updateDisplay(state.elapsedSeconds);
    }
  }, tickRate);
}

// Pause/Resume Speech Timer
function togglePause() {
  if (!state.isRunning) return;
  
  if (state.isPaused) {
    // Resume
    state.isPaused = false;
    state.startTime = Date.now();
    elements.btnPause.innerHTML = '<span class="icon">⏸️</span> Pause';
    elements.btnPause.classList.remove('btn-secondary');
    elements.btnPause.classList.add('btn-warn');
    elements.speechStatus.textContent = 'RUNNING';
    if (elements.settingWakeLock.checked) {
      requestWakeLock();
    }
  } else {
    // Pause
    state.isPaused = true;
    state.accumulatedTime += Date.now() - state.startTime;
    elements.btnPause.innerHTML = '<span class="icon">▶️</span> Resume';
    elements.btnPause.classList.remove('btn-warn');
    elements.btnPause.classList.add('btn-secondary');
    elements.speechStatus.textContent = 'PAUSED';
    releaseWakeLock();
  }
}

// Discard Speech and return to dashboard
function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isRunning = false;
  state.isPaused = false;
  
  releaseWakeLock();
  exitFullscreenMode();
  
  // Restore view toggle
  elements.timerView.classList.remove('view-active');
  elements.timerView.classList.add('view-hidden');
  elements.setupView.classList.remove('view-hidden');
  elements.setupView.classList.add('view-active');
  
  // Reset pause buttons
  elements.btnPause.innerHTML = '<span class="icon">⏸️</span> Pause';
  elements.btnPause.classList.remove('btn-secondary');
  elements.btnPause.classList.add('btn-warn');
  
  // Clean classes
  elements.immersiveBg.className = 'immersive-beacon bg-neutral';
}

// Stop speech, Log Details, Save to History
function stopSpeech() {
  if (!state.isRunning) return;
  
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isRunning = false;
  
  const totalSeconds = state.elapsedSeconds;
  
  // Log timing result
  saveSpeechLog(state.speakerName, state.activePreset, totalSeconds);
  
  releaseWakeLock();
  exitFullscreenMode();
  
  // Swap Views back
  elements.timerView.classList.remove('view-active');
  elements.timerView.classList.add('view-hidden');
  elements.setupView.classList.remove('view-hidden');
  elements.setupView.classList.add('view-active');
  
  // Reset buttons
  elements.btnPause.innerHTML = '<span class="icon">⏸️</span> Pause';
  elements.btnPause.classList.remove('btn-secondary');
  elements.btnPause.classList.add('btn-warn');
  
  // Clear classes
  elements.immersiveBg.className = 'immersive-beacon bg-neutral';
}

// ==========================================================================
// Immersive Display Color Controller
// ==========================================================================
function updateDisplay(seconds) {
  // Update numerical clock digits
  elements.displayTime.textContent = formatSecondsToClock(seconds);
  
  /* CUSTOMIZATION GUIDE: TIMER STATE LABELS & STATUS COLORS
     Here you can modify the text that displays inside the circular timer ring (e.g. 'RUNNING', 'GREEN REACHED')
     and the exact color of the text during each active state.
     
     Note: Background colors are defined in style.css under the class names:
     .bg-neutral, .bg-green, .bg-yellow, .bg-red. Refer to style.css to change the actual background hues. */
  if (seconds < state.thresholds.green) {
    // Under minimum limit
    elements.immersiveBg.className = 'immersive-beacon bg-neutral';
    elements.speechStatus.textContent = 'SPEECH STARTED';
    elements.speechStatus.style.color = 'var(--color-slate-400)'; // Default gray text
  } else if (seconds >= state.thresholds.green && seconds < state.thresholds.yellow) {
    // Green State reached
    elements.immersiveBg.className = 'immersive-beacon bg-green';
    elements.speechStatus.textContent = 'GREEN REACHED';
    elements.speechStatus.style.color = '#34d399'; // Bright green text color
  } else if (seconds >= state.thresholds.yellow && seconds < state.thresholds.red) {
    // Yellow State reached
    elements.immersiveBg.className = 'immersive-beacon bg-yellow';
    elements.speechStatus.textContent = 'YELLOW REACHED';
    elements.speechStatus.style.color = '#fbbf24'; // Warm yellow text color
  } else if (seconds >= state.thresholds.red) {
    // Red State reached (Remain solid red throughout)
    elements.immersiveBg.className = 'immersive-beacon bg-red';
    elements.speechStatus.textContent = 'LIMIT REACHED';
    elements.speechStatus.style.color = '#f87171'; // Light red/pinkish text color
  }
}

// ==========================================================================
// Keyboard Controls Integration
// ==========================================================================
function handleKeyPress(e) {
  // Ensure we are inside the active timer view before intercepting spacebar
  if (!state.isRunning) return;
  
  if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  } else if (e.code === 'Escape') {
    // Allow ESC to escape out of timer mode smoothly
    e.preventDefault();
    stopSpeech();
  }
}

// ==========================================================================
// System Wake Lock API Controls
// ==========================================================================
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !elements.settingWakeLock.checked) return;
  
  try {
    state.wakeLockSentinel = await navigator.wakeLock.request('screen');
    
    // Update badge UI
    elements.wakelockStatus.classList.remove('badge-secondary', 'badge-inactive');
    elements.wakelockStatus.classList.add('badge-active');
    elements.wakelockStatus.innerHTML = '<span class="badge-dot"></span> Wake Lock: Active';
    
    // Sentinel release handler listener
    state.wakeLockSentinel.addEventListener('release', () => {
      if (!state.isRunning || state.isPaused) {
        elements.wakelockStatus.classList.remove('badge-active');
        elements.wakelockStatus.classList.add('badge-secondary');
        elements.wakelockStatus.innerHTML = '<span class="badge-dot"></span> Wake Lock: Idle';
      }
    });
  } catch (err) {
    console.error(`Wake Lock failed to initialize: ${err.name}, ${err.message}`);
    elements.wakelockStatus.classList.remove('badge-active', 'badge-secondary');
    elements.wakelockStatus.classList.add('badge-inactive');
    elements.wakelockStatus.innerHTML = '⚠️ Wake Lock Locked';
  }
}

function releaseWakeLock() {
  if (state.wakeLockSentinel !== null) {
    state.wakeLockSentinel.release();
    state.wakeLockSentinel = null;
  }
}

// Re-request wake lock if tab loses focus and returns focus
async function handleVisibilityChange() {
  if (state.wakeLockSentinel !== null && document.visibilityState === 'visible' && state.isRunning && !state.isPaused) {
    await requestWakeLock();
  }
}

// ==========================================================================
// Fullscreen API Controls
// ==========================================================================
function toggleFullscreenMode() {
  if (!document.fullscreenElement) {
    elements.appContainer.requestFullscreen()
      .catch(err => {
        console.error(`Error enabling full-screen mode: ${err.message}`);
      });
  } else {
    exitFullscreenMode();
  }
}

function exitFullscreenMode() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  if (document.fullscreenElement) {
    elements.fullscreenBadge.classList.remove('badge-secondary');
    elements.fullscreenBadge.classList.add('badge-active');
    elements.fullscreenBadge.innerHTML = '🖥️ Immersive Fullscreen';
    elements.btnToggleFullscreen.innerHTML = '🖥️ Exit Fullscreen';
  } else {
    elements.fullscreenBadge.classList.remove('badge-active');
    elements.fullscreenBadge.classList.add('badge-secondary');
    elements.fullscreenBadge.innerHTML = '🖥️ Window Mode';
    elements.btnToggleFullscreen.innerHTML = '🖥️ Fullscreen';
  }
}

// ==========================================================================
// Qualifications & Session History Persistent Logs
// ==========================================================================
function saveSpeechLog(speaker, type, elapsedSecs) {
  let minLimit = 0;
  let maxLimit = 0;
  let label = '';
  
  if (type === 'custom') {
    label = 'Custom';
    // For custom presets, we calculate standard 30s grace window buffer on thresholds
    minLimit = Math.max(0, state.thresholds.green - 30);
    maxLimit = state.thresholds.red + 30;
  } else {
    const config = state.presets[type];
    label = config.name;
    minLimit = config.minQualify;
    maxLimit = config.maxQualify;
  }
  
  // Decide Qualification status
  let status = 'qualified';
  let statusLabel = 'Qualified';
  
  if (elapsedSecs < minLimit) {
    status = 'undertime';
    statusLabel = 'Under Time';
  } else if (elapsedSecs > maxLimit) {
    status = 'disqualified';
    statusLabel = 'Over Time';
  }
  
  const logItem = {
    id: Date.now(),
    speaker: speaker,
    typeLabel: label,
    milestones: `${formatSeconds(state.thresholds.green)} | ${formatSeconds(state.thresholds.yellow)} | ${formatSeconds(state.thresholds.red)}`,
    actual: formatSeconds(elapsedSecs),
    status: status,
    statusLabel: statusLabel,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  
  // Save to localStorage array
  const logs = JSON.parse(localStorage.getItem('tm_timer_history') || '[]');
  logs.unshift(logItem); // Insert at start
  localStorage.setItem('tm_timer_history', JSON.stringify(logs));
  
  renderHistoryTable();
}

function renderHistoryTable() {
  const logs = JSON.parse(localStorage.getItem('tm_timer_history') || '[]');
  
  // Clear current rows except header
  elements.historyBody.innerHTML = '';
  
  if (logs.length === 0) {
    elements.historyBody.appendChild(elements.historyEmptyRow);
    return;
  }
  
  logs.forEach(log => {
    const tr = document.createElement('tr');
    
    // Status Tag class
    let tagClass = 'tag-qualified';
    if (log.status === 'undertime') tagClass = 'tag-undertime';
    if (log.status === 'disqualified') tagClass = 'tag-disqualified';
    
    tr.innerHTML = `
      <td style="font-weight:600; color:#ffffff;">${escapeHTML(log.speaker)}</td>
      <td>${log.typeLabel}</td>
      <td style="font-family:var(--font-display); font-weight:500;">${log.milestones}</td>
      <td style="font-family:var(--font-display); font-weight:700; color:#fff;">${log.actual}</td>
      <td><span class="tag ${tagClass}">${log.statusLabel}</span></td>
      <td class="text-muted">${log.timestamp}</td>
    `;
    
    elements.historyBody.appendChild(tr);
  });
}

function loadHistoryFromStorage() {
  renderHistoryTable();
}

function clearSpeechLogs() {
  if (confirm('Are you sure you want to clear your local session history logs?')) {
    localStorage.removeItem('tm_timer_history');
    renderHistoryTable();
  }
}

// ==========================================================================
// Formatting & Helpers
// ==========================================================================
function formatSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSecondsToClock(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
