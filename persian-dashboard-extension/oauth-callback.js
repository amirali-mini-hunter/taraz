/**
 * AI Pass OAuth callback handler.
 *
 * This page is the registered redirect URI. It must be web-accessible (see
 * manifest.json web_accessible_resources) so Chrome allows the provider to
 * redirect the tab here. It runs in the SAME tab as the dashboard that started
 * login, so sessionStorage still holds the PKCE verifier + state.
 *
 * AiPass.initialize() auto-detects the ?code=&state= params and exchanges the
 * code (redirect flow). On success it emits "login"; we then return to the
 * dashboard (index.html), where the stored token makes the agent authenticated.
 */
(function () {
  function redirectUri() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL("oauth-callback.html");
    }
    return new URL("oauth-callback.html", window.location.href).href;
  }

  function goToDashboard() {
    // Same-origin navigation back to the new-tab dashboard.
    window.location.replace("index.html");
  }

  function showError(msg) {
    var el = document.getElementById("err");
    if (el) {
      el.textContent = msg + " — در حال بازگشت…";
      el.style.display = "block";
    }
    setTimeout(goToDashboard, 2500);
  }

  if (typeof AiPass === "undefined") {
    showError("کتابخانه AI Pass بارگذاری نشد");
    return;
  }

  try {
    // Same config as the dashboard so the token-exchange redirect_uri matches.
    AiPass.initialize({
      clientId: "client_d7dN68jgxdY-B2rf0NFbSg",
      authFlow: "redirect",
      redirectUri: redirectUri(),
      darkMode: true
    });
  } catch (e) {
    showError("خطا در راه‌اندازی: " + (e && e.message));
    return;
  }

  // initialize() kicks off the code exchange asynchronously; return once it lands.
  if (typeof AiPass.on === "function") {
    AiPass.on("login", goToDashboard);
    AiPass.on("tokenError", function (d) {
      showError("ورود ناموفق بود");
    });
  }

  // Fallback: if no event fires (e.g. already authenticated, or a silent path),
  // head back to the dashboard anyway.
  setTimeout(function () {
    try {
      if (AiPass.isAuthenticated()) { goToDashboard(); return; }
    } catch (e) {}
    goToDashboard();
  }, 2000);
})();
