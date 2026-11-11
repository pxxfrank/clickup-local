export async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('clickup:unauthorized'));
    }
    const error = new Error(data?.error || `请求失败 (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  get(path, params) {
    let url = path;
    if (params) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') search.set(key, value);
      });
      const query = search.toString();
      if (query) url += `${url.includes('?') ? '&' : '?'}${query}`;
    }
    return apiRequest(url);
  },
  post(path, body) {
    return apiRequest(path, { method: 'POST', body });
  },
  patch(path, body) {
    return apiRequest(path, { method: 'PATCH', body });
  },
  delete(path, body) {
    return apiRequest(path, { method: 'DELETE', body });
  },
};
