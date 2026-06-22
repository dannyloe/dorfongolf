if (!import.meta.env.DEV) {
  const BASE = import.meta.env.VITE_API_BASE_URL || "https://dorfongolf.com";
  const SESSION_KEY = "cap_sid";

  const _fetch = window.fetch.bind(window);

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === "string" && input.startsWith("/")) {
      input = `${BASE}${input}`;
    } else if (input instanceof URL && input.origin === location.origin) {
      input = `${BASE}${input.pathname}${input.search}`;
    }

    const sid = localStorage.getItem(SESSION_KEY);
    if (sid) {
      const existing = (init?.headers) as Record<string, string> | undefined;
      init = {
        ...init,
        headers: { ...(existing || {}), "X-Session-Id": sid },
      };
    }

    return _fetch(input, init);
  };
}
