/**
 * Jalali Calendar Utilities and Grid Rendering
 */

const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

const WEEKDAYS_FA = [
  "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"
];

const WEEKDAYS_FULL_FA = [
  "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"
];

// Helper to convert English digits to Persian digits
function toPersianDigits(num) {
  const id = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num.toString().replace(/[0-9]/g, function (w) {
    return id[+w];
  });
}

// Gregorian to Jalali conversion algorithm
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 335];
  let jy, jm, jd;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy2 = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy2 += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy2 += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  jy = jy2;
  return { jy, jm, jd };
}

// Jalali to Gregorian conversion algorithm
function jalaliToGregorian(jy, jm, jd) {
  const sal_a = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let gy, gm, gd;
  const jy2 = jy - 979;
  let j_day_no = 365 * jy2 + Math.floor(jy2 / 33) * 8 + Math.floor(((jy2 % 33) + 3) / 4);
  for (let i = 0; i < jm - 1; ++i) {
    j_day_no += sal_a[i + 1];
  }
  j_day_no += jd - 1;
  let g_day_no = j_day_no + 79;
  let gy2 = 1600 + 400 * Math.floor(g_day_no / 146097); /* 146097 = 365*400 + 400/4 - 400/100 + 400/400 */
  g_day_no %= 146097;
  let leap = true;
  if (g_day_no >= 36525) { /* 36525 = 365*100 + 100/4 */
    g_day_no--;
    gy2 += 100 * Math.floor(g_day_no / 36524); /* 36524 = 365*100 + 100/4 - 1 */
    g_day_no %= 36524;
    if (g_day_no >= 365) {
      g_day_no++;
    } else {
      leap = false;
    }
  }
  gy2 += 4 * Math.floor(g_day_no / 1461); /* 1461 = 365*4 + 1 */
  g_day_no %= 1461;
  if (g_day_no >= 366) {
    leap = false;
    g_day_no--;
    gy2 += Math.floor(g_day_no / 365);
    g_day_no %= 365;
  }
  const g_d_m = [0, 31, (leap ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let i;
  for (i = 1; i <= 12; ++i) {
    if (g_day_no < g_d_m[i]) break;
    g_day_no -= g_d_m[i];
  }
  gy = gy2;
  gm = i;
  gd = g_day_no + 1;
  return { gy, gm, gd };
}

// Get the length of a Jalali month
function getJalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  
  // For Esfand (month 12), check if 30th day exists mathematically
  const g = jalaliToGregorian(jy, 12, 30);
  const j = gregorianToJalali(g.gy, g.gm, g.gd);
  if (j.jy === jy && j.jm === 12 && j.jd === 30) {
    return 30;
  }
  return 29;
}

// Format date into a readable Persian string, e.g. "سه‌شنبه، ۱۲ خرداد ۱۴۰۵"
function formatPersianFullDate(jy, jm, jd, dayOfWeekStr) {
  return `${dayOfWeekStr}، ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

// Calendar View State
let calYear, calMonth;
let todayJalali;
let selectedCalYear, selectedCalMonth, selectedCalDay;

function initCalendar() {
  const now = new Date();
  todayJalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  
  // Set current viewed calendar year and month
  calYear = todayJalali.jy;
  calMonth = todayJalali.jm;

  // Set selected date default to today
  selectedCalYear = todayJalali.jy;
  selectedCalMonth = todayJalali.jm;
  selectedCalDay = todayJalali.jd;

  // Render the calendar
  renderCalendarGrid();

  // Set up event listeners for calendar nav buttons
  document.getElementById("prev-month").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 1) {
      calMonth = 12;
      calYear--;
    }
    renderCalendarGrid();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 12) {
      calMonth = 1;
      calYear++;
    }
    renderCalendarGrid();
  });

  // Setup Date Converter events
  setupDateConverter();
}

function renderCalendarGrid() {
  // Update header title
  document.getElementById("calendar-title").innerText = `${JALALI_MONTHS[calMonth - 1]} ${toPersianDigits(calYear)}`;

  const daysGrid = document.getElementById("calendar-days-grid");
  daysGrid.innerHTML = "";

  // Get Gregorian date of the first day of this Jalali month
  const gFirstDay = jalaliToGregorian(calYear, calMonth, 1);
  const dateObj = new Date(gFirstDay.gy, gFirstDay.gm - 1, gFirstDay.gd);
  
  // Gregorian weekday (0=Sun, 1=Mon, ..., 6=Sat)
  const gWeekday = dateObj.getDay();
  
  // Convert to Jalali weekday offset (where Saturday=0, Sunday=1, ..., Friday=6)
  const offset = (gWeekday + 1) % 7;

  // Add empty placeholders for offset days
  for (let i = 0; i < offset; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    daysGrid.appendChild(emptyCell);
  }

  // Get total days in this Jalali month
  const totalDays = getJalaliMonthLength(calYear, calMonth);

  // Render days
  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    dayCell.innerText = toPersianDigits(day);

    // Identify if Friday (Holiday in Iran, usually highlighted)
    // Saturday + offset + day - 1 index check
    const currentWeekday = (offset + day - 1) % 7;
    if (currentWeekday === 6) { // Friday
      dayCell.classList.add("friday");
    }

    // Highlight today
    if (calYear === todayJalali.jy && calMonth === todayJalali.jm && day === todayJalali.jd) {
      dayCell.classList.add("today");
    }

    // Highlight selected day
    if (calYear === selectedCalYear && calMonth === selectedCalMonth && day === selectedCalDay) {
      dayCell.classList.add("selected");
    }

    // Click event for interactive day selection
    dayCell.addEventListener("click", () => {
      selectedCalYear = calYear;
      selectedCalMonth = calMonth;
      selectedCalDay = day;

      document.querySelectorAll(".calendar-day.selected").forEach(el => el.classList.remove("selected"));
      dayCell.classList.add("selected");

      if (typeof onCalendarDateSelected === "function") {
        onCalendarDateSelected(calYear, calMonth, day);
      }
    });

    daysGrid.appendChild(dayCell);
  }
}

// Setup Date Converter Modal
function setupDateConverter() {
  const tabG2J = document.getElementById("tab-g2j");
  const tabJ2G = document.getElementById("tab-j2g");
  const formG2J = document.getElementById("form-g2j");
  const formJ2G = document.getElementById("form-j2g");
  const btnConvert = document.getElementById("btn-convert");
  const resultText = document.getElementById("converter-result-text");

  let currentTab = "g2j";

  tabG2J.addEventListener("click", () => {
    tabG2J.classList.add("active");
    tabJ2G.classList.remove("active");
    formG2J.classList.remove("hidden");
    formJ2G.classList.add("hidden");
    currentTab = "g2j";
    resultText.innerText = "منتظر ورودی...";
  });

  tabJ2G.addEventListener("click", () => {
    tabJ2G.classList.add("active");
    tabG2J.classList.remove("active");
    formJ2G.classList.remove("hidden");
    formG2J.classList.add("hidden");
    currentTab = "j2g";
    resultText.innerText = "منتظر ورودی...";
  });

  btnConvert.addEventListener("click", () => {
    if (currentTab === "g2j") {
      const gDay = parseInt(document.getElementById("g-day").value);
      const gMonth = parseInt(document.getElementById("g-month").value);
      const gYear = parseInt(document.getElementById("g-year").value);

      if (isNaN(gDay) || isNaN(gYear) || gDay < 1 || gDay > 31) {
        resultText.innerText = "لطفاً مقادیر معتبر وارد کنید.";
        return;
      }

      const res = gregorianToJalali(gYear, gMonth, gDay);
      resultText.innerText = `${toPersianDigits(res.jy)}/${toPersianDigits(res.jm)}/${toPersianDigits(res.jd)} (${JALALI_MONTHS[res.jm - 1]})`;
    } else {
      const jDay = parseInt(document.getElementById("j-day").value);
      const jMonth = parseInt(document.getElementById("j-month").value);
      const jYear = parseInt(document.getElementById("j-year").value);

      if (isNaN(jDay) || isNaN(jYear) || jDay < 1 || jDay > 31) {
        resultText.innerText = "لطفاً مقادیر معتبر وارد کنید.";
        return;
      }

      const res = jalaliToGregorian(jYear, jMonth, jDay);
      const monthNamesEn = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      resultText.innerText = `${res.gy}-${String(res.gm).padStart(2, '0')}-${String(res.gd).padStart(2, '0')} (${monthNamesEn[res.gm - 1]})`;
    }
  });
}
