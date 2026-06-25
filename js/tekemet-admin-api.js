(function initExortAdminApiConfig() {
  const PROD_ENDPOINT = "/.netlify/functions/tekemet-admin";
  const STORAGE_KEY = "exort.admin.apiUrl";
  const META_SELECTOR = 'meta[name="exort-admin-api"]';
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

  function isLocalhost() {
    return LOCAL_HOSTS.has(window.location.hostname);
  }

  function normalizeEndpoint(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
    if (raw.startsWith("/")) return raw;
    return "";
  }

  function getConfiguredEndpoint() {
    const metaValue = document.querySelector(META_SELECTOR)?.content || "";
    const storedValue = localStorage.getItem(STORAGE_KEY) || "";
    const explicitValue = window.EXORT_ADMIN_API_URL || window.TEKEMET_ADMIN_API || metaValue || storedValue;
    return normalizeEndpoint(explicitValue);
  }

  function getEndpointError(endpoint) {
    if (!isLocalhost()) return "";
    if (!endpoint) {
      return "Для локального входа через Live Server укажите полный URL Cloudflare Worker в window.EXORT_ADMIN_API_URL или localStorage key exort.admin.apiUrl.";
    }
    if (!/^https?:\/\//i.test(endpoint)) {
      return "На локальном сервере API должен быть указан полным URL Cloudflare Worker. Относительный путь для Live Server не подходит.";
    }
    return "";
  }

  function resolveEndpoint() {
    const configured = getConfiguredEndpoint();
    if (configured) return configured;
    return isLocalhost() ? "" : PROD_ENDPOINT;
  }

  const endpoint = resolveEndpoint();
  const configError = getEndpointError(endpoint);

  window.EXORT_ADMIN_API_CONFIG = {
    endpoint,
    configError,
    isLocalhost: isLocalhost(),
    productionEndpoint: PROD_ENDPOINT,
    storageKey: STORAGE_KEY,
  };

  window.TEKEMET_ADMIN_API = endpoint;

  window.TekemetAdminApi = {
    endpoint,
    configError,
    async request(action, payload = {}) {
      if (configError) throw new Error(configError);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || "Ошибка запроса Exort Admin");
      }
      return data;
    },
  };
})();
