/**
 * AI Pass Web SDK v2.0.0
 *
 * A standalone OAuth2 + PKCE authentication SDK for web browsers
 * Works with any website - no backend required!
 *
 * Improvements over v1:
 * - Fallback to redirect flow when popups are blocked (mobile Safari, etc.)
 * - Proactive token refresh to prevent unexpected logouts
 * - Better error handling and recovery
 * - No debug logs in production
 * - Fixed security issues (postMessage origin)
 * - AbortController support for cancellation
 * - Optional auto-initialization
 *
 * @license MIT
 * @author AI Pass Team
 * @see https://aipass.one
 */

(function (global) {
    'use strict';

    // ============================================================================
    // CONFIGURATION & CONSTANTS
    // ============================================================================

    const DEFAULT_CONFIG = {
        baseUrl: 'https://aipass.one',
        clientId: null,
        scopes: ['api:access', 'profile:read'],
        redirectUri: window.location.origin + window.location.pathname,
        storageKey: 'aipass_oauth_token',
        popupWidth: 600,
        popupHeight: 700,
        // NEW: Authentication flow preference
        // 'popup' = try popup first, fallback to redirect
        // 'redirect' = always use redirect (better for mobile)
        // 'popup_only' = only popup, fail if blocked
        authFlow: 'popup',
        // NEW: Token refresh settings
        tokenRefreshBuffer: 300000, // 5 minutes before expiry
        enableBackgroundRefresh: true,
        // NEW: Debug mode (disabled by default)
        debug: false,
        // NEW: Force login modal
        requireLogin: false, // Show modal forcing users to login on page load
        // NEW: Dark mode for modals
        darkMode: false, // Enable dark mode for all modals
        // NEW: Auto-mount the [data-aipass-button] auth/balance widget.
        // Set to false ONLY if you intend to call AiPassUI.init() yourself
        // (e.g. you're mounting buttons added dynamically after initialize).
        mountUI: true
    };

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Get dark mode color scheme for modals
     */
    function getDarkModeColors(darkMode) {
        if (darkMode) {
            return {
                dialogBg: '#1f2937',
                textPrimary: '#f3f4f6',
                textSecondary: '#9ca3af',
                borderColor: '#374151',
                inputBg: '#111827',
                inputText: '#f3f4f6',
                inputBorder: '#4b5563',
                warningBg: '#451a03',
                warningText: '#fef3c7',
                closeBtn: '#9ca3af',
                closeBtnHover: '#f3f4f6',
                closeBtnHoverBg: '#374151'
            };
        } else {
            return {
                dialogBg: 'white',
                textPrimary: '#333',
                textSecondary: '#666',
                borderColor: '#eeeeee',
                inputBg: 'white',
                inputText: '#333',
                inputBorder: '#e0e0e0',
                warningBg: '#fff7ed',
                warningText: '#9a3412',
                closeBtn: '#999',
                closeBtnHover: '#333',
                closeBtnHoverBg: '#f3f4f6'
            };
        }
    }

    /**
     * Debug logger - only logs when debug mode is enabled
     */
    let debugEnabled = false;
    function debug(...args) {
        if (debugEnabled) {
            console.log('[AiPass]', ...args);
        }
    }

    /**
     * Detect if we're on a mobile device
     */
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Detect if popups are likely to be blocked
     */
    function popupsLikelyBlocked() {
        // iOS Safari blocks popups not triggered by direct user interaction
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        return isIOS && isSafari;
    }

    /**
     * Generate cryptographically secure random string
     */
    function generateRandomString(length) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);
        return Array.from(randomValues)
            .map(x => charset[x % charset.length])
            .join('');
    }

    /**
     * Base64URL encode (RFC 7636 compliant)
     */
    function base64URLEncode(buffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Generate PKCE challenge from verifier (SHA-256)
     */
    async function generatePKCEChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return base64URLEncode(hash);
    }

    /**
     * Parse query parameters from URL
     */
    function parseQueryString(url) {
        const params = {};
        const urlObj = new URL(url);
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    }

    /**
     * Build query string from object
     */
    function buildQueryString(params) {
        return Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
    }

    /**
     * Parse error response and detect budget exceeded
     * Handles both streaming (double-stringified) and non-streaming errors
     */
    function parseBudgetError(errorText) {
        try {
            // Try parsing as JSON
            const errorData = JSON.parse(errorText);

            // Handle streaming case: error is stringified inside error field
            if (errorData.error && typeof errorData.error === 'string') {
                try {
                    const innerError = JSON.parse(errorData.error);
                    if (innerError.error?.type === 'budget_exceeded') {
                        return {
                            isBudgetError: true,
                            message: innerError.error.message,
                            spend: extractNumberFromMessage(innerError.error.message, 'Spend='),
                            budget: extractNumberFromMessage(innerError.error.message, 'Budget=')
                        };
                    }
                } catch (e) {
                    // Not a JSON string, continue
                }
            }

            // Handle non-streaming case: error is an object
            if (errorData.error?.type === 'budget_exceeded') {
                return {
                    isBudgetError: true,
                    message: errorData.error.message,
                    spend: extractNumberFromMessage(errorData.error.message, 'Spend='),
                    budget: extractNumberFromMessage(errorData.error.message, 'Budget=')
                };
            }
        } catch (e) {
            // Not JSON, return false
        }

        return { isBudgetError: false };
    }

    /**
     * Extract number from error message
     */
    function extractNumberFromMessage(message, prefix) {
        try {
            const startIndex = message.indexOf(prefix);
            if (startIndex === -1) return null;

            const numberStart = startIndex + prefix.length;
            const numberEnd = message.indexOf(',', numberStart);
            const numberStr = numberEnd === -1
                ? message.substring(numberStart)
                : message.substring(numberStart, numberEnd);

            return parseFloat(numberStr.trim());
        } catch (e) {
            return null;
        }
    }

    /**
     * Show budget exceeded modal with payment options
     */
    function showBudgetExceededModal(spend, budget, baseUrl) {
        // Check if modal already exists
        if (document.getElementById('aipass-budget-modal')) return;

        const remainingBalance = budget && spend ? (budget - spend) : (spend ? -spend : 0);
        const balanceFormatted = `$${remainingBalance.toFixed(2)}`;
        const balanceColor = remainingBalance < 0 ? '#dc2626' : '#4F46E5'; // red if negative, purple if positive

        const modal = document.createElement('div');
        modal.id = 'aipass-budget-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            animation: aipass-fadeIn 0.3s ease-out;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 24px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            animation: aipass-slideUp 0.3s ease-out;
            border: 1px solid rgba(0,0,0,0.06);
        `;

        dialog.innerHTML = `
            <style>
                @keyframes aipass-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes aipass-slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes aipass-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                }
                .aipass-payment-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(0,0,0,0.15) !important;
                    background: #000000 !important;
                }
                .aipass-payment-btn:active {
                    transform: translateY(0);
                }

                /* Mobile Responsive Styles */
                @media (max-width: 480px) {
                    #aipass-budget-modal .aipass-payment-grid {
                        grid-template-columns: 1fr !important;
                        gap: 12px !important;
                    }
                    #aipass-budget-modal .aipass-payment-btn {
                        font-size: 1.2rem !important;
                        padding: 16px !important;
                    }
                    #aipass-budget-modal .aipass-logo-container {
                        margin-bottom: 15px !important;
                    }
                    #aipass-budget-modal .aipass-warning-box {
                        flex-direction: column !important;
                        text-align: center !important;
                    }
                    #aipass-budget-modal .aipass-warning-text {
                        text-align: center !important;
                    }
                }

                @media (max-width: 360px) {
                    #aipass-budget-modal .aipass-payment-btn {
                        font-size: 1.1rem !important;
                        padding: 14px !important;
                    }
                    #aipass-budget-modal .aipass-payment-btn-tax {
                        font-size: 0.6rem !important;
                    }
                }
            </style>
            <div style="text-align: center;">
                <!-- AI Pass Logo -->
                <div class="aipass-logo-container" style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px; background-color: white; padding: 6px 10px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); width: fit-content; margin-left: auto; margin-right: auto;">
                    <div style="background-color: #4F46E5; color: white; font-weight: bold; font-size: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-right: 6px; position: relative; overflow: hidden; z-index: 1;">
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); clip-path: polygon(0 0, 41.4% 0, 70.7% 29.3%, 0 100%); z-index: -1;"></div>
                        AI
                    </div>
                    <div style="color: #111111; font-size: 20px; font-weight: 900; letter-spacing: -0.5px;">Pass</div>
                </div>

                <!-- Warning Message -->
                <div class="aipass-warning-box" style="background-color: #fff7ed; color: #9a3412; border-radius: 8px; padding: 15px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; animation: aipass-pulse 2s infinite;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <div class="aipass-warning-text" style="text-align: left;">
                        <strong style="display: block; font-size: 15px;">Your balance is low (<span style="color: ${balanceColor};">${balanceFormatted}</span>)</strong>
                        <p style="margin: 5px 0 0 0; font-size: 14px;">Please add funds to continue using AI services.</p>
                    </div>
                </div>

                <!-- Payment Options Section -->
                <div id="aipass-payment-section">
                    <p style="color: #666; margin-bottom: 15px; font-size: 0.95rem;">Select amount to add. Invoice sent via email automatically.</p>

                    <!-- Payment Amount Buttons -->
                    <div class="aipass-payment-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                        <button class="aipass-payment-btn" data-amount="1" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $1
                        </button>
                        <button class="aipass-payment-btn" data-amount="5" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $5
                        </button>
                        <button class="aipass-payment-btn" data-amount="10" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $10
                        </button>
                    </div>

                    <!-- Or Divider -->
                    <div style="text-align: center; color: #999; margin: 20px 0; position: relative;">
                        <span style="background: white; padding: 0 10px; position: relative; z-index: 1;">or</span>
                        <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #ddd; z-index: 0;"></div>
                    </div>

                    <!-- Gift Card Button -->
                    <button id="aipass-show-giftcard" style="width: 100%; padding: 12px; background: transparent; color: #111111; border: 1px solid rgba(0,0,0,0.1); border-radius: 9999px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s; margin-bottom: 12px;">
                        Have a Gift Card?
                    </button>

                    <!-- Go to Dashboard Button -->
                    <button id="aipass-goto-dashboard" style="width: 100%; padding: 12px; background: transparent; color: #333; border: 1px solid rgba(0,0,0,0.1); border-radius: 9999px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#111'; this.style.color='#111';" onmouseout="this.style.borderColor='rgba(0,0,0,0.1)'; this.style.color='#333';">
                        Go to Dashboard
                    </button>
                </div>

                <!-- Gift Card Section (Hidden) -->
                <div id="aipass-giftcard-section" style="display: none;">
                    <button id="aipass-back-to-payment" style="margin-bottom: 20px; padding: 8px 15px; background: transparent; color: #4F46E5; border: none; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; gap: 5px;">
                        ← Back to payment options
                    </button>

                    <p style="color: #666; margin-bottom: 20px; text-align: left;">Enter your gift card code to add funds to your account.</p>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333; text-align: left;">Gift Card Code</label>
                        <input
                            type="text"
                            id="aipass-giftcard-code"
                            placeholder="QUICK-5-A"
                            autocomplete="off"
                            style="width: 100%; padding: 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1.1rem; font-family: monospace; text-transform: uppercase; box-sizing: border-box; outline: none; transition: border-color 0.2s; color: #333;"
                        />
                    </div>

                    <div id="aipass-giftcard-message" style="display: none; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 0.95rem;"></div>

                    <button id="aipass-redeem-giftcard" style="width: 100%; padding: 14px 24px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 10px 15px rgba(0,0,0,0.1);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 25px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 15px rgba(0,0,0,0.1)';">
                        Redeem Gift Card
                    </button>
                </div>

                <!-- Close Button -->
                <button id="aipass-close-modal" style="width: 100%; padding: 12px; background: transparent; color: #999; border: none; border-radius: 8px; font-size: 0.9rem; cursor: pointer; margin-top: 15px;">
                    Close
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Get elements
        const paymentSection = dialog.querySelector('#aipass-payment-section');
        const giftcardSection = dialog.querySelector('#aipass-giftcard-section');
        const paymentBtns = dialog.querySelectorAll('.aipass-payment-btn');
        const showGiftcardBtn = dialog.querySelector('#aipass-show-giftcard');
        const backToPaymentBtn = dialog.querySelector('#aipass-back-to-payment');
        const giftcardCodeInput = dialog.querySelector('#aipass-giftcard-code');
        const redeemGiftcardBtn = dialog.querySelector('#aipass-redeem-giftcard');
        const giftcardMessage = dialog.querySelector('#aipass-giftcard-message');
        const dashboardBtn = dialog.querySelector('#aipass-goto-dashboard');
        const closeBtn = dialog.querySelector('#aipass-close-modal');

        // Show gift card section
        showGiftcardBtn.addEventListener('click', () => {
            paymentSection.style.display = 'none';
            giftcardSection.style.display = 'block';
            giftcardCodeInput.value = '';
            giftcardMessage.style.display = 'none';
        });

        // Back to payment
        backToPaymentBtn.addEventListener('click', () => {
            giftcardSection.style.display = 'none';
            paymentSection.style.display = 'block';
        });

        // Payment amount buttons
        paymentBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const amount = btn.dataset.amount;

                // Disable all buttons
                paymentBtns.forEach(b => b.disabled = true);
                btn.textContent = 'Processing...';

                try {
                    // Get ApiClient instance from window.AiPass
                    const apiClient = window.AiPass?.apiClient;
                    if (!apiClient) {
                        throw new Error('API client not available');
                    }

                    const response = await apiClient.request('/api/v1/payment/create-checkout-session', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseFloat(amount) })
                    });

                    if (response.success && response.data.checkoutUrl) {
                        // Redirect to Stripe
                        window.location.href = response.data.checkoutUrl;
                    } else {
                        alert('Failed to create checkout session: ' + (response.message || 'Unknown error'));
                        paymentBtns.forEach(b => b.disabled = false);
                        btn.innerHTML = `<div>$${amount}</div>`;
                    }
                } catch (error) {
                    console.error('Error creating checkout session:', error);
                    alert('Failed to create checkout session: ' + error.message);
                    paymentBtns.forEach(b => b.disabled = false);
                    btn.innerHTML = `<div>$${amount}</div>`;
                }
            });
        });

        // Redeem gift card
        const redeemGiftCard = async () => {
            const code = giftcardCodeInput.value.trim().toUpperCase();

            if (!code) {
                showGiftcardMessage('Please enter a gift card code', false);
                return;
            }

            redeemGiftcardBtn.disabled = true;
            redeemGiftcardBtn.textContent = 'Redeeming...';

            try {
                const apiClient = window.AiPass?.apiClient;
                if (!apiClient) {
                    throw new Error('API client not available');
                }

                const response = await apiClient.request('/api/v1/giftcard/redeem', {
                    method: 'POST',
                    body: JSON.stringify({ code: code })
                });

                if (response.success) {
                    const data = response.data;
                    showGiftcardMessage(
                        `Success! $${data.amountAdded} has been added to your account. New balance: $${data.newBalance}`,
                        true
                    );

                    // Emit balance update event
                    if (window.AiPass) {
                        window.AiPass.emit('balanceUpdated', {
                            balance: data.newBalance,
                            amountAdded: data.amountAdded
                        });
                    }

                    // Close modal after 2 seconds and reload page
                    setTimeout(() => {
                        modal.remove();
                        window.location.reload();
                    }, 2000);
                } else {
                    showGiftcardMessage(response.error || response.message || 'Failed to redeem gift card', false);
                }
            } catch (error) {
                console.error('Error redeeming gift card:', error);
                // Try to parse error message from response
                let errorMessage = 'An error occurred while redeeming the gift card';
                if (error.message) {
                    try {
                        const jsonMatch = error.message.match(/\{.*\}/);
                        if (jsonMatch) {
                            const errorData = JSON.parse(jsonMatch[0]);
                            errorMessage = errorData.error || errorData.message || error.message;
                        } else {
                            errorMessage = error.message;
                        }
                    } catch (e) {
                        errorMessage = error.message;
                    }
                }
                showGiftcardMessage(errorMessage, false);
            } finally {
                redeemGiftcardBtn.disabled = false;
                redeemGiftcardBtn.textContent = 'Redeem Gift Card';
            }
        };

        function showGiftcardMessage(message, isSuccess) {
            giftcardMessage.textContent = message;
            giftcardMessage.style.display = 'block';
            giftcardMessage.style.backgroundColor = isSuccess ? '#d1fae5' : '#fee2e2';
            giftcardMessage.style.color = isSuccess ? '#065f46' : '#991b1b';
        }

        redeemGiftcardBtn.addEventListener('click', redeemGiftCard);

        // Allow Enter key in gift card input
        giftcardCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                redeemGiftCard();
            }
        });

        // Focus input when changing border color
        giftcardCodeInput.addEventListener('focus', () => {
            giftcardCodeInput.style.borderColor = '#9d4edd';
        });
        giftcardCodeInput.addEventListener('blur', () => {
            giftcardCodeInput.style.borderColor = '#e0e0e0';
        });

        // Dashboard button
        const dashboardUrl = `${baseUrl}/panel/dashboard.html`;
        dashboardBtn.addEventListener('click', () => {
            window.open(dashboardUrl, '_blank');
            modal.remove();
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    /**
     * Show account/balance modal when user clicks AI Pass button while logged in
     */
    function showAccountModal(balance, baseUrl, oauth2Manager, darkMode = false) {
        // Check if modal already exists
        if (document.getElementById('aipass-account-modal')) return;

        const colors = getDarkModeColors(darkMode);
        const balanceAmount = parseFloat(balance);
        const balanceFormatted = `$${balanceAmount.toFixed(2)}`;
        const balanceColor = balanceAmount < 0 ? '#dc2626' : '#4F46E5';
        const balanceStatus = balanceAmount < 0 ? 'low' : 'good';

        const modal = document.createElement('div');
        modal.id = 'aipass-account-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, ${darkMode ? '0.85' : '0.7'});
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            animation: aipass-fadeIn 0.3s ease-out;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: ${colors.dialogBg};
            border-radius: 24px;
            padding: 40px;
            max-width: 440px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            animation: aipass-slideUp 0.3s ease-out;
            border: 1px solid ${colors.borderColor};
            position: relative;
        `;

        dialog.innerHTML = `
            <style>
                @keyframes aipass-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes aipass-slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .aipass-payment-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(0,0,0,0.15) !important;
                    background: #000000 !important;
                }
                .aipass-payment-btn:active {
                    transform: translateY(0);
                }
                .aipass-logout-btn:hover {
                    background: rgba(0,0,0,0.05) !important;
                    color: #111 !important;
                    border-color: #111 !important;
                }

                /* Mobile Responsive Styles */
                @media (max-width: 480px) {
                    #aipass-account-modal .aipass-payment-grid {
                        grid-template-columns: 1fr !important;
                        gap: 12px !important;
                    }
                    #aipass-account-modal .aipass-payment-btn {
                        font-size: 1.2rem !important;
                        padding: 16px !important;
                    }
                }
            </style>
            <div style="text-align: center;">
                <!-- Close Button -->
                <button id="aipass-close-btn" style="position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 24px; color: ${colors.closeBtn}; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s;" onmouseover="this.style.background='${colors.closeBtnHoverBg}'; this.style.color='${colors.closeBtnHover}'" onmouseout="this.style.background='none'; this.style.color='${colors.closeBtn}'">×</button>

                <!-- AI Pass Logo -->
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px; background-color: ${darkMode ? '#374151' : 'white'}; padding: 6px 10px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0, 0, 0, ${darkMode ? '0.3' : '0.1'}); width: fit-content; margin-left: auto; margin-right: auto;">
                    <div style="background-color: #4F46E5; color: white; font-weight: bold; font-size: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-right: 6px; position: relative; overflow: hidden; z-index: 1;">
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); clip-path: polygon(0 0, 41.4% 0, 70.7% 29.3%, 0 100%); z-index: -1;"></div>
                        AI
                    </div>
                    <div style="color: ${darkMode ? 'white' : '#111111'}; font-size: 20px; font-weight: 900; letter-spacing: -0.5px;">Pass</div>
                </div>

                <!-- Balance Display -->
                <div style="background: ${darkMode ? 'linear-gradient(135deg, #374151, #1f2937)' : 'linear-gradient(135deg, #f8f9fa, #e9ecef)'}; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                    <p style="color: ${colors.textSecondary}; margin: 0 0 8px 0; font-size: 0.9rem;">Your Balance</p>
                    <h2 style="margin: 0; font-size: 2.5rem; color: ${balanceColor}; font-weight: bold;">${balanceFormatted}</h2>
                </div>

                <!-- Payment Options Section -->
                <div id="aipass-payment-section">
                    <p style="color: ${colors.textSecondary}; margin-bottom: 15px; font-size: 0.95rem;">Add funds to your account</p>

                    <!-- Payment Amount Buttons -->
                    <div class="aipass-payment-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                        <button class="aipass-payment-btn" data-amount="1" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $1
                        </button>
                        <button class="aipass-payment-btn" data-amount="5" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $5
                        </button>
                        <button class="aipass-payment-btn" data-amount="10" style="padding: 14px 8px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 8px rgba(0,0,0,0.08);">
                            $10
                        </button>
                    </div>

                    <!-- Gift Card Section -->
                    <div style="border-top: 1px solid ${colors.borderColor}; padding-top: 20px; margin-top: 20px;">
                        <p style="color: ${colors.textSecondary}; margin-bottom: 12px; font-size: 0.9rem;">Have a gift card?</p>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="aipass-giftcard-input" placeholder="Enter gift card code" style="flex: 1; padding: 12px 16px; background: ${colors.inputBg}; border: 1px solid ${colors.inputBorder}; border-radius: 9999px; font-size: 0.9rem; outline: none; color: ${colors.inputText};">
                            <button id="aipass-redeem-btn" style="padding: 12px 20px; background: #111111; color: white; border: none; border-radius: 9999px; font-weight: 600; font-size: 0.9rem; cursor: pointer; white-space: nowrap; transition: all 0.2s;">Redeem</button>
                        </div>
                        <div id="aipass-giftcard-message" style="margin-top: 10px; padding: 10px; border-radius: 12px; font-size: 0.9rem; display: none;"></div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; margin-top: 25px;">
                    <button id="aipass-dashboard-btn" style="flex: 1; padding: 12px; background: #111111; color: white; border: none; border-radius: 9999px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        Dashboard
                    </button>
                    <button id="aipass-logout-btn" class="aipass-logout-btn" style="flex: 1; padding: 12px; background: transparent; color: #333; border: 1px solid rgba(0,0,0,0.1); border-radius: 9999px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        Disconnect
                    </button>
                </div>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Get elements
        const closeBtn = dialog.querySelector('#aipass-close-btn');
        const paymentBtns = dialog.querySelectorAll('.aipass-payment-btn');
        const giftcardInput = dialog.querySelector('#aipass-giftcard-input');
        const redeemBtn = dialog.querySelector('#aipass-redeem-btn');
        const giftcardMessage = dialog.querySelector('#aipass-giftcard-message');
        const dashboardBtn = dialog.querySelector('#aipass-dashboard-btn');
        const logoutBtn = dialog.querySelector('#aipass-logout-btn');

        // Payment button handlers
        paymentBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const amount = btn.dataset.amount;
                btn.disabled = true;
                btn.style.opacity = '0.6';

                try {
                    const apiClient = window.AiPass?.apiClient;
                    if (!apiClient) {
                        throw new Error('API client not available');
                    }

                    const response = await apiClient.request('/api/v1/payment/create-checkout-session', {
                        method: 'POST',
                        body: JSON.stringify({ amount: parseFloat(amount) })
                    });

                    if (response.success && response.data.checkoutUrl) {
                        window.location.href = response.data.checkoutUrl;
                    } else {
                        alert('Failed to create payment session');
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    }
                } catch (error) {
                    console.error('Payment error:', error);
                    alert('Failed to create checkout session: ' + error.message);
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            });
        });

        // Gift card redemption
        function showGiftcardMessage(message, isSuccess) {
            giftcardMessage.textContent = message;
            giftcardMessage.style.display = 'block';
            giftcardMessage.style.backgroundColor = isSuccess ? '#d1fae5' : '#fee2e2';
            giftcardMessage.style.color = isSuccess ? '#065f46' : '#991b1b';
        }

        const redeemGiftCard = async () => {
            const code = giftcardInput.value.trim();
            if (!code) {
                showGiftcardMessage('Please enter a gift card code', false);
                return;
            }

            redeemBtn.disabled = true;
            redeemBtn.textContent = 'Redeeming...';

            try {
                const apiClient = window.AiPass?.apiClient;
                if (!apiClient) {
                    throw new Error('API client not available');
                }

                const response = await apiClient.request('/api/v1/giftcard/redeem', {
                    method: 'POST',
                    body: JSON.stringify({ code: code })
                });

                if (response.success) {
                    const data = response.data;
                    showGiftcardMessage(
                        `Success! $${data.amountAdded} added. New balance: $${data.newBalance}`,
                        true
                    );

                    // Emit balance update event
                    if (window.AiPass) {
                        window.AiPass.emit('balanceUpdated', {
                            balance: data.newBalance,
                            amountAdded: data.amountAdded
                        });
                    }

                    // Update balance display in modal
                    setTimeout(() => {
                        modal.remove();
                        window.location.reload();
                    }, 2000);
                } else {
                    showGiftcardMessage(response.error || response.message || 'Failed to redeem gift card', false);
                }
            } catch (error) {
                console.error('Error redeeming gift card:', error);
                // Try to parse error message from response
                let errorMessage = 'An error occurred';
                if (error.message) {
                    // Check if error message contains JSON
                    try {
                        const jsonMatch = error.message.match(/\{.*\}/);
                        if (jsonMatch) {
                            const errorData = JSON.parse(jsonMatch[0]);
                            errorMessage = errorData.error || errorData.message || error.message;
                        } else {
                            errorMessage = error.message;
                        }
                    } catch (e) {
                        errorMessage = error.message;
                    }
                }
                showGiftcardMessage(errorMessage, false);
            } finally {
                redeemBtn.disabled = false;
                redeemBtn.textContent = 'Redeem';
            }
        };

        redeemBtn.addEventListener('click', redeemGiftCard);
        giftcardInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') redeemGiftCard();
        });

        // Dashboard button
        dashboardBtn.addEventListener('click', () => {
            window.open(`${baseUrl}/panel/dashboard.html`, '_blank');
        });

        // Logout button
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                try {
                    await oauth2Manager.logout();
                    modal.remove();
                    window.location.reload();
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Failed to logout');
                }
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    /**
     * Show required login modal (blocks interaction until login)
     */
    function showRequiredLoginModal(oauth2Manager, baseUrl, sdkInstance) {
        // Check if modal already exists
        if (document.getElementById('aipass-required-login-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'aipass-required-login-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            animation: aipass-fadeIn 0.3s ease-out;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 50px 40px;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: aipass-slideUp 0.3s ease-out;
            border: 1px solid #eeeeee;
            text-align: center;
        `;

        dialog.innerHTML = `
            <style>
                @keyframes aipass-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes aipass-slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .aipass-login-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(79, 70, 229, 0.5) !important;
                }
                .aipass-login-btn-primary:active {
                    transform: translateY(0);
                }

                /* Mobile Responsive Styles */
                @media (max-width: 480px) {
                    #aipass-required-login-modal .dialog-container {
                        padding: 30px 20px !important;
                    }
                    #aipass-required-login-modal .aipass-login-btn-primary {
                        padding: 16px !important;
                        font-size: 1.1rem !important;
                    }
                }
            </style>
            <div>
                <!-- AI Pass Logo -->
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 30px; background-color: white; padding: 8px 12px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15); width: fit-content; margin-left: auto; margin-right: auto;">
                    <div style="background-color: #4F46E5; color: white; font-weight: bold; font-size: 24px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-right: 8px; position: relative; overflow: hidden; z-index: 1;">
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); clip-path: polygon(0 0, 41.4% 0, 70.7% 29.3%, 0 100%); z-index: -1;"></div>
                        AI
                    </div>
                    <div style="color: #111111; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">Pass</div>
                </div>

                <!-- Title -->
                <h2 style="color: #333; margin: 0 0 15px 0; font-size: 1.8rem; font-weight: 600;">
                    Login Required
                </h2>

                <!-- Description -->
                <p style="color: #666; margin-bottom: 30px; font-size: 1rem; line-height: 1.6;">
                    This application requires authentication to access AI services.
                    Please log in with your AI Pass account to continue.
                </p>

                <!-- Login Button -->
                <button
                    id="aipass-login-btn-primary"
                    class="aipass-login-btn-primary"
                    style="width: 100%; padding: 18px; background: linear-gradient(135deg, #4F46E5, #312E81); color: white; border: none; border-radius: 12px; font-size: 1.2rem; font-weight: bold; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                        <polyline points="10 17 15 12 10 7"></polyline>
                        <line x1="15" y1="12" x2="3" y2="12"></line>
                    </svg>
                    Login with AI Pass
                </button>

                <!-- Sign up link -->
                <p style="margin-top: 25px; color: #888; font-size: 0.9rem;">
                    Don't have an account?
                    <a id="aipass-signup-link" href="#" style="color: #4F46E5; text-decoration: none; font-weight: 600;">Sign up with Google and get $1 free credit</a>
                </p>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Add spinner animation once
        const spinnerStyle = document.createElement('style');
        spinnerStyle.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(spinnerStyle);

        const loginBtn = dialog.querySelector('#aipass-login-btn-primary');
        const signupLink = dialog.querySelector('#aipass-signup-link');

        const originalLoginHTML = loginBtn.innerHTML;
        const originalSignupHTML = signupLink.innerHTML;

        const startAuth = async (mode) => {
            // Disable both controls during auth
            loginBtn.disabled = true;
            signupLink.style.pointerEvents = 'none';
            signupLink.style.opacity = '0.6';

            if (mode === 'signup') {
                signupLink.innerHTML = 'Opening sign up...';
            } else {
                loginBtn.innerHTML = `
                    <svg style="display: inline-block; animation: spin 1s linear infinite;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Logging in...
                `;
            }

            try {
                await sdkInstance.login({ mode });

                // Wait for the login event to propagate and AiPassUI to update buttons
                // This includes fetching and displaying the balance
                await new Promise(resolve => setTimeout(resolve, 500));

                modal.remove();
            } catch (error) {
                console.error(`${mode === 'signup' ? 'Sign up' : 'Login'} failed:`, error);
                loginBtn.disabled = false;
                signupLink.style.pointerEvents = '';
                signupLink.style.opacity = '';
                loginBtn.innerHTML = originalLoginHTML;
                signupLink.innerHTML = originalSignupHTML;

                const errorMsg = document.createElement('p');
                errorMsg.style.cssText = 'color: #dc2626; margin-top: 15px; font-size: 0.9rem;';
                errorMsg.textContent = `${mode === 'signup' ? 'Sign up' : 'Login'} failed. Please try again.`;
                dialog.appendChild(errorMsg);

                setTimeout(() => errorMsg.remove(), 3000);
            }
        };

        loginBtn.addEventListener('click', () => startAuth('login'));
        signupLink.addEventListener('click', (e) => {
            e.preventDefault();
            startAuth('signup');
        });

        // Remove modal on successful login
        if (oauth2Manager) {
            const handleLogin = () => {
                modal.remove();
            };
            oauth2Manager.once('login', handleLogin);
        }
    }

    /**
     * Dismissible auth-gate modal shown when a generation call is made while
     * the user is not authenticated. Returns a Promise that resolves on
     * successful login and rejects with an AuthRequiredError on dismiss.
     */
    function showAuthGateModal(oauth2Manager, baseUrl, sdkInstance) {
        return new Promise((resolve, reject) => {
            // If a gate is already open, attach to it instead of stacking
            const existing = document.getElementById('aipass-auth-gate-modal');
            if (existing && existing.__aipassGate) {
                existing.__aipassGate.attach(resolve, reject);
                return;
            }

            const modal = document.createElement('div');
            modal.id = 'aipass-auth-gate-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.85); z-index: 999999;
                display: flex; align-items: center; justify-content: center;
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                animation: aipass-fadeIn 0.3s ease-out;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: relative;
                background: white; border-radius: 16px; padding: 50px 40px;
                max-width: 450px; width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: aipass-slideUp 0.3s ease-out;
                border: 1px solid #eeeeee; text-align: center;
            `;

            dialog.innerHTML = `
                <style>
                    @keyframes aipass-fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes aipass-slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    #aipass-auth-gate-modal .aipass-login-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(79, 70, 229, 0.5) !important; }
                    #aipass-auth-gate-modal .aipass-login-btn-primary:active { transform: translateY(0); }
                    #aipass-auth-gate-modal .aipass-gate-close {
                        position: absolute; top: 14px; right: 14px;
                        width: 32px; height: 32px; border-radius: 8px;
                        background: transparent; border: none; cursor: pointer;
                        color: #999; font-size: 22px; line-height: 1;
                        display: flex; align-items: center; justify-content: center;
                        transition: background 0.15s, color 0.15s;
                    }
                    #aipass-auth-gate-modal .aipass-gate-close:hover { background: #f3f4f6; color: #333; }
                    @media (max-width: 480px) {
                        #aipass-auth-gate-modal .dialog-container { padding: 30px 20px !important; }
                        #aipass-auth-gate-modal .aipass-login-btn-primary { padding: 16px !important; font-size: 1.1rem !important; }
                    }
                </style>
                <button class="aipass-gate-close" id="aipass-gate-close" aria-label="Close">&times;</button>
                <div>
                    <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 30px; background-color: white; padding: 8px 12px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15); width: fit-content; margin-left: auto; margin-right: auto;">
                        <div style="background-color: #4F46E5; color: white; font-weight: bold; font-size: 24px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 8px; margin-right: 8px; position: relative; overflow: hidden; z-index: 1;">
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.15); clip-path: polygon(0 0, 41.4% 0, 70.7% 29.3%, 0 100%); z-index: -1;"></div>
                            AI
                        </div>
                        <div style="color: #111111; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">Pass</div>
                    </div>
                    <h2 style="color: #333; margin: 0 0 15px 0; font-size: 1.8rem; font-weight: 600;">Sign in to continue</h2>
                    <p style="color: #666; margin-bottom: 30px; font-size: 1rem; line-height: 1.6;">
                        Sign in with your AI Pass account to run this generation.
                    </p>
                    <button id="aipass-gate-login-btn" class="aipass-login-btn-primary"
                        style="width: 100%; padding: 18px; background: linear-gradient(135deg, #4F46E5, #312E81); color: white; border: none; border-radius: 12px; font-size: 1.2rem; font-weight: bold; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px;">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                            <polyline points="10 17 15 12 10 7"></polyline>
                            <line x1="15" y1="12" x2="3" y2="12"></line>
                        </svg>
                        Login with AI Pass
                    </button>
                    <p style="margin-top: 25px; color: #888; font-size: 0.9rem;">
                        Don't have an account?
                        <a id="aipass-gate-signup-link" href="#" style="color: #4F46E5; text-decoration: none; font-weight: 600;">Sign up with Google and get $1 free credit</a>
                    </p>
                </div>
            `;

            modal.appendChild(dialog);
            document.body.appendChild(modal);

            const waiters = [{ resolve, reject }];
            let settled = false;

            const settle = (kind, value) => {
                if (settled) return;
                settled = true;
                modal.__aipassGate = null;
                document.removeEventListener('keydown', onKey);
                if (unsubscribeLogin) unsubscribeLogin();
                modal.remove();
                for (const w of waiters) {
                    if (kind === 'resolve') w.resolve(value);
                    else w.reject(value);
                }
            };

            modal.__aipassGate = {
                attach(res, rej) { waiters.push({ resolve: res, reject: rej }); }
            };

            const authRequiredError = (msg = 'Authentication required') => {
                const err = new Error(msg);
                err.name = 'AuthRequiredError';
                err.code = 'AUTH_REQUIRED';
                return err;
            };

            const onKey = (e) => {
                if (e.key === 'Escape') settle('reject', authRequiredError('Authentication cancelled'));
            };
            document.addEventListener('keydown', onKey);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) settle('reject', authRequiredError('Authentication cancelled'));
            });

            const closeBtn = dialog.querySelector('#aipass-gate-close');
            closeBtn.addEventListener('click', () => settle('reject', authRequiredError('Authentication cancelled')));

            const loginBtn = dialog.querySelector('#aipass-gate-login-btn');
            const signupLink = dialog.querySelector('#aipass-gate-signup-link');
            const originalLoginHTML = loginBtn.innerHTML;
            const originalSignupHTML = signupLink.innerHTML;

            const startAuth = async (mode) => {
                loginBtn.disabled = true;
                signupLink.style.pointerEvents = 'none';
                signupLink.style.opacity = '0.6';
                if (mode === 'signup') {
                    signupLink.innerHTML = 'Opening sign up...';
                } else {
                    loginBtn.innerHTML = `
                        <svg style="display: inline-block; animation: spin 1s linear infinite;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                        Logging in...
                    `;
                }
                try {
                    await sdkInstance.login({ mode });
                    // Wait briefly for tokens to land; the login event also drives resolve
                    await new Promise(r => setTimeout(r, 300));
                    settle('resolve');
                } catch (error) {
                    console.error(`${mode === 'signup' ? 'Sign up' : 'Login'} failed:`, error);
                    loginBtn.disabled = false;
                    signupLink.style.pointerEvents = '';
                    signupLink.style.opacity = '';
                    loginBtn.innerHTML = originalLoginHTML;
                    signupLink.innerHTML = originalSignupHTML;

                    const errorMsg = document.createElement('p');
                    errorMsg.style.cssText = 'color: #dc2626; margin-top: 15px; font-size: 0.9rem;';
                    errorMsg.textContent = `${mode === 'signup' ? 'Sign up' : 'Login'} failed. Please try again.`;
                    dialog.appendChild(errorMsg);
                    setTimeout(() => errorMsg.remove(), 3000);
                }
            };

            loginBtn.addEventListener('click', () => startAuth('login'));
            signupLink.addEventListener('click', (e) => { e.preventDefault(); startAuth('signup'); });

            const unsubscribeLogin = oauth2Manager
                ? oauth2Manager.once('login', () => settle('resolve'))
                : null;
        });
    }

    // ============================================================================
    // EVENT EMITTER
    // ============================================================================

    class EventEmitter {
        constructor() {
            this._listeners = {};
        }

        on(event, callback) {
            if (!this._listeners[event]) {
                this._listeners[event] = [];
            }
            this._listeners[event].push(callback);
            return () => this.off(event, callback);
        }

        off(event, callback) {
            if (!this._listeners[event]) return;
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        }

        once(event, callback) {
            const onceWrapper = (data) => {
                callback(data);
                this.off(event, onceWrapper);
            };
            this.on(event, onceWrapper);
            return () => this.off(event, onceWrapper);
        }

        emit(event, data) {
            if (!this._listeners[event]) return;
            this._listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in event listener for ${event}:`, e);
                }
            });
        }
    }

    // ============================================================================
    // TOKEN STORAGE
    // ============================================================================

    class TokenStorage {
        constructor(storageKey) {
            this.storageKey = storageKey;
            this.memoryFallback = null; // Fallback if localStorage unavailable
        }

        save(tokenData) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(tokenData));
                this.memoryFallback = tokenData;
                return true;
            } catch (error) {
                // localStorage might be unavailable (private browsing, etc.)
                console.warn('localStorage unavailable, using memory storage:', error);
                this.memoryFallback = tokenData;
                return true;
            }
        }

        load() {
            try {
                const data = localStorage.getItem(this.storageKey);
                if (data) {
                    this.memoryFallback = JSON.parse(data);
                    return this.memoryFallback;
                }
                return this.memoryFallback;
            } catch (error) {
                return this.memoryFallback;
            }
        }

        clear() {
            try {
                localStorage.removeItem(this.storageKey);
            } catch (error) {
                // Ignore
            }
            this.memoryFallback = null;
            return true;
        }

        /**
         * Check if token is expired
         * @param {number} buffer - Buffer time in ms before actual expiry
         */
        isExpired(buffer = 60000) {
            const tokenData = this.load();
            if (!tokenData || !tokenData.expires_at) return true;
            return Date.now() >= (tokenData.expires_at - buffer);
        }

        /**
         * Check if token needs refresh (approaching expiry)
         */
        needsRefresh(buffer = 300000) {
            const tokenData = this.load();
            if (!tokenData || !tokenData.expires_at) return false;
            // Needs refresh if within buffer window but not yet expired
            const timeUntilExpiry = tokenData.expires_at - Date.now();
            return timeUntilExpiry > 0 && timeUntilExpiry <= buffer;
        }

        /**
         * Get time until token expires (in ms)
         */
        getTimeUntilExpiry() {
            const tokenData = this.load();
            if (!tokenData || !tokenData.expires_at) return 0;
            return Math.max(0, tokenData.expires_at - Date.now());
        }
    }

    // ============================================================================
    // OAUTH2 MANAGER
    // ============================================================================

    class OAuth2Manager extends EventEmitter {
        constructor(config) {
            super();
            this.config = config;
            this.storage = new TokenStorage(config.storageKey);
            this.authWindow = null;
            this.pendingAuth = null;
            this.authCheckInterval = null;
            this.authTimeout = null;
            this.refreshTimer = null;
            this.isRefreshing = false;
            this.refreshPromise = null;
        }

        /**
         * Start OAuth2 authorization flow
         * Automatically chooses popup or redirect based on config and environment
         * @param {Object} options
         * @param {boolean} [options.forceRedirect] - Force redirect flow
         * @param {('login'|'signup')} [options.mode] - Open auth page in this mode
         */
        async login(options = {}) {
            const { forceRedirect = false, mode } = options;

            // Determine which flow to use
            let useRedirect = forceRedirect || this.config.authFlow === 'redirect';

            // On mobile or when popups are likely blocked, prefer redirect
            if (!useRedirect && this.config.authFlow === 'popup') {
                if (isMobileDevice() || popupsLikelyBlocked()) {
                    debug('Mobile/Safari detected, using redirect flow');
                    useRedirect = true;
                }
            }

            if (useRedirect) {
                return this._loginWithRedirect({ mode });
            } else {
                return this._loginWithPopup({ mode });
            }
        }

        /**
         * Login using redirect flow (works on mobile)
         */
        async _loginWithRedirect({ mode } = {}) {
            // Generate PKCE parameters
            const codeVerifier = generateRandomString(128);
            const codeChallenge = await generatePKCEChallenge(codeVerifier);
            const state = generateRandomString(32);

            // Store PKCE parameters - these persist across redirect
            sessionStorage.setItem('oauth_state', state);
            sessionStorage.setItem('oauth_verifier', codeVerifier);
            sessionStorage.setItem('oauth_flow', 'redirect');
            sessionStorage.setItem('oauth_return_url', window.location.href);

            // Build authorization URL
            const authParams = {
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUri,
                response_type: 'code',
                scope: this.config.scopes.join(' '),
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            };
            if (mode === 'signup' || mode === 'login') {
                authParams.mode = mode;
            }
            const authUrl = `${this.config.baseUrl}/oauth2/authorize?${buildQueryString(authParams)}`;

            // Redirect to authorization page
            window.location.href = authUrl;

            // Return a promise that never resolves (page will redirect)
            return new Promise(() => { });
        }

        /**
         * Login using popup flow
         */
        async _loginWithPopup({ mode } = {}) {
            if (this.pendingAuth) {
                throw new Error('Authorization already in progress');
            }

            // Generate PKCE parameters
            const codeVerifier = generateRandomString(128);
            const codeChallenge = await generatePKCEChallenge(codeVerifier);
            const state = generateRandomString(32);

            // Store PKCE parameters
            sessionStorage.setItem('oauth_state', state);
            sessionStorage.setItem('oauth_verifier', codeVerifier);
            sessionStorage.setItem('oauth_flow', 'popup');

            // Build authorization URL
            const authParams = {
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUri,
                response_type: 'code',
                scope: this.config.scopes.join(' '),
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            };
            if (mode === 'signup' || mode === 'login') {
                authParams.mode = mode;
            }
            const authUrl = `${this.config.baseUrl}/oauth2/authorize?${buildQueryString(authParams)}`;

            // Calculate popup position
            const left = (window.screen.width - this.config.popupWidth) / 2;
            const top = (window.screen.height - this.config.popupHeight) / 2;

            // Open popup
            this.authWindow = window.open(
                authUrl,
                'AI Pass Authorization',
                `width=${this.config.popupWidth},height=${this.config.popupHeight},left=${left},top=${top}`
            );

            // Check if popup was blocked
            if (!this.authWindow || this.authWindow.closed || typeof this.authWindow.closed === 'undefined') {
                debug('Popup blocked, falling back to redirect flow');

                // Clean up
                sessionStorage.removeItem('oauth_state');
                sessionStorage.removeItem('oauth_verifier');
                sessionStorage.removeItem('oauth_flow');

                // Fallback to redirect if allowed
                if (this.config.authFlow !== 'popup_only') {
                    return this._loginWithRedirect();
                } else {
                    throw new Error(
                        'Popup was blocked by your browser. Please allow popups for this site or try again.'
                    );
                }
            }

            // Return promise that resolves when auth completes
            return new Promise((resolve, reject) => {
                this.pendingAuth = { resolve, reject };
                this._callbackProcessed = false;

                // Message handler for popup communication
                this._messageHandler = async (event) => {
                    // Security: verify origin
                    if (event.origin !== window.location.origin) {
                        return;
                    }

                    // Only accept from our popup
                    if (!this.authWindow || event.source !== this.authWindow) {
                        return;
                    }

                    const data = event.data || {};

                    if (data.type === 'aipass_oauth_callback') {
                        // Prevent duplicate processing
                        if (this._callbackProcessed) return;
                        this._callbackProcessed = true;

                        if (data.error) {
                            const err = new Error(`Authorization failed: ${data.error} - ${data.error_description || ''}`);
                            this._notifyAuthComplete(false, err);
                            return;
                        }

                        // Validate state
                        const expectedState = sessionStorage.getItem('oauth_state');
                        const codeVerifier = sessionStorage.getItem('oauth_verifier');

                        if (!expectedState || data.state !== expectedState) {
                            this._notifyAuthComplete(false, new Error('Invalid state parameter - possible CSRF attack'));
                            return;
                        }

                        if (!codeVerifier) {
                            this._notifyAuthComplete(false, new Error('PKCE verifier not found'));
                            return;
                        }

                        try {
                            const tokenData = await this.exchangeCodeForToken(data.code, codeVerifier);
                            this._cleanupSessionStorage();
                            this._startBackgroundRefresh();
                            this._notifyAuthComplete(true, tokenData);
                        } catch (error) {
                            this._notifyAuthComplete(false, error);
                        }
                    }
                };
                window.addEventListener('message', this._messageHandler);

                // Storage event handler (fallback)
                this._storageHandler = (event) => {
                    if (event.key === 'aipass_auth_complete') {
                        try {
                            const data = JSON.parse(event.newValue);
                            if (data && Date.now() - data.timestamp < 10000) {
                                if (data.success) {
                                    const token = this.storage.load();
                                    if (token) {
                                        this._startBackgroundRefresh();
                                        this._notifyAuthComplete(true, token);
                                    }
                                } else {
                                    this._notifyAuthComplete(false, new Error(data.error || 'Authorization failed'));
                                }
                                localStorage.removeItem('aipass_auth_complete');
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                };
                window.addEventListener('storage', this._storageHandler);

                // Timeout (5 minutes)
                this.authTimeout = setTimeout(() => {
                    this._cleanupAuthFlow();
                    reject(new Error('Authorization timeout (5 minutes). Please try again.'));
                }, 300000);

                // Check if popup closed manually
                this.authCheckInterval = setInterval(() => {
                    if (this.authWindow && this.authWindow.closed) {
                        // Give a small grace period for message to arrive
                        setTimeout(() => {
                            if (!this._callbackProcessed) {
                                this._cleanupAuthFlow();
                                reject(new Error('Authorization cancelled - popup was closed'));
                            }
                        }, 500);
                    }
                }, 500);
            });
        }

        /**
         * Handle OAuth callback - call this on the callback/redirect page
         */
        async handleCallback(callbackUrl = window.location.href) {
            const params = parseQueryString(callbackUrl);
            const flow = sessionStorage.getItem('oauth_flow') || 'redirect';
            const isPopup = !!(window.opener && !window.opener.closed);

            debug('Handling callback, flow:', flow, 'isPopup:', isPopup);

            // If we're in a popup, send data back to opener
            if (isPopup) {
                return this._handlePopupCallback(params);
            }

            // Redirect flow - handle in same window
            return this._handleRedirectCallback(params);
        }

        /**
         * Handle callback in popup window
         */
        async _handlePopupCallback(params) {
            const message = params.error ? {
                type: 'aipass_oauth_callback',
                error: params.error,
                error_description: params.error_description,
                state: params.state
            } : {
                type: 'aipass_oauth_callback',
                code: params.code,
                state: params.state
            };

            // Send to opener with specific origin (security fix)
            const sendToOpener = () => {
                try {
                    window.opener.postMessage(message, window.location.origin);
                } catch (e) {
                    debug('Failed to send to opener:', e);
                }
            };

            // Send multiple times for reliability
            sendToOpener();
            setTimeout(sendToOpener, 100);
            setTimeout(sendToOpener, 300);
            setTimeout(sendToOpener, 600);

            // Close popup
            setTimeout(() => {
                try {
                    window.close();
                } catch (e) {
                    // Show manual close UI
                    this._showPopupCloseUI(!params.error);
                }
            }, 1000);

            return { popup: true, sent: true };
        }

        /**
         * Handle callback in redirect flow (same window)
         */
        async _handleRedirectCallback(params) {
            const expectedState = sessionStorage.getItem('oauth_state');
            const codeVerifier = sessionStorage.getItem('oauth_verifier');
            const returnUrl = sessionStorage.getItem('oauth_return_url');

            // Validate state
            if (!expectedState || params.state !== expectedState) {
                this._cleanupSessionStorage();
                throw new Error('Invalid state parameter - possible CSRF attack');
            }

            // Check for error
            if (params.error) {
                this._cleanupSessionStorage();
                throw new Error(`Authorization failed: ${params.error} - ${params.error_description || ''}`);
            }

            if (!codeVerifier) {
                this._cleanupSessionStorage();
                throw new Error('PKCE verifier not found - session may have expired');
            }

            // Exchange code for token
            const tokenData = await this.exchangeCodeForToken(params.code, codeVerifier);

            // Clean up
            this._cleanupSessionStorage();

            // Clean URL
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);

            // Start background refresh
            this._startBackgroundRefresh();

            // Emit login event
            this.emit('login', tokenData);

            return tokenData;
        }

        /**
         * Show UI for manual popup close
         */
        _showPopupCloseUI(success) {
            const color = success ? '#28a745' : '#dc3545';
            const icon = success ? '✓' : '✕';
            const title = success ? 'Authentication Successful!' : 'Authentication Failed';
            const message = success ? 'Please close this window to continue.' : 'Please close this window and try again.';

            document.body.innerHTML = `
                <div style="padding: 40px; text-align: center; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;">
                    <div style="font-size: 48px; margin-bottom: 20px; color: ${color};">${icon}</div>
                    <h2 style="color: ${color}; margin: 0 0 10px 0;">${title}</h2>
                    <p style="color: #666; margin: 0 0 20px 0;">${message}</p>
                    <button onclick="window.close()" style="background: ${success ? '#4F46E5' : '#6c757d'}; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Close Window
                    </button>
                </div>
            `;
        }

        /**
         * Exchange authorization code for tokens
         */
        async exchangeCodeForToken(code, codeVerifier) {
            const response = await fetch(`${this.config.baseUrl}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    grantType: 'authorization_code',
                    code: code,
                    codeVerifier: codeVerifier,
                    clientId: this.config.clientId,
                    redirectUri: this.config.redirectUri
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
            }

            const tokenData = await response.json();

            // Calculate expiration timestamp
            if (tokenData.expires_in) {
                tokenData.expires_at = Date.now() + (tokenData.expires_in * 1000);
            }

            // Store received timestamp
            tokenData.received_at = Date.now();

            // Save token
            this.storage.save(tokenData);

            return tokenData;
        }

        /**
         * Refresh access token
         * Uses mutex to prevent concurrent refresh attempts
         */
        async refreshAccessToken() {
            // If already refreshing, wait for that to complete
            if (this.isRefreshing && this.refreshPromise) {
                debug('Refresh already in progress, waiting...');
                return this.refreshPromise;
            }

            this.isRefreshing = true;
            this.refreshPromise = this._doRefreshToken();

            try {
                const result = await this.refreshPromise;
                return result;
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        }

        /**
         * Actual refresh implementation
         */
        async _doRefreshToken() {
            const tokenData = this.storage.load();
            if (!tokenData || !tokenData.refresh_token) {
                throw new Error('No refresh token available');
            }

            debug('Refreshing access token...');

            try {
                const response = await fetch(`${this.config.baseUrl}/oauth2/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        grantType: 'refresh_token',
                        refreshToken: tokenData.refresh_token,
                        clientId: this.config.clientId
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();

                    // If refresh token is invalid/expired, clear everything
                    if (response.status === 400 || response.status === 401) {
                        debug('Refresh token invalid, clearing tokens');
                        this.storage.clear();
                        this._stopBackgroundRefresh();
                        this.emit('logout', { reason: 'refresh_token_expired' });
                        throw new Error('Session expired. Please login again.');
                    }

                    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
                }

                const newTokenData = await response.json();

                // Calculate expiration
                if (newTokenData.expires_in) {
                    newTokenData.expires_at = Date.now() + (newTokenData.expires_in * 1000);
                }

                newTokenData.received_at = Date.now();

                // Preserve refresh token if not returned (some servers don't return new one)
                if (!newTokenData.refresh_token && tokenData.refresh_token) {
                    newTokenData.refresh_token = tokenData.refresh_token;
                }

                // Save new token
                this.storage.save(newTokenData);

                debug('Token refreshed successfully, expires at:', new Date(newTokenData.expires_at));

                // Emit event
                this.emit('tokenRefreshed', newTokenData);

                // Reschedule background refresh
                this._scheduleBackgroundRefresh();

                return newTokenData;
            } catch (error) {
                debug('Token refresh failed:', error);

                // For network errors, don't clear tokens - might be temporary
                if (error.message.includes('Session expired')) {
                    throw error;
                }

                // Retry once after a short delay for transient errors
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    return await this._doRefreshToken();
                } catch (retryError) {
                    // If retry also fails, check if it's a permanent error
                    if (retryError.message.includes('Session expired')) {
                        throw retryError;
                    }
                    // For other errors, throw but don't clear tokens
                    throw new Error('Token refresh failed - please check your connection');
                }
            }
        }

        /**
         * Start background token refresh
         */
        _startBackgroundRefresh() {
            if (!this.config.enableBackgroundRefresh) return;
            this._scheduleBackgroundRefresh();

            // Also refresh on page visibility change (when user returns to tab)
            if (!this._visibilityHandler) {
                this._visibilityHandler = () => {
                    if (document.visibilityState === 'visible') {
                        debug('Page became visible, checking token...');
                        this._checkAndRefreshToken();
                    }
                };
                document.addEventListener('visibilitychange', this._visibilityHandler);
            }

            // Also refresh on online event (when connection restored)
            if (!this._onlineHandler) {
                this._onlineHandler = () => {
                    debug('Connection restored, checking token...');
                    this._checkAndRefreshToken();
                };
                window.addEventListener('online', this._onlineHandler);
            }
        }

        /**
         * Stop background refresh
         */
        _stopBackgroundRefresh() {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            if (this._visibilityHandler) {
                document.removeEventListener('visibilitychange', this._visibilityHandler);
                this._visibilityHandler = null;
            }
            if (this._onlineHandler) {
                window.removeEventListener('online', this._onlineHandler);
                this._onlineHandler = null;
            }
        }

        /**
         * Schedule next background refresh
         */
        _scheduleBackgroundRefresh() {
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }

            const timeUntilExpiry = this.storage.getTimeUntilExpiry();
            if (timeUntilExpiry <= 0) return;

            // Refresh when we're within the buffer window
            const refreshIn = Math.max(
                timeUntilExpiry - this.config.tokenRefreshBuffer,
                60000 // Minimum 1 minute
            );

            debug(`Scheduling token refresh in ${Math.round(refreshIn / 1000)} seconds`);

            this.refreshTimer = setTimeout(() => {
                this._checkAndRefreshToken();
            }, refreshIn);
        }

        /**
         * Check token and refresh if needed
         */
        async _checkAndRefreshToken() {
            if (!this.isAuthenticated()) return;

            const tokenData = this.storage.load();
            if (!tokenData) return;

            // If token is expired or needs refresh
            if (this.storage.isExpired(0)) {
                debug('Token expired, attempting refresh...');
                try {
                    await this.refreshAccessToken();
                } catch (error) {
                    debug('Background refresh failed:', error);
                    // Emit event so app can handle (show re-login prompt)
                    this.emit('tokenError', { error, action: 'background_refresh' });
                }
            } else if (this.storage.needsRefresh(this.config.tokenRefreshBuffer)) {
                debug('Token needs refresh (approaching expiry)...');
                try {
                    await this.refreshAccessToken();
                } catch (error) {
                    debug('Proactive refresh failed:', error);
                    // Not critical, will retry later
                }
            } else {
                // Token is fine, just reschedule
                this._scheduleBackgroundRefresh();
            }
        }

        /**
         * Logout and revoke token
         */
        async logout() {
            this._stopBackgroundRefresh();

            const tokenData = this.storage.load();
            if (!tokenData || !tokenData.access_token) {
                this.storage.clear();
                this.emit('logout', { reason: 'manual' });
                return true;
            }

            try {
                await fetch(`${this.config.baseUrl}/oauth2/revoke`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: buildQueryString({
                        token: tokenData.access_token,
                        client_id: this.config.clientId
                    })
                });
            } catch (error) {
                debug('Token revocation failed:', error);
            }

            this.storage.clear();
            this.emit('logout', { reason: 'manual' });
            return true;
        }

        /**
         * Get current access token (refreshes if needed)
         */
        async getAccessToken() {
            const tokenData = this.storage.load();
            if (!tokenData) return null;

            // If expired, try to refresh
            if (this.storage.isExpired(30000)) { // 30 second buffer
                try {
                    await this.refreshAccessToken();
                    return this.storage.load()?.access_token || null;
                } catch (error) {
                    return null;
                }
            }

            return tokenData.access_token;
        }

        /**
         * Get access token synchronously (no refresh, returns null if expired)
         */
        getAccessTokenSync() {
            if (this.storage.isExpired(0)) return null;
            return this.storage.load()?.access_token || null;
        }

        /**
         * Check if user is authenticated
         */
        isAuthenticated() {
            return this.getAccessTokenSync() !== null;
        }

        /**
         * Clean up auth flow
         */
        _cleanupAuthFlow() {
            if (this.authCheckInterval) {
                clearInterval(this.authCheckInterval);
                this.authCheckInterval = null;
            }
            if (this.authTimeout) {
                clearTimeout(this.authTimeout);
                this.authTimeout = null;
            }
            if (this._messageHandler) {
                window.removeEventListener('message', this._messageHandler);
                this._messageHandler = null;
            }
            if (this._storageHandler) {
                window.removeEventListener('storage', this._storageHandler);
                this._storageHandler = null;
            }
            if (this.authWindow && !this.authWindow.closed) {
                try {
                    this.authWindow.close();
                } catch (e) {
                    // Ignore
                }
            }
            this.authWindow = null;
            this.pendingAuth = null;
        }

        /**
         * Clean up session storage
         */
        _cleanupSessionStorage() {
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_verifier');
            sessionStorage.removeItem('oauth_flow');
            sessionStorage.removeItem('oauth_return_url');
        }

        /**
         * Notify auth complete
         */
        _notifyAuthComplete(success, data) {
            if (!this.pendingAuth) return;

            const { resolve, reject } = this.pendingAuth;
            this._cleanupAuthFlow();

            if (success) {
                this.emit('login', data);
                resolve(data);
            } else {
                reject(data);
            }
        }
    }

    // ============================================================================
    // API CLIENT
    // ============================================================================

    // Per-method default timeouts in milliseconds. Image edit / video can take
    // 5-10 min on Fal; everything else stays tighter. Callers may override by
    // passing `timeout: <ms>` in the options bag of any long-running method.
    // Server-side: nginx + WebClient + Netty are configured for 600s, so the
    // SDK timeouts here should never exceed 600_000 — otherwise the SDK would
    // wait past the point where the server has already given up.
    const TIMEOUT_DEFAULTS = {
        request: 60_000,                   // 1 min — generic helper for short calls
        editImage: 600_000,                // 10 min — Fal gpt-image-2/edit can take ~4 min
        _editImageViaChatCompletions: 600_000,
        generateVideo: 600_000,            // 10 min — slowest path
        generateImage: 300_000,            // 5 min
        generateImageVariations: 300_000,
        generateSpeech: 300_000,
        transcribeAudio: 300_000,
        generateCompletion: 300_000,
        generateCompletionStream: 300_000,
        generateEmbeddings: 60_000,
        getVideoStatus: 60_000,
        downloadVideo: 60_000,
    };

    class ApiClient {
        constructor(baseUrl, oauth2Manager) {
            this.baseUrl = baseUrl;
            this.oauth2Manager = oauth2Manager;
            this.activeRequests = new Map(); // For abort support
        }

        /**
         * Wrap fetch() with an internal AbortController + timeout. Translates
         * timeout-driven aborts into a friendlier error message so the caller
         * can distinguish "AI service slow" from "user pressed cancel".
         * @private
         */
        async _fetchWithTimeout(url, init, { timeoutMs, externalSignal }) {
            const controller = new AbortController();
            const requestId = Symbol('request');
            this.activeRequests.set(requestId, controller);

            const timer = setTimeout(() => {
                try {
                    controller.abort(new DOMException(`AIPASS_TIMEOUT_${timeoutMs}`, 'AbortError'));
                } catch (_) {
                    controller.abort();
                }
            }, timeoutMs);

            // Use a named handler so we can remove it from the external signal
            // after the request finishes — otherwise reused signals accumulate
            // stale listeners across many calls.
            const onExternalAbort = () => controller.abort(externalSignal && externalSignal.reason);
            if (externalSignal) {
                if (externalSignal.aborted) {
                    controller.abort(externalSignal.reason);
                } else {
                    externalSignal.addEventListener('abort', onExternalAbort);
                }
            }

            try {
                return await fetch(url, { ...init, signal: controller.signal });
            } catch (e) {
                const reasonMsg = String(controller.signal.reason && controller.signal.reason.message || '');
                if (e.name === 'AbortError' && reasonMsg.startsWith('AIPASS_TIMEOUT_')) {
                    throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. The AI service may be overloaded — please try again.`);
                }
                throw e;
            } finally {
                clearTimeout(timer);
                this.activeRequests.delete(requestId);
                if (externalSignal) {
                    externalSignal.removeEventListener('abort', onExternalAbort);
                }
            }
        }

        /**
         * Handle budget exceeded errors (centralized)
         * @private
         * @returns {boolean} True if this was a budget error (modal shown)
         */
        _handleBudgetError(errorText) {
            const budgetError = parseBudgetError(errorText);
            if (budgetError.isBudgetError) {
                // Show modal to user
                showBudgetExceededModal(budgetError.spend, budgetError.budget, this.baseUrl);

                // Emit event for custom handling
                if (this.oauth2Manager) {
                    this.oauth2Manager.emit('budgetExceeded', {
                        spend: budgetError.spend,
                        budget: budgetError.budget,
                        message: budgetError.message
                    });
                }

                return true;
            }
            return false;
        }

        /**
         * Make authenticated API request with automatic token refresh
         */
        async request(endpoint, options = {}, retryCount = 1) {
            let token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated - call login() first');
            }

            const { signal, timeout, ...restOptions } = options;
            const timeoutMs = timeout ?? TIMEOUT_DEFAULTS.request;

            for (let attempt = 0; attempt <= retryCount; attempt++) {
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    ...restOptions.headers
                };

                if (restOptions.body && !(restOptions.body instanceof FormData)) {
                    headers['Content-Type'] = 'application/json';
                }

                const response = await this._fetchWithTimeout(
                    `${this.baseUrl}${endpoint}`,
                    { ...restOptions, headers },
                    { timeoutMs, externalSignal: signal }
                );

                if (response.status === 401 && attempt < retryCount) {
                    try {
                        await this.oauth2Manager.refreshAccessToken();
                        token = await this.oauth2Manager.getAccessToken();
                        if (!token) throw new Error('Token refresh succeeded but no token available');
                        continue;
                    } catch (error) {
                        throw new Error('Session expired. Please login again.');
                    }
                }

                if (response.status === 401) {
                    throw new Error('Session expired. Please login again.');
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    const isBudgetError = this._handleBudgetError(errorText);
                    const error = new Error(`API request failed: ${response.status} - ${errorText}`);
                    if (isBudgetError) error.budgetExceededHandled = true;
                    throw error;
                }

                return response.json();
            }
        }

        /**
         * Cancel all active requests
         */
        cancelAllRequests() {
            for (const controller of this.activeRequests.values()) {
                controller.abort();
            }
            this.activeRequests.clear();
        }

        /**
         * Generate chat completion.
         *
         * Note on `maxTokens`: there is NO default. Reasoning models like gpt-5-mini
         * count their internal reasoning tokens against `max_completion_tokens`, so
         * setting a low cap (e.g. the old 1000-token default) silently eats the entire
         * budget on reasoning and returns `content: null`. By omitting `max_tokens`
         * entirely when the caller doesn't pass it, we let each model use its native
         * default (effectively unbounded for chat-tier models). Pass `maxTokens` only
         * when you genuinely need to cap output length.
         */
        async generateCompletion(options) {
            const {
                model = 'gemini/gemini-2.5-flash-lite',
                messages,
                prompt,
                temperature = 0.7,
                maxTokens,
                web_search_options,
                stream = false,
                signal,
                timeout,
                ...additionalOptions
            } = options;

            const messagesArray = messages || [{ role: 'user', content: prompt }];

            const requestBody = {
                model,
                messages: messagesArray,
                temperature,
                stream
            };

            if (typeof maxTokens === 'number' && maxTokens > 0) {
                requestBody.max_tokens = maxTokens;
            }

            if (web_search_options) {
                requestBody.web_search_options = web_search_options;
            }

            Object.assign(requestBody, additionalOptions);

            if (stream) {
                return this.generateCompletionStream(requestBody, signal, timeout);
            }

            return this.request('/oauth2/v1/chat/completions', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
                timeout: timeout ?? TIMEOUT_DEFAULTS.generateCompletion
            });
        }

        /**
         * Generate chat completion with streaming
         */
        /**
         * Stream chat completion as plain text via an onToken callback.
         *
         * Wraps `generateCompletion({ ..., stream: true })` so simple apps don't
         * have to write the `for await` loop. The callback receives the running
         * accumulated text and the just-arrived delta — render whichever you want.
         *
         * @example
         *   await AiPass.streamText(
         *     { model: 'gpt-5-mini', messages: [{ role: 'user', content: 'hi' }] },
         *     (full) => { resultEl.textContent = full; }
         *   );
         *
         * @returns the final full text after the stream completes.
         */
        async streamText(options, onToken) {
            let full = '';
            const iter = await this.generateCompletion({ ...options, stream: true });
            for await (const chunk of iter) {
                const delta = (chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || '';
                if (delta) {
                    full += delta;
                    if (typeof onToken === 'function') onToken(full, delta);
                }
            }
            return full;
        }

        async *generateCompletionStream(requestBody, signal, timeout) {
            // Get fresh token (with refresh if needed)
            let token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated - call login() first');
            }

            const timeoutMs = timeout ?? TIMEOUT_DEFAULTS.generateCompletionStream;
            const abortController = new AbortController();
            const timeoutTimer = setTimeout(() => {
                try {
                    abortController.abort(new DOMException(`AIPASS_TIMEOUT_${timeoutMs}`, 'AbortError'));
                } catch (_) {
                    abortController.abort();
                }
            }, timeoutMs);

            // Link external signal
            if (signal) {
                if (signal.aborted) abortController.abort(signal.reason);
                else signal.addEventListener('abort', () => abortController.abort(signal.reason));
            }

            const makeStreamRequest = async (authToken) => {
                return fetch(`${this.baseUrl}/oauth2/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify(requestBody),
                    signal: abortController.signal
                });
            };

            let response;
            try {
                response = await makeStreamRequest(token);
            } catch (e) {
                clearTimeout(timeoutTimer);
                const reasonMsg = String(abortController.signal.reason && abortController.signal.reason.message || '');
                if (e.name === 'AbortError' && reasonMsg.startsWith('AIPASS_TIMEOUT_')) {
                    throw new Error(`Stream timed out after ${Math.round(timeoutMs / 1000)}s. The AI service may be overloaded — please try again.`);
                }
                throw e;
            }

            // Retry with refresh on 401
            if (response.status === 401) {
                try {
                    await this.oauth2Manager.refreshAccessToken();
                    token = await this.oauth2Manager.getAccessToken();
                    if (!token) throw new Error('Refresh failed');
                    response = await makeStreamRequest(token);
                } catch (error) {
                    clearTimeout(timeoutTimer);
                    throw new Error('Session expired. Please login again.');
                }
            }

            if (!response.ok) {
                clearTimeout(timeoutTimer);
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Streaming request failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamFullyConsumed = false;

            try {
                while (true) {
                    let chunk;
                    try {
                        chunk = await reader.read();
                    } catch (e) {
                        const reasonMsg = String(abortController.signal.reason && abortController.signal.reason.message || '');
                        if (e.name === 'AbortError' && reasonMsg.startsWith('AIPASS_TIMEOUT_')) {
                            throw new Error(`Stream timed out after ${Math.round(timeoutMs / 1000)}s. The AI service may be overloaded — please try again.`);
                        }
                        throw e;
                    }
                    const { done, value } = chunk;

                    if (done) { streamFullyConsumed = true; break; }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

                        const data = trimmedLine.startsWith('data: ')
                            ? trimmedLine.substring(6)
                            : trimmedLine.substring(5);

                        if (data === '[DONE]') { streamFullyConsumed = true; return; }

                        try {
                            const parsedData = JSON.parse(data);

                            // Check if this is a budget exceeded error in the stream
                            if (parsedData.error) {
                                const dataStr = JSON.stringify(parsedData);
                                const isBudgetError = this._handleBudgetError(dataStr);

                                // Check if it was a budget error to stop streaming
                                if (isBudgetError) {
                                    const budgetError = parseBudgetError(dataStr);
                                    const error = new Error(budgetError.message);
                                    error.budgetExceededHandled = true;
                                    throw error;
                                }
                            }

                            yield parsedData;
                        } catch (e) {
                            // If it's a budget error, rethrow it
                            if (e.message && e.message.includes('ExceededBudget')) {
                                throw e;
                            }
                            // Otherwise skip malformed JSON
                        }
                    }
                }
            } finally {
                clearTimeout(timeoutTimer);
                // If the consumer broke or threw before the stream finished, abort
                // the upstream fetch so LiteLLM / Fal stop generating (and we stop
                // paying) instead of running to completion in the background.
                if (!streamFullyConsumed && !abortController.signal.aborted) {
                    try { abortController.abort(); } catch (_) {}
                }
                try { reader.releaseLock(); } catch (_) {}
            }
        }

        /**
         * Generate speech from text
         */
        async generateSpeech(options) {
            const {
                text,
                model = 'tts-1',
                voice = 'alloy',
                responseFormat = 'mp3',
                speed = 1.0,
                signal,
                timeout
            } = options;

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/audio/speech`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        input: text,
                        voice,
                        response_format: responseFormat,
                        speed
                    })
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.generateSpeech, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Speech generation failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.blob();
        }

        /**
         * Transcribe audio to text
         */
        async transcribeAudio(options) {
            const {
                audioFile,
                model = 'whisper-1',
                language = null,
                prompt = null,
                temperature = 0.0,
                signal,
                timeout
            } = options;

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('model', model);
            if (language) formData.append('language', language);
            if (prompt) formData.append('prompt', prompt);
            formData.append('temperature', temperature.toString());

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/audio/transcriptions`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.transcribeAudio, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Transcription failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.json();
        }

        /**
         * Get user balance
         */
        async getUserBalance(options = {}) {
            return this.request('/api/v1/usage/me/summary', {
                method: 'GET',
                signal: options.signal
            });
        }

        /**
         * Get user profile information
         * Requires 'profile:read' scope
         */
        async getUserInfo(options = {}) {
            return this.request('/oauth2/userinfo', {
                method: 'GET',
                signal: options.signal
            });
        }

        /**
         * List available models — public endpoint, no auth required.
         * Bypasses request() (which gates on getAccessToken) so anonymous
         * space-app visitors can populate model pickers before signing in.
         */
        async getModels(options = {}) {
            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/models`,
                { method: 'GET' },
                { timeoutMs: TIMEOUT_DEFAULTS.request, externalSignal: options.signal }
            );
            if (!response.ok) throw new Error(`getModels failed: HTTP ${response.status}`);
            return response.json();
        }

        /**
         * Get specific model details — public endpoint, same rationale as getModels.
         */
        async getModel(modelId, options = {}) {
            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/models/${modelId}`,
                { method: 'GET' },
                { timeoutMs: TIMEOUT_DEFAULTS.request, externalSignal: options.signal }
            );
            if (!response.ok) throw new Error(`getModel failed: HTTP ${response.status}`);
            return response.json();
        }

        /**
         * Generate images
         */
        async generateImage(options) {
            const {
                model = 'gpt-image-1',
                prompt,
                n = 1,
                size = '1024x1024',
                responseFormat = 'url',
                user = null,
                quality = null,
                signal,
                timeout
            } = options;

            const requestBody = {
                model,
                prompt,
                n,
                size
            };

            if (responseFormat && responseFormat !== 'url') {
                requestBody.response_format = responseFormat;
            }
            if (user) requestBody.user = user;
            if (quality) requestBody.quality = quality;

            return this.request('/oauth2/v1/images/generations', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
                timeout: timeout ?? TIMEOUT_DEFAULTS.generateImage
            });
        }

        /**
         * Resize an image File/Blob via canvas so it fits comfortably under upload limits.
         * Phone photos are routinely 5–10 MB and beyond Fal's per-model dimension caps; the
         * Spring multipart limit is 10 MB and nginx caps at 25 MB. We target ≤2048px on the
         * longest side and ≤~3 MB JPEG. Skipped silently for non-Blob inputs, tiny JPEGs, or
         * if canvas APIs aren't available (e.g. SSR).
         * @private
         */
        async _shrinkImage(file, opts = {}) {
            const maxSide = opts.maxSide ?? 2048;
            const quality = opts.quality ?? 0.9;
            const maxBytes = opts.maxBytes ?? (3 * 1024 * 1024);
            if (typeof window === 'undefined' || !(file instanceof Blob)) return file;
            // Small JPEGs/PNGs can pass through untouched.
            if (file.size <= maxBytes && /^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '')) {
                // Still need to check dimensions for some models — but if file is small AND
                // type is a supported raster, almost always OK. Caller can override via opts.
            }
            try {
                const bitmap = await createImageBitmap(file);
                const { width, height } = bitmap;
                const scale = Math.min(1, maxSide / Math.max(width, height));
                if (scale === 1 && file.size <= maxBytes) {
                    bitmap.close && bitmap.close();
                    return file;
                }
                const w = Math.max(1, Math.round(width * scale));
                const h = Math.max(1, Math.round(height * scale));
                const canvas = (typeof OffscreenCanvas !== 'undefined')
                    ? new OffscreenCanvas(w, h)
                    : Object.assign(document.createElement('canvas'), { width: w, height: h });
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0, w, h);
                bitmap.close && bitmap.close();
                const blob = canvas.convertToBlob
                    ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
                    : await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
                const baseName = ((file.name || 'upload').replace(/\.[^.]+$/, '')) || 'upload';
                return new File([blob], baseName + '.jpg', { type: 'image/jpeg' });
            } catch (e) {
                console.warn('AiPass SDK: image shrink failed, sending original.', e);
                return file;
            }
        }

        /**
         * Convert an HTTP error response into a short, user-facing message.
         * Tries common JSON shapes first ({error:{message}}, {message}, {detail}, {error:"..."}),
         * then falls back to status-code-based copy. Used by editImage and any other method
         * that needs to surface a friendly Error.message rather than raw JSON.
         * @private
         */
        _parseApiError(errorText, status) {
            let extracted = null;
            try {
                const body = JSON.parse(errorText);
                extracted = (body && body.error && body.error.message)
                    || (body && body.message)
                    || (body && body.detail)
                    || (body && typeof body.error === 'string' ? body.error : null);
            } catch (_) { /* not JSON */ }
            if (typeof extracted === 'string' && extracted.length > 0 && extracted.length < 500) {
                return extracted;
            }
            if (status === 413) return 'Image too large. Try a smaller photo.';
            if (status === 401 || status === 403) return 'Sign-in required to continue.';
            if (status === 402) return "You're out of credits — top up at aipass.one/panel.";
            if (status === 429) return 'Too many requests — slow down a moment.';
            if (status >= 500) return 'The image model returned an error. Try a different scene or try again in a minute.';
            return `Request failed (HTTP ${status}).`;
        }

        /**
         * Edit images
         * For Gemini models, routes through chat completions with base64 image
         * to avoid LiteLLM multipart serialization issues.
         */
        async editImage(options) {
            const {
                image,
                mask = null,
                prompt,
                model = 'gpt-image-1',
                n = 1,
                size = '1024x1024',
                responseFormat = 'url',
                user = null,
                signal,
                timeout
            } = options;

            // Gemini models don't support multipart /images/edits - use chat completions instead
            if (model.startsWith('gemini/')) {
                return this._editImageViaChatCompletions(options);
            }

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            // Client-side resize: keeps phones-photos (5–10 MB, 4000+ px) under Spring/Fal limits.
            const formData = new FormData();
            const images = Array.isArray(image) ? image : [image];
            const shrunk = await Promise.all(images.map(img => this._shrinkImage(img)));
            shrunk.forEach(img => formData.append('image', img));

            if (mask) {
                const maskShrunk = await this._shrinkImage(mask);
                formData.append('mask', maskShrunk);
            }
            formData.append('prompt', prompt);
            formData.append('model', model);
            // formData.append('n', n.toString());
            formData.append('size', size);
            if (responseFormat && responseFormat !== 'url') {
                formData.append('response_format', responseFormat);
            }
            if (user) formData.append('user', user);

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/images/edits`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.editImage, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const friendly = this._parseApiError(errorText, response.status);
                const error = new Error(friendly);
                error.status = response.status;
                error.rawBody = errorText;
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.json();
        }

        /**
         * Route image editing through /v1/chat/completions for Gemini models.
         * Converts the image to base64 and sends as inline content, then
         * transforms the chat response back to the images/edits response format.
         * @private
         */
        async _editImageViaChatCompletions(options) {
            const {
                image,
                prompt,
                model,
                signal,
                timeout
            } = options;

            // Convert image(s) to base64 data URIs
            const images = Array.isArray(image) ? image : [image];
            const contentParts = [];

            for (const img of images) {
                const base64DataUri = await this._fileToBase64DataUri(img);
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: base64DataUri }
                });
            }

            // Add the text prompt after the image(s)
            contentParts.push({ type: 'text', text: prompt });

            const requestBody = {
                model,
                messages: [{
                    role: 'user',
                    content: contentParts
                }]
            };

            const chatResponse = await this.request('/oauth2/v1/chat/completions', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
                timeout: timeout ?? TIMEOUT_DEFAULTS._editImageViaChatCompletions
            });

            // Transform chat completions response to images/edits format
            return this._chatResponseToImageResponse(chatResponse);
        }

        /**
         * Convert a File or Blob to a base64 data URI string
         * @private
         */
        _fileToBase64DataUri(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read image file'));
                reader.readAsDataURL(file);
            });
        }

        /**
         * Transform a chat completions response into the images/edits response format.
         * Extracts image data from message.images (Gemini) or message.content (OpenAI).
         * @private
         */
        _chatResponseToImageResponse(chatResponse) {
            const data = [];

            if (chatResponse.choices && chatResponse.choices.length > 0) {
                const message = chatResponse.choices[0].message;

                // Gemini models return images in message.images[] (content is null)
                if (Array.isArray(message.images)) {
                    for (const img of message.images) {
                        if (img.type === 'image_url' && img.image_url && img.image_url.url) {
                            const url = img.image_url.url;
                            if (url.startsWith('data:')) {
                                const base64Part = url.split(',')[1];
                                data.push({ b64_json: base64Part, url: url });
                            } else {
                                data.push({ url: url });
                            }
                        }
                    }
                }

                // Fallback: check content array (OpenAI-style multimodal)
                const content = message.content;
                if (data.length === 0 && Array.isArray(content)) {
                    for (const part of content) {
                        if (part.type === 'image_url' && part.image_url && part.image_url.url) {
                            const url = part.image_url.url;
                            if (url.startsWith('data:')) {
                                const base64Part = url.split(',')[1];
                                data.push({ b64_json: base64Part, url: url });
                            } else {
                                data.push({ url: url });
                            }
                        }
                    }
                } else if (data.length === 0 && typeof content === 'string' && content.startsWith('data:image')) {
                    const base64Part = content.split(',')[1];
                    data.push({ b64_json: base64Part, url: content });
                }
            }

            if (data.length === 0) {
                throw new Error('No image returned from model');
            }

            return { data };
        }

        /**
         * Generate image variations
         */
        async generateImageVariations(options) {
            const {
                image,
                model = 'gpt-image-1',
                n = 1,
                size = '1024x1024',
                responseFormat = 'url',
                user = null,
                signal,
                timeout
            } = options;

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const formData = new FormData();
            formData.append('image', image);
            formData.append('model', model);
            formData.append('n', n.toString());
            formData.append('size', size);
            if (responseFormat && responseFormat !== 'url') {
                formData.append('response_format', responseFormat);
            }
            if (user) formData.append('user', user);

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/images/variations`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.generateImageVariations, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Image variations failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.json();
        }

        /**
         * Generate embeddings
         */
        async generateEmbeddings(options) {
            const {
                model = 'text-embedding-ada-002',
                input,
                user = null,
                signal,
                timeout
            } = options;

            const requestBody = { model, input };
            if (user) requestBody.user = user;

            return this.request('/oauth2/v1/embeddings', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                signal,
                timeout: timeout ?? TIMEOUT_DEFAULTS.generateEmbeddings
            });
        }

        /**
         * Resize image to specific dimensions while maintaining aspect ratio
         * Adds padding (letterboxing/pillarboxing) instead of squeezing
         * @private
         */
        async _resizeImage(imageBlob, width, height) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // Fill with neutral background (gray/black)
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, width, height);

                    // Calculate scaling to fit within target dimensions while maintaining aspect ratio
                    const scale = Math.min(width / img.width, height / img.height);
                    const scaledWidth = img.width * scale;
                    const scaledHeight = img.height * scale;

                    // Center the image
                    const x = (width - scaledWidth) / 2;
                    const y = (height - scaledHeight) / 2;

                    // Draw image centered with maintained aspect ratio
                    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to resize image'));
                        }
                    }, 'image/png');
                };
                img.onerror = () => reject(new Error('Failed to load image for resizing'));
                img.src = URL.createObjectURL(imageBlob);
            });
        }

        /**
         * Generate video from text prompt or image
         * @param {Object} options
         * @param {string} options.model - Video model (e.g., 'gemini/veo-3.1-generate-preview')
         * @param {string} options.prompt - Text description of the video
         * @param {string|Blob|File} [options.image] - Image to use as reference (File, Blob, or base64 data URI)
         * @param {string} [options.size='1280x720'] - Video dimensions
         * @param {number} [options.seconds=4] - Video duration in seconds
         * @param {AbortSignal} [options.signal] - Optional abort signal
         * @returns {Promise<Object>} Video generation response with video ID
         */
        async generateVideo(options) {
            const {
                model = 'gemini/veo-3.1-generate-preview',
                prompt,
                image = null,
                size = '1280x720',
                seconds = 4,
                signal,
                timeout
            } = options;

            if (!prompt) {
                throw new Error('Prompt is required for video generation');
            }

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const timeoutMs = timeout ?? TIMEOUT_DEFAULTS.generateVideo;

            // If image is provided, we need to use multipart/form-data
            if (image) {
                const formData = new FormData();

                // Convert base64 data URI to Blob if needed
                let imageBlob = image;
                if (typeof image === 'string' && image.startsWith('data:')) {
                    // Convert data URI to blob
                    const response = await fetch(image);
                    imageBlob = await response.blob();
                }

                // Parse size to get dimensions (e.g., "1280x720" -> width=1280, height=720)
                const [width, height] = size.split('x').map(Number);

                // Resize image to match requested dimensions (required by Sora-2)
                if (width && height) {
                    try {
                        imageBlob = await this._resizeImage(imageBlob, width, height);
                    } catch (error) {
                        console.warn('Failed to resize image, using original:', error);
                    }
                }

                // Append image as file
                formData.append('input_reference', imageBlob, 'image.png');
                formData.append('model', model);
                formData.append('prompt', prompt);
                formData.append('size', size);
                formData.append('seconds', seconds.toString());

                const response = await this._fetchWithTimeout(
                    `${this.baseUrl}/oauth2/v1/videos`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    },
                    { timeoutMs, externalSignal: signal }
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    const isBudgetError = this._handleBudgetError(errorText);
                    const error = new Error(`Video generation failed: ${response.status} - ${errorText}`);
                    if (isBudgetError) error.budgetExceededHandled = true;
                    throw error;
                }

                return response.json();
            } else {
                // Text-only: use JSON
                const requestBody = {
                    model,
                    prompt,
                    size,
                    seconds
                };

                const response = await this._fetchWithTimeout(
                    `${this.baseUrl}/oauth2/v1/videos`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody)
                    },
                    { timeoutMs, externalSignal: signal }
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    const isBudgetError = this._handleBudgetError(errorText);
                    const error = new Error(`Video generation failed: ${response.status} - ${errorText}`);
                    if (isBudgetError) error.budgetExceededHandled = true;
                    throw error;
                }

                return response.json();
            }
        }

        /**
         * Get video generation status
         * @param {string} videoId - The video ID returned from generateVideo
         * @param {AbortSignal} [signal] - Optional abort signal
         * @returns {Promise<Object>} Video status information
         */
        async getVideoStatus(videoId, signalOrOptions = null) {
            if (!videoId) {
                throw new Error('Video ID is required');
            }

            // Accept legacy positional signal OR an options bag { signal, timeout }
            const isOptionsBag = signalOrOptions && typeof signalOrOptions === 'object' && !(signalOrOptions instanceof AbortSignal);
            const signal = isOptionsBag ? signalOrOptions.signal : signalOrOptions;
            const timeout = isOptionsBag ? signalOrOptions.timeout : undefined;

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/videos/${videoId}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.getVideoStatus, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Status check failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.json();
        }

        /**
         * Download video content as blob
         * @param {string} videoId - The video ID
         * @param {AbortSignal} [signal] - Optional abort signal
         * @returns {Promise<Blob>} Video blob
         */
        async downloadVideo(videoId, signalOrOptions = null) {
            if (!videoId) {
                throw new Error('Video ID is required');
            }

            const isOptionsBag = signalOrOptions && typeof signalOrOptions === 'object' && !(signalOrOptions instanceof AbortSignal);
            const signal = isOptionsBag ? signalOrOptions.signal : signalOrOptions;
            const timeout = isOptionsBag ? signalOrOptions.timeout : undefined;

            const token = await this.oauth2Manager.getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await this._fetchWithTimeout(
                `${this.baseUrl}/oauth2/v1/videos/${videoId}/content`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'video/mp4,video/*'
                    }
                },
                { timeoutMs: timeout ?? TIMEOUT_DEFAULTS.downloadVideo, externalSignal: signal }
            );

            if (!response.ok) {
                const errorText = await response.text();
                const isBudgetError = this._handleBudgetError(errorText);
                const error = new Error(`Video download failed: ${response.status} - ${errorText}`);
                if (isBudgetError) error.budgetExceededHandled = true;
                throw error;
            }

            return response.blob();
        }
    }

    // ============================================================================
    // MAIN SDK CLASS
    // ============================================================================

    class AiPassSDK extends EventEmitter {
        constructor() {
            super();
            this.config = null;
            this.oauth2Manager = null;
            this.apiClient = null;
            this.initialized = false;
            this.autoUpdateBalance = true; // Auto-update balance after API calls
        }

        /**
         * Initialize the SDK
         */
        initialize(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            debugEnabled = this.config.debug;

            // Validate clientId
            if (!this.config.clientId || typeof this.config.clientId !== 'string' || !this.config.clientId.trim()) {
                throw new Error('clientId is required. Call AiPass.initialize({ clientId: "..." })');
            }

            // Validate HTTPS (with localhost exception)
            const isLocalhost = (urlStr) => {
                try {
                    const u = new URL(urlStr);
                    return ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
                } catch {
                    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
                }
            };

            if (!this.config.baseUrl.startsWith('https://')) {
                if (this.config.baseUrl.startsWith('http://') && isLocalhost(this.config.baseUrl)) {
                    console.warn('[AiPass] Using HTTP for local development. Do not use in production.');
                } else {
                    throw new Error('baseUrl must use HTTPS in production');
                }
            }

            // Create managers
            this.oauth2Manager = new OAuth2Manager(this.config);
            this.apiClient = new ApiClient(this.config.baseUrl, this.oauth2Manager);

            // Forward events from oauth2Manager
            this.oauth2Manager.on('login', (data) => this.emit('login', data));
            this.oauth2Manager.on('logout', (data) => this.emit('logout', data));
            this.oauth2Manager.on('tokenRefreshed', (data) => this.emit('tokenRefreshed', data));
            this.oauth2Manager.on('tokenError', (data) => this.emit('tokenError', data));

            this.initialized = true;

            // Check for OAuth callback in URL
            this._checkForCallback();

            // Start background refresh if already authenticated
            if (this.isAuthenticated()) {
                this.oauth2Manager._startBackgroundRefresh();
            }

            // Show required login modal if enabled and not authenticated
            if (this.config.requireLogin && !this.isAuthenticated()) {
                // Delay to ensure DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        showRequiredLoginModal(this.oauth2Manager, this.config.baseUrl, this);
                    });
                } else {
                    showRequiredLoginModal(this.oauth2Manager, this.config.baseUrl, this);
                }
            }

            // Auto-mount the [data-aipass-button] auth/balance widget unless
            // the caller opted out. AiPassUIManager.init() is idempotent and
            // handles document.readyState === 'loading' on its own.
            if (this.config.mountUI !== false) {
                AiPassUIManager.init();
            }

            debug('SDK initialized');
            return this;
        }

        /**
         * Check if current page is OAuth callback
         */
        _checkForCallback() {
            try {
                const url = new URL(window.location.href);
                const hasCode = url.searchParams.has('code');
                const hasState = url.searchParams.has('state');
                const hasSessionState = !!sessionStorage.getItem('oauth_state');
                const isPopup = !!(window.opener && !window.opener.closed);

                if (hasCode && hasState && (hasSessionState || isPopup)) {
                    debug('Detected OAuth callback, handling...');

                    // Handle callback async
                    this.handleCallback().catch(error => {
                        console.error('[AiPass] Callback handling failed:', error);
                    });
                }
            } catch (e) {
                // Ignore URL parsing errors
            }
        }

        // ========== Public API ==========

        isInitialized() {
            return this.initialized;
        }

        isAuthenticated() {
            this._checkInit();
            return this.oauth2Manager.isAuthenticated();
        }

        /**
         * Login with automatic flow selection
         * @param {Object} options
         * @param {boolean} options.forceRedirect - Force redirect flow (recommended for mobile)
         */
        async login(options = {}) {
            this._checkInit();
            return this.oauth2Manager.login(options);
        }

        async handleCallback(callbackUrl = window.location.href) {
            this._checkInit();
            return this.oauth2Manager.handleCallback(callbackUrl);
        }

        async logout() {
            this._checkInit();
            return this.oauth2Manager.logout();
        }

        async refreshAccessToken() {
            this._checkInit();
            return this.oauth2Manager.refreshAccessToken();
        }

        async getAccessToken() {
            this._checkInit();
            return this.oauth2Manager.getAccessToken();
        }

        getAccessTokenSync() {
            this._checkInit();
            return this.oauth2Manager.getAccessTokenSync();
        }

        getConfig() {
            this._checkInit();
            return { ...this.config };
        }

        /**
         * Get token info (expiry, etc.)
         */
        getTokenInfo() {
            this._checkInit();
            const tokenData = this.oauth2Manager.storage.load();
            if (!tokenData) return null;

            return {
                expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at) : null,
                expiresIn: this.oauth2Manager.storage.getTimeUntilExpiry(),
                isExpired: this.oauth2Manager.storage.isExpired(0),
                needsRefresh: this.oauth2Manager.storage.needsRefresh(this.config.tokenRefreshBuffer)
            };
        }

        openDashboard() {
            this._checkInit();
            window.open(`${this.config.baseUrl}/panel/developer.html`, '_blank');
        }

        // ========== API Methods ==========

        /**
         * Ensure the user is authenticated before a generation call.
         * If not authenticated, shows a dismissible login modal and waits.
         * Rejects with AuthRequiredError (code: 'AUTH_REQUIRED') if dismissed.
         * @private
         */
        async _ensureAuthenticated() {
            this._checkInit();
            if (this.oauth2Manager.isAuthenticated()) return;
            await showAuthGateModal(this.oauth2Manager, this.config.baseUrl, this);
        }

        async generateCompletion(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateCompletion(options);
            await this._refreshBalance();
            return result;
        }

        /**
         * Stream chat completion via callback. Prefer this over generateCompletion()
         * for any user-facing chat UI — perceived latency improves dramatically.
         * See ApiClient.streamText for full docs.
         */
        async streamText(options, onToken) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.streamText(options, onToken);
            await this._refreshBalance();
            return result;
        }

        async generateSpeech(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateSpeech(options);
            await this._refreshBalance();
            return result;
        }

        async transcribeAudio(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.transcribeAudio(options);
            await this._refreshBalance();
            return result;
        }

        async getUserBalance(options) {
            this._checkInit();
            return this.apiClient.getUserBalance(options);
        }

        async getUserInfo(options) {
            this._checkInit();
            return this.apiClient.getUserInfo(options);
        }

        async getModels(options) {
            this._checkInit();
            return this.apiClient.getModels(options);
        }

        async getModel(modelId, options) {
            this._checkInit();
            return this.apiClient.getModel(modelId, options);
        }

        async generateImage(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateImage(options);
            await this._refreshBalance();
            return result;
        }

        async editImage(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.editImage(options);
            await this._refreshBalance();
            return result;
        }

        async generateImageVariations(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateImageVariations(options);
            await this._refreshBalance();
            return result;
        }

        async generateEmbeddings(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateEmbeddings(options);
            await this._refreshBalance();
            return result;
        }

        // ========== Video Generation Methods ==========

        /**
         * Generate video from text prompt or image
         * @param {Object} options - Video generation options
         * @param {string} options.model - Video model (e.g., 'gemini/veo-3.1-generate-preview')
         * @param {string} options.prompt - Text description of the video
         * @param {string} [options.image] - Base64 encoded image to use as reference
         * @param {string} [options.size='1280x720'] - Video dimensions
         * @param {number} [options.seconds=4] - Video duration in seconds
         * @returns {Promise<Object>} Video generation response with video ID
         */
        async generateVideo(options) {
            await this._ensureAuthenticated();
            const result = await this.apiClient.generateVideo(options);
            await this._refreshBalance();
            return result;
        }

        /**
         * Get video generation status
         * @param {string} videoId - The video ID returned from generateVideo
         * @returns {Promise<Object>} Video status information
         */
        async getVideoStatus(videoId) {
            this._checkInit();
            return this.apiClient.getVideoStatus(videoId);
        }

        /**
         * Download video content as blob
         * @param {string} videoId - The video ID
         * @returns {Promise<Blob>} Video blob
         */
        async downloadVideo(videoId) {
            this._checkInit();
            return this.apiClient.downloadVideo(videoId);
        }

        /**
         * Show payment/add funds modal
         * Displays the budget exceeded modal with payment options
         *
         * @param {Object} options - Optional configuration
         * @param {number} options.balance - Current balance to display (optional)
         * @param {number} options.spend - Current spend amount (optional)
         * @param {number} options.budget - Budget limit (optional)
         *
         * @example
         * // Show modal with default message
         * AiPass.showPaymentModal();
         *
         * @example
         * // Show modal with specific balance
         * AiPass.showPaymentModal({ balance: -0.66 });
         *
         * @example
         * // Show modal with spend and budget (balance calculated automatically)
         * AiPass.showPaymentModal({ spend: 15.66, budget: 15.0 });
         */
        showPaymentModal(options = {}) {
            this._checkInit();

            const { balance, spend, budget } = options;

            // If balance is provided directly, use it
            // Otherwise calculate from spend and budget
            let finalSpend = spend;
            let finalBudget = budget;

            if (balance !== undefined) {
                // Convert balance to spend/budget format
                // If balance is negative, spend exceeds budget
                finalSpend = Math.abs(balance);
                finalBudget = 0;
            }

            showBudgetExceededModal(finalSpend, finalBudget, this.config.baseUrl);
        }

        // ========== Internal Methods ==========

        /**
         * Cancel all pending API requests
         */
        cancelAllRequests() {
            this._checkInit();
            this.apiClient.cancelAllRequests();
        }

        _checkInit() {
            if (!this.initialized) {
                throw new Error('SDK not initialized - call AiPass.initialize({ clientId: "..." }) first');
            }
        }

        /**
         * Refresh user balance and emit update event
         * @private
         */
        async _refreshBalance() {
            if (!this.autoUpdateBalance) return;

            try {
                const response = await this.apiClient.getUserBalance();
                // Emit in the same format as gift card redemption: { balance: ... }
                if (response?.data?.remainingBudget !== undefined) {
                    this.emit('balanceUpdated', { balance: response.data.remainingBudget });
                }
                return response;
            } catch (error) {
                console.warn('Failed to refresh balance:', error);
            }
        }
    }

    // ============================================================================
    // UI COMPONENTS (auto-mounted from AiPass.initialize() unless { mountUI: false }).
    // The module remains exposed as AiPassUI for manual re-mount (e.g. buttons added
    // dynamically after initialize) via AiPassUI.init() / .reinit().
    // ============================================================================

    class AiPassUI {
        constructor(sdk) {
            this.sdk = sdk;
            this.initialized = false;
            this.buttons = new Set();
        }

        /**
         * Initialize UI components (call manually when ready)
         */
        init() {
            if (this.initialized) return;

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._initButtons());
            } else {
                this._initButtons();
            }

            // Listen for auth events to update buttons
            this.sdk.on('login', () => this._updateAllButtons(true));
            this.sdk.on('logout', () => this._updateAllButtons(false));

            // Listen for balance updates to refresh button display
            this.sdk.on('balanceUpdated', (balance) => {
                this.buttons.forEach(button => {
                    const balanceBox = button.querySelector('[data-balance]');
                    if (balanceBox && balance.balance !== undefined) {
                        const amount = parseFloat(balance.balance).toFixed(2);
                        balanceBox.textContent = `$${amount}`;
                        balanceBox.style.visibility = 'visible';

                        // Color logic: negative = red, positive = purple
                        if (parseFloat(amount) < 0) {
                            balanceBox.style.color = '#dc2626'; // red
                        } else {
                            balanceBox.style.color = '#4F46E5'; // purple
                        }
                    }
                });
            });

            this.initialized = true;
        }

        _initButtons() {
            const buttons = document.querySelectorAll('[data-aipass-button]');
            buttons.forEach(button => this._setupButton(button));
        }

        _setupButton(button) {
            if (this.buttons.has(button)) return;
            this.buttons.add(button);

            const isAuthenticated = this.sdk.isAuthenticated();
            this._updateButtonState(button, isAuthenticated);

            if (isAuthenticated) {
                this._fetchAndDisplayBalance(button);
            }

            button.addEventListener('click', async () => {
                if (this.sdk.isAuthenticated()) {
                    await this._handleLogout(button);
                } else {
                    await this._handleLogin(button);
                }
            });

            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');

            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    button.click();
                }
            });
        }

        async _handleLogin(button) {
            try {
                button.setAttribute('disabled', 'true');
                await this.sdk.login();
                this._updateButtonState(button, true);
                await this._fetchAndDisplayBalance(button);
                button.dispatchEvent(new CustomEvent('aipass:login', { bubbles: true, detail: { authenticated: true } }));
            } catch (error) {
                console.error('AI Pass login failed:', error);
                button.dispatchEvent(new CustomEvent('aipass:error', { bubbles: true, detail: { error, action: 'login' } }));
            } finally {
                button.removeAttribute('disabled');
            }
        }

        async _handleLogout(button) {
            try {
                // Fetch current balance
                const balanceData = await this.sdk.getUserBalance();
                const balance = balanceData?.data?.remainingBudget ?? 0;

                // Show account modal instead of logging out immediately
                showAccountModal(balance, this.sdk.config.baseUrl, this.sdk.oauth2Manager);
            } catch (error) {
                console.error('AI Pass failed to show account modal:', error);
                button.dispatchEvent(new CustomEvent('aipass:error', { bubbles: true, detail: { error, action: 'account' } }));
            }
        }

        _updateAllButtons(isConnected) {
            this.buttons.forEach(button => {
                this._updateButtonState(button, isConnected);
                if (isConnected) {
                    this._fetchAndDisplayBalance(button);
                }
            });
        }

        _updateButtonState(button, isConnected) {
            if (isConnected) {
                button.className = 'logo-container connected';
                button.innerHTML = `
                    <div class="ripple"></div>
                    <div class="ripple"></div>
                    <div class="ripple"></div>
                    <div class="ai-box">AI</div>
                    <div class="pass-text">Pass</div>
                    <div class="balance-box" data-balance style="visibility: hidden;">$0.00</div>
                `;
                button.setAttribute('aria-label', 'Disconnect from AI Pass');
            } else {
                button.className = 'logo-container dark';
                button.innerHTML = `
                    <div class="ai-box">AI</div>
                    <div class="pass-text">Pass</div>
                    <div class="connect-text">CONNECT</div>
                `;
                button.setAttribute('aria-label', 'Connect with AI Pass');
            }
        }

        async _fetchAndDisplayBalance(button) {
            try {
                const balance = await this.sdk.getUserBalance();
                if (balance?.data?.remainingBudget !== undefined) {
                    const amount = parseFloat(balance.data.remainingBudget).toFixed(2);
                    const balanceBox = button.querySelector('[data-balance]');
                    if (balanceBox) {
                        balanceBox.textContent = `$${amount}`;
                        balanceBox.style.visibility = 'visible';

                        // Color logic: negative = red, positive = purple
                        if (parseFloat(amount) < 0) {
                            balanceBox.style.color = '#dc2626'; // red
                        } else {
                            balanceBox.style.color = '#4F46E5'; // purple
                        }
                    }
                    button.dispatchEvent(new CustomEvent('aipass:balance', {
                        bubbles: true,
                        detail: { balance: balance.data.remainingBudget, formatted: amount }
                    }));
                }
            } catch (error) {
                console.error('Failed to fetch balance:', error);
            }
        }

        refreshBalance(buttonElement) {
            if (!buttonElement) {
                this.buttons.forEach(btn => this._fetchAndDisplayBalance(btn));
            } else {
                this._fetchAndDisplayBalance(buttonElement);
            }
        }

        reinit() {
            this._initButtons();
        }

        isConnected(buttonElement) {
            return buttonElement?.classList?.contains('connected') || false;
        }
    }

    // ============================================================================
    // EXPORT
    // ============================================================================

    const AiPass = new AiPassSDK();
    const AiPassUIManager = new AiPassUI(AiPass);

    // Expose UI (but don't auto-init)
    global.AiPassUI = {
        init: () => AiPassUIManager.init(),
        refreshBalance: (btn) => AiPassUIManager.refreshBalance(btn),
        reinit: () => AiPassUIManager.reinit(),
        isConnected: (btn) => AiPassUIManager.isConnected(btn)
    };

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AiPass;
    } else {
        global.AiPass = AiPass;
    }

})(typeof window !== 'undefined' ? window : this);