/**
 * CodeAlpha E-Commerce Store API Client
 * Seamlessly interfaces with Express.js REST API
 */

const API_BASE = window.location.origin;

// Session ID for guest cart handling
function getSessionId() {
  let sid = localStorage.getItem('ca_session_id');
  if (!sid) {
    sid = 'session_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
    localStorage.setItem('ca_session_id', sid);
  }
  return sid;
}

// Auth Token management
function getAuthToken() {
  return localStorage.getItem('ca_auth_token');
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('ca_auth_token', token);
  } else {
    localStorage.removeItem('ca_auth_token');
  }
}

// Generic Request Helper
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-session-id': getSessionId(),
    ...(options.headers || {})
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }
  return data;
}

const api = {
  // Products
  async getCategories() {
    return apiRequest('/api/categories');
  },

  async getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'All') query.append('category', params.category);
    if (params.search) query.append('search', params.search);
    if (params.sort) query.append('sort', params.sort);
    if (params.minPrice) query.append('minPrice', params.minPrice);
    if (params.maxPrice) query.append('maxPrice', params.maxPrice);
    if (params.inStock) query.append('inStock', 'true');
    if (params.featured) query.append('featured', 'true');

    const qs = query.toString();
    return apiRequest(`/api/products${qs ? `?${qs}` : ''}`);
  },

  async getProductById(id) {
    return apiRequest(`/api/products/${id}`);
  },

  async submitReview(productId, reviewData) {
    return apiRequest(`/api/products/${productId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(reviewData)
    });
  },

  // Auth
  async register(name, email, password) {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  async login(email, password) {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  async getCurrentUser() {
    if (!getAuthToken()) return null;
    try {
      const data = await apiRequest('/api/auth/me');
      return data.user;
    } catch (e) {
      setAuthToken(null);
      return null;
    }
  },

  logout() {
    setAuthToken(null);
  },

  // Cart
  async getCart() {
    return apiRequest('/api/cart');
  },

  async addToCart(productId, quantity = 1) {
    return apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
  },

  async updateCartItem(productId, quantity) {
    return apiRequest(`/api/cart/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    });
  },

  async removeCartItem(productId) {
    return apiRequest(`/api/cart/${productId}`, {
      method: 'DELETE'
    });
  },

  async clearCart() {
    return apiRequest('/api/cart', {
      method: 'DELETE'
    });
  },

  // Orders
  async createOrder(orderPayload) {
    return apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });
  },

  async getOrders(email = '', status = '') {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (status && status !== 'All') params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/orders${query}`);
  },

  async getOrderByNumber(orderNumber) {
    return apiRequest(`/api/orders/${encodeURIComponent(orderNumber)}`);
  },

  async updateOrderStatus(orderId, status) {
    return apiRequest(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  async cancelOrder(orderId) {
    return apiRequest(`/api/orders/${orderId}/cancel`, {
      method: 'POST'
    });
  },

  async getStats() {
    return apiRequest('/api/stats');
  },

  // Admin Product Management
  async createProduct(productData) {
    return apiRequest('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async updateProduct(productId, updates) {
    return apiRequest(`/api/admin/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  async deleteProduct(productId) {
    return apiRequest(`/api/admin/products/${productId}`, {
      method: 'DELETE'
    });
  }
};

window.api = api;
