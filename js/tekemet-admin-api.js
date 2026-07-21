(function initTekemetAdminApiConfig() {
  const PROD_ENDPOINT = "/api/tekemet-admin";
  const LOCAL_FALLBACK_ENDPOINT = "/api/tekemet-admin";
  const STORAGE_KEY = "tekemet.admin.apiUrl";
  const META_SELECTOR = 'meta[name="tekemet-admin-api"]';
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
    const explicitValue = window.TEKEMET_ADMIN_API || metaValue || storedValue;
    return normalizeEndpoint(explicitValue);
  }

  function getEndpointError(endpoint) {
    if (!isLocalhost()) return "";
    if (!endpoint) {
      return "Для локального входа укажите полный адрес административного сервиса в window.TEKEMET_ADMIN_API или настройке tekemet.admin.apiUrl.";
    }
    if (!/^https?:\/\//i.test(endpoint)) {
      return "На локальном сервере укажите полный адрес административного сервиса. Относительный адрес для Live Server не подходит.";
    }
    return "";
  }

  function resolveEndpoint() {
    const configured = getConfiguredEndpoint();
    if (configured) return configured;
    return isLocalhost() ? LOCAL_FALLBACK_ENDPOINT : PROD_ENDPOINT;
  }

  const endpoint = resolveEndpoint();
  const configError = getEndpointError(endpoint);

  window.TEKEMET_ADMIN_API_CONFIG = {
    endpoint,
    configError,
    isLocalhost: isLocalhost(),
    productionEndpoint: PROD_ENDPOINT,
    localFallbackEndpoint: LOCAL_FALLBACK_ENDPOINT,
    storageKey: STORAGE_KEY,
  };

  window.TEKEMET_ADMIN_API = endpoint;

})();
