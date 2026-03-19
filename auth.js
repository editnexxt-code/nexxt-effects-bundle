/** Nexxt Guard - Server Auth System */
(function () {
    const VALIDATE_URL = 'https://nexxtedit.netlify.app/.netlify/functions/validate-login';
    const USAGE_URL    = 'https://nexxtedit.netlify.app/.netlify/functions/check-and-increment-usage';

    /** Generates a stable device ID from machine info (Node.js available in CEP) */
    function getDeviceId() {
        try {
            const os     = require('os');
            const crypto = require('crypto');
            return crypto
                .createHash('sha256')
                .update(os.hostname() + os.platform() + os.arch())
                .digest('hex')
                .substring(0, 32);
        } catch (e) {
            // Fallback: persist a random ID in localStorage
            let id = localStorage.getItem('nexxt_device_id');
            if (!id) {
                id = Math.random().toString(36).substring(2) + Date.now().toString(36);
                localStorage.setItem('nexxt_device_id', id);
            }
            return id;
        }
    }

    window.nexxtAuth = {

        /** Returns true if there is a valid session stored locally */
        check: function () {
            try {
                const s = JSON.parse(localStorage.getItem('nexxt_session') || 'null');
                return !!(s && s.license_key && s.plan);
            } catch { return false; }
        },

        /** Returns the full session object { email, plan, license_key } or null */
        getSession: function () {
            try {
                return JSON.parse(localStorage.getItem('nexxt_session') || 'null');
            } catch { return null; }
        },

        /**
         * Authenticates against the Netlify backend.
         * @param {string} email
         * @param {string} licenseKey
         * @returns {Promise<{ ok: boolean, user?: object, error?: string }>}
         */
        login: async function (email, licenseKey) {
            if (!email || !licenseKey) {
                return { ok: false, error: 'missing_fields' };
            }

            if (typeof window.__adobe_cep__ === 'undefined') {
                console.error('[Nexxt] Ambiente inválido: plugin deve rodar dentro do Adobe Premiere Pro.');
                return { ok: false, error: 'invalid_environment' };
            }

            try {
                const res = await fetch(VALIDATE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email:       email.trim().toLowerCase(),
                        license_key: licenseKey.trim().toUpperCase(),
                        device_id:   getDeviceId(),
                    }),
                });

                const data = await res.json();

                if (res.ok && data.ok) {
                    localStorage.setItem('nexxt_session', JSON.stringify({
                        email:       data.user.email,
                        plan:        data.user.plan,
                        license_key: data.user.license_key,
                    }));
                    return { ok: true, user: data.user };
                }

                return { ok: false, error: data.error || 'auth_failed' };

            } catch (e) {
                console.error('[Nexxt] Login error:', e);
                return { ok: false, error: 'network_error' };
            }
        },

        /**
         * Checks quota and increments usage counter for one generation.
         * Call this BEFORE every image or video generation.
         * @param {'image'|'video'} action
         * @returns {Promise<{ allowed: boolean, remaining?: number, limit?: number, plan?: string, error?: string }>}
         */
        checkUsage: async function (action) {
            const session = this.getSession();
            if (!session) return { allowed: false, error: 'not_logged_in' };

            try {
                const res = await fetch(USAGE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        license_key: session.license_key,
                        action,      // "image" or "video"
                    }),
                });

                return await res.json();

            } catch (e) {
                console.error('[Nexxt] Usage check error:', e);
                return { allowed: false, error: 'network_error' };
            }
        },

        logout: function () {
            localStorage.removeItem('nexxt_session');
            location.reload();
        }
    };
})();
