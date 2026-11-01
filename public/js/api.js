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

  async getOrders(email = '') {
    const query = email ? `?email=${encodeURIComponent(email)}` : '';
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

  // User Profile
  async updateProfile(profileData) {
    return apiRequest('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  async updatePassword(passwordData) {
    return apiRequest('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify(passwordData)
    });
  },

  // Admin Product Management
  async createProduct(productData) {
    return apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async updateProduct(id, productData) {
    return apiRequest(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData)
    });
  },

  async deleteProduct(id) {
    return apiRequest(`/api/products/${id}`, {
      method: 'DELETE'
    });
  },

  // Coupons
  async validateCoupon(code, subtotal) {
    return apiRequest('/api/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal })
    });
  },

  async getAdminCoupons() {
    return apiRequest('/api/admin/coupons');
  },

  async createCoupon(couponData) {
    return apiRequest('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(couponData)
    });
  },

  async deleteCoupon(id) {
    return apiRequest(`/api/admin/coupons/${id}`, {
      method: 'DELETE'
    });
  },

  // Contact
  async submitContact(contactData) {
    return apiRequest('/api/contact', {
      method: 'POST',
      body: JSON.stringify(contactData)
    });
  },

  async getAdminContacts() {
    return apiRequest('/api/admin/contacts');
  },

  // Admin Analytics & Customers
  async getAdminDashboard() {
    return apiRequest('/api/admin/dashboard');
  },

  async getAdminCustomers() {
    return apiRequest('/api/admin/customers');
  },

  // Wishlist API (Synchronized with SQLite backend)
  async getWishlist() {
    return apiRequest('/api/wishlist');
  },

  async toggleWishlist(productId) {
    return apiRequest(`/api/wishlist/${productId}`, {
      method: 'POST'
    });
  },

  async removeWishlist(productId) {
    return apiRequest(`/api/wishlist/${productId}`, {
      method: 'DELETE'
    });
  },

  // Admin Category Management
  async adminCreateCategory(categoryData) {
    return apiRequest('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(categoryData)
    });
  },

  async adminUpdateCategory(name, categoryData) {
    return apiRequest(`/api/admin/categories/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(categoryData)
    });
  },

  async adminDeleteCategory(name) {
    return apiRequest(`/api/admin/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
  }
};

window.api = api;
