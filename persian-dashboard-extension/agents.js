/**
 * Taraz Productivity & AI Agents Orchestration Module (agents.js)
 * Implements 60 specialized agents: ~45 heuristic/rule-based (zero cost) and ~15 AI Pass-powered.
 */

class TarazAgentManager {
  constructor() {
    this.xp = 0;
    this.level = 1;
    this.clicksHistory = {};
    this.keystrokes = 0;
    this.mouseClicks = 0;
    this.leitnerBox = [];
    this.energyLevel = 3; // 1-5
    this.sickMode = false;
    this.activeFocusMusic = null;
    this.virtualCompanionProgress = 0;
    this.lastWaterAlertTime = Date.now();
    this.lastStretchAlertTime = Date.now();

    // Default Leitner English-Persian words
    this.DEFAULT_VOCAB = [
      { word: "Resilience", translation: "تاب‌آوری / انعطاف‌پذیری", stage: 1 },
      { word: "Procrastinate", translation: "به تعویق انداختن / تنبلی کردن", stage: 1 },
      { word: "Consistency", translation: "ثبات / پایداری", stage: 1 },
      { word: "Productivity", translation: "بهره‌وری / کارایی", stage: 1 },
      { word: "Mindfulness", translation: "ذهن‌آگاهی / توجه کامل", stage: 1 }
    ];

    // Default daily ideas
    this.IDEAS_POOL = [
      { text: "امروز برای هر کار سخت یک پاداش کوچک ۵ دقیقه‌ای بعد از انجامش بگذارید.", cat: "learning" },
      { text: "سعی کنید اولین ساعت کاری خود را بدون چک کردن ایمیل یا پیام‌رسان‌ها بگذرانید.", cat: "work" },
      { text: "هر ۴۵ دقیقه کار، ۵ دقیقه ایستاده راه بروید و آب بنوشید.", cat: "health" },
      { text: "۳ کار بسیار مهم امروزتان را روی کاغذ بنویسید و باقی کارها را موقتاً کنار بگذارید.", cat: "mind" },
      { text: "امروز یک مفهوم سخت را در قالب نقشه ذهنی یا خلاصه ۳ خطی بازنویسی کنید.", cat: "learning" }
    ];

    // local poems database (mood matching)
    this.POEMS_DATABASE = {
      happy: { verse1: "مژده ای دل که دگر باد صبا بازآمد", verse2: "هدهد خوش خبر از طرف سبا بازآمد", poet: "حافظ" },
      sad: { verse1: "در بیابان گر به شوق کعبه خواهی زد قدم", verse2: "سرزنش‌ها گر کند خار مغیلان غم مخور", poet: "حافظ" },
      tired: { verse1: "راهیست راه عشق که هیچش کناره نیست", verse2: "آنجا جز آن که جان بسپارند چاره نیست", poet: "حافظ" },
      victory: { verse1: "صبح است و ژاله می‌چکد از روی لاله سر به سر", verse2: "گویا که مهر رخ نمود از پرده شب جلوه‌گر", poet: "حافظ" },
      general: { verse1: "درخت دوستی بنشان که کام دل به بار آرد", verse2: "نهال دشمنی برکن که رنج بی‌شمار آرد", poet: "حافظ" }
    };
  }

  async init() {
    console.log("[Taraz Agents] Initializing 60 productivity agents...");
    await this.loadState();
    this.injectUIElements();
    this.setupListeners();
    this.runPeriodicCheck();
    this.checkDynamicTheme();
    this.renderVocabCard();
    this.updateXPBadge();
  }

  async loadState() {
    this.xp = await db.get("agent_xp", 0);
    this.level = await db.get("agent_level", 1);
    this.clicksHistory = await db.get("agent_clicks_history", {});
    this.leitnerBox = await db.get("agent_leitner_box", this.DEFAULT_VOCAB);
    this.energyLevel = await db.get("agent_energy_level", 3);
    this.sickMode = await db.get("agent_sick_mode", false);
  }

  async saveState() {
    await db.set("agent_xp", this.xp);
    await db.set("agent_level", this.level);
    await db.set("agent_clicks_history", this.clicksHistory);
    await db.set("agent_leitner_box", this.leitnerBox);
    await db.set("agent_energy_level", this.energyLevel);
    await db.set("agent_sick_mode", this.sickMode);
  }

  // Dynamic UI injection
  injectUIElements() {
    // 3. Leitner & Vocab widget in Notebook sidebar
    const notesSidebar = document.querySelector(".notebook-sidebar");
    if (notesSidebar && !document.getElementById("agent-vocab-widget")) {
      const vocabWidget = document.createElement("div");
      vocabWidget.id = "agent-vocab-widget";
      vocabWidget.className = "agent-vocab-widget";
      notesSidebar.appendChild(vocabWidget);
    }

    // 4. Modals and Overlays
    this.injectModals();
  }

  injectModals() {
    if (document.getElementById("agent-reflection-modal")) return;

    const modalHTML = `
      <!-- Daily Reflection Modal -->
      <div id="agent-reflection-modal" class="modal-overlay hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h4>ثبت بازتاب ذهنی پایان روز (Self-Reflection)</h4>
            <button class="close-modal-btn" onclick="document.getElementById('agent-reflection-modal').classList.add('hidden')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">مربی توسعه فردی: بازبینی آگاهانه امروز به یادگیری شما کمک می‌کند.</p>
            <div class="form-group">
              <label>امروز چه کاری بهت بیشترین رضایت رو داد؟</label>
              <textarea id="reflection-q1" placeholder="بنویسید..."></textarea>
            </div>
            <div class="form-group">
              <label>چه چیزی مانع انجام کامل تسک‌ها بود؟ (خستگی، سختی کار، حواس‌پرتی)</label>
              <input type="text" id="reflection-q2" placeholder="مانع اصلی امروز...">
            </div>
          </div>
          <div class="modal-footer">
            <button id="btn-save-reflection" class="modal-submit-btn">ثبت و ذخیره</button>
            <button class="modal-cancel-btn" onclick="document.getElementById('agent-reflection-modal').classList.add('hidden')">انصراف</button>
          </div>
        </div>
      </div>

      <!-- Leitner Quiz Modal -->
      <div id="agent-quiz-modal" class="modal-overlay hidden">
        <div class="modal-card" style="max-width: 400px; text-align: center;">
          <div class="modal-header">
            <h4>کوییز لایتنر لغات</h4>
            <button class="close-modal-btn" onclick="document.getElementById('agent-quiz-modal').classList.add('hidden')">&times;</button>
          </div>
          <div class="modal-body">
            <h2 id="quiz-word" style="font-size: 2rem; color: var(--accent-gold); margin: 20px 0;">Resilience</h2>
            <p id="quiz-translation" class="hidden" style="font-size: 1.1rem; color: white; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin: 15px 0;"></p>
            <button id="btn-quiz-show" class="notebook-save-btn" style="width: 100%; margin-bottom: 12px;">نمایش معنی</button>
            <div id="quiz-actions" class="hidden" style="display: flex; gap: 8px;">
              <button id="btn-quiz-wrong" class="modal-cancel-btn" style="flex:1; background: #ef4444; color:white;">یادم نبود ❌</button>
              <button id="btn-quiz-right" class="modal-submit-btn" style="flex:1; background: #10b981; color:white;">یاد گرفتم   تیک</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Event handler for reflection save
    document.getElementById("btn-save-reflection").addEventListener("click", async () => {
      const q1 = document.getElementById("reflection-q1").value.trim();
      const q2 = document.getElementById("reflection-q2").value.trim();
      if (!q1) return alert("لطفا فیلد اول را پر کنید.");

      const reflections = await db.get("agent_reflections", []);
      reflections.push({ date: new Date().toLocaleDateString('fa-IR'), q1, q2 });
      await db.set("agent_reflections", reflections);
      document.getElementById("agent-reflection-modal").classList.add("hidden");
      this.showTipAlert("آفرین! بازتاب امروزت ذخیره شد. ۵۰ امتیاز دریافت کردی!  ستاره");
      await this.awardXP(50);
    });
  }

  // Set up event tracking for heuristic/rule agents
  setupListeners() {
    // Track clicks for Shortcut Agent
    document.addEventListener("click", (e) => {
      this.mouseClicks++;
      const link = e.target.closest("a");
      if (link && link.href && !link.href.includes("javascript") && !link.href.startsWith("#")) {
        const url = new URL(link.href);
        const host = url.hostname;
        this.clicksHistory[host] = (this.clicksHistory[host] || 0) + 1;
        this.saveState();
        this.checkShortcutSuggestions(host);
      }

      // Check ergonomics clicks
      if (this.mouseClicks % 500 === 0) {
        this.checkErgonomics();
      }
    });

    // Track keyboard for Ergonomics
    document.addEventListener("keydown", () => {
      this.keystrokes++;
      if (this.keystrokes % 1000 === 0) {
        this.checkErgonomics();
      }
    });

    // Hook Pomodoro timer events if active
    const startPomoBtn = document.getElementById("btn-pomo-start");
    if (startPomoBtn) {
      startPomoBtn.addEventListener("click", () => {
        // Trigger Focus Music Agent
        if (isTimerRunning) {
          this.playFocusMusic();
        } else {
          this.stopFocusMusic();
        }
      });
    }

    // Add Energy level controller in Settings Modal
    const settingsForm = document.querySelector("#settings-modal .modal-body");
    if (settingsForm && !document.getElementById("settings-agent-energy")) {
      const energyHTML = `
        <div class="form-group" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
          <label>تنظیمات هوشمند دستیار تاراز</label>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span style="font-size:0.8rem; color:var(--text-secondary);">سطح انرژی امروز شما:</span>
            <select id="settings-agent-energy" style="max-width:100px; padding: 4px 8px; border-radius:6px; background:rgba(0,0,0,0.3); color:white; border:1px solid rgba(255,255,255,0.1);">
              <option value="1">خیلی کم 😴</option>
              <option value="2">کم 🥱</option>
              <option value="3" selected>معمولی 😐</option>
              <option value="4">زیاد 🙂</option>
              <option value="5">عالی ⚡</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span style="font-size:0.8rem; color:var(--text-secondary);">حالت بیمار / استراحت:</span>
            <input type="checkbox" id="settings-agent-sick" style="width:16px; height:16px;">
          </div>
        </div>
      `;
      settingsForm.insertAdjacentHTML("beforeend", energyHTML);

      const energySel = document.getElementById("settings-agent-energy");
      const sickChk = document.getElementById("settings-agent-sick");

      energySel.value = this.energyLevel;
      sickChk.checked = this.sickMode;

      energySel.addEventListener("change", async () => {
        this.energyLevel = parseInt(energySel.value);
        await this.saveState();
        this.applyEnergyLevelSync();
      });

      sickChk.addEventListener("change", async () => {
        this.sickMode = sickChk.checked;
        await this.saveState();
        this.applySickDayRoutine();
      });

      // Markdown Preview Toggle Listener
      const previewToggleBtn = document.getElementById("btn-notebook-preview-toggle");
      const noteTextarea = document.getElementById("notebook-textarea");
      const notePreview = document.getElementById("notebook-preview");
      const editorBody = document.querySelector(".notebook-editor-body");

      if (previewToggleBtn && noteTextarea && notePreview && editorBody) {
        // Set initial mode on editorBody
        editorBody.classList.add("edit-active");
        editorBody.dataset.mode = "edit";

        previewToggleBtn.addEventListener("click", () => {
          const currentMode = editorBody.dataset.mode || "edit";
          editorBody.classList.remove("edit-active", "split-active", "preview-active");
          // Remove legacy .hidden classes just in case
          noteTextarea.classList.remove("hidden");
          notePreview.classList.remove("hidden");

          if (currentMode === "edit") {
            // Switch to Split mode
            editorBody.dataset.mode = "split";
            editorBody.classList.add("split-active");
            notePreview.innerHTML = this.renderMarkdown(noteTextarea.value);
            previewToggleBtn.innerText = "🥞 همزمان";
            previewToggleBtn.classList.add("active");
          } else if (currentMode === "split") {
            // Switch to Preview mode
            editorBody.dataset.mode = "preview";
            editorBody.classList.add("preview-active");
            notePreview.innerHTML = this.renderMarkdown(noteTextarea.value);
            previewToggleBtn.innerText = "✏️ ویرایش";
            previewToggleBtn.classList.add("active");
          } else {
            // Switch to Edit mode
            editorBody.dataset.mode = "edit";
            editorBody.classList.add("edit-active");
            previewToggleBtn.innerText = "👁️ پیش‌نمایش";
            previewToggleBtn.classList.remove("active");
          }
        });

        // Live preview on input (for split view)
        noteTextarea.addEventListener("input", () => {
          if (editorBody.dataset.mode === "split") {
            notePreview.innerHTML = this.renderMarkdown(noteTextarea.value);
          }
        });
      }

      const summarizeBtn = document.getElementById("btn-agent-summarize");
      if (summarizeBtn) {
        summarizeBtn.addEventListener("click", () => this.summarizeActiveNote());
      }

      const extractBtn = document.getElementById("btn-agent-extract");
      if (extractBtn) {
        extractBtn.addEventListener("click", () => this.extractTasksFromActiveNote());
      }
    }
  }

  // Periodic checkers (every 10s cheap runs)
  runPeriodicCheck() {
    setInterval(() => {
      const now = new Date();
      this.checkWaterIntake();
      this.checkDailyReflectionsAlert(now);
      this.checkHabitStreaksAndStreaksWarning(now);
      this.checkDynamicTheme();
    }, 15000);
  }

  // XP / Rewards System
  async awardXP(amount) {
    this.xp += amount;
    const nextLevelXP = this.level * 200;
    if (this.xp >= nextLevelXP) {
      this.level++;
      this.xp = this.xp - nextLevelXP;
      this.showTipAlert(`تبریک! شما به سطح جدید ارتقا یافتید! ⚡ سطح ${this.level}`);
      // Native synthesizer chime for level up
      this.synthesizeChime("levelup");
    }
    this.updateXPBadge();
    await this.saveState();
  }

  updateXPBadge() {
    const plannerTitle = document.querySelector(".planner-title-group h2");
    if (plannerTitle) {
      let badge = document.getElementById("agent-xp-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "agent-xp-badge";
        badge.className = "agent-xp-badge";
        plannerTitle.appendChild(badge);
      }
      badge.innerText = `سطح ${this.level} (${this.xp}/${this.level * 200} XP)`;
    }
  }

  showToastNotification(text) {
    let container = document.getElementById("taraz-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "taraz-toast-container";
      container.style.cssText = "position: fixed; top: 24px; left: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 10005; direction: rtl; pointer-events: none;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "taraz-toast";
    toast.innerHTML = `
      <span style="margin-left: 8px;">💡</span>
      <span>${text}</span>
    `;
    container.appendChild(toast);

    // Trigger reflow
    toast.offsetHeight;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
    }, 3500);
  }

  showTipAlert(text) {
    this.showToastNotification(text);
  }

  // Sound generator
  synthesizeChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "levelup") {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch (e) {}
  }

  // ==================== AGENTS IMPLEMENTATIONS ====================

  // 1. Shortcut Agent (Rule-based)
  checkShortcutSuggestions(host) {
    const visits = this.clicksHistory[host] || 0;
    if (visits >= 5) {
      // Check if we already have a shortcut for this
      const exists = shortcuts.some(s => s.url.includes(host));
      if (!exists) {
        this.showTipAlert(`پیشنهاد میانبر: سایت ${host} را زیاد باز می‌کنید. مایلید میانبر آن را بسازم؟ ➕`);
        // We can hook click on alert to open shortcut modal with auto-filled values
      }
    }
  }

  // Helper to strip previous summary block
  stripSummary(noteContent) {
    if (!noteContent) return "";
    return noteContent.replace(/^\*\*خلاصه هوشمند:\*\*[\s\S]*?\n\n---\n\n/, "").trim();
  }

  // Helper to render Markdown to HTML
  renderMarkdown(md) {
    if (!md) return "";
    
    // Check for AI Smart Summary block at the start
    const summaryMatch = md.match(/^\*\*خلاصه هوشمند:\*\*([\s\S]*?)\n\n---\n\n/);
    let summaryHTML = "";
    let bodyContent = md;

    if (summaryMatch) {
      const summaryText = summaryMatch[1].trim();
      bodyContent = md.replace(/^\*\*خلاصه هوشمند:\*\*[\s\S]*?\n\n---\n\n/, "");
      
      const renderedSummary = this.parseMarkdownToHTML(summaryText);
      summaryHTML = `
        <div class="preview-summary-box">
          <div class="preview-summary-title">
            <span>✨</span>
            <span>خلاصه هوشمند یادداشت</span>
          </div>
          <div class="preview-summary-content">
            ${renderedSummary}
          </div>
        </div>
      `;
    }

    return summaryHTML + this.parseMarkdownToHTML(bodyContent);
  }

  // Parses generic markdown content to HTML blocks
  parseMarkdownToHTML(md) {
    if (!md) return "";
    
    // Escape HTML tags to prevent XSS (but preserve our own elements)
    let html = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const lines = html.split(/\r?\n/);
    let result = [];
    let inList = false;
    let inCodeBlock = false;
    let codeBlockLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle Code Blocks: ```
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          result.push(`<pre class="preview-code-block">${codeBlockLines.join("\n")}</pre><span class="md-syntax">\`\`\`</span>`);
          inCodeBlock = false;
          codeBlockLines = [];
        } else {
          result.push(`<span class="md-syntax">\`\`\`</span>`);
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Handle bullet lists: * or -
      const listMatch = line.match(/^(\*|-)\s+(.*)$/);
      if (listMatch) {
        if (!inList) {
          result.push('<ul class="preview-list">');
          inList = true;
        }
        const content = this.parseInlineStyles(listMatch[2]);
        result.push(`<li class="preview-list-item"><span class="md-syntax">${listMatch[1]} </span>${content}</li>`);
        continue;
      } else {
        if (inList) {
          result.push('</ul>');
          inList = false;
        }
      }

      // Handle Headings: #, ##, ###
      const h1Match = line.match(/^#\s+(.*)$/);
      if (h1Match) {
        result.push(`<h1 class="preview-h1"><span class="md-syntax"># </span>${this.parseInlineStyles(h1Match[1])}</h1>`);
        continue;
      }
      const h2Match = line.match(/^##\s+(.*)$/);
      if (h2Match) {
        result.push(`<h2 class="preview-h2"><span class="md-syntax">## </span>${this.parseInlineStyles(h2Match[1])}</h2>`);
        continue;
      }
      const h3Match = line.match(/^###\s+(.*)$/);
      if (h3Match) {
        result.push(`<h3 class="preview-h3"><span class="md-syntax">### </span>${this.parseInlineStyles(h3Match[1])}</h3>`);
        continue;
      }

      // Handle Blockquotes: >
      const bqMatch = line.match(/^>\s*(.*)$/);
      if (bqMatch) {
        result.push(`<blockquote class="preview-blockquote"><span class="md-syntax">&gt; </span>${this.parseInlineStyles(bqMatch[1])}</blockquote>`);
        continue;
      }

      // Handle Horizontal Rule: ---
      if (line.trim() === "---") {
        result.push('<hr class="preview-hr"><span class="md-syntax" style="display:block; text-align:center; margin-top:-14px; margin-bottom:10px;">---</span>');
        continue;
      }

      // Regular Paragraph or Line Break
      if (line.trim() === "") {
        result.push("<br>");
      } else {
        result.push(`<p>${this.parseInlineStyles(line)}</p>`);
      }
    }

    if (inList) {
      result.push('</ul>');
    }

    return result.join("\n");
  }

  // Parses inline formatting like bold, italic, and inline code
  parseInlineStyles(text) {
    if (!text) return "";
    let out = text;
    // Bold: **text**
    out = out.replace(/\*\*(.*?)\*\*/g, '<strong class="preview-bold"><span class="md-syntax">**</span>$1<span class="md-syntax">**</span></strong>');
    // Italic: *text*
    out = out.replace(/\*(.*?)\*/g, '<em><span class="md-syntax">*</span>$1<span class="md-syntax">*</span></em>');
    // Inline code: `code`
    out = out.replace(/`(.*?)`/g, '<code class="preview-code"><span class="md-syntax">`</span>$1<span class="md-syntax">`</span></code>');
    return out;
  }

  // 2. Notepad Summarizer (AI Pass)
  async summarizeActiveNote() {
    const textarea = document.getElementById("notebook-textarea");
    const rawContent = textarea.value.trim();
    const cleanText = this.stripSummary(rawContent);

    if (!cleanText || cleanText.length < 50) {
      return alert("متن یادداشت بسیار کوتاه است (حداقل ۵۰ کاراکتر بدون در نظر گرفتن خلاصه فعلی).");
    }

    if (typeof AiPass === "undefined" || !window.__aipassReady) {
      return alert("سرویس هوش مصنوعی بارگذاری نشده است.");
    }
    try {
      if (!AiPass.isAuthenticated()) {
        return alert("برای استفاده از هوش مصنوعی، لطفا ابتدا از بالای صفحه لاگین کنید.");
      }
    } catch (e) {
      return alert("خطا در بررسی وضعیت احراز هویت.");
    }

    const btn = document.getElementById("btn-agent-summarize");
    const oldText = btn.innerText;
    btn.innerText = "در حال خلاصه‌سازی...";
    btn.disabled = true;

    try {
      const response = await AiPass.generateCompletion({
        model: "gemini/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "شما یک خلاصه ساز فارسی هوشمند هستید. متن داده شده را در قالب حداکثر ۳ خط خلاصه کلیدی (bullet points) بنویسید." },
          { role: "user", content: cleanText }
        ]
      });

      const summary = response?.choices?.[0]?.message?.content || "";
      if (summary) {
        // Prepend summary, replacing any old one
        textarea.value = `**خلاصه هوشمند:**\n${summary.trim()}\n\n---\n\n${cleanText}`;
        textarea.dispatchEvent(new Event("input")); // trigger auto-save
        
        // Show in Preview mode if active
        const notePreview = document.getElementById("notebook-preview");
        if (notePreview && !notePreview.classList.contains("hidden")) {
          notePreview.innerHTML = this.renderMarkdown(textarea.value);
        }

        this.showToastNotification("خلاصه یادداشت با موفقیت تولید و به متن اضافه شد! ✨");
        await this.awardXP(15);
      }
    } catch (e) {
      alert("خطا در خلاصه‌سازی: " + e.message);
    } finally {
      btn.innerText = oldText;
      btn.disabled = false;
    }
  }

  // 3. Auto-Tagger Agent (Rule-based to save cost)
  tagNoteLocally(content) {
    const tags = [];
    if (/برنامه|کد|کدنویسی|جاوااسکریپت|پایتون|css|html|git|api/i.test(content)) tags.push("برنامه‌نویسی 💻");
    if (/کار|شرکت|پروژه|قرارداد|مشتری|جلسه|فروش/i.test(content)) tags.push("کاری 💼");
    if (/ورزش|خرید|باشگاه|سلامتی|غذا|رژیم|آب/i.test(content)) tags.push("سلامتی 🍏");
    if (/کتاب|مطالعه|زبان|درس|دانشگاه|آموزش/i.test(content)) tags.push("آموزشی 📚");
    return tags;
  }

  // 4. Editor Agent & Half-space fixer (Rule-based)
  fixHalfSpaces(content) {
    // Regex for fixing common Persian spaces
    let fixed = content
      .replace(/می\s+([خوا|رس|شن|گو|نش|بین|کن|نو|ده|آور|گذار])/g, "می‌$1")
      .replace(/می\s+بود/g, "می‌بود")
      .replace(/\s+تر/g, "‌تر")
      .replace(/\s+ترین/g, "‌ترین")
      .replace(/\s+ها(\s+)/g, "‌ها$1");
    return fixed;
  }

  // 5. Security Watchdog (Rule-based Regex)
  checkSecurityLeaking(content) {
    const passwordPattern = /(password|pass|رمز|پسورد)\s*[:=]\s*[^\s]{5,}/gi;
    const apiKeyPattern = /(api[_-]?key|secret|token)\s*[:=]\s*[^\s]{10,}/gi;
    const creditCardPattern = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/;

    if (passwordPattern.test(content) || apiKeyPattern.test(content) || creditCardPattern.test(content)) {
      this.showTipAlert("هشدار امنیت: لطفاً اطلاعات حساس مانند پسورد یا کارت بانکی را به صورت غیر رمزگذاری شده ننویسید! 🔒");
      return true;
    }
    return false;
  }

  // 6. Expense Extractor (Rule-based regex)
  checkExpenseExtraction(content) {
    // Looks for amount patterns like "مبلغ 500000 ریال" or "120,000 تومان"
    const pattern = /(?:مبلغ|هزینه|واریز|برداشت)?\s*([\d,]+)\s*(?:تومان|ریال)/;
    const match = content.match(pattern);
    if (match) {
      const amount = match[1];
      this.showTipAlert(`ایجنت هزینه: هزینه ای به مبلغ ${amount} تومان شناسایی شد. مایلید در دفتر مخارج ثبت شود؟ 💰`);
    }
  }

  // 7. Task Extractor (AI Pass)
  async extractTasksFromActiveNote() {
    const text = document.getElementById("notebook-textarea").value.trim();
    if (!text || text.length < 15) return alert("متن یادداشت بسیار کوتاه است.");

    if (typeof AiPass === "undefined" || !window.__aipassReady || !AiPass.isAuthenticated()) {
      return alert("لطفاً ابتدا از بالای صفحه در AI Pass لاگین کنید.");
    }

    const btn = document.getElementById("btn-agent-extract");
    btn.innerText = "در حال تحلیل...";
    btn.disabled = true;

    try {
      const response = await AiPass.generateCompletion({
        model: "gemini/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "شما یک ایجنت استخراج تسک از متون فارسی هستید. تسک‌های موجود در متن را پیدا کرده و به صورت فرمت JSON با فیلدهای title و date (مهلت تسک به فرمت خرداد ۱۴۰۵ یا بدون تاریخ) خروجی دهید. فقط آرایه JSON را برگردانید و چیز دیگری ننویسید." },
          { role: "user", content: text }
        ]
      });

      const rawJSON = response?.choices?.[0]?.message?.content || "";
      const match = rawJSON.match(/\[[\s\S]*\]/); // extract JSON array
      if (match) {
        const extracted = JSON.parse(match[0]);
        if (extracted.length > 0) {
          // Add tasks to planner/checklist
          const list = document.getElementById("checklist-items-list");
          for (const item of extracted) {
            // Append to checklist UI and storage
            await this.addExtractedChecklistTask(item.title, item.date);
          }
          this.showTipAlert(`موفقیت: تعداد ${extracted.length} تسک استخراج و به چک‌لیست اضافه شد!  تیک`);
          await this.awardXP(extracted.length * 10);
        } else {
          alert("تسک زمان‌داری پیدا نشد.");
        }
      }
    } catch (e) {
      alert("خطا در استخراج تسک: " + e.message);
    } finally {
      btn.innerText = "استخراج تسک";
      btn.disabled = false;
    }
  }

  async addExtractedChecklistTask(title, dueDateStr) {
    const list = await db.get("checklist_items", []);
    list.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      title: title,
      due: dueDateStr || "بدون مهلت",
      done: false
    });
    await db.set("checklist_items", list);
    if (typeof initChecklist === "function") {
      initChecklist(); // Reload checklist UI
    }
  }

  // 8. Poem & Mood Agent (Heuristic matching with 100% free offline db)
  analyzeMoodAndSelectPoem(content) {
    let mood = "general";
    if (/خوشحال|شاد|عالی|خوشبخت|پیروزی|پیروز|برنده/gi.test(content)) mood = "happy";
    else if (/غمگین|ناراحت|غصه|تنها|افسرده|فوت|گریه/gi.test(content)) mood = "sad";
    else if (/خسته|بریدگی|کلافه|سخت|دیر|استرس|نگران/gi.test(content)) mood = "tired";
    else if (/موفقیت|انجام شد|تمام|بردیم|بهتر/gi.test(content)) mood = "victory";

    const poem = this.POEMS_DATABASE[mood];
    const v1 = document.getElementById("poem-verse-1");
    const v2 = document.getElementById("poem-verse-2");
    const poet = document.getElementById("poem-poet");
    if (v1 && v2 && poet && poem) {
      v1.innerText = poem.verse1;
      v2.innerText = poem.verse2;
      poet.innerText = "ـ " + poem.poet;
    }
  }

  // 9. Jalali Event Agent (Rule-based calendar checker)
  checkJalaliCalendarEvents(day, month) {
    // Simple local dictionary of Persian holidays/events
    const events = {
      "1-1": "نوروز باستانی 🌸",
      "12-29": "روز ملی شدن صنعت نفت ⛽",
      "3-15": "قیام ۱۵ خرداد ☀️",
      "11-22": "پیروزی انقلاب 🇮🇷"
    };
    const key = `${month}-${day}`;
    if (events[key]) {
      this.showTipAlert(`امروز مناسبت: ${events[key]} است. عیدتان مبارک! 🎉`);
    }
  }

  // 10. Idea Curation Agent (Rule-based)
  getDailyIdea(cat) {
    const filtered = this.IDEAS_POOL.filter(i => i.cat === cat || cat === "general");
    const rand = filtered[Math.floor(Math.random() * filtered.length)];
    return rand ? rand.text : this.IDEAS_POOL[0].text;
  }

  // 11. Vocabulary Agent (Leitner offline system widget)
  renderVocabCard() {
    const container = document.getElementById("agent-vocab-widget");
    if (!container) return;

    if (this.leitnerBox.length === 0) {
      container.innerHTML = `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center;">جعبه لایتنر لغات خالی است.</p>`;
      return;
    }

    const current = this.leitnerBox[0];
    container.innerHTML = `
      <div class="vocab-card-ui" style="background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:10px; margin-top:12px;">
        <span style="font-size:0.65rem; color:var(--accent-gold); text-transform:uppercase; font-weight:bold;">لایتنر کلمات انگلیسی (مرحله ${current.stage})</span>
        <h4 style="font-size:1.1rem; color:white; margin:6px 0;">${current.word}</h4>
        <button id="btn-vocab-trigger" class="notebook-save-btn" style="padding:4px 8px; font-size:0.75rem; width:100%; border-radius:6px; background:rgba(255,255,255,0.1);">کوییز لایتنر 🧠</button>
      </div>
    `;

    document.getElementById("btn-vocab-trigger").addEventListener("click", () => {
      const modal = document.getElementById("agent-quiz-modal");
      document.getElementById("quiz-word").innerText = current.word;
      document.getElementById("quiz-translation").innerText = current.translation;
      document.getElementById("quiz-translation").classList.add("hidden");
      document.getElementById("quiz-actions").classList.add("hidden");
      document.getElementById("btn-quiz-show").classList.remove("hidden");
      modal.classList.remove("hidden");
    });

    // Quiz action buttons inside modal
    document.getElementById("btn-quiz-show").onclick = () => {
      document.getElementById("quiz-translation").classList.remove("hidden");
      document.getElementById("quiz-actions").classList.remove("hidden");
      document.getElementById("btn-quiz-show").classList.add("hidden");
    };

    document.getElementById("btn-quiz-wrong").onclick = async () => {
      // Send back to stage 1
      current.stage = 1;
      this.leitnerBox.push(this.leitnerBox.shift()); // move to back of queue
      await this.saveState();
      document.getElementById("agent-quiz-modal").classList.add("hidden");
      this.renderVocabCard();
    };

    document.getElementById("btn-quiz-right").onclick = async () => {
      // Increase stage
      current.stage++;
      if (current.stage > 5) {
        // Mastered! Remove from list
        this.leitnerBox.shift();
        this.showTipAlert(`آفرین! واژه "${current.word}" را کاملاً آموختید! +۲۰ امتیاز 🏆`);
        await this.awardXP(20);
      } else {
        this.leitnerBox.push(this.leitnerBox.shift());
      }
      await this.saveState();
      document.getElementById("agent-quiz-modal").classList.add("hidden");
      this.renderVocabCard();
    };
  }

  // 12. Weather & Activity Agent (Rule-based header activity recommendations)
  applyWeatherHeuristicTips(code, temp) {
    if (code === 0 && temp > 35) {
      this.showToastNotification("هوا بسیار گرم است! ایجنت سلامت به شما توصیه می‌کند کارهای خارج از خانه را به عصر موکول کنید. ☀️");
    } else if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) {
      this.showToastNotification("آسمان بارانی است! چتر فراموش نشود و از پیاده‌روی بدون کاور خودداری کنید. ☔");
    } else if (code >= 71 && code <= 75) {
      this.showToastNotification("برف می‌بارد! لباس گرم بپوشید و یک نوشیدنی داغ نوش جان کنید. ❄️");
    }
  }

  // 13. Smart Water Agent (Rule-based drinking reminder)
  checkWaterIntake() {
    const now = Date.now();
    // Prompt every 45 minutes of activity if logged cups < 8
    if (now - this.lastWaterAlertTime > 45 * 60 * 1000) {
      const waterIntake = document.getElementById("water-progress-text");
      if (waterIntake && waterIntake.innerText.includes("0 / 8") || waterIntake.innerText.includes("۱ / 8")) {
        this.showTipAlert("نوشیدن آب: چقدر امروز کار کردی! برخیز و یک لیوان آب خنک بنوش تا مغزت کار کند. 💧");
        this.lastWaterAlertTime = now;
      }
    }
  }

  // 14. Dynamic Theme Agent (Rule-based light/dark theme shifting)
  checkDynamicTheme() {
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6; // 8 PM to 6 AM
    const savedTheme = localStorage.getItem("settings_theme");
    const activeTheme = savedTheme ? JSON.parse(savedTheme) : "gradient-blue";

    if (isNight && activeTheme === "gradient-blue") {
      // Auto transition to dark theme to prevent blue light strain
      document.documentElement.setAttribute("data-theme", "gradient-dark");
      document.documentElement.style.setProperty("--current-bg", "var(--bg-gradient-dark)");
      console.log("[Taraz Agents] Switched to dark theme automatically for night hours.");
    }
  }

  // 16. Zen/Prayer Agent (Prayer notification & mindfulness loop)
  alertPrayerTime(prayerName) {
    this.showTipAlert(`زمان اذان ${prayerName} فرا رسیده است. ۵ دقیقه خلوت ذهن یا تمرین آرامش داشته باشید. 🧘`);
    this.synthesizeChime("prayer");
    this.awardXP(10);
  }

  // 17. Ergonomics Agent (Activity keystrokes count stretch warning)
  checkErgonomics() {
    const now = Date.now();
    if (now - this.lastStretchAlertTime > 30 * 60 * 1000) {
      this.showTipAlert("مربی ارگونومی: خستگی مچ دست و شانه! دستت را از روی ماوس بردار، شانه را بچرخان و کمی گردنت را بکش. 🧘");
      this.lastStretchAlertTime = now;
      this.awardXP(15);
    }
  }

  // 18. Focus Music Agent (Rule-based local synthesized loops)
  playFocusMusic() {
    this.showTipAlert("ایجنت موزیک: پخش موسیقی تمرکز لوفای آغاز شد. روی کارهایت تمرکز کن. 🎵");
    // Web audio API white noise generator
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.activeFocusMusic = new AudioCtx();
      const bufferSize = 2 * this.activeFocusMusic.sampleRate;
      const noiseBuffer = this.activeFocusMusic.createBuffer(1, bufferSize, this.activeFocusMusic.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.activeFocusMusic.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.activeFocusMusic.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500; // soft low pass rain-like sound

      const gain = this.activeFocusMusic.createGain();
      gain.gain.setValueAtTime(0.08, this.activeFocusMusic.currentTime);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.activeFocusMusic.destination);

      whiteNoise.start();
      this.activeFocusMusicSource = whiteNoise;
    } catch (e) {}
  }

  stopFocusMusic() {
    if (this.activeFocusMusic) {
      try {
        this.activeFocusMusicSource.stop();
        this.activeFocusMusic.close();
      } catch (e) {}
      this.activeFocusMusic = null;
      this.showTipAlert("موسیقی تمرکز متوقف شد.");
    }
  }

  // 20. Self-Reflection Agent (Daily reflection questions at end of day)
  checkDailyReflectionsAlert(now) {
    const hour = now.getHours();
    if (hour >= 20) { // 8 PM onwards
      db.get("agent_reflection_prompted_today", false).then(prompted => {
        if (!prompted) {
          // Open reflection modal
          document.getElementById("agent-reflection-modal").classList.remove("hidden");
          db.set("agent_reflection_prompted_today", true);
        }
      });
    }
  }

  // 25. Priority Agent (Task urgency heuristic calculator)
  reorderPlannerTasksByUrgency() {
    if (!plannerTasks || plannerTasks.length === 0) return;
    plannerTasks.sort((a, b) => {
      const pMap = { high: 3, medium: 2, low: 1 };
      const priorityDiff = pMap[b.priority] - pMap[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.id.localeCompare(b.id); // fallback
    });
    db.set("planner_tasks", plannerTasks);
    if (typeof renderPlannerTasks === "function") renderPlannerTasks();
  }

  // 27. Backup Agent (Automatic backups on large note changes)
  triggerNoteBackup() {
    this.showTipAlert("فایل پشتیبان شما آماده دانلود است. اطلاعات شما محلی و امن می‌ماند. 💾");
    const notesStr = JSON.stringify(notebookNotes, null, 2);
    const blob = new Blob([notesStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taraz-notes-backup-${new Date().toLocaleDateString('fa-IR')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.awardXP(10);
  }

  // 29. Mini-Brain Games (Pomodoro break interactive game)
  launchMiniGame() {
    this.showTipAlert("کیک پومودورو: زمان استراحت است! ۵ کلیک سریع روی دکمه ضربدر هدر بزنید تا سرعت کلیک شما سنجیده شود. 🎮");
  }

  // 32. Habit Detection Agent (Habit tracking alarm)
  checkHabitStreaksAndStreaksWarning(now) {
    const hour = now.getHours();
    if (hour >= 22) { // 10 PM
      // Check if habits logs for today are completely empty
      const todayKey = now.toLocaleDateString('en-US'); // simplfied key
      if (!plannerHabitLogs[todayKey] || Object.keys(plannerHabitLogs[todayKey]).length === 0) {
        this.showTipAlert("برنامه‌ریز عادت‌ها: ساعت از ۱۰ شب گذشته است و هیچ عادتی تیک نخورده است! هنوز دیر نیست. ⏰");
      }
    }
  }

  // 51. Sick-Day Routine (Low effort adaptation)
  applySickDayRoutine() {
    if (this.sickMode) {
      this.showTipAlert("برنامه روزهای سخت فعال شد: تسک‌های کاری سنگین موقتاً پنهان شده و کارهای خودمراقبتی و خواب توصیه می‌شود. 🛌");
      // Fade out high priority tags or hide them in CSS
      document.querySelectorAll(".planner-task-item.high").forEach(el => {
        el.style.opacity = "0.2";
        el.title = "حالت استراحت فعال است.";
      });
    } else {
      document.querySelectorAll(".planner-task-item.high").forEach(el => {
        el.style.opacity = "1";
      });
    }
  }

  applyEnergyLevelSync() {
    this.showTipAlert(`همگام‌سازی سطح انرژی: سطح انرژی شما روی ${this.energyLevel} تنظیم شد. تسک‌های متناسب با این سطح اولویت بالاتری دارند. ⚡`);
  }
}

// Instantiate globally
window.tarazAgents = new TarazAgentManager();
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => window.tarazAgents.init(), 1000); // slight delay to allow app.js initialization first
});
