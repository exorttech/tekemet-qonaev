window.TEKEMET_ADMIN_API = "/.netlify/functions/tekemet-admin";

window.TekemetAdminApi = {
  endpoint: window.TEKEMET_ADMIN_API,
  async request(action, payload = {}) {
    const response = await fetch(window.TEKEMET_ADMIN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "Exort admin request failed");
    return data;
  },
};
