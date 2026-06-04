# Requirements Definition Document (RDP) for Taraz AI Agents
**Smart Assistant & Planning Notebook System (English Version)**

This document details the technical requirements, architecture, and implementation plan for the 60 AI Agent features proposed for the **Taraz** Chrome Extension. It serves as a developer-oriented blueprint.

---

## 1. Technical Architecture of the AI Agents

As Taraz is a Chrome Extension, maintaining user privacy and ensuring offline functionality are key constraints. The following hybrid architecture is proposed:

1. **Local Large Language Model (Local LLM - Chrome built-in AI)**:
   - Leverage Chrome's built-in `window.ai` / `translation` API (Gemini Nano) for local text summaries, syntax improvements, and lightweight reasoning without calling external servers.
2. **Cloud-Based Large Language Model (Hybrid/Cloud LLM)**:
   - Provide an optional API settings page where the user can enter their own API Keys (e.g., Google Gemini or OpenAI) for more advanced reasoning tasks.
3. **Local Rule-Based & Heuristics Engine**:
   - For proactive triggers and lighter performance optimizations (such as hydration alerts, basic behavioral pattern analysis, dynamic theme switches), use optimized ES6 JS code (regexes, statistical filters) to maintain 60+ FPS scroll performance.
4. **Storage (Chrome Extension Local Storage / IndexedDB)**:
   - Store note history, habit logs, mood scores, and usage frequency in `chrome.storage.local` or a local `IndexedDB` to enable the agent to learn the user's patterns over time.

---

## 2. Section 1: 30 General Dashboard AI Agents

Technical specifications for the 30 general dashboard agent features:

### 2.1. Content & Shortcut Management Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **1** | Shortcut Manager Agent | **Medium** | Hybrid (Rule-based / Local LLM) | **Logic:** Tracks click rates on existing shortcuts and patterns of typed URLs (requires limited `chrome.history` permission). Suggests grouping frequently visited sites into folders.<br>**UI:** Tiny alert banner on the shortcuts card with an "Add Folder" option. |
| **2** | Notepad Summarizer | **High** | AI (Local/Cloud LLM) | **Logic:** Clicking the "Summarize" button in the note editor sends the note text to the LLM to generate a 3-bullet-point summary saved alongside the note.<br>**UI:** A collapsible drawer on the top of the notepad. |
| **3** | Auto-Tagger Agent | **Medium** | AI (Local LLM) | **Logic:** On note editor blur, parses the text to extract key themes and automatically tags the note (e.g., #Coding, #Personal, #Work). Tag colors are stored in DB. |
| **4** | Persian Editor Agent | **High** | Hybrid (Rule-based / Local LLM) | **Logic:** Combines local regex logic for semi-space (نیم‌فاصله) correction with LLM capabilities to fix complex grammatical/spelling errors via a float action button in the notepad. |
| **5** | Security Watchdog | **High** | Rule-based (Regex) | **Logic:** Scans text input in real-time for patterns matching passwords, credit card numbers, API keys, or private keys. Warns the user about saving sensitive data in unencrypted notes. |
| **6** | Expense Extractor | **Medium** | AI (Local LLM) | **Logic:** Detects pasted transaction SMS messages or receipts inside notes, extracts the price, date, and category, and formats them for the expense sheet. |
| **7** | Task Extractor | **High** | AI (Local LLM) | **Logic:** Scans notes to detect deadline-oriented statements (e.g., "Must deliver project by Monday"). Displays a confirmation dialog to automatically append the task to the checklist. |

---

### 2.2. Personalization, Ideas & Content Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **8** | Poem & Mood Agent | **Medium** | AI (Local LLM) | **Logic:** Evaluates the user's general mood based on recently created notes and checked items. Selects a suitable Persian poem from Hafez/Saadi that reflects the current mood.<br>**UI:** Placed in the Greeting & Poem Card. |
| **9** | Jalali Event Agent | **Low** | Hybrid (Rule-based / Local LLM) | **Logic:** Cross-references the Jalali calendar with a local holiday database. Uses the LLM to draft context-appropriate greeting messages (formal or friendly) for holidays. |
| **10** | Idea Curation Agent | **Medium** | AI (Local LLM) | **Logic:** Learns the user's role/interests (Developer, Designer, Writer) and dynamically filters/orders the ideas shown in the Idea Bank panel to prioritize relevant suggestions. |
| **11** | Vocabulary Agent | **Medium** | Hybrid (Rule-based / Local LLM) | **Logic:** Extracts new words written or searched by the user, adds them to a virtual Leitner box system, and offers short multiple-choice vocabulary quiz prompts on the margin. |
| **12** | News Curator Agent | **Low** | AI (Cloud LLM) | **Logic:** Pulls favorite RSS feeds, summarizes headlines, filters clickbait, and renders a brief daily briefing card for the user in the morning. |
| **13** | Code Mentor Agent | **Medium** | AI (Cloud LLM) | **Logic:** Detects code snippets in the notebook and activates a "Code Mentor" helper button to analyze code quality, debug errors, or suggest performance improvements. |
| **14** | Mini-Brain Games | **Low** | Rule-based | **Logic:** Launches simple visual memory puzzles, Persian word association games, or typing speed tests during Pomodoro break intervals without using active LLM resources. |
| **15** | Birthday Agent | **Medium** | AI (Local LLM) | **Logic:** Extracts contact birthdays mentioned in notes, saves them to the local reminder system, and dynamically suggests personalized gift ideas. |

---

### 2.3. Health, Productivity & System Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **16** | Weather & Activity Agent | **Medium** | Rule-based | **Logic:** Monitors weather condition codes fetched from the meteorological API and injects health/activity tips into the header card based on current temperatures or rainfall. |
| **17** | Smart Water Agent | **High** | Rule-based | **Logic:** Uses dynamic interval timers to remind the user to stay hydrated. For instance, if mouse movement/typing is continuous for 2 hours, reminder frequency peaks. |
| **18** | Dynamic Theme Agent | **Medium** | Rule-based | **Logic:** Tracks sunrise/sunset times of the configured city to smoothly shift the dashboard color scheme from bright gradients to dark, warm, blue-light-reduced themes. |
| **19** | Tab Manager Agent | **Medium** | Rule-based | **Logic:** Uses `chrome.tabs` to identify background browser tabs that have been idle for more than 3 hours and suggests closing or bookmarking them to free RAM. |
| **20** | Zen/Prayer Agent | **Low** | Rule-based | **Logic:** Calculates prayer times based on city coordinates and displays a non-intrusive Zen card for breathing exercises or short rest periods during those times. |
| **21** | Ergonomics Agent | **Medium** | Rule-based | **Logic:** Monitors keystroke counts and mouse travel distances. Prompts short wrist and eye relaxation exercises when fatigue thresholds are exceeded. |
| **22** | Focus Music Agent | **Low** | Rule-based | **Logic:** Ingests the current Pomodoro state and plays matching ambient audio loops (white noise, rain, focus Lo-Fi for work; calm tunes for break times). |
| **23** | Web Search Agent | **High** | AI (Cloud LLM) | **Logic:** Runs queries typed into the search widget in the background, summarizes search results from top URLs, and displays a summary preview without forcing tab context switches. |
| **24** | Self-Reflection Agent | **Medium** | AI (Local LLM) | **Logic:** Launches a quick nightly review dialog asking, "How did your day go?". Categorizes user inputs and writes them into a secure mood journal. |
| **25** | Priority Agent | **High** | Hybrid (Rule-based / Local LLM) | **Logic:** Evaluates overdue checklist items and available slots on tomorrow's calendar to rank tasks by urgency and effort using a local weighting algorithm. |
| **26** | Email Digest Agent | **Low** | AI (Cloud LLM) | **Logic:** (If Google OAuth is granted) Fetches and classifies unread email headers (Work, Personal, Promotional) and lists a three-line digest directly on the dashboard. |
| **27** | Backup Agent | **Low** | Rule-based | **Logic:** Counts newly added characters in notes. Triggers an automatic JSON file backup export once changes exceed 1000 characters. |
| **28** | Smart Greeting Agent | **Medium** | AI (Local LLM) | **Logic:** Regenerates a contextual header greeting depending on weather, remaining high-priority tasks, and current calendar goals. |
| **29** | Shopping Budget Agent | **Medium** | Rule-based | **Logic:** Detects cost markers inside notes, tabulates expenses, and alerts the user if they are close to exceeding their weekly spending budget limit. |
| **30** | Restore Agent | **Medium** | Rule-based | **Logic:** Saves up to 5 previous revisions of active notes locally and assists in restoring accidentally deleted sections by displaying a file diff comparison. |

---

## 3. Section 2: 30 Planning Section (Notebook/Habit Tracker) AI Agents

This section operates as a dedicated screen accessible by scrolling down from the main dashboard. It acts as an integrated habit tracker and advanced task planner. All 30 agents below operate in this viewport.

### 3.1. Habit Analytics, Forecasting & Reporting Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **31** | Habit Detection Agent | **High** | AI (Local LLM) | **Logic:** If a core daily habit remains unchecked by 10:00 PM, opens a friendly chat bubble asking, "Did you practice piano today? Should I log it for you?". |
| **32** | Habit Streak Guardian | **High** | Rule-based | **Logic:** Tracks streak counters (e.g., 5 consecutive study days). Triggers motivational alerts when a streak is in jeopardy of being broken. |
| **33** | Habit Report Generator | **High** | AI (Local/Cloud LLM) | **Logic:** At the end of each week/month, aggregates performance logs and prompts the LLM to write a qualitative productivity report summarizing strengths and improvements.<br>**UI:** Renders inside the statistics panel. |
| **34** | Procrastination Predictor | **Medium** | AI (Local LLM) | **Logic:** Evaluates past habits. If a specific task is pushed back multiple times, alerts the user that this task is at risk of complete abandonment. |
| **35** | Obstacle Analyst | **Medium** | AI (Local LLM) | **Logic:** When a task is skipped, prompts the user to select the obstacle (fatigue, lack of time, complexity). Suggests corrective routines for future slots. |
| **36** | Life Balance Analyzer | **Medium** | Rule-based | **Logic:** Categories are tagged (Health, Work, Creative, Social). Renders a radar/pie chart tracking progress across areas; flags severely neglected categories. |
| **37** | Compound Effect Simulator | **Low** | AI (Local LLM) | **Logic:** Projects habit consistency outcomes. For instance, writes a letter showing how a daily 20-minute reading streak pays off over 1 year. |
| **38** | Peak Productivity Hour | **Medium** | Rule-based | **Logic:** Evaluates the exact timestamps of completed tasks. Identifies and displays the hours of the day when the user performs best. |
| **39** | Virtual Companion | **Low** | Hybrid (Rule-based / Local LLM) | **Logic:** Introduces a gamified buddy avatar that logs habits alongside the user and prompts friendly, supportive progress checks. |
| **40** | Success Archive Agent | **Medium** | AI (Local LLM) | **Logic:** Archives major task completions. Displays past achievements when the user reports low energy to boost motivation. |

---

### 3.2. Scheduling, Planning & Goal Management Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **41** | Daily Planner Agent | **High** | AI (Local LLM) | **Logic:** Evaluates pending habits and today's deadlines to compile a step-by-step recommended timeline for the day.<br>**UI:** "Plan My Day" button. |
| **42** | Goal Companion (SMART) | **Medium** | AI (Local/Cloud LLM) | **Logic:** Deconstructs broad goals (e.g., "Learn Python") into granular, daily, measurable targets through a short interactive chat. |
| **43** | Virtual Rewards Agent | **Medium** | Rule-based | **Logic:** Awards custom badges, experience points (XP), and virtual level-ups for habit completion and task completion consistency. |
| **44** | Smart Pomodoro Sync | **Medium** | Rule-based | **Logic:** Initiating a task from the planner automatically syncs and sets the main Pomodoro widget duration to the task's estimated difficulty. |
| **45** | Eisenhower Sorting Agent | **Medium** | AI (Local LLM) | **Logic:** Analyzes task descriptions typed by the user and recommends placing them into the appropriate Eisenhower Matrix quadrant (Urgent/Important, etc.). |
| **46** | Reschedule Agent | **High** | Rule-based | **Logic:** Evaluates incomplete tasks at midnight and automatically pushes them to the next available free calendar slot. |
| **47** | Wake-up Helper | **Medium** | Rule-based | **Logic:** Gradually shifts the user's wake-up target 5 minutes earlier day-by-day and outputs sleep recommendations depending on tomorrow's load. |
| **48** | Nightly Review Coach | **Medium** | AI (Local LLM) | **Logic:** Guides the user through a short conversational evening review, summarizes the day's highlights, and logs it. |
| **49** | Weekend Planner | **Low** | AI (Local LLM) | **Logic:** Gauges weekly burnout level and outputs a relaxed schedule for the weekend focused on exercise, reading, or leisure. |
| **50** | Time Tracker Agent | **Medium** | Rule-based | **Logic:** Records actual time spent on tasks using Start/Pause buttons. Compares actual duration with estimated duration to highlight estimation errors. |

---

### 3.3. Coaching, Focus & Wellness Habits Agents

| ID | Agent Name | Priority | AI Usage Type | Technical Implementation & Logic |
| :--- | :--- | :---: | :---: | :--- |
| **51** | Contextual Motivator | **Medium** | AI (Local LLM) | **Logic:** Synthesizes a daily motivational quote addressing the user's specific calendar challenges (e.g., "Today you tackle the difficult report, you got this!"). |
| **52** | Syllabus Splitter | **Medium** | AI (Local/Cloud LLM) | **Logic:** Splits course curricula or book pages into equal daily learning schedules depending on the user's daily study window. |
| **53** | Focus Shield Agent | **Low** | Rule-based | **Logic:** Monitors active tabs during Pomodoro sessions. Warns the user if distracting domains (Social Media) are loaded during focus periods. |
| **54** | Sick-Day Routine | **Medium** | AI (Local LLM) | **Logic:** If the user toggles a "Low Energy/Sick" status, pauses complex tasks and only presents minimal, light wellness habits. |
| **55** | Rule of 3 Guard | **High** | Rule-based | **Logic:** Restricts the user from starring more than 3 tasks per day to eliminate overwhelm and promote deep focus on core priorities. |
| **56** | Sleep Sync Agent | **Low** | AI (Local LLM) | **Logic:** Adjusts morning tasks if the user logs a late bedtime (e.g., shifting complex mental work to later in the day). |
| **57** | Recurring Agent | **Medium** | Rule-based | **Logic:** Sets calendar routines for less-frequent tasks (insurance renewals, health checks, monthly billing) and presents them as distinct alerts. |
| **58** | Energy-Level Sync | **Medium** | Rule-based | **Logic:** Asks the user for their energy level (1-5) in the morning and shifts tasks between high-energy mental work and lighter routines. |
| **59** | Wellness Habit Agent | **Medium** | Hybrid (Rule-based / Local LLM) | **Logic:** Recommends desk exercises, stretching, or brief walks depending on continuous screen time logs. |
| **60** | Planner Backup Agent | **Low** | Rule-based | **Logic:** Automatically backs up habit analytics and checklists to ensure data preservation across extension re-installs. |

---

## 4. Implementation Phasing

To ensure the extension remains lightweight and performs at 60+ FPS, implementation is split into three phases:

### Phase 1: Core Architecture & High-Priority Agents
- Set up local IndexedDB schemas for planner databases.
- Develop the symmetrical, clean glassmorphic scroll-down planner layout.
- Integrate the Jalali date system across all calendar/planning widgets.
- Implement high-priority features: Notepad Summarizer, Task Extractor, Habit Streak Guardian, Reschedule Agent, Rule of 3 Guard, and Habit Detection.

### Phase 2: Heuristic & Productivity Agents
- Integrate rule-based helper engines: Smart Water, Ergonomics, Dynamic Theme, and Energy-Level Sync.
- Implement the local Habit Report Generator.
- Build the SMART Goal Companion and Eisenhower quadrant system.

### Phase 3: Cloud Integrations & Optimization
- Set up API configurations for Cloud LLMs (Gemini/OpenAI) to handle complex tasks (Web Search, Code Mentor, Email Digest).
- Refine memory footprints, assets, and transitions to preserve extension launch performance.
