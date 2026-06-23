(function () {
    const CONFIG = {
        url: (window.TEKEMET_SUPABASE_CONFIG && window.TEKEMET_SUPABASE_CONFIG.url) || window.TEKEMET_SUPABASE_URL || localStorage.getItem('tekemet.supabase.url') || '',
        anonKey: (window.TEKEMET_SUPABASE_CONFIG && window.TEKEMET_SUPABASE_CONFIG.anonKey) || window.TEKEMET_SUPABASE_ANON_KEY || localStorage.getItem('tekemet.supabase.anonKey') || ''
    };

    let client = null;

    function getClient() {
        if (client) {
            return client;
        }

        if (!window.supabase || !CONFIG.url || !CONFIG.anonKey) {
            return null;
        }

        client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });

        return client;
    }

    function setConfig(overrides) {
        if (!overrides) {
            return;
        }

        if (overrides.url) {
            CONFIG.url = overrides.url;
            localStorage.setItem('tekemet.supabase.url', overrides.url);
        }

        if (overrides.anonKey) {
            CONFIG.anonKey = overrides.anonKey;
            localStorage.setItem('tekemet.supabase.anonKey', overrides.anonKey);
        }

        client = null;
    }

    window.TekemetSupabase = {
        getClient,
        setConfig,
        hasConfig() {
            return Boolean(CONFIG.url && CONFIG.anonKey);
        },
        getConfig() {
            return {
                url: CONFIG.url,
                anonKey: CONFIG.anonKey
            };
        }
    };
})();
