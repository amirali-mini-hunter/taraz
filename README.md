# Taraz (تاراز) ⚖️
### Premium Persian Productivity Dashboard & Chrome New Tab Extension
**تاراز | دستیار برنامه‌ریزی، رشد فردی و تب جدید مرورگر**

Taraz is a feature-rich, high-performance Chrome extension designed to replace your new tab page with a beautiful, glassmorphic productivity dashboard. Tailored for Persian users, it includes a Jalali calendar, advanced task planners, habit trackers, and interactive analytics—all packed into a highly polished, zero-dependency, local-first architecture.

تاراز یک افزونه بسیار زیبا و حرفه‌ای برای مرورگر کروم است که صفحه تب جدید شما را با یک داشبورد مدرن رشد فردی و برنامه‌ریزی جایگزین می‌کند. این دستیار شامل تقویم جلالی، برنامه‌ریز کارهای روزانه، ردیاب عادات، تایمر پومودورو، مصرف آب و نمودارهای تحلیل عملکرد پویایِ اختصاصی است.

---

## 🎨 Cohesive Theme System & Aesthetics
Every detail of Taraz has been crafted to deliver a premium, state-of-the-art visual experience:
- **Unified Accent Sync**: When changing themes, all active highlights, progress indicators, calendar glow states, and interactive SVG points dynamically adapt to match the theme.
- **Tinted Glassmorphism**: Cards feature HSL-tinted translucent overlays with heavy background blur filters (`backdrop-filter`).
- **Smooth Animations**: Responsive hover floats, iPhone-style wobble icons during edit mode, and zero-stutter transitions.

### 5 Curated Theme Palettes:
1. **Sapphire Blue (Default)**: Deep navy backdrops with vibrant cyan accents and soft slate-blue glass cards.
2. **Obsidian Dark (Luxury)**: Warm gold and champagne highlights over dark obsidian glass—giving a premium "Gold on Obsidian" luxury appearance.
3. **Twilight Sunset (Aesthetic)**: Rich burgundy and twilight plum backdrops with warm rose-gold and coral accents.
4. **Eucalyptus Sage (Organic)**: Relaxing eucalyptus green and botanical sage accentuation over dark yami jade cards.
5. **Royal Velvet Lavender (Modern)**: Royal purple velvet backdrops paired with pastel lavender and soft violet highlights.

---

## ✨ Features (قابلیت‌ها)

- **📊 Interactive SVG Line Charts**: Fully custom-built responsive vector line charts for monthly and yearly progress. Features grid lines, vertical percentage Y-axis labels, smooth Bezier curves, glowing selection rings, and custom glassmorphic hover tooltips.
- **📅 Jalali Calendar & Time Widgets**: System clock displaying local Jalali date, holiday integration, and a Gregorian-to-Jalali calendar grid with golden active-day pulsing animations.
- **📝 Self-Organizing Planner**: Advanced tasks featuring Priority (High/Medium/Low), Time of Day (Morning/Noon/Evening/Night), estimated durations, and links. Automatically groups tasks by time slot and sorts completed items to the bottom. Includes a roll-over button to transfer incomplete tasks to tomorrow.
- **💧 Visual Water Intake Tracker**: A gorgeous 3D simulated glass cup that fills with liquid and animate waves dynamically as you log your water cups.
- **✅ Circular Checklist with Urgency Labels**: Clean glassmorphic cards with custom circle checkboxes, strikethrough animations, and automatic "Overdue" or "Due Today" status badges.
- **⏱️ Integrated Pomodoro Timer**: An inline Pomodoro widget supporting 25-minute focus intervals and 5-minute breaks with custom digital chimes and notifications.
- **🔋 System Battery Widget**: Displays your current system battery percentage and charging state inside the clock widget.
- **🎵 Native Synthesized Sounds & Confetti**:
  - *No External Assets*: Programmable Web Audio API oscillators synthesize clean digital clicks and success chimes dynamically.
  - *Canvas Confetti*: Spawns particle explosions on an HTML5 canvas when tasks are successfully completed.
- **🚀 Fixed Navigation Sidebar**: Fixed floating sidebar that scrolls smoothly (`smoothscroll-spy`) with throttled scroll listener optimizations to guarantee 60+ FPS scrolling.

---

## 🛠️ Technology Stack (تکنولوژی‌ها)

- **Frontend**: HTML5, Vanilla CSS3 (CSS Variables, Flexbox, Grid, Backdrop Filters).
- **Core Logic**: Modern Vanilla ES6+ JavaScript.
- **Vector Graphics**: Dynamic SVG Paths (Bezier curve calculations for line charts).
- **Storage**: Chrome Extension Storage API with local storage fallback (works 100% offline).
- **Audio & Animations**: Native Web Audio API (real-time sound synthesis), HTML5 Canvas 2D Context.

---

## 📦 Installation (نحوه نصب افزونه)

### English:
1. Clone or download this repository.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `persian-dashboard-extension` directory.
6. Open a new tab in Chrome, accept the override, and enjoy **Taraz**!

### فارسی:
۱. این مخزن را شبیه‌سازی (Clone) کنید یا فایل زیپ را دانلود و استخراج نمایید.
۲. مرورگر گوگل کروم را باز کرده و به آدرس `chrome://extensions/` بروید.
۳. از گوشه بالا سمت راست، گزینه **Developer mode** (حالت توسعه‌دهنده) را فعال کنید.
۴. از گوشه بالا سمت چپ، روی دکمه **Load unpacked** کلیک کنید.
۵. پوشه `persian-dashboard-extension` را انتخاب کنید.
۶. یک تب جدید باز کنید و از دستیار هوشمند **تاراز** لذت ببرید!

---

## ⚖️ License
Licensed under the MIT License.
