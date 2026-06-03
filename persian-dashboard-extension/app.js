/**
 * Persian Dashboard Application Orchestration
 */

// Storage Wrapper supporting Chrome Extension storage and localStorage fallback
const db = {
  async get(key, defaultValue = null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise(resolve => {
        chrome.storage.local.get([key], result => {
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      });
    } else {
      const val = localStorage.getItem(key);
      try {
        return val !== null ? JSON.parse(val) : defaultValue;
      } catch (e) {
        return val !== null ? val : defaultValue;
      }
    }
  },

  async set(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise(resolve => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
};

// Default Shortcuts
const DEFAULT_SHORTCUTS = [
  { id: "1", title: "گوگل", url: "https://google.com" },
  { id: "2", title: "جیمیل", url: "https://mail.google.com" },
  { id: "3", title: "دیجی‌کالا", url: "https://digikala.com" },
  { id: "4", title: "یوتیوب", url: "https://youtube.com" },
  { id: "5", title: "تلگرام", url: "https://web.telegram.org" },
  { id: "6", title: "هوش مصنوعی گوگل", url: "https://gemini.google.com" },
  { id: "7", title: "آپارات", url: "https://aparat.com" },
  { id: "8", title: "ورزش سه", url: "https://varzesh3.com" }
];

// App State
let clockInterval;
let shortcuts = [];
let currentCategory = "general";
let isEditMode = false;
let editingShortcutId = null;
let activeFolderId = null; // Folder context for adding shortcut

// Timer State
let timerInterval = null;
let timerSeconds = 25 * 60; // default 25 mins
let isTimerRunning = false;

// Planner Global State
let plannerTasks = [];
let plannerHabits = [];
let plannerHabitLogs = {};
let plannerCategories = [];

const DEFAULT_CATEGORIES = [
  { id: "health", name: "سلامتی", emoji: "🍏", color: "#10b981" },
  { id: "learning", name: "یادگیری", emoji: "📚", color: "#3b82f6" },
  { id: "work", name: "کار", emoji: "💻", color: "#f59e0b" },
  { id: "mind", name: "ذهن", emoji: "🧘", color: "#8b5cf6" }
];

// DOMContentLoaded Initialization
document.addEventListener("DOMContentLoaded", async () => {
  // Pre-load categories, habits, logs globally so that checklist and planner can use them
  plannerCategories = await db.get("planner_categories", DEFAULT_CATEGORIES);
  plannerHabits = await db.get("planner_habits", [
    { id: "h1", name: "ورزش روزانه", category: "health" },
    { id: "h2", name: "مطالعه کتاب", category: "learning" },
    { id: "h3", name: "کدنویسی روزانه", category: "work" },
    { id: "h4", name: "مدیتیشن و آرامش", category: "mind" }
  ]);
  plannerHabitLogs = await db.get("planner_habit_logs", {});
  plannerTasks = await db.get("planner_tasks", []);

  // Initialize general dashboard clock and calendar instantly
  initClock();
  initCalendar();
  
  // Load Settings, Shortcuts, and Scratchpad notes in parallel to speed up startup
  await Promise.all([
    initSettings(),
    initShortcuts(),
    initScratchpad()
  ]);
  
  // Setup Modal Triggers
  setupModalHandlers();
  
  // Load initial Weather
  loadWeather();

  // Setup Timer Event Listeners
  setupTimer();

  // Initialize Greeting & Persian Poem card
  initGreetingPoem();

  // Initialize Water Tracker card
  await initWaterTracker();

  // Initialize Checklist and Tabs
  await initChecklist();
  initTabs();
  
  // Initialize new Custom Jalali Datepicker for checklist
  initJalaliDatePicker();
  
  // Initialize new Planning Book (دفتر برنامه‌ریزی)
  await initPlanner();

  // Initialize Interactive Analytics with today's date
  if (typeof selectedCalYear !== "undefined") {
    updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
  }
});

// 1. Clock Section
function initClock() {
  const clockElement = document.getElementById("digital-clock");
  const dateElement = document.getElementById("persian-full-date");

  function updateTime() {
    const now = new Date();
    
    // Digital Clock HH:MM:SS
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    clockElement.innerText = toPersianDigits(`${hh}:${mm}:${ss}`);

    // Update Jalali date once per day or on clock tick (cheap)
    const jalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const gWeekday = now.getDay();
    const dayName = WEEKDAYS_FULL_FA[gWeekday];
    dateElement.innerText = formatPersianFullDate(jalali.jy, jalali.jm, jalali.jd, dayName);
  }

  // Initialize Battery Status Widget
  function initBattery() {
    const batteryPercent = document.getElementById("battery-percent-text");
    const batteryWidget = document.getElementById("battery-status-widget");
    if (!batteryPercent || !batteryWidget) return;
    
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        function updateBatteryInfo() {
          const level = Math.round(battery.level * 100);
          batteryPercent.innerText = toPersianDigits(`${level}%`);
          
          if (battery.charging) {
            batteryWidget.classList.add("charging");
            batteryWidget.title = "در حال شارژ...";
          } else {
            batteryWidget.classList.remove("charging");
            batteryWidget.title = "میزان شارژ باتری";
          }
        }
        
        updateBatteryInfo();
        battery.addEventListener("levelchange", updateBatteryInfo);
        battery.addEventListener("chargingchange", updateBatteryInfo);
      });
    } else {
      batteryWidget.style.display = "none";
    }
  }

  updateTime();
  initBattery();
  clockInterval = setInterval(updateTime, 1000);
}

// 2. Shortcuts Management
async function initShortcuts() {
  shortcuts = await db.get("user_shortcuts", DEFAULT_SHORTCUTS);
  renderShortcuts();

  // Add shortcut button click
  document.getElementById("btn-add-shortcut").addEventListener("click", (e) => {
    e.stopPropagation();
    activeFolderId = null;
    openModal("shortcut-modal");
    document.getElementById("shortcut-modal-title").innerText = "افزودن میانبر جدید";
    document.getElementById("shortcut-name-input").value = "";
    document.getElementById("shortcut-url-input").value = "";
    document.getElementById("shortcut-type-select").value = "link";
    document.getElementById("shortcut-type-select").disabled = false;
    toggleShortcutModalUrlField(false);
    editingShortcutId = null;
  });

  // Edit shortcuts toggle button
  const editBtn = document.getElementById("btn-edit-shortcuts");
  editBtn.addEventListener("click", () => {
    isEditMode = !isEditMode;
    editBtn.classList.toggle("active", isEditMode);
    document.getElementById("shortcuts-grid").classList.toggle("edit-active", isEditMode);
    const folderGrid = document.getElementById("folder-shortcuts-grid");
    if (folderGrid) {
      folderGrid.classList.toggle("edit-active", isEditMode);
    }
  });

  // Add shortcut to active folder button click
  document.getElementById("btn-folder-add-shortcut").addEventListener("click", () => {
    if (!activeFolderId) return;
    openModal("shortcut-modal");
    document.getElementById("shortcut-modal-title").innerText = "افزودن میانبر به پوشه";
    document.getElementById("shortcut-name-input").value = "";
    document.getElementById("shortcut-url-input").value = "";
    document.getElementById("shortcut-type-select").value = "link";
    document.getElementById("shortcut-type-select").disabled = true;
    toggleShortcutModalUrlField(false);
    editingShortcutId = null;
  });

  // Type selection in shortcut modal
  const typeSelect = document.getElementById("shortcut-type-select");
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      toggleShortcutModalUrlField(typeSelect.value === "folder");
    });
  }

  // URL autofill listener
  const urlInput = document.getElementById("shortcut-url-input");
  const nameInput = document.getElementById("shortcut-name-input");
  if (urlInput && nameInput) {
    urlInput.addEventListener("input", () => {
      const url = urlInput.value.trim();
      const type = typeSelect ? typeSelect.value : "link";
      if (!nameInput.value.trim() && url && type === "link") {
        try {
          let domain = url;
          if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
            domain = "https://" + domain;
          }
          let hostname = new URL(domain).hostname;
          hostname = hostname.replace("www.", "");
          const parts = hostname.split(".");
          if (parts.length > 0) {
            const name = parts[0];
            const translations = {
              'google': 'گوگل', 'youtube': 'یوتیوب', 'github': 'گیت‌هاب',
              'gmail': 'جیمیل', 'digikala': 'دیجی‌کالا', 'aparat': 'آپارات',
              'varzesh3': 'ورزش سه', 'wikipedia': 'ویکی‌پدیا', 'instagram': 'اینستاگرام',
              'telegram': 'تلگرام', 'divar': 'دیوار', 'snapp': 'اسنپ',
              'tapsi': 'تپسی', 'eitaa': 'ایتا', 'bale': 'بله'
            };
            if (translations[name.toLowerCase()]) {
              nameInput.value = translations[name.toLowerCase()];
            } else {
              nameInput.value = name.charAt(0).toUpperCase() + name.slice(1);
            }
          }
        } catch (e) {}
      }
    });
  }

  // Save shortcut modal submit
  document.getElementById("btn-save-shortcut").addEventListener("click", async () => {
    const type = typeSelect ? typeSelect.value : "link";
    const titleInput = nameInput.value.trim();
    let urlInput = document.getElementById("shortcut-url-input").value.trim();

    if (!titleInput) {
      alert("لطفاً نام را وارد کنید.");
      return;
    }
    if (type === "link" && !urlInput) {
      alert("لطفاً آدرس میانبر را وارد کنید.");
      return;
    }

    if (type === "link" && !urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
      urlInput = "https://" + urlInput;
    }

    if (editingShortcutId) {
      // Modify existing shortcut
      shortcuts = shortcuts.map(s => {
        if (s.id === editingShortcutId) {
          if (type === "folder") {
            return { ...s, title: titleInput, isFolder: true, url: "", icon: "", shortcuts: s.shortcuts || [] };
          } else {
            return { ...s, title: titleInput, url: urlInput, isFolder: false };
          }
        }
        return s;
      });
    } else {
      // Add new shortcut
      const newShortcut = {
        id: Date.now().toString(),
        title: titleInput,
        isFolder: type === "folder",
        shortcuts: type === "folder" ? [] : undefined,
        url: type === "folder" ? "" : urlInput
      };
      
      if (activeFolderId) {
        // Add inside folder
        shortcuts = shortcuts.map(s => {
          if (s.id === activeFolderId) {
            return { ...s, shortcuts: [...(s.shortcuts || []), newShortcut] };
          }
          return s;
        });
      } else {
        shortcuts.push(newShortcut);
      }
    }

    await db.set("user_shortcuts", shortcuts);
    renderShortcuts();
    if (activeFolderId) {
      const folder = shortcuts.find(s => s.id === activeFolderId);
      if (folder) renderFolderGrid(folder);
    }
    closeModal("shortcut-modal");
  });
}

function toggleShortcutModalUrlField(isFolder) {
  const urlGroup = document.getElementById("shortcut-url-group");
  const nameLabel = document.getElementById("shortcut-name-label");
  if (urlGroup && nameLabel) {
    if (isFolder) {
      urlGroup.classList.add("hidden");
      nameLabel.innerText = "نام پوشه";
    } else {
      urlGroup.classList.remove("hidden");
      nameLabel.innerText = "نام میانبر";
    }
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

function renderShortcuts() {
  const grid = document.getElementById("shortcuts-grid");
  const addBtn = document.getElementById("btn-add-shortcut");
  grid.innerHTML = "";
  
  shortcuts.forEach(shortcut => {
    const item = document.createElement("a");
    item.href = isEditMode ? "#" : (shortcut.isFolder ? "#" : shortcut.url);
    item.className = "shortcut-item";
    item.setAttribute("data-id", shortcut.id);
    if (!isEditMode && !shortcut.isFolder) {
      item.target = "_blank";
    }

    if (shortcut.isFolder) {
      item.innerHTML = `
        <div class="shortcut-icon-wrapper folder-wrapper">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="var(--accent-gold)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <span class="shortcut-title">${shortcut.title}</span>
        <div class="delete-badge" data-id="${shortcut.id}">&times;</div>
      `;
    } else {
      const domain = getDomain(shortcut.url);
      const letter = shortcut.title.charAt(0);
      const faviconUrl = shortcut.icon || `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

      if (!shortcut.icon && navigator.onLine) {
        cacheFavicon(shortcut.id, domain);
      }

      item.innerHTML = `
        <div class="shortcut-icon-wrapper">
          <img src="${faviconUrl}" alt="${shortcut.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <span class="shortcut-fallback-letter" style="display:none; justify-content:center; align-items:center; width:100%; height:100%; font-size:1.3rem; color:var(--accent-gold); font-weight:700;">${letter}</span>
        </div>
        <span class="shortcut-title">${shortcut.title}</span>
        <div class="delete-badge" data-id="${shortcut.id}">&times;</div>
      `;
    }

    // Handle delete badge click
    item.querySelector(".delete-badge").addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = e.target.getAttribute("data-id");
      shortcuts = shortcuts.filter(s => s.id !== id);
      await db.set("user_shortcuts", shortcuts);
      renderShortcuts();
    });

    // Handle edit/folder click
    item.addEventListener("click", (e) => {
      if (isEditMode) {
        e.preventDefault();
        openModal("shortcut-modal");
        document.getElementById("shortcut-modal-title").innerText = shortcut.isFolder ? "ویرایش پوشه" : "ویرایش میانبر";
        document.getElementById("shortcut-name-input").value = shortcut.title;
        document.getElementById("shortcut-url-input").value = shortcut.isFolder ? "" : shortcut.url;
        document.getElementById("shortcut-type-select").value = shortcut.isFolder ? "folder" : "link";
        document.getElementById("shortcut-type-select").disabled = false;
        toggleShortcutModalUrlField(shortcut.isFolder);
        editingShortcutId = shortcut.id;
      } else if (shortcut.isFolder) {
        e.preventDefault();
        openFolderModal(shortcut);
      }
    });

    grid.appendChild(item);
  });

  grid.appendChild(addBtn);
}

// 3. Notebook Explorer (Apple Notes style Notes Manager)
let notebookNotes = [];
let currentNoteId = null;

async function initScratchpad() {
  const notesList = document.getElementById("notebook-notes-list");
  const titleInput = document.getElementById("notebook-title-input");
  const textarea = document.getElementById("notebook-textarea");
  const saveBtn = document.getElementById("btn-notebook-save");
  const deleteBtn = document.getElementById("btn-notebook-delete");
  const newBtn = document.getElementById("btn-notebook-new");
  const saveIndicator = document.getElementById("notebook-save-indicator");
  const emptyState = document.getElementById("notebook-empty-state");
  
  // List/Back buttons for sliding panel layout
  const listBtn = document.getElementById("btn-notebook-list");
  const backBtn = document.getElementById("btn-notebook-back");
  const container = document.querySelector(".notebook-container");

  if (listBtn) {
    listBtn.addEventListener("click", () => {
      container.classList.add("show-sidebar");
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      container.classList.remove("show-sidebar");
    });
  }

  // Load notes from storage
  notebookNotes = await db.get("notebook_notes", []);
  
  // Migrate from old user_notes format if present and empty
  if (notebookNotes.length === 0) {
    const oldNotesObj = await db.get("user_notes", null);
    if (oldNotesObj && typeof oldNotesObj === 'object') {
      const oldKeys = ["general", "planning", "goals"];
      const tagLabels = { general: "روزمرگی", planning: "برنامه‌ریزی", goals: "لیست اهداف" };
      oldKeys.forEach((key, idx) => {
        if (oldNotesObj[key]) {
          notebookNotes.push({
            id: (Date.now() + idx).toString(),
            title: tagLabels[key],
            content: oldNotesObj[key],
            updatedAt: new Date().toLocaleDateString('fa-IR')
          });
        }
      });
    }
  }

  // If still empty, create a default note
  if (notebookNotes.length === 0) {
    notebookNotes.push({
      id: "default-1",
      title: "خوش آمدید",
      content: "به دفترچه یادداشت جدید خوش آمدید! شما می‌توانید یادداشت‌های متعددی بسازید، آن‌ها را ذخیره کرده و مدیریت کنید.",
      updatedAt: new Date().toLocaleDateString('fa-IR')
    });
  }

  // Set first note as active
  if (notebookNotes.length > 0) {
    currentNoteId = notebookNotes[0].id;
  }

  // Ensure metadata structure is present for backward compatibility
  notebookNotes = notebookNotes.map(note => {
    if (!note.createdAt) {
      note.createdAt = note.updatedAt || new Date().toLocaleDateString('fa-IR');
    }
    if (!note.updatedAt) {
      note.updatedAt = new Date().toLocaleDateString('fa-IR');
    }
    if (!note.history) {
      note.history = [];
    }
    return note;
  });

  // History button listener
  const historyBtn = document.getElementById("btn-notebook-history");
  if (historyBtn) {
    historyBtn.addEventListener("click", () => {
      if (!currentNoteId) return;
      const activeNote = notebookNotes.find(n => n.id === currentNoteId);
      if (activeNote) {
        showHistoryModal(activeNote);
      }
    });
  }

  function renderNotesList() {
    notesList.innerHTML = "";
    if (notebookNotes.length === 0) {
      currentNoteId = null;
      titleInput.value = "";
      textarea.value = "";
      emptyState.classList.remove("hidden");
      titleInput.disabled = true;
      textarea.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
      if (historyBtn) historyBtn.disabled = true;
      return;
    }

    emptyState.classList.add("hidden");
    titleInput.disabled = false;
    textarea.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
    if (historyBtn) historyBtn.disabled = false;

    notebookNotes.forEach(note => {
      const item = document.createElement("div");
      item.className = `notebook-note-item ${note.id === currentNoteId ? 'active' : ''}`;
      
      item.innerHTML = `
        <span class="notebook-note-item-title">${note.title || "بدون عنوان"}</span>
        <span class="notebook-note-item-date">ویرایش: ${note.updatedAt}</span>
      `;
      
      item.addEventListener("click", () => {
        if (currentNoteId) {
          saveCurrentNoteData();
        }
        currentNoteId = note.id;
        loadCurrentNote();
        renderNotesList();
        if (container) {
          container.classList.remove("show-sidebar");
        }
      });
      
      notesList.appendChild(item);
    });
  }

  function loadCurrentNote() {
    const activeNote = notebookNotes.find(n => n.id === currentNoteId);
    if (activeNote) {
      titleInput.value = activeNote.title || "";
      textarea.value = activeNote.content || "";
      
      // Update metadata labels in editor
      const metaCreated = document.getElementById("notebook-meta-created");
      const metaUpdated = document.getElementById("notebook-meta-updated");
      if (metaCreated) metaCreated.innerText = `ایجاد: ${activeNote.createdAt || activeNote.updatedAt}`;
      if (metaUpdated) metaUpdated.innerText = `ویرایش: ${activeNote.updatedAt}`;
    }
  }

  function saveCurrentNoteData() {
    const activeNote = notebookNotes.find(n => n.id === currentNoteId);
    if (activeNote) {
      const newContent = textarea.value;
      const newTitle = titleInput.value.trim() || "بدون عنوان";
      
      // Push content to history if changed and not empty
      if (activeNote.content !== newContent && newContent.trim() !== "") {
        if (!activeNote.history) activeNote.history = [];
        activeNote.history.unshift({
          content: activeNote.content || "",
          updatedAt: activeNote.updatedAt || new Date().toLocaleDateString('fa-IR')
        });
        if (activeNote.history.length > 10) {
          activeNote.history.pop();
        }
      }

      activeNote.title = newTitle;
      activeNote.content = newContent;
      activeNote.updatedAt = new Date().toLocaleDateString('fa-IR');
    }
  }

  async function saveNotesToStorage() {
    saveCurrentNoteData();
    await db.set("notebook_notes", notebookNotes);
    showSaveIndicator();
    renderNotesList();
  }

  function showSaveIndicator() {
    saveIndicator.innerText = "ذخیره شد";
    saveIndicator.classList.add("show");
    setTimeout(() => {
      saveIndicator.classList.remove("show");
    }, 1000);
  }

  // Save button click
  saveBtn.addEventListener("click", async () => {
    if (!currentNoteId) return;
    await saveNotesToStorage();
  });

  // Debounced auto-save on input
  let debounceTimeout;
  function triggerAutoSave() {
    saveIndicator.innerText = "در حال ذخیره...";
    saveIndicator.classList.add("show");
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      await saveNotesToStorage();
    }, 800);
  }

  textarea.addEventListener("input", triggerAutoSave);
  titleInput.addEventListener("input", triggerAutoSave);

  // New Note button click
  newBtn.addEventListener("click", async () => {
    if (currentNoteId) {
      saveCurrentNoteData();
    }
    
    const newNote = {
      id: Date.now().toString(),
      title: "یادداشت جدید",
      content: "",
      createdAt: new Date().toLocaleDateString('fa-IR'),
      updatedAt: new Date().toLocaleDateString('fa-IR'),
      history: []
    };
    
    notebookNotes.unshift(newNote);
    currentNoteId = newNote.id;
    await db.set("notebook_notes", notebookNotes);
    
    renderNotesList();
    loadCurrentNote();
    if (container) {
      container.classList.remove("show-sidebar");
    }
    titleInput.focus();
  });

  // Delete Note button click
  deleteBtn.addEventListener("click", async () => {
    if (!currentNoteId) return;
    if (confirm("آیا از حذف این یادداشت اطمینان دارید؟")) {
      notebookNotes = notebookNotes.filter(n => n.id !== currentNoteId);
      currentNoteId = notebookNotes.length > 0 ? notebookNotes[0].id : null;
      await db.set("notebook_notes", notebookNotes);
      
      renderNotesList();
      if (currentNoteId) {
        loadCurrentNote();
      }
    }
  });

  // Initial load
  renderNotesList();
  if (currentNoteId) {
    loadCurrentNote();
  }
}

// 4. Modal Handlers
function setupModalHandlers() {
  // Modal Overlays
  const overlays = document.querySelectorAll(".modal-overlay");

  overlays.forEach(overlay => {
    // Close modal on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
        overlay.classList.add("hidden");
      }
    });

    // Close on click outside of card
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
      }
    });

    // Close buttons inside modals
    const closeBtns = overlay.querySelectorAll(".close-modal-btn, .modal-cancel-btn");
    closeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        overlay.classList.add("hidden");
      });
    });
  });

  // Trigger: Settings button
  document.getElementById("btn-settings").addEventListener("click", () => {
    openModal("settings-modal");
  });

  // Trigger: Jalali Calendar date converter
  document.getElementById("btn-date-converter").addEventListener("click", () => {
    openModal("converter-modal");
  });

  // Trigger: Prayer Times (اوقات شرعی)
  document.getElementById("btn-prayer").addEventListener("click", async () => {
    openModal("prayer-modal");
    
    // Load coordinates from cache or default
    let lat = DEFAULT_LAT;
    let lon = DEFAULT_LON;
    
    const cache = await db.get("weather_cache", null);
    if (cache) {
      // Just estimate coords based on city
      const cityCoordinates = {
        'tehran': { lat: 35.6892, lon: 51.3890 }, 'تهران': { lat: 35.6892, lon: 51.3890 },
        'mashhad': { lat: 36.2972, lon: 59.6067 }, 'مشهد': { lat: 36.2972, lon: 59.6067 },
        'isfahan': { lat: 32.6546, lon: 51.6680 }, 'اصفهان': { lat: 32.6546, lon: 51.6680 },
        'tabriz': { lat: 38.0800, lon: 46.2919 }, 'تبریز': { lat: 38.0800, lon: 46.2919 },
        'shiraz': { lat: 29.5926, lon: 52.5836 }, 'شیراز': { lat: 29.5926, lon: 52.5836 },
        'karaj': { lat: 35.8081, lon: 50.9485 }, 'کرج': { lat: 35.8081, lon: 50.9485 },
        'qom': { lat: 34.6399, lon: 50.8759 }, 'قم': { lat: 34.6399, lon: 50.8759 },
        'ahvaz': { lat: 31.3183, lon: 48.6706 }, 'اهواز': { lat: 31.3183, lon: 48.6706 }
      };
      const cleanCity = (cache.city || 'تهران').trim().toLowerCase();
      if (cityCoordinates[cleanCity]) {
        lat = cityCoordinates[cleanCity].lat;
        lon = cityCoordinates[cleanCity].lon;
      }
    }
    
    fetchPrayerTimes(lat, lon);
  });

  // Trigger: Timer button
  document.getElementById("btn-timer").addEventListener("click", () => {
    openModal("timer-modal");
  });

  // Setup right sidebar panel slide-overs
  setupSidebarPanels();
}

function openModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

// 5. Settings Modal (Theme & City Settings)
// Helper to resolve auto theme based on time of day
function resolveThemeName(theme) {
  if (theme === "gradient-auto") {
    const hr = new Date().getHours();
    if (hr >= 6 && hr < 12) return "gradient-emerald";   // Morning
    if (hr >= 12 && hr < 17) return "gradient-blue";     // Afternoon
    if (hr >= 17 && hr < 21) return "gradient-sunset";   // Evening
    return "gradient-dark";                              // Night
  }
  return theme;
}

// 5. Settings Modal (Theme & City Settings)
async function initSettings() {
  // Theme Backgrounds
  const bgChoiceBtns = document.querySelectorAll(".bg-choice-btn");
  const currentTheme = await db.get("settings_theme", "gradient-blue");

  // Apply saved theme
  document.documentElement.setAttribute("data-theme", currentTheme);
  const resolvedTheme = resolveThemeName(currentTheme);
  document.documentElement.style.setProperty("--current-bg", `var(--bg-${resolvedTheme})`);
  document.body.style.background = `var(--bg-${resolvedTheme})`;
  
  bgChoiceBtns.forEach(btn => {
    const bgName = btn.getAttribute("data-bg");
    btn.classList.toggle("active", bgName === currentTheme);
    
    btn.addEventListener("click", () => {
      bgChoiceBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const themeVal = bgName;
      document.documentElement.setAttribute("data-theme", themeVal);
      const resTheme = resolveThemeName(themeVal);
      document.documentElement.style.setProperty("--current-bg", `var(--bg-${resTheme})`);
      document.body.style.background = `var(--bg-${resTheme})`;
      db.set("settings_theme", themeVal);
      
      window.playUIClickSound();
    });
  });

  // Sound Settings Checkbox
  const soundCheckbox = document.getElementById("settings-sound-checkbox");
  if (soundCheckbox) {
    const soundEnabled = await db.get("settings_sound_enabled", true);
    soundCheckbox.checked = soundEnabled;
  }

  // City Settings
  const cityInput = document.getElementById("settings-city-input");
  const savedCity = await db.get("settings_city", "تهران");
  cityInput.value = savedCity;

  document.getElementById("btn-save-settings").addEventListener("click", async () => {
    // Save Sound setting
    if (soundCheckbox) {
      await db.set("settings_sound_enabled", soundCheckbox.checked);
    }
    
    const newCity = cityInput.value.trim();
    if (newCity) {
      await db.set("settings_city", newCity);
      // Evict weather cache to force reload
      await db.set("weather_cache", null);
      loadWeather(newCity);
    }
    closeModal("settings-modal");
    
    window.playUISuccessSound();
  });
}

// 6. Prayer Times API Fetch
async function fetchPrayerTimes(lat, lon) {
  const ids = ["prayer-fajr", "prayer-sunrise", "prayer-dhuhr", "prayer-sunset", "prayer-maghrib", "prayer-midnight"];
  
  // Loading State
  ids.forEach(id => {
    document.getElementById(id).innerText = "...";
  });

  try {
    const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=7`; // Institute of Geophysics, University of Tehran
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const json = await res.json();
    const timings = json.data.timings;

    document.getElementById("prayer-fajr").innerText = toPersianDigits(timings.Fajr);
    document.getElementById("prayer-sunrise").innerText = toPersianDigits(timings.Sunrise);
    document.getElementById("prayer-dhuhr").innerText = toPersianDigits(timings.Dhuhr);
    document.getElementById("prayer-sunset").innerText = toPersianDigits(timings.Sunset);
    document.getElementById("prayer-maghrib").innerText = toPersianDigits(timings.Maghrib);
    document.getElementById("prayer-midnight").innerText = toPersianDigits(timings.Midnight);
  } catch (error) {
    // Hardcoded estimated fallback for Tehran
    document.getElementById("prayer-fajr").innerText = toPersianDigits("04:12");
    document.getElementById("prayer-sunrise").innerText = toPersianDigits("05:54");
    document.getElementById("prayer-dhuhr").innerText = toPersianDigits("13:04");
    document.getElementById("prayer-sunset").innerText = toPersianDigits("20:14");
    document.getElementById("prayer-maghrib").innerText = toPersianDigits("20:34");
    document.getElementById("prayer-midnight").innerText = toPersianDigits("00:13");
  }
}

// 7. Focus Timer (Pomodoro) Logic
function setupTimer() {
  const display = document.getElementById("timer-display-val");
  const startBtn = document.getElementById("btn-timer-start");
  const pauseBtn = document.getElementById("btn-timer-pause");
  const resetBtn = document.getElementById("btn-timer-reset");
  const presets = document.querySelectorAll(".timer-preset-btn");

  function updateDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    display.innerText = toPersianDigits(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
  }

  presets.forEach(btn => {
    btn.addEventListener("click", () => {
      presets.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      
      const mins = parseInt(btn.getAttribute("data-minutes"));
      timerSeconds = mins * 60;
      
      // Stop timer if running
      pauseTimer();
      updateDisplay();
    });
  });

  startBtn.addEventListener("click", () => {
    if (isTimerRunning) return;
    
    isTimerRunning = true;
    startBtn.classList.add("hidden");
    pauseBtn.classList.remove("hidden");
    
    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        updateDisplay();
      } else {
        // Timer complete
        clearInterval(timerInterval);
        isTimerRunning = false;
        
        // Show complete state
        display.innerText = toPersianDigits("۰۰:۰۰");
        startBtn.classList.remove("hidden");
        pauseBtn.classList.add("hidden");
        
        // Play audio alert / popup notification
        alert("زمان تمرکز شما به پایان رسید!");
        
        // Reset timer
        const activePreset = document.querySelector(".timer-preset-btn.active");
        timerSeconds = parseInt(activePreset.getAttribute("data-minutes")) * 60;
        updateDisplay();
      }
    }, 1000);
  });

  function pauseTimer() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    startBtn.classList.remove("hidden");
    pauseBtn.classList.add("hidden");
  }

  pauseBtn.addEventListener("click", pauseTimer);

  resetBtn.addEventListener("click", () => {
    pauseTimer();
    const activePreset = document.querySelector(".timer-preset-btn.active");
    timerSeconds = parseInt(activePreset.getAttribute("data-minutes")) * 60;
    updateDisplay();
  });

  updateDisplay();
}

// 8. Greeting & Poem Widget
const PERSIAN_POEMS = [
  { v1: "صبح است و ژاله می‌چکد از روی لاله سر به سر", v2: "گویا که مِهر رخ نمود از پرده‌ی شب جلوه‌گر", poet: "حافظ" },
  { v1: "دلا بسوز که سوز تو کارها بکند", v2: "نیاز نیم‌شبی دفع صد بلا بکند", poet: "حافظ" },
  { v1: "سعدیا مرد نکونام نمیرد هرگز", v2: "مرده آن است که نامش به نکویی نبرند", poet: "سعدی" },
  { v1: "بی همگان به سر شود، بی‌تو به سر نمی‌شود", v2: "داغ تو دارد این دل و جای دگر نمی‌شود", poet: "مولانا" },
  { v1: "دنیا همه هیچ و اهل دنیا همه هیچ", v2: "ای هیچ برای هیچ بر هیچ مپیچ", poet: "مولانا" },
  { v1: "تو کز محنت دیگران بی‌غمی", v2: "نشاید که نامت نهند آدمی", poet: "سعدی" },
  { v1: "روزها فکر من این است و همه شب سخنم", v2: "که چرا غافل از احوال دل خویشتنم", poet: "مولانا" },
  { v1: "هرگز نمیرد آن که دلش زنده شد به عشق", v2: "ثبت است بر جریده‌ی عالم دوام ما", poet: "حافظ" },
  { v1: "خوشا شیراز و وضع بی‌مثالش", v2: "خداوندا نگه دار از زوالش", poet: "حافظ" },
  { v1: "گر نگهدار من آن است که من می‌دانم", v2: "شیشه را در بغل سنگ نگه می‌دارد", poet: "سعدی" },
  { v1: "ای پادشه خوبان داد از غم تنهایی", v2: "دل بی تو به جان آمد وقت است که بازآیی", poet: "حافظ" },
  { v1: "رسید مژده که ایام غم نخواهد ماند", v2: "چنان نماند و چنین نیز هم نخواهد ماند", poet: "حافظ" }
];

function initGreetingPoem() {
  const greetingText = document.getElementById("greeting-text");
  const verse1 = document.getElementById("poem-verse-1");
  const verse2 = document.getElementById("poem-verse-2");
  const poet = document.getElementById("poem-poet");
  
  // Dynamic Greeting based on time of day
  const hour = new Date().getHours();
  let greeting = "سلام، وقت بخیر";
  if (hour >= 5 && hour < 12) {
    greeting = "سلام، صبح بخیر ☀️";
  } else if (hour >= 12 && hour < 17) {
    greeting = "سلام، ظهر بخیر 🌤️";
  } else if (hour >= 17 && hour < 20) {
    greeting = "سلام، عصر بخیر 🌅";
  } else {
    greeting = "سلام، شب بخیر 🌙";
  }
  greetingText.innerText = greeting;

  // Pick a random poem on each load
  const randomIndex = Math.floor(Math.random() * PERSIAN_POEMS.length);
  const poem = PERSIAN_POEMS[randomIndex];
  
  verse1.innerText = poem.v1;
  verse2.innerText = poem.v2;
  poet.innerText = `ـ ${poem.poet}`;
}

// 9. Water Tracker Widget
async function initWaterTracker() {
  const btnAdd = document.getElementById("btn-water-add");
  const btnReset = document.getElementById("btn-water-reset");
  
  let waterLogs = await db.get("water_tracker_logs", {});
  // Migrate old data if present
  const oldDate = await db.get("water_tracker_date", "");
  const oldCount = await db.get("water_tracker_count", 0);
  if (oldDate && oldCount && !waterLogs[oldDate]) {
    waterLogs[oldDate] = oldCount;
    await db.set("water_tracker_logs", waterLogs);
  }
  
  const todayStr = getTodayLocalDateStr();
  
  function updateWaterUI(count) {
    const goal = 8;
    const progressText = document.getElementById("water-progress-text");
    progressText.innerText = `${toPersianDigits(count)} / ${toPersianDigits(goal)} لیوان`;
    
    const circle = document.getElementById("water-progress-ring-circle");
    if (circle) {
      const circumference = 188.5; // 2 * pi * r (r=30)
      const percent = Math.min(count / goal, 1);
      const offset = circumference - (percent * circumference);
      circle.style.strokeDashoffset = offset;
    }

    const liquid = document.getElementById("water-liquid-level");
    if (liquid) {
      const fillPercent = Math.min((count / goal) * 100, 100);
      liquid.style.height = `${fillPercent}%`;
    }
  }
  
  updateWaterUI(waterLogs[todayStr] || 0);
  
  btnAdd.addEventListener("click", async () => {
    const current = waterLogs[todayStr] || 0;
    waterLogs[todayStr] = current + 1;
    await db.set("water_tracker_logs", waterLogs);
    updateWaterUI(waterLogs[todayStr]);
    
    // Play sounds
    if (waterLogs[todayStr] === 8) {
      window.playUISuccessSound();
      window.triggerConfetti();
    } else {
      window.playUIClickSound();
    }
    
    if (typeof updateInteractiveAnalytics === "function") {
      updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
    }
  });
  
  btnReset.addEventListener("click", async () => {
    if (confirm("آیا می‌خواهید تعداد لیوان‌های آب امروز را صفر کنید؟")) {
      waterLogs[todayStr] = 0;
      await db.set("water_tracker_logs", waterLogs);
      updateWaterUI(0);
      
      window.playUIClickSound();
      
      if (typeof updateInteractiveAnalytics === "function") {
        updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
      }
    }
  });
}

// 10. Favicon Caching Logic
async function cacheFavicon(shortcutId, domain) {
  try {
    const url = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64data = reader.result;
      
      // Save to database
      let currentShortcuts = await db.get("user_shortcuts", DEFAULT_SHORTCUTS);
      currentShortcuts = currentShortcuts.map(s => s.id === shortcutId ? { ...s, icon: base64data } : s);
      await db.set("user_shortcuts", currentShortcuts);
      
      // Update in-memory shortcuts array
      shortcuts = shortcuts.map(s => s.id === shortcutId ? { ...s, icon: base64data } : s);
      
      // Find the specific image in DOM and update its src to Base64 instantly
      const imgEl = document.querySelector(`.shortcut-item[data-id="${shortcutId}"] img`);
      if (imgEl) {
        imgEl.src = base64data;
      }
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    console.warn("Could not cache favicon for domain " + domain, e);
  }
}

// Web Audio API Synth Sounds
let audioCtx = null;
window.playUIClickSound = function() {
  db.get("settings_sound_enabled", true).then(enabled => {
    if (!enabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      console.warn("Click sound failed", e);
    }
  });
};

window.playUISuccessSound = function() {
  db.get("settings_sound_enabled", true).then(enabled => {
    if (!enabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.03, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc1.start(now);
      osc1.stop(now + 0.12);
      
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.08); // E5
      gain2.gain.setValueAtTime(0.03, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.22);
    } catch (e) {
      console.warn("Success sound failed", e);
    }
  });
};

window.triggerConfetti = function() {
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const colors = ["#ffb300", "#22a1f8", "#38ef7d", "#ff5e62", "#8b5cf6", "#fd79a8"];
  const particles = [];
  
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height - 20,
      r: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
      speed: Math.random() * 3 + 2
    });
  }
  
  let animationId;
  let frameCount = 0;
  
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    
    particles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += p.speed;
      p.x += Math.sin(p.tiltAngle) * 0.5;
      p.tilt = Math.sin(p.tiltAngle - frameCount / 5) * 6;
      
      if (p.y < canvas.height + 20) {
        active = true;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      }
    });
    
    frameCount++;
    if (active && frameCount < 200) {
      animationId = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(animationId);
      canvas.remove();
    }
  }
  
  draw();
  window.playUISuccessSound();
};

// 11. Floating Sidebar Panels Setup & Navigation scroll spy
function setupSidebarPanels() {
  const btnHome = document.getElementById("btn-home");
  const panelAi = document.getElementById("panel-ai");
  const panelApps = document.getElementById("panel-apps");
  const closeAi = document.getElementById("close-panel-ai");
  const closeApps = document.getElementById("close-panel-apps");

  const navScrollMap = [
    { btnId: "btn-home", selector: "body" },
    { btnId: "btn-nav-calendar", selector: ".clock-weather-card" },
    { btnId: "btn-nav-shortcuts", selector: ".shortcuts-card" },
    { btnId: "btn-nav-notes", selector: ".scratchpad-card" },
    { btnId: "btn-nav-water", selector: ".water-tracker-card" },
    { btnId: "btn-nav-tasks", selector: "#planner-section .planner-card:nth-child(1)" },
    { btnId: "btn-nav-habits", selector: ".planner-card.habits-card" },
    { btnId: "btn-nav-charts", selector: "#interactive-reports-card" }
  ];

  // Setup Sidebar Click Navigation
  navScrollMap.forEach(item => {
    const btn = document.getElementById(item.btnId);
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        
        // Remove active class from all navigation buttons
        document.querySelectorAll(".floating-sidebar .sidebar-btn").forEach(b => {
          if (b.id !== "btn-settings") b.classList.remove("active");
        });
        btn.classList.add("active");
        
        if (item.btnId === "btn-home") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          const target = document.querySelector(item.selector);
          if (target) {
            const rect = target.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const targetY = rect.top + scrollTop - 24; // clean offset
            window.scrollTo({ top: targetY, behavior: "smooth" });
          }
        }
        
        window.playUIClickSound();
      });
    }
  });

  // Scroll spy to highlight active button
  window.addEventListener("scroll", () => {
    let activeBtnId = "btn-home";
    let minDistance = Infinity;
    
    navScrollMap.forEach(item => {
      const target = document.querySelector(item.selector);
      if (target) {
        const rect = target.getBoundingClientRect();
        const dist = Math.abs(rect.top - 80); 
        if (dist < minDistance && rect.top < window.innerHeight * 0.6 && rect.bottom > 20) {
          minDistance = dist;
          activeBtnId = item.btnId;
        }
      }
    });

    if (window.scrollY < 100) {
      activeBtnId = "btn-home";
    }

    document.querySelectorAll(".floating-sidebar .sidebar-btn").forEach(btn => {
      if (btn.id === activeBtnId) {
        btn.classList.add("active");
      } else if (btn.id !== "btn-settings") {
        btn.classList.remove("active");
      }
    });
  });

  // Drawer panel close handlers fallback
  if (closeAi && panelAi) {
    closeAi.addEventListener("click", () => {
      panelAi.classList.remove("active");
      const btnAi = document.getElementById("btn-ai");
      if (btnAi) btnAi.classList.remove("active");
      if (btnHome) btnHome.classList.add("active");
    });
  }

  if (closeApps && panelApps) {
    closeApps.addEventListener("click", () => {
      panelApps.classList.remove("active");
      const btnApps = document.getElementById("btn-apps");
      if (btnApps) btnApps.classList.remove("active");
      if (btnHome) btnHome.classList.add("active");
    });
  }

  // AI Chat Interface logic
  const chatInput = document.getElementById("chat-input");
  const chatSendBtn = document.getElementById("btn-chat-send");
  const chatMessages = document.getElementById("chat-messages");
  const suggestBtns = document.querySelectorAll(".chat-suggest-btn");

  function addMessage(text, sender) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerText = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage(text) {
    if (!text.trim()) return;
    addMessage(text, "user");
    
    setTimeout(() => {
      const response = getAiResponse(text);
      addMessage(response, "ai");
    }, 450);
  }

  chatSendBtn.addEventListener("click", () => {
    const text = chatInput.value;
    chatInput.value = "";
    sendChatMessage(text);
  });

  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const text = chatInput.value;
      chatInput.value = "";
      sendChatMessage(text);
    }
  });

  suggestBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      sendChatMessage(prompt);
    });
  });

  // Apps Panel: Idea search and category tabs
  const ideaSearchInput = document.getElementById("idea-search-input");
  const ideaTabBtns = document.querySelectorAll(".idea-tab-btn");

  ideaSearchInput.addEventListener("input", () => {
    renderIdeas();
  });

  ideaTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      ideaTabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentIdeaCategory = btn.getAttribute("data-category");
      renderIdeas();
    });
  });
}

// 12. Local AI Chat responses
const AI_RESPONSES = {
  general: "من دستیار محلی شما هستم. می‌توانم به شما در ایده‌یابی، مدیریت کارها و بهبود راندمان کاریتان کمک کنم. پیشنهاد می‌کنم از بخش ایده‌ها در منوی برنامه‌ها نیز استفاده کنید!",
  poem: "بگذارید شعری الهام‌بخش برایتان بخوانم:\n«هرگز نمیرد آن که دلش زنده شد به عشق / ثبت است بر جریده‌ی عالم دوام ما»\nتلاش امروز شماست که فردایتان را می‌سازد!",
  planning: "برای داشتن روزی موفق، پیشنهاد می‌کنم روز خود را به بازه‌های تمرکز پومودورو (۲۵ دقیقه کار و ۵ دقیقه استراحت) تقسیم کنید. اهداف اصلی امروزتان را هم‌اکنون در دفترچه یادداشت سمت چپ ثبت کنید.",
  coding: "برنامه‌نویسی مسیر فوق‌العاده‌ای است. سعی کنید یکی از ۵۰ ایده برنامه‌نویسی پنل برنامه‌ها را انتخاب کرده و امروز یک پروژه کوچک از آن بسازید!",
  thanks: "خواهش می‌کنم! من همیشه اینجا هستم تا به شما کمک کنم. موفق باشید! ✨",
  hello: "سلام! روز خوبی داشته باشید. چطور می‌توانم در کارهای امروزتان کمکتان کنم؟"
};

function getAiResponse(message) {
  const msg = message.toLowerCase().trim();
  if (msg.includes("شعر") || msg.includes("انگیزشی") || msg.includes("حافظ") || msg.includes("سخن")) {
    return AI_RESPONSES.poem;
  }
  if (msg.includes("برنامه") || msg.includes("کارها") || msg.includes("تسک") || msg.includes("برنامه‌ریزی")) {
    return AI_RESPONSES.planning;
  }
  if (msg.includes("کد") || msg.includes("برنامه‌نویسی") || msg.includes("وب") || msg.includes("پروژه")) {
    return AI_RESPONSES.coding;
  }
  if (msg.includes("ممنون") || msg.includes("تشکر") || msg.includes("سپاس") || msg.includes("مرسی")) {
    return AI_RESPONSES.thanks;
  }
  if (msg.includes("سلام") || msg.includes("درود")) {
    return AI_RESPONSES.hello;
  }
  return `درخواست شما را شنیدم: "${message}". به‌عنوان دستیار محلی شما، پیشنهاد می‌کنم برای ایده‌های نوآورانه حتماً بخش برنامه‌ها را چک کنید و اهداف روزانه خود را در دفترچه یادداشت ثبت نمایید تا متمرکز بمانید!`;
}

// 13. Ideas Bank Database (50 Curated Ideas)
const IDEAS_BANK = [
  // Startup
  { id: 1, category: "startup", catLabel: "استارتاپ", title: "پلتفرم تبادل کتاب محلی", desc: "وب‌سایت تعاملی برای امانت و تبادل کتاب‌های دست دوم بین همسایگان." },
  { id: 2, category: "startup", catLabel: "استارتاپ", title: "دستیار هوشمند هدیه", desc: "ابزار پیشنهاد هدیه بر اساس روحیات، سن و علاقه‌مندی‌های گیرنده." },
  { id: 3, category: "startup", catLabel: "استارتاپ", title: "برنامه‌ریز غذایی هفتگی ارزان", desc: "برنامه‌ریزی وعده‌های غذایی سالم با کمترین هزینه خرید مواد اولیه." },
  { id: 4, category: "startup", catLabel: "استارتاپ", title: "ردیاب داروی صوتی سالمندان", desc: "اپلیکیشن ساده با یادآورهای صوتی فارسی برای زمان مصرف داروی سالمندان." },
  { id: 5, category: "startup", catLabel: "استارتاپ", title: "اشتراک‌گذاری ابزار همسایگی", desc: "پلتفرم امانت دادن ابزارهای فنی خانه (دریل، نردبان و...) به همسایگان." },
  { id: 6, category: "startup", catLabel: "استارتاپ", title: "مشاوره سریع دکوراسیون", desc: "چت فوری با طراحان داخلی برای راهنمایی چیدمان اقتصادی اتاق‌ها." },
  { id: 7, category: "startup", catLabel: "استارتاپ", title: "رزومه‌ساز فریلنسرها", desc: "پورتفولیوساز تعاملی و پویا مخصوص طراحان و توسعه‌دهندگان مستقل." },
  { id: 8, category: "startup", catLabel: "استارتاپ", title: "خدمات نگهداری گیاهان آپارتمانی", desc: "اپلیکیشن درخواست نگهداری و آبیاری گل‌ها در زمان سفرهای طولانی." },
  { id: 9, category: "startup", catLabel: "استارتاپ", title: "خرید مستقیم از کشاورز بومی", desc: "پلتفرم سفارش بدون واسطه میوه و برنج مستقیماً از باغداران و مزارع بومی." },
  { id: 10, category: "startup", catLabel: "استارتاپ", title: "مدیریت مخارج هم‌خانه‌ها", desc: "سیستم اشتراک دنگ‌سفر و هزینه‌های مشترک خانه به زبان فارسی." },
  { id: 11, category: "startup", catLabel: "استارتاپ", title: "مسیرهای پیاده‌گردی تاریخی", desc: "راهنمای صوتی و نقشه مسیرهای گردشگری پیاده در بافت‌های قدیمی شهرهای ایران." },
  { id: 12, category: "startup", catLabel: "استارتاپ", title: "آموزش‌های ۱۰ دقیقه‌ای فنی", desc: "پلتفرم آموزش ویدئویی کارهای فنی ساده منزل (شیر آب، تعویض لامپ و...)." },
  { id: 13, category: "startup", catLabel: "استارتاپ", title: "نظارت هوشمند بر گلخانه", desc: "کیت ساده نرم‌افزاری گزارش دما و رطوبت گیاهان با هشدارهای پیامکی." },
  { id: 14, category: "startup", catLabel: "استارتاپ", title: "نوبت‌دهی آنلاین محلی", desc: "سیستم رزرواسیون وقت آرایشگاه‌ها و دندان‌پزشکی‌های محله." },
  { id: 15, category: "startup", catLabel: "استارتاپ", title: "تیم‌سازی فریلنسری", desc: "پلتفرم پیدا کردن هم‌تیمی برای انجام کارهای پروژه‌ای مشترک بزرگ." },

  // Coding
  { id: 16, category: "coding", catLabel: "کدنویسی", title: "شبیه‌ساز مالی شخصی جوانان", desc: "ابزار وب ساده برای شبیه‌سازی پس‌انداز و سرمایه‌گذاری برای نوجوانان." },
  { id: 17, category: "coding", catLabel: "کدنویسی", title: "مترجم کدهای SQL به فارسی", desc: "تبدیل کوئری‌های پیچیده پایگاه داده به زبان فارسی ساده و روان." },
  { id: 18, category: "coding", catLabel: "کدنویسی", title: "افزونه کدهای تخفیف خودکار", desc: "پلاگین مرورگر برای جمع‌آوری و اعمال خودکار کدهای تخفیف فروشگاه‌های ایرانی." },
  { id: 19, category: "coding", catLabel: "کدنویسی", title: "رزومه‌ساز انیمیشنی تک‌صفحه‌ای", desc: "ابزار ایجاد پورتفولیوهای دو بعدی و متحرک سبک." },
  { id: 20, category: "coding", catLabel: "کدنویسی", title: "بات مدیریت تسک صوتی", desc: "بات تلگرام که با ویس‌های فارسی کارهای شما را ثبت و یادآوری می‌کند." },
  { id: 21, category: "coding", catLabel: "کدنویسی", title: "پروژه‌ساز خودکار CSS Grid", desc: "ابزار طراحی زنده گریدها و استخراج کدهای بهینه CSS." },
  { id: 22, category: "coding", catLabel: "کدنویسی", title: "شبیه‌ساز مصاحبه فنی", desc: "شبیه‌ساز تعاملی چت برای آمادگی مصاحبه‌های استخدامی برنامه‌نویسی." },
  { id: 23, category: "coding", catLabel: "کدنویسی", title: "مبدل صوت جلسات به متن", desc: "ابزار تبدیل ویس جلسات کاری به متن‌های فارسی دسته‌بندی‌شده." },
  { id: 24, category: "coding", catLabel: "کدنویسی", title: "فیلتر اخبار شبکه‌های اجتماعی", desc: "افزونه مرورگر جهت مسدودسازی کلمات کلیدی اخبار منفی و ترندهای آزاردهنده." },
  { id: 25, category: "coding", catLabel: "کدنویسی", title: "ردیاب گارانتی کالاها", desc: "وب‌اپلیکیشن ساده اسکن فاکتور و ثبت تاریخ انقضای گارانتی وسایل خانه." },
  { id: 26, category: "coding", catLabel: "کدنویسی", title: "مدیریت هوشمند تب‌های مرورگر", desc: "ابزاری برای فشرده‌سازی و دسته‌بندی تب‌های مرورگر جهت کاهش مصرف رم." },
  { id: 27, category: "coding", catLabel: "کدنویسی", title: "داشبورد سلامت سرور", desc: "سیستم مانیتورینگ آپ‌تایم وب‌سایت‌ها با هشدارهای آنی تلگرام." },
  { id: 28, category: "coding", catLabel: "کدنویسی", title: "پورتفولیوی عکاسان", desc: "گالری‌ساز تک‌صفحه‌ای با افکت‌های زیبای لایت‌باکس و بارگذاری تنبل تصاویر." },
  { id: 29, category: "coding", catLabel: "کدنویسی", title: "سنجش خوانایی متن فارسی", desc: "ابزاری برای تحلیل میزان دشواری و روانی متن‌های فارسی." },
  { id: 30, category: "coding", catLabel: "کدنویسی", title: "جعبه لایتنر اشتراکی", desc: "پلتفرم یادگیری لغات زبان با فلش‌کارت‌های مشترک دوستانه." },

  // Self Improvement
  { id: 31, category: "self", catLabel: "توسعه فردی", title: "چالش ۲۱ روزه ترک عادت", desc: "برنامه ردیابی و ترک عادات ناپسند روزانه با جوایز انگیزشی مجازی." },
  { id: 32, category: "self", catLabel: "توسعه فردی", title: "چالش سحرخیزی ۵ صبح", desc: "برنامه تعاملی بیدار شدن زودهنگام با سیستم پارتنر و اعلام حضور روزانه." },
  { id: 33, category: "self", catLabel: "توسعه فردی", title: "ژورنال صوتی احساسات", desc: "ثبت صوتی خاطرات روزانه همراه با تحلیل حس‌وحال شما." },
  { id: 34, category: "self", catLabel: "توسعه فردی", title: "ردیاب زمان مفید مطالعه", desc: "کرنومتر اختصاصی مطالعه کتاب با نمودارهای آماری پیشرفت هفتگی." },
  { id: 35, category: "self", catLabel: "توسعه فردی", title: "برنامه تمرینات کششی اداری", desc: "حرکات ساده ورزشی ۵ دقیقه‌ای مناسب برای پشت‌میزنشین‌ها و برنامه‌نویسان." },
  { id: 36, category: "self", catLabel: "توسعه فردی", title: "یادآور آب و کشش پشت میز", desc: "افزونه یادآوری نوشیدن آب و اصلاح وضعیت نشستن هر ۴۵ دقیقه یکبار." },
  { id: 37, category: "self", catLabel: "توسعه فردی", title: "سم‌زدایی دیجیتال", desc: "چالش‌های دوره‌ای قطع استفاده از گوشی و شبکه‌های اجتماعی برای بهبود تمرکز." },
  { id: 38, category: "self", catLabel: "توسعه فردی", title: "شکرگزاری روزانه ناشناس", desc: "ثبت سپاسگزاری‌های روزانه و اشتراک گذاری کاملاً ناشناس با دیگران." },
  { id: 39, category: "self", catLabel: "توسعه فردی", title: "پومودوروی لوفای پیشرفته", desc: "تایمر تمرکز پومودورو متصل به رادیوهای موسیقی Lo-Fi و آرامش‌بخش." },
  { id: 40, category: "self", catLabel: "توسعه فردی", title: "سنجش راندمان کار روزانه", desc: "محاسبه درصد بازدهی شخصی بر اساس وظایف انجام‌شده در مقایسه با تسک‌های معوقه." },

  // Creative
  { id: 41, category: "creative", catLabel: "خلاقیت", title: "چالش ۵۰۰ کلمه آزاد", desc: "چالش روزانه نوشتن بدون توقف برای تقویت مهارت نویسندگی خلاق." },
  { id: 42, category: "creative", catLabel: "خلاقیت", title: "میکس صدای طبیعت", desc: "ابزار وب برای ترکیب صداهای باران، موج، جنگل و آتش جهت تمرکز و خواب راحت." },
  { id: 43, category: "creative", catLabel: "خلاقیت", title: "مارپیچ‌ساز فکری کودکان", desc: "تولید هوشمند طرح‌های پازل و مارپیچ قابل چاپ برای سرگرمی کودکان." },
  { id: 44, category: "creative", catLabel: "خلاقیت", title: "پالت مینیاتور ایرانی", desc: "استخراج پالت‌های رنگی خیره‌کننده بر اساس نگارگری‌ها و مینیاتورهای اصیل ایرانی." },
  { id: 45, category: "creative", catLabel: "خلاقیت", title: "چالش روزانه عکاسی خانگی", desc: "ارائه سوژه‌های خلاقانه روزانه برای عکاسی با گوشی در محیط خانه." },
  { id: 46, category: "creative", catLabel: "خلاقیت", title: "اوریگامی سه بعدی متحرک", desc: "راهنماهای گام‌به‌گام و انیمیشنی ساخت کاردستی با کاغذ." },
  { id: 47, category: "creative", catLabel: "خلاقیت", title: "تایم‌لپس پیشرفت هنری", desc: "ابزار آپلود عکس‌های دوره‌ای پروژه‌های نقاشی/صنایع‌دستی برای خروجی ویدئویی تایم‌لپس." },
  { id: 48, category: "creative", catLabel: "خلاقیت", title: "بازی تئوری موسیقی", desc: "بازی ساده جهت یادگیری نت‌ها، کلیدها و گام‌های موسیقی سنتی و کلاسیک." },
  { id: 49, category: "creative", catLabel: "خلاقیت", title: "ترکیب فونت‌های فارسی", desc: "ابزار وب برای پیشنهاد زوج‌فونت‌های فارسی همخوانی‌دار برای طراحان گرافیک." },
  { id: 50, category: "creative", catLabel: "خلاقیت", title: "ماندالاساز آرامش‌بخش", desc: "ابزار وب برای کشیدن قرینه طرح‌های ماندالا جهت آرامش ذهن و کاهش استرس." }
];

// 14. Apps Panel: Render Ideas list
let currentIdeaCategory = "all";

function renderIdeas() {
  const container = document.getElementById("ideas-list-container");
  const searchInput = document.getElementById("idea-search-input");
  const query = searchInput.value.toLowerCase().trim();
  
  container.innerHTML = "";
  
  const filtered = IDEAS_BANK.filter(idea => {
    const matchesCategory = (currentIdeaCategory === "all" || idea.category === currentIdeaCategory);
    const matchesQuery = (idea.title.toLowerCase().includes(query) || idea.desc.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="idea-card"><p style="font-size: 0.82rem; color: var(--text-muted); text-align: center;">ایده‌ای یافت نشد.</p></div>`;
    return;
  }
  
  filtered.forEach(idea => {
    const card = document.createElement("div");
    card.className = "idea-card";
    
    card.innerHTML = `
      <div class="idea-card-header">
        <span class="idea-card-title">${idea.title}</span>
        <span class="idea-card-category">${idea.catLabel}</span>
      </div>
      <p class="idea-card-desc">${idea.desc}</p>
      <button class="idea-copy-btn" data-id="${idea.id}">
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        <span>انتقال به یادداشت</span>
      </button>
    `;
    
    card.querySelector(".idea-copy-btn").addEventListener("click", async () => {
      if (!currentNoteId) {
        alert("لطفاً ابتدا یک یادداشت در دفترچه بسازید یا باز کنید.");
        return;
      }
      
      const activeNote = notebookNotes.find(n => n.id === currentNoteId);
      if (activeNote) {
        const ideaText = `\n\n[ایده: ${idea.title}]\n${idea.desc}\n`;
        activeNote.content = (activeNote.content || "") + ideaText;
        
        // Save
        await db.set("notebook_notes", notebookNotes);
        
        // Update Notepad UI elements
        const textarea = document.getElementById("notebook-textarea");
        if (textarea) {
          textarea.value = activeNote.content;
        }
        
        const saveIndicator = document.getElementById("notebook-save-indicator");
        if (saveIndicator) {
          saveIndicator.innerText = "کپی شد!";
          saveIndicator.classList.add("show");
          setTimeout(() => saveIndicator.classList.remove("show"), 1500);
        }
        
        // Refresh notes list title/date
        activeNote.updatedAt = new Date().toLocaleDateString('fa-IR');
        const saveBtn = document.getElementById("btn-notebook-save");
        if (saveBtn) {
          saveBtn.click();
        }
        
        alert(`ایده «${idea.title}» با موفقیت به انتهای یادداشت باز اضافه شد.`);
      }
    });
    
    container.appendChild(card);
  });
}

// 15. Note Change History Modal & Restore logic
function showHistoryModal(note) {
  const modal = document.getElementById("history-modal");
  const list = document.getElementById("history-versions-list");
  list.innerHTML = "";

  const history = note.history || [];
  if (history.length === 0) {
    list.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 20px 0;">هیچ تاریخچه تغییری برای این یادداشت ثبت نشده است.</div>`;
  } else {
    history.forEach((version, index) => {
      const row = document.createElement("div");
      row.className = "history-version-item";
      const sizeStr = `${toPersianDigits(version.content.length)} کاراکتر`;
      
      row.innerHTML = `
        <div class="history-version-info">
          <span class="history-version-time">${version.updatedAt}</span>
          <span class="history-version-size">${sizeStr}</span>
        </div>
        <div class="history-version-actions">
          <button class="history-version-btn preview-btn" data-idx="${index}">پیش‌نمایش</button>
          <button class="history-version-btn restore-btn" data-idx="${index}">بازیابی</button>
        </div>
      `;

      row.querySelector(".preview-btn").addEventListener("click", () => {
        alert(`پیش‌نمایش محتوا:\n\n${version.content}`);
      });

      row.querySelector(".restore-btn").addEventListener("click", async () => {
        if (confirm("آیا مایلید این یادداشت را به این نسخه بازیابی کنید؟")) {
          const currentContent = document.getElementById("notebook-textarea").value;
          const currentUpdatedAt = note.updatedAt;
          
          note.history.unshift({
            content: currentContent,
            updatedAt: currentUpdatedAt
          });
          if (note.history.length > 10) note.history.pop();

          note.content = version.content;
          note.updatedAt = new Date().toLocaleDateString('fa-IR');
          
          await db.set("notebook_notes", notebookNotes);
          
          document.getElementById("notebook-textarea").value = note.content;
          const metaUpdated = document.getElementById("notebook-meta-updated");
          if (metaUpdated) metaUpdated.innerText = `ویرایش: ${note.updatedAt}`;
          
          const notesList = document.getElementById("notebook-notes-list");
          notesList.innerHTML = ""; // Force list to render
          
          const saveBtn = document.getElementById("btn-notebook-save");
          if (saveBtn) saveBtn.click();
          
          closeModal("history-modal");
          alert("یادداشت با موفقیت بازیابی شد.");
        }
      });

      list.appendChild(row);
    });
  }

  openModal("history-modal");
}

// 16. Shortcuts Folder Modal Logic
let currentOpenFolder = null;

function openFolderModal(folder) {
  currentOpenFolder = folder;
  activeFolderId = folder.id;
  document.getElementById("folder-shortcuts-modal-title").innerText = folder.title;
  renderFolderGrid(folder);
  openModal("folder-shortcuts-modal");
}

function renderFolderGrid(folder) {
  const grid = document.getElementById("folder-shortcuts-grid");
  grid.innerHTML = "";
  
  const childShortcuts = folder.shortcuts || [];
  if (childShortcuts.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 20px 0;">پوشه خالی است. با استفاده از دکمه زیر میانبر اضافه کنید.</div>`;
  } else {
    childShortcuts.forEach(child => {
      const item = document.createElement("a");
      item.href = isEditMode ? "#" : child.url;
      item.className = "shortcut-item";
      item.setAttribute("data-id", child.id);
      if (!isEditMode) {
        item.target = "_blank";
      }
      
      const domain = getDomain(child.url);
      const letter = child.title.charAt(0);
      const faviconUrl = child.icon || `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
      
      item.innerHTML = `
        <div class="shortcut-icon-wrapper">
          <img src="${faviconUrl}" alt="${child.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <span class="shortcut-fallback-letter" style="display:none; justify-content:center; align-items:center; width:100%; height:100%; font-size:1.3rem; color:var(--accent-gold); font-weight:700;">${letter}</span>
        </div>
        <span class="shortcut-title">${child.title}</span>
        <div class="delete-badge" data-id="${child.id}">&times;</div>
      `;
      
      item.querySelector(".delete-badge").addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = e.target.getAttribute("data-id");
        
        shortcuts = shortcuts.map(s => {
          if (s.id === folder.id) {
            return { ...s, shortcuts: (s.shortcuts || []).filter(c => c.id !== id) };
          }
          return s;
        });
        
        await db.set("user_shortcuts", shortcuts);
        renderShortcuts();
        const updated = shortcuts.find(s => s.id === folder.id);
        if (updated) renderFolderGrid(updated);
      });
      
      grid.appendChild(item);
    });
  }
}

// 17. Checklist Tab Functions
let checklistItems = [];
async function initChecklist() {
  const listElement = document.getElementById("checklist-items-list");
  const inputElement = document.getElementById("checklist-input");
  const dueDateElement = document.getElementById("checklist-due-date");
  const addBtn = document.getElementById("btn-checklist-add");

  checklistItems = await db.get("user_checklist", []);

  function renderChecklist() {
    listElement.innerHTML = "";
    if (checklistItems.length === 0 && plannerHabits.length === 0) {
      listElement.innerHTML = `<div style="text-align: center; font-size: 0.82rem; color: var(--text-muted); padding: 40px 0;">هیچ کاری در چک‌لیست ثبت نشده است.</div>`;
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tKey = getTodayLocalDateStr();

    // Render normal checklist items
    checklistItems.forEach(item => {
      const row = document.createElement("div");
      row.className = `checklist-item ${item.completed ? 'completed' : ''}`;

      let overdueMarkup = "";
      if (item.dueDate && !item.completed) {
        const due = new Date(item.dueDate);
        if (today > due) {
          overdueMarkup = `<span class="checklist-item-date-due overdue">منقضی شده! (مهلت: ${toPersianDateString(due)})</span>`;
        } else {
          overdueMarkup = `<span class="checklist-item-date-due">مهلت: ${toPersianDateString(due)}</span>`;
        }
      } else if (item.dueDate) {
        overdueMarkup = `<span class="checklist-item-date-due">مهلت: ${toPersianDateString(new Date(item.dueDate))}</span>`;
      }

      row.innerHTML = `
        <input type="checkbox" class="checklist-item-checkbox" ${item.completed ? 'checked' : ''}>
        <div class="checklist-item-content">
          <span class="checklist-item-text">${item.text}</span>
          <div class="checklist-item-dates">
            <span class="checklist-item-date-created">ایجاد: ${item.createdAt}</span>
            ${overdueMarkup}
          </div>
        </div>
        <button class="checklist-item-delete" title="حذف تسک">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      row.querySelector(".checklist-item-checkbox").addEventListener("change", async (e) => {
        item.completed = e.target.checked;
        item.completedAt = e.target.checked ? getTodayLocalDateStr() : null;
        await db.set("user_checklist", checklistItems);
        renderChecklist();
        if (typeof updateInteractiveAnalytics === "function") {
          updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
        }
        
        // Play sounds and confetti
        if (item.completed) {
          window.playUISuccessSound();
          const allCompleted = checklistItems.every(c => c.completed);
          if (allCompleted && checklistItems.length > 0) {
            window.triggerConfetti();
          }
        } else {
          window.playUIClickSound();
        }
      });

      row.querySelector(".checklist-item-delete").addEventListener("click", async () => {
        checklistItems = checklistItems.filter(c => c.id !== item.id);
        await db.set("user_checklist", checklistItems);
        renderChecklist();
        if (typeof updateInteractiveAnalytics === "function") {
          updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
        }
      });

      listElement.appendChild(row);
    });

    // Mix in active habits for today
    plannerHabits.forEach(habit => {
      const isCompletedToday = plannerHabitLogs[habit.id] && plannerHabitLogs[habit.id][tKey];
      const row = document.createElement("div");
      row.className = `checklist-item habit-task-item ${isCompletedToday ? 'completed' : ''}`;

      const cat = plannerCategories.find(c => c.id === habit.category) || { emoji: "🔄", name: "عادت" };

      row.innerHTML = `
        <input type="checkbox" class="checklist-item-checkbox" ${isCompletedToday ? 'checked' : ''}>
        <div class="checklist-item-content">
          <span class="checklist-item-text">[عادت] ${habit.name}</span>
          <div class="checklist-item-dates">
            <span class="category-tag habit-badge">${cat.name} ${cat.emoji}</span>
          </div>
        </div>
      `;

      row.querySelector(".checklist-item-checkbox").addEventListener("change", async (e) => {
        await toggleHabitComplete(habit.id, tKey, e.target.checked);
      });

      listElement.appendChild(row);
    });
  }

  // Expose renderChecklist globally
  window.renderChecklist = renderChecklist;

  function toPersianDateString(dateObj) {
    const j = gregorianToJalali(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
    return `${toPersianDigits(j.jy)}/${toPersianDigits(j.jm)}/${toPersianDigits(j.jd)}`;
  }

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const text = inputElement.value.trim();
      const dueDate = dueDateElement.value;

      if (!text) {
        alert("لطفاً متن کار را وارد کنید.");
        return;
      }

      const now = new Date();
      const jToday = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const createdAtStr = `${toPersianDigits(jToday.jy)}/${toPersianDigits(jToday.jm)}/${toPersianDigits(jToday.jd)}`;

      const newItem = {
        id: Date.now().toString(),
        text: text,
        completed: false,
        createdAt: createdAtStr,
        dueDate: dueDate || null
      };

      checklistItems.unshift(newItem);
      await db.set("user_checklist", checklistItems);
      inputElement.value = "";
      dueDateElement.value = "";
      const labelEl = document.getElementById("checklist-due-label");
      if (labelEl) labelEl.innerText = "بدون مهلت";
      renderChecklist();
      if (typeof updateInteractiveAnalytics === "function") {
        updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
      }
    });
  }

  renderChecklist();
}

// 18. Tab Switcher
function initTabs() {
  const tabNotes = document.getElementById("tab-btn-notes");
  const tabChecklist = document.getElementById("tab-btn-checklist");
  const notebookContainer = document.querySelector(".notebook-container");
  const checklistContainer = document.querySelector(".checklist-container");

  if (tabNotes && tabChecklist) {
    tabNotes.addEventListener("click", () => {
      tabNotes.classList.add("active");
      tabChecklist.classList.remove("active");
      notebookContainer.classList.remove("hidden");
      checklistContainer.classList.add("hidden");
    });

    tabChecklist.addEventListener("click", () => {
      tabChecklist.classList.add("active");
      tabNotes.classList.remove("active");
      checklistContainer.classList.remove("hidden");
      notebookContainer.classList.add("hidden");
    });
  }
}

// ==========================================================================
// Custom Jalali Datepicker Dropdown Logic
// ==========================================================================
function initJalaliDatePicker() {
  const triggerBtn = document.getElementById("checklist-due-btn");
  const modal = document.getElementById("checklist-datepicker-modal");
  const hiddenInput = document.getElementById("checklist-due-date");
  const label = document.getElementById("checklist-due-label");
  
  const monthYearLabel = document.getElementById("dp-month-year");
  const prevBtn = document.getElementById("dp-prev-month");
  const nextBtn = document.getElementById("dp-next-month");
  const daysGrid = document.getElementById("datepicker-days-grid");
  const todayBtn = document.getElementById("dp-btn-today");
  const clearBtn = document.getElementById("dp-btn-clear");

  if (!triggerBtn || !modal) return;

  const now = new Date();
  const todayJ = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  
  let dpYear = todayJ.jy;
  let dpMonth = todayJ.jm;
  let selectedDateStr = ""; // YYYY-MM-DD

  // Open Modal
  triggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    modal.classList.remove("hidden");
    renderDatePicker();
  });

  // Close modal via X button
  modal.querySelector(".close-modal-btn").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  // Close modal via overlay click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dpMonth--;
    if (dpMonth < 1) {
      dpMonth = 12;
      dpYear--;
    }
    renderDatePicker();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dpMonth++;
    if (dpMonth > 12) {
      dpMonth = 1;
      dpYear++;
    }
    renderDatePicker();
  });

  todayBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const t = new Date();
    const yStr = t.getFullYear();
    const mStr = String(t.getMonth() + 1).padStart(2, '0');
    const dStr = String(t.getDate()).padStart(2, '0');
    selectedDateStr = `${yStr}-${mStr}-${dStr}`;
    
    hiddenInput.value = selectedDateStr;
    const tj = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    label.innerText = `${toPersianDigits(tj.jd)} ${JALALI_MONTHS[tj.jm - 1]} ${toPersianDigits(tj.jy)}`;
    modal.classList.add("hidden");
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectedDateStr = "";
    hiddenInput.value = "";
    label.innerText = "بدون مهلت";
    modal.classList.add("hidden");
  });

  function renderDatePicker() {
    monthYearLabel.innerText = `${JALALI_MONTHS[dpMonth - 1]} ${toPersianDigits(dpYear)}`;
    daysGrid.innerHTML = "";

    const firstDayGreg = jalaliToGregorian(dpYear, dpMonth, 1);
    const firstDayDateObj = new Date(firstDayGreg.gy, firstDayGreg.gm - 1, firstDayGreg.gd);
    const gWeekday = firstDayDateObj.getDay();
    const offset = (gWeekday + 1) % 7; // Saturday = 0

    // Fill offset slots
    for (let i = 0; i < offset; i++) {
      const cell = document.createElement("div");
      cell.className = "dp-day empty";
      daysGrid.appendChild(cell);
    }

    const monthLength = getJalaliMonthLength(dpYear, dpMonth);

    let selJ = null;
    if (selectedDateStr) {
      const parts = selectedDateStr.split("-");
      if (parts.length === 3) {
        selJ = gregorianToJalali(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
      }
    }

    for (let day = 1; day <= monthLength; day++) {
      const cell = document.createElement("div");
      cell.className = "dp-day";
      cell.innerText = toPersianDigits(day);

      const currentWeekday = (offset + day - 1) % 7;
      if (currentWeekday === 6) {
        cell.classList.add("friday");
      }

      if (dpYear === todayJ.jy && dpMonth === todayJ.jm && day === todayJ.jd) {
        cell.classList.add("today");
      }

      if (selJ && selJ.jy === dpYear && selJ.jm === dpMonth && selJ.jd === day) {
        cell.classList.add("selected");
      }

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        const greg = jalaliToGregorian(dpYear, dpMonth, day);
        const yStr = greg.gy;
        const mStr = String(greg.gm).padStart(2, '0');
        const dStr = String(greg.gd).padStart(2, '0');
        selectedDateStr = `${yStr}-${mStr}-${dStr}`;
        hiddenInput.value = selectedDateStr;
        
        label.innerText = `${toPersianDigits(day)} ${JALALI_MONTHS[dpMonth - 1]} ${toPersianDigits(dpYear)}`;
        modal.classList.add("hidden");
      });

      daysGrid.appendChild(cell);
    }
  }
}

// ==========================================================================
// Planning Book (دفتر برنامه‌ریزی) Application Logic
// ==========================================================================
function getTodayLocalDateStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

async function initPlanner() {
  const scrollTopBtn = document.getElementById("btn-scroll-top");
  const btnHome = document.getElementById("btn-home");
  const plannerSection = document.getElementById("planner-section");

  // Task Form elements
  const btnAddPlannerTask = document.getElementById("btn-add-planner-task");
  const plannerTaskForm = document.getElementById("planner-task-form");
  const plannerTaskInput = document.getElementById("planner-task-input");
  const plannerTaskCategory = document.getElementById("planner-task-category");
  const btnSavePlannerTask = document.getElementById("btn-save-planner-task");
  const btnCancelPlannerTask = document.getElementById("btn-cancel-planner-task");
  const plannerTasksList = document.getElementById("planner-tasks-list");

  // Habit Form elements
  const btnAddHabit = document.getElementById("btn-add-habit");
  const habitForm = document.getElementById("habit-form");
  const habitInput = document.getElementById("habit-input");
  const habitCategory = document.getElementById("habit-category");
  const btnSaveHabit = document.getElementById("btn-save-habit");
  const btnCancelHabit = document.getElementById("btn-cancel-habit");
  const habitsList = document.getElementById("habits-list");

  // Reflection element
  const reflectionTextarea = document.getElementById("planner-reflection");
  const reflectionSaveStatus = document.getElementById("reflection-save-status");

  const todayKey = getTodayLocalDateStr();

  // Scroll to Top action
  if (scrollTopBtn) {
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (btnHome) {
        btnHome.click();
      }
    });
  }

  // Roll over uncompleted planner tasks from previous days to today
  let tasksUpdated = false;
  plannerTasks.forEach(t => {
    if (!t.completed && t.date < todayKey) {
      t.date = todayKey;
      tasksUpdated = true;
    }
  });
  if (tasksUpdated) {
    await db.set("planner_tasks", plannerTasks);
  }

  // Reflection Load & Autosave Setup
  if (reflectionTextarea) {
    const reflections = await db.get("planner_reflections", {});
    reflectionTextarea.value = reflections[todayKey] || "";

    let debTimeout;
    reflectionTextarea.addEventListener("input", () => {
      if (reflectionSaveStatus) reflectionSaveStatus.innerText = "در حال ذخیره خودکار...";
      clearTimeout(debTimeout);
      debTimeout = setTimeout(async () => {
        const refs = await db.get("planner_reflections", {});
        refs[todayKey] = reflectionTextarea.value;
        await db.set("planner_reflections", refs);
        if (reflectionSaveStatus) reflectionSaveStatus.innerText = "ذخیره شد";
        if (typeof updateInteractiveAnalytics === "function") {
          updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
        }
      }, 800);
    });
  }

  // Task form toggles
  if (btnAddPlannerTask) {
    btnAddPlannerTask.addEventListener("click", () => {
      plannerTaskForm.classList.toggle("hidden");
      plannerTaskInput.focus();
    });
  }
  if (btnCancelPlannerTask) {
    btnCancelPlannerTask.addEventListener("click", () => {
      plannerTaskForm.classList.add("hidden");
      plannerTaskInput.value = "";
      document.getElementById("planner-task-priority").value = "medium";
      document.getElementById("planner-task-timeofday").value = "noon";
      document.getElementById("planner-task-duration").value = "";
    });
  }

  // Task save handler
  if (btnSavePlannerTask) {
    btnSavePlannerTask.addEventListener("click", async () => {
      const text = plannerTaskInput.value.trim();
      const category = plannerTaskCategory.value;
      if (!text) {
        alert("لطفاً متن تسک را وارد کنید.");
        return;
      }

      const priority = document.getElementById("planner-task-priority").value;
      const timeOfDay = document.getElementById("planner-task-timeofday").value;
      const durationVal = document.getElementById("planner-task-duration").value;
      const estimatedTime = durationVal ? parseInt(durationVal) : 0;

      const newTask = {
        id: Date.now().toString(),
        text: text,
        category: category,
        completed: false,
        date: todayKey,
        priority: priority,
        timeOfDay: timeOfDay,
        estimatedTime: estimatedTime
      };

      plannerTasks.unshift(newTask);
      await db.set("planner_tasks", plannerTasks);
      
      plannerTaskInput.value = "";
      document.getElementById("planner-task-priority").value = "medium";
      document.getElementById("planner-task-timeofday").value = "noon";
      document.getElementById("planner-task-duration").value = "";
      plannerTaskForm.classList.add("hidden");
      
      renderPlannerTasks();
      renderPlannerReports();
      if (typeof updateInteractiveAnalytics === "function") {
        updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
      }
    });
  }

  // Habit form toggles
  if (btnAddHabit) {
    btnAddHabit.addEventListener("click", () => {
      habitForm.classList.toggle("hidden");
      habitInput.focus();
    });
  }
  if (btnCancelHabit) {
    btnCancelHabit.addEventListener("click", () => {
      habitForm.classList.add("hidden");
      habitInput.value = "";
    });
  }

  // Habit save handler
  if (btnSaveHabit) {
    btnSaveHabit.addEventListener("click", async () => {
      const name = habitInput.value.trim();
      const category = habitCategory.value;
      if (!name) {
        alert("لطفاً نام عادت را وارد کنید.");
        return;
      }

      const newHabit = {
        id: Date.now().toString(),
        name: name,
        category: category
      };

      plannerHabits.push(newHabit);
      await db.set("planner_habits", plannerHabits);
      
      habitInput.value = "";
      habitForm.classList.add("hidden");
      
      renderHabits();
      renderPlannerReports();
      if (window.renderChecklist) window.renderChecklist();
      if (typeof updateInteractiveAnalytics === "function") {
        updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
      }
    });
  }

  // Render Daily Tasks List
  function renderPlannerTasks() {
    if (!plannerTasksList) return;
    plannerTasksList.innerHTML = "";

    const todayTasks = plannerTasks.filter(t => t.date === todayKey);
    
    if (todayTasks.length === 0 && plannerHabits.length === 0) {
      plannerTasksList.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 40px 0;">هیچ تسکی برای امروز تعریف نشده است.</div>`;
      return;
    }

    const priorityColors = { high: '#ef4444', medium: '#ffb300', low: '#3b82f6' };
    const priorityLabels = { high: 'فوری 🔴', medium: 'معمولی 🟡', low: 'کم‌اهمیت 🔵' };

    // Define groups
    const groups = [
      { id: "morning", title: "کارهای صبح 🌅", items: [] },
      { id: "noon", title: "کارهای ظهر و عصر ☀️", items: [] },
      { id: "evening", title: "کارهای غروب 🌇", items: [] },
      { id: "night", title: "کارهای شب 🌙", items: [] },
      { id: "habits", title: "روتین و عادات روزانه 🔄", items: [] }
    ];

    // Distribute tasks
    todayTasks.forEach(t => {
      const tOfDay = t.timeOfDay || "noon";
      const targetGroup = groups.find(g => g.id === tOfDay) || groups[1];
      targetGroup.items.push({ type: "task", data: t });
    });

    // Distribute habits
    plannerHabits.forEach(h => {
      const isCompletedToday = plannerHabitLogs[h.id] && plannerHabitLogs[h.id][todayKey];
      groups[4].items.push({ type: "habit", data: h, completed: !!isCompletedToday });
    });

    // Render groups
    groups.forEach(group => {
      if (group.items.length === 0) return;

      // Sort items: completed goes to bottom
      group.items.sort((a, b) => {
        const aComp = a.type === "task" ? a.data.completed : a.completed;
        const bComp = b.type === "task" ? b.data.completed : b.completed;
        return (aComp === bComp) ? 0 : aComp ? 1 : -1;
      });

      // Render group header
      const header = document.createElement("div");
      header.className = "planner-group-header";
      header.innerHTML = `<span class="group-title">${group.title}</span><span class="group-count">${toPersianDigits(group.items.length)} کار</span>`;
      plannerTasksList.appendChild(header);

      // Render items
      group.items.forEach(item => {
        const row = document.createElement("div");
        
        if (item.type === "task") {
          const task = item.data;
          row.className = `planner-task-item ${task.completed ? 'completed' : ''}`;
          const cat = plannerCategories.find(c => c.id === task.category) || { emoji: "📝", name: task.category };
          const pColor = priorityColors[task.priority || 'medium'];
          const pLabel = priorityLabels[task.priority || 'medium'];

          row.innerHTML = `
            <input type="checkbox" class="planner-task-checkbox" ${task.completed ? 'checked' : ''}>
            <div class="planner-task-info">
              <span class="task-text">${task.text} ${task.estimatedTime ? `<span style="font-size:0.75rem; color:var(--text-muted);">(${toPersianDigits(task.estimatedTime)} دقیقه)</span>` : ''}</span>
              <div class="task-meta">
                <span class="category-tag" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: ${cat.color || 'var(--text-secondary)'}">${cat.name} ${cat.emoji}</span>
                <span class="priority-tag" style="font-size: 0.68rem; padding: 2px 6px; border-radius: 6px; border: 1px solid ${pColor}40; background: ${pColor}10; color: ${pColor}; margin-right: 6px;">${pLabel}</span>
              </div>
            </div>
            <button class="task-delete-btn" title="حذف تسک">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          `;

          row.querySelector(".planner-task-checkbox").addEventListener("change", async (e) => {
            task.completed = e.target.checked;
            await db.set("planner_tasks", plannerTasks);
            row.classList.toggle("completed", task.completed);
            renderPlannerReports();
            
            // Sound and confetti triggers
            if (task.completed) {
              window.playUISuccessSound();
              const todayTasks = plannerTasks.filter(t => t.date === todayKey);
              const allCompleted = todayTasks.every(t => t.completed);
              if (allCompleted && todayTasks.length > 0) {
                window.triggerConfetti();
              }
            } else {
              window.playUIClickSound();
            }

            if (typeof updateInteractiveAnalytics === "function") {
              updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
            }
          });

          row.querySelector(".task-delete-btn").addEventListener("click", async () => {
            plannerTasks = plannerTasks.filter(t => t.id !== task.id);
            await db.set("planner_tasks", plannerTasks);
            renderPlannerTasks();
            renderPlannerReports();
            if (typeof updateInteractiveAnalytics === "function") {
              updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
            }
          });

        } else {
          // Habit item
          const habit = item.data;
          const isCompletedToday = item.completed;
          row.className = `planner-task-item habit-task-item ${isCompletedToday ? 'completed' : ''}`;
          const cat = plannerCategories.find(c => c.id === habit.category) || { emoji: "🔄", name: "عادت" };

          row.innerHTML = `
            <input type="checkbox" class="planner-task-checkbox" ${isCompletedToday ? 'checked' : ''}>
            <div class="planner-task-info">
              <span class="task-text">[عادت] ${habit.name}</span>
              <div class="task-meta">
                <span class="category-tag habit-badge">${cat.name} ${cat.emoji}</span>
              </div>
            </div>
          `;

          row.querySelector(".planner-task-checkbox").addEventListener("change", async (e) => {
            await toggleHabitComplete(habit.id, todayKey, e.target.checked);
          });
        }

        plannerTasksList.appendChild(row);
      });
    });
  }

  // Expose renderPlannerTasks globally
  window.renderPlannerTasks = renderPlannerTasks;

  // Render Habits List with Monthly grids
  function renderHabits() {
    if (!habitsList) return;
    habitsList.innerHTML = "";

    if (plannerHabits.length === 0) {
      habitsList.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 40px 0;">هیچ عادتی تعریف نکرده‌اید.</div>`;
      return;
    }

    const now = new Date();
    const todayJ = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

    plannerHabits.forEach(habit => {
      const item = document.createElement("div");
      item.className = "habit-item";

      const cat = plannerCategories.find(c => c.id === habit.category) || { emoji: "🔄", name: habit.category, color: "var(--accent-blue)" };

      item.innerHTML = `
        <div class="habit-item-header">
          <div class="habit-title-group">
            <span class="habit-category-dot" style="background-color: ${cat.color || '#fff'}"></span>
            <span class="habit-name">${habit.name} <span style="font-size: 0.72rem; color: var(--text-muted); padding-right: 4px;">(${cat.name})</span></span>
          </div>
          <div class="habit-stats-summary" id="habit-summary-${habit.id}">
            محاسبه...
          </div>
        </div>
        <div class="habit-grid-container" id="habit-grid-${habit.id}"></div>
        <div class="habit-actions">
          <button class="habit-delete-btn" title="حذف عادت">حذف عادت</button>
        </div>
      `;

      const gridContainer = item.querySelector(`#habit-grid-${habit.id}`);
      const { doneCount, monthLength } = renderHabitGridItem(habit, gridContainer, cat);

      const percent = Math.round((doneCount / monthLength) * 100);
      item.querySelector(`#habit-summary-${habit.id}`).innerText = `انجام شده: ${toPersianDigits(doneCount)} از ${toPersianDigits(monthLength)} روز (${toPersianDigits(percent)}٪)`;

      item.querySelector(".habit-delete-btn").addEventListener("click", async () => {
        if (confirm(`آیا مایلید عادت «${habit.name}» را حذف کنید؟`)) {
          plannerHabits = plannerHabits.filter(h => h.id !== habit.id);
          await db.set("planner_habits", plannerHabits);
          if (plannerHabitLogs[habit.id]) {
            delete plannerHabitLogs[habit.id];
            await db.set("planner_habit_logs", plannerHabitLogs);
          }
          renderHabits();
          renderPlannerReports();
          if (window.renderChecklist) window.renderChecklist();
          if (typeof updateInteractiveAnalytics === "function") {
            updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
          }
        }
      });

      habitsList.appendChild(item);
    });
  }

  // Expose renderHabits globally
  window.renderHabits = renderHabits;

  function renderHabitGridItem(habit, container, cat) {
    const now = new Date();
    const todayJ = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const monthLength = getJalaliMonthLength(todayJ.jy, todayJ.jm);
    
    const gridDiv = document.createElement("div");
    gridDiv.className = "habit-days-grid";

    let doneCount = 0;

    for (let day = 1; day <= monthLength; day++) {
      const box = document.createElement("div");
      box.className = "habit-day-box";
      box.innerText = toPersianDigits(day);
      box.title = `${toPersianDigits(day)} ${JALALI_MONTHS[todayJ.jm - 1]} ${toPersianDigits(todayJ.jy)}`;

      const greg = jalaliToGregorian(todayJ.jy, todayJ.jm, day);
      const dateKey = `${greg.gy}-${String(greg.gm).padStart(2, '0')}-${String(greg.gd).padStart(2, '0')}`;

      const isDone = plannerHabitLogs[habit.id] && plannerHabitLogs[habit.id][dateKey];
      if (isDone) {
        box.classList.add("done");
        box.style.backgroundColor = cat.color || "var(--accent-blue)";
        box.style.borderColor = cat.color || "var(--accent-blue)";
        doneCount++;
      }

      // Highlight today and selected day in habit grid
      if (day === todayJ.jd) {
        box.classList.add("today-habit-day");
      }
      if (day === selectedCalDay && todayJ.jm === selectedCalMonth && todayJ.jy === selectedCalYear) {
        box.classList.add("selected-habit-day");
      }

      box.style.cursor = "default";
      gridDiv.appendChild(box);
    }

    container.appendChild(gridDiv);
    return { doneCount, monthLength };
  }

  // Calculate and Render Reports (Progress rings, stats)
  function renderPlannerReports() {
    const todayTasks = plannerTasks.filter(t => t.date === todayKey);
    const totalTasks = todayTasks.length;
    const completedTasks = todayTasks.filter(t => t.completed).length;

    // Habits done today
    let completedHabits = 0;
    const totalHabits = plannerHabits.length;
    plannerHabits.forEach(habit => {
      if (plannerHabitLogs[habit.id] && plannerHabitLogs[habit.id][todayKey]) {
        completedHabits++;
      }
    });

    const totalActions = totalTasks + totalHabits;
    const completedActions = completedTasks + completedHabits;
    const totalProgressPercent = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

    // Update Header stats
    const todayStatNum = document.getElementById("planner-stat-today");
    if (todayStatNum) todayStatNum.innerText = `${toPersianDigits(totalProgressPercent)}٪`;

    const habitsStatNum = document.getElementById("planner-stat-habits");
    if (habitsStatNum) habitsStatNum.innerText = toPersianDigits(totalHabits);

    // Update circular progress ring
    const circle = document.getElementById("planner-progress-circle");
    if (circle) {
      const circumference = 314.15; // 2 * pi * r (r=50)
      const percent = Math.min(totalProgressPercent / 100, 1);
      const offset = circumference - (percent * circumference);
      circle.style.strokeDashoffset = offset;
    }

    const percentText = document.getElementById("planner-progress-percent");
    if (percentText) percentText.innerText = `${toPersianDigits(totalProgressPercent)}٪`;

    // Category calculation - dynamic progress bars
    const progressListEl = document.getElementById("category-progress-list");
    if (progressListEl) {
      progressListEl.innerHTML = "";
      plannerCategories.forEach(cat => {
        const catTasks = todayTasks.filter(t => t.category === cat.id);
        const catHabits = plannerHabits.filter(h => h.category === cat.id);

        const totalCatItems = catTasks.length + catHabits.length;
        let completedCatItems = catTasks.filter(t => t.completed).length;
        catHabits.forEach(habit => {
          if (plannerHabitLogs[habit.id] && plannerHabitLogs[habit.id][todayKey]) {
            completedCatItems++;
          }
        });

        const catPercent = totalCatItems > 0 ? Math.round((completedCatItems / totalCatItems) * 100) : 0;
        
        const catProgressItem = document.createElement("div");
        catProgressItem.className = "category-progress-item";
        catProgressItem.innerHTML = `
          <div class="category-progress-info">
            <span>${cat.emoji} ${cat.name}</span>
            <span>${toPersianDigits(catPercent)}٪</span>
          </div>
          <div class="category-progress-track">
            <div class="category-progress-fill" style="width: ${catPercent}%; background-color: ${cat.color || 'var(--accent-blue)'}; color: ${cat.color || 'var(--accent-blue)'}"></div>
          </div>
        `;
        progressListEl.appendChild(catProgressItem);
      });
    }
  }

  // Expose renderPlannerReports globally
  window.renderPlannerReports = renderPlannerReports;

  // Initialize category manager hooks
  const btnManageCategories = document.getElementById("btn-manage-categories");
  if (btnManageCategories) {
    btnManageCategories.addEventListener("click", () => {
      renderCategoryManagerList();
      openModal("category-manager-modal");
    });
  }

  const btnAddCategory = document.getElementById("btn-add-category");
  if (btnAddCategory) {
    btnAddCategory.addEventListener("click", async () => {
      const nameInput = document.getElementById("new-cat-name");
      const emojiInput = document.getElementById("new-cat-emoji");
      const colorInput = document.getElementById("new-cat-color");
      
      const name = nameInput.value.trim();
      const emoji = emojiInput.value.trim() || "🌟";
      const color = colorInput.value;
      
      if (!name) {
        alert("لطفاً نام دسته‌بندی را وارد کنید.");
        return;
      }
      
      const newCat = {
        id: "cat_" + Date.now(),
        name: name,
        emoji: emoji,
        color: color
      };
      
      plannerCategories.push(newCat);
      await db.set("planner_categories", plannerCategories);
      
      nameInput.value = "";
      emojiInput.value = "";
      
      renderCategoryManagerList();
      populateCategoryDropdowns();
      renderPlannerReports();
      updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
    });
  }

  // Pomodoro Timer Logic
  let pomoTimer = null;
  let pomoTimeLeft = 25 * 60;
  let pomoIsRunning = false;
  let pomoMode = "work";
  
  const pomoDisplay = document.getElementById("pomo-display-time");
  const pomoLabel = document.getElementById("pomo-status-label");
  const pomoStartBtn = document.getElementById("btn-pomo-start");
  const pomoResetBtn = document.getElementById("btn-pomo-reset");
  const pomoModeBtn = document.getElementById("btn-pomo-mode");
  
  function updatePomoDisplay() {
    if (!pomoDisplay) return;
    const min = String(Math.floor(pomoTimeLeft / 60)).padStart(2, '0');
    const sec = String(pomoTimeLeft % 60).padStart(2, '0');
    pomoDisplay.innerText = toPersianDigits(`${min}:${sec}`);
  }
  
  if (pomoStartBtn) {
    pomoStartBtn.addEventListener("click", () => {
      window.playUIClickSound();
      if (pomoIsRunning) {
        pomoIsRunning = false;
        clearInterval(pomoTimer);
        pomoStartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
        pomoStartBtn.classList.remove("active");
      } else {
        pomoIsRunning = true;
        pomoStartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;
        pomoStartBtn.classList.add("active");
        
        pomoTimer = setInterval(() => {
          if (pomoTimeLeft > 0) {
            pomoTimeLeft--;
            updatePomoDisplay();
          } else {
            clearInterval(pomoTimer);
            pomoIsRunning = false;
            pomoStartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
            pomoStartBtn.classList.remove("active");
            
            window.playUISuccessSound();
            
            if (pomoMode === "work") {
              alert("زمان تمرکز به پایان رسید! وقت استراحت است. ☕");
              pomoMode = "break";
              pomoTimeLeft = 5 * 60;
              if (pomoLabel) pomoLabel.innerText = "☕ زمان استراحت:";
              if (pomoModeBtn) pomoModeBtn.innerText = "🧠";
              if (pomoDisplay) pomoDisplay.style.color = "#38ef7d";
            } else {
              alert("زمان استراحت به پایان رسید! دوباره شروع به کار کنید. 🍅");
              pomoMode = "work";
              pomoTimeLeft = 25 * 60;
              if (pomoLabel) pomoLabel.innerText = "🍅 زمان تمرکز:";
              if (pomoModeBtn) pomoModeBtn.innerText = "☕";
              if (pomoDisplay) pomoDisplay.style.color = "#ef4444";
            }
            updatePomoDisplay();
          }
        }, 1000);
      }
    });
  }
  
  if (pomoResetBtn) {
    pomoResetBtn.addEventListener("click", () => {
      window.playUIClickSound();
      clearInterval(pomoTimer);
      pomoIsRunning = false;
      pomoTimeLeft = pomoMode === "work" ? 25 * 60 : 5 * 60;
      updatePomoDisplay();
      if (pomoStartBtn) {
        pomoStartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
        pomoStartBtn.classList.remove("active");
      }
    });
  }
  
  if (pomoModeBtn) {
    pomoModeBtn.addEventListener("click", () => {
      window.playUIClickSound();
      clearInterval(pomoTimer);
      pomoIsRunning = false;
      if (pomoStartBtn) {
        pomoStartBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
        pomoStartBtn.classList.remove("active");
      }
      
      if (pomoMode === "work") {
        pomoMode = "break";
        pomoTimeLeft = 5 * 60;
        if (pomoLabel) pomoLabel.innerText = "☕ زمان استراحت:";
        pomoModeBtn.innerText = "🧠";
        if (pomoDisplay) pomoDisplay.style.color = "#38ef7d";
      } else {
        pomoMode = "work";
        pomoTimeLeft = 25 * 60;
        if (pomoLabel) pomoLabel.innerText = "🍅 زمان تمرکز:";
        pomoModeBtn.innerText = "☕";
        if (pomoDisplay) pomoDisplay.style.color = "#ef4444";
      }
      updatePomoDisplay();
    });
  }
  
  updatePomoDisplay();

  // Initial populate & render
  populateCategoryDropdowns();
  renderPlannerTasks();
  renderHabits();
  renderPlannerReports();
}

// ==========================================================================
// Helper functions for dynamic categories, habits as tasks, and charts
// ==========================================================================

function populateCategoryDropdowns() {
  const taskCatSelect = document.getElementById("planner-task-category");
  const habitCatSelect = document.getElementById("habit-category");
  if (taskCatSelect) {
    taskCatSelect.innerHTML = plannerCategories.map(c => `<option value="${c.id}">${c.name} ${c.emoji}</option>`).join("");
  }
  if (habitCatSelect) {
    habitCatSelect.innerHTML = plannerCategories.map(c => `<option value="${c.id}">${c.name} ${c.emoji}</option>`).join("");
  }
}

function renderCategoryManagerList() {
  const listEl = document.getElementById("categories-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  
  plannerCategories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "cat-item";
    
    // Protect default categories from deletion
    const isDefault = DEFAULT_CATEGORIES.some(dc => dc.id === cat.id);
    const deleteBtnMarkup = isDefault ? 
      `<span class="cat-default-badge">پیش‌فرض</span>` :
      `<button class="cat-delete-btn" data-id="${cat.id}">&times;</button>`;
      
    item.innerHTML = `
      <div class="cat-color-preview" style="background: ${cat.color || '#fff'}"></div>
      <span class="cat-emoji-preview">${cat.emoji || '🌟'}</span>
      <span class="cat-name">${cat.name}</span>
      ${deleteBtnMarkup}
    `;
    
    if (!isDefault) {
      item.querySelector(".cat-delete-btn").addEventListener("click", async () => {
        plannerCategories = plannerCategories.filter(c => c.id !== cat.id);
        await db.set("planner_categories", plannerCategories);
        renderCategoryManagerList();
        populateCategoryDropdowns();
        if (window.renderPlannerReports) window.renderPlannerReports();
        if (window.renderPlannerTasks) window.renderPlannerTasks();
        if (window.renderHabits) window.renderHabits();
        updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
      });
    }
    
    listEl.appendChild(item);
  });
}

async function toggleHabitComplete(habitId, dateKey, isDone) {
  if (!plannerHabitLogs[habitId]) {
    plannerHabitLogs[habitId] = {};
  }
  if (isDone) {
    plannerHabitLogs[habitId][dateKey] = true;
    window.playUISuccessSound();
  } else {
    delete plannerHabitLogs[habitId][dateKey];
    window.playUIClickSound();
  }
  await db.set("planner_habit_logs", plannerHabitLogs);
  
  // Update all connected rendering sections
  if (window.renderChecklist) window.renderChecklist();
  if (window.renderPlannerTasks) window.renderPlannerTasks();
  if (window.renderHabits) window.renderHabits();
  if (window.renderPlannerReports) window.renderPlannerReports();
  updateInteractiveAnalytics(selectedCalYear, selectedCalMonth, selectedCalDay);
}

function getGregorianDateKeyFromJalali(jy, jm, jd) {
  const g = jalaliToGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

async function updateInteractiveAnalytics(jy, jm, jd) {
  const dateKey = getGregorianDateKeyFromJalali(jy, jm, jd);
  const jalaliDateStr = `${jy}/${jm}/${jd}`;

  // Find weekday name in Persian
  const g = jalaliToGregorian(jy, jm, jd);
  const dateObj = new Date(g.gy, g.gm - 1, g.gd);
  const gWeekday = dateObj.getDay();
  const weekdayStr = WEEKDAYS_FULL_FA[(gWeekday + 1) % 7];
  
  const formattedDateLong = `${weekdayStr}، ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
  const titleEl = document.getElementById("selected-report-date-title");
  if (titleEl) titleEl.innerText = `گزارش روزانه: ${formattedDateLong}`;

  // Fetch fresh states
  const pTasks = await db.get("planner_tasks", []);
  const pHabits = await db.get("planner_habits", []);
  const pHabitLogs = await db.get("planner_habit_logs", {});
  const reflections = await db.get("planner_reflections", {});
  const wLogs = await db.get("water_tracker_logs", {});
  const cItems = await db.get("user_checklist", []);

  // 1. Checklist Tasks stats
  const dayChecklistItems = cItems.filter(item => {
    const normalizedCreated = item.createdAt ? item.createdAt.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : "";
    const targetCreated1 = `${jy}/${jm}/${jd}`;
    const targetCreated2 = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    const matchesCreated = (normalizedCreated === targetCreated1 || normalizedCreated === targetCreated2);
    const matchesDue = (item.dueDate === dateKey);
    return matchesCreated || matchesDue;
  });
  const completedChecklist = dayChecklistItems.filter(item => item.completed || item.completedAt === dateKey).length;
  const totalChecklist = dayChecklistItems.length;
  const checklistStatVal = document.getElementById("report-checklist-status");
  if (checklistStatVal) {
    checklistStatVal.innerText = `${toPersianDigits(completedChecklist)} از ${toPersianDigits(totalChecklist)}`;
  }

  // 2. Planner Tasks stats (excluding dynamic habits)
  const dayPlannerTasks = pTasks.filter(t => t.date === dateKey);
  const completedPlanner = dayPlannerTasks.filter(t => t.completed).length;
  const totalPlanner = dayPlannerTasks.length;
  const plannerStatVal = document.getElementById("report-planner-status");
  if (plannerStatVal) {
    plannerStatVal.innerText = `${toPersianDigits(completedPlanner)} از ${toPersianDigits(totalPlanner)}`;
  }

  // 3. Habits stats
  let completedHabits = 0;
  pHabits.forEach(h => {
    if (pHabitLogs[h.id] && pHabitLogs[h.id][dateKey]) {
      completedHabits++;
    }
  });
  const totalHabits = pHabits.length;
  const habitsStatVal = document.getElementById("report-habits-status");
  if (habitsStatVal) {
    habitsStatVal.innerText = `${toPersianDigits(completedHabits)} از ${toPersianDigits(totalHabits)}`;
  }

  // 4. Water intake
  const waterCount = wLogs[dateKey] || 0;
  const waterStatVal = document.getElementById("report-water-status");
  if (waterStatVal) {
    waterStatVal.innerText = `${toPersianDigits(waterCount)} لیوان`;
  }

  // 5. Reflection text
  const reflectionText = reflections[dateKey] || "";
  const reflectionTextEl = document.getElementById("report-reflection-text");
  if (reflectionTextEl) {
    reflectionTextEl.innerText = reflectionText.trim() ? reflectionText : "یادداشتی برای این روز ثبت نشده است.";
  }

  // Draw Charts
  renderMonthlyAndYearlyCharts(jy, jm);
}

// Global exposure of report update function
window.onCalendarDateSelected = function(jy, jm, jd) {
  updateInteractiveAnalytics(jy, jm, jd);
};

async function renderMonthlyAndYearlyCharts(jy, jm) {
  const monthlyContainer = document.getElementById("monthly-bar-chart");
  const yearlyContainer = document.getElementById("yearly-bar-chart");
  
  if (!monthlyContainer || !yearlyContainer) return;
  
  const monthNameEl = document.getElementById("chart-month-name");
  if (monthNameEl) monthNameEl.innerText = `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
  
  const yearNameEl = document.getElementById("chart-year-name");
  if (yearNameEl) yearNameEl.innerText = `سال ${toPersianDigits(jy)}`;

  monthlyContainer.innerHTML = "";
  yearlyContainer.innerHTML = "";

  const pTasks = await db.get("planner_tasks", []);
  const pHabits = await db.get("planner_habits", []);
  const pHabitLogs = await db.get("planner_habit_logs", {});
  const cItems = await db.get("user_checklist", []);

  // 1. Monthly Chart calculation
  const daysInMonth = getJalaliMonthLength(jy, jm);
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dKey = getGregorianDateKeyFromJalali(jy, jm, day);
    const jalaliDateStr1 = `${jy}/${jm}/${day}`;
    const jalaliDateStr2 = `${jy}/${String(jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

    // Checklist
    const dChecklist = cItems.filter(item => {
      const normalizedCreated = item.createdAt ? item.createdAt.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : "";
      return normalizedCreated === jalaliDateStr1 || normalizedCreated === jalaliDateStr2 || item.dueDate === dKey;
    });
    const compChecklist = dChecklist.filter(item => item.completed || item.completedAt === dKey).length;
    const totChecklist = dChecklist.length;

    // Planner tasks
    const dPlanner = pTasks.filter(t => t.date === dKey);
    const compPlanner = dPlanner.filter(t => t.completed).length;
    const totPlanner = dPlanner.length;

    // Habits
    let compHabits = 0;
    pHabits.forEach(h => {
      if (pHabitLogs[h.id] && pHabitLogs[h.id][dKey]) compHabits++;
    });
    const totHabits = pHabits.length;

    const totalDone = compChecklist + compPlanner + compHabits;
    const totalItems = totChecklist + totPlanner + totHabits;
    const progressPercent = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

    const col = document.createElement("div");
    col.className = "chart-bar-col";
    
    const isSelected = (jy === selectedCalYear && jm === selectedCalMonth && day === selectedCalDay);
    
    col.innerHTML = `
      <div class="chart-bar-track">
        <div class="chart-bar-fill ${isSelected ? 'selected' : ''}" 
             style="height: ${progressPercent}%;" 
             data-tooltip="روز ${toPersianDigits(day)}: ${toPersianDigits(progressPercent)}٪ پیشرفت" 
             data-day="${day}"></div>
      </div>
      <span class="chart-bar-label">${toPersianDigits(day)}</span>
    `;

    col.querySelector(".chart-bar-fill").addEventListener("click", () => {
      selectedCalYear = jy;
      selectedCalMonth = jm;
      selectedCalDay = day;
      
      // Update calendar UI grid highlight
      renderCalendarGrid();
      
      // Update reports
      updateInteractiveAnalytics(jy, jm, day);
    });

    monthlyContainer.appendChild(col);
  }

  // 2. Yearly Chart calculation
  for (let m = 1; m <= 12; m++) {
    const daysInM = getJalaliMonthLength(jy, m);
    let totalMonthProgress = 0;
    let daysWithData = 0;

    for (let d = 1; d <= daysInM; d++) {
      const dKey = getGregorianDateKeyFromJalali(jy, m, d);
      const jalaliDateStr1 = `${jy}/${m}/${d}`;
      const jalaliDateStr2 = `${jy}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

      const dChecklist = cItems.filter(item => {
        const normalizedCreated = item.createdAt ? item.createdAt.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : "";
        return normalizedCreated === jalaliDateStr1 || normalizedCreated === jalaliDateStr2 || item.dueDate === dKey;
      });
      const compChecklist = dChecklist.filter(item => item.completed || item.completedAt === dKey).length;
      const totChecklist = dChecklist.length;

      const dPlanner = pTasks.filter(t => t.date === dKey);
      const compPlanner = dPlanner.filter(t => t.completed).length;
      const totPlanner = dPlanner.length;

      let compHabits = 0;
      pHabits.forEach(h => {
        if (pHabitLogs[h.id] && pHabitLogs[h.id][dKey]) compHabits++;
      });
      const totHabits = pHabits.length;

      const totalDone = compChecklist + compPlanner + compHabits;
      const totalItems = totChecklist + totPlanner + totHabits;
      
      if (totalItems > 0) {
        totalMonthProgress += (totalDone / totalItems);
        daysWithData++;
      }
    }

    const monthAvgPercent = daysWithData > 0 ? Math.round((totalMonthProgress / daysWithData) * 100) : 0;

    const col = document.createElement("div");
    col.className = "chart-bar-col";
    
    const isSelectedMonth = (jy === selectedCalYear && m === selectedCalMonth);

    col.innerHTML = `
      <div class="chart-bar-track">
        <div class="chart-bar-fill" 
             style="height: ${monthAvgPercent}%; ${isSelectedMonth ? 'background: linear-gradient(180deg, #ffc43d 0%, #ffb300 100%);' : ''}" 
             data-tooltip="${JALALI_MONTHS[m - 1]}: ${toPersianDigits(monthAvgPercent)}٪ پیشرفت متوسط"></div>
      </div>
      <span class="chart-bar-label">${JALALI_MONTHS[m - 1].substring(0, 3)}</span>
    `;

    yearlyContainer.appendChild(col);
  }
}

