/**
 * CodeAlpha E-Commerce Store - Auth Manager
 */

const auth = {
  currentUser: null,
  listeners: [],

  async init() {
    try {
      this.currentUser = await window.api.getCurrentUser();
    } catch (e) {
      this.currentUser = null;
    }
    this.notify();
    this.bindEvents();
  },

  onChange(callback) {
    this.listeners.push(callback);
  },

  notify() {
    this.listeners.forEach(cb => cb(this.currentUser));
    this.updateUI();
  },

  async login(email, password) {
    const res = await window.api.login(email, password);
    this.currentUser = res.user;
    this.notify();
    return res;
  },

  async register(name, email, password) {
    const res = await window.api.register(name, email, password);
    this.currentUser = res.user;
    this.notify();
    return res;
  },

  logout() {
    window.api.logout();
    this.currentUser = null;
    this.notify();
    window.app?.showToast('You have been signed out.', 'info');
  },

  updateUI() {
    const userBtn = document.getElementById('user-menu-btn');
    const userMenuText = document.getElementById('user-menu-text');
    const userAvatar = document.getElementById('user-menu-avatar');
    const userDropdown = document.getElementById('user-dropdown');
    const userProfileName = document.getElementById('user-profile-name');
    const userProfileEmail = document.getElementById('user-profile-email');
    const userProfileRole = document.getElementById('user-profile-role');

    const adminNavBtn = document.getElementById('admin-nav-btn');
    const adminDropdownLink = document.getElementById('user-menu-admin-link');

    if (this.currentUser) {
      const isAdmin = this.currentUser.role === 'admin';
      if (userMenuText) userMenuText.textContent = this.currentUser.name.split(' ')[0];
      if (userAvatar) {
        userAvatar.src = this.currentUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(this.currentUser.name)}`;
        userAvatar.classList.remove('hidden');
      }
      if (userProfileName) userProfileName.textContent = this.currentUser.name;
      if (userProfileEmail) userProfileEmail.textContent = this.currentUser.email;
      if (userProfileRole) {
        userProfileRole.textContent = this.currentUser.role.toUpperCase();
        userProfileRole.className = `badge badge-${isAdmin ? 'admin' : 'customer'}`;
      }
      userBtn?.setAttribute('data-logged-in', 'true');

      if (adminNavBtn) {
        if (isAdmin) adminNavBtn.classList.remove('hidden');
        else adminNavBtn.classList.add('hidden');
      }
      if (adminDropdownLink) {
        if (isAdmin) adminDropdownLink.classList.remove('hidden');
        else adminDropdownLink.classList.add('hidden');
      }
    } else {
      if (userMenuText) userMenuText.textContent = 'Sign In';
      if (userAvatar) userAvatar.classList.add('hidden');
      userBtn?.setAttribute('data-logged-in', 'false');
      adminNavBtn?.classList.add('hidden');
      adminDropdownLink?.classList.add('hidden');
    }
  },

  bindEvents() {
    const userBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    const logoutBtn = document.getElementById('logout-btn');
    const adminNavBtn = document.getElementById('admin-nav-btn');
    const adminDropdownLink = document.getElementById('user-menu-admin-link');

    adminNavBtn?.addEventListener('click', () => {
      window.app?.openAdminModal();
    });

    adminDropdownLink?.addEventListener('click', () => {
      userDropdown?.classList.remove('active');
      window.app?.openAdminModal();
    });

    userBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentUser) {
        userDropdown?.classList.toggle('active');
      } else {
        window.app?.openAuthModal('login');
      }
    });

    document.addEventListener('click', (e) => {
      if (!userDropdown?.contains(e.target) && e.target !== userBtn) {
        userDropdown?.classList.remove('active');
      }
    });

    logoutBtn?.addEventListener('click', () => {
      userDropdown?.classList.remove('active');
      this.logout();
    });

    // Tab switching in Auth modal
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    tabLogin?.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister?.classList.remove('active');
      formLogin?.classList.remove('hidden');
      formRegister?.classList.add('hidden');
      document.getElementById('auth-error-msg').textContent = '';
    });

    tabRegister?.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin?.classList.remove('active');
      formRegister?.classList.remove('hidden');
      formLogin?.classList.add('hidden');
      document.getElementById('auth-error-msg').textContent = '';
    });

    // Fill demo accounts
    document.getElementById('fill-demo-user')?.addEventListener('click', () => {
      document.getElementById('login-email').value = 'alex@alphastore.io';
      document.getElementById('login-password').value = 'alpha123';
    });

    document.getElementById('fill-demo-admin')?.addEventListener('click', () => {
      document.getElementById('login-email').value = 'admin@alphastore.io';
      document.getElementById('login-password').value = 'admin123';
    });

    // Form submissions
    formLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorBox = document.getElementById('auth-error-msg');
      const submitBtn = formLogin.querySelector('button[type="submit"]');

      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        await this.login(email, password);
        window.app?.closeModal('auth-modal');
        window.app?.showToast(`Welcome back, ${this.currentUser.name}!`, 'success');
        // Refresh cart for user
        await window.cart?.load();
      } catch (err) {
        errorBox.textContent = err.message || 'Login failed. Please check credentials.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });

    formRegister?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const errorBox = document.getElementById('auth-error-msg');
      const submitBtn = formRegister.querySelector('button[type="submit"]');

      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';

      try {
        await this.register(name, email, password);
        window.app?.closeModal('auth-modal');
        window.app?.showToast(`Account created! Welcome, ${this.currentUser.name}!`, 'success');
        await window.cart?.load();
      } catch (err) {
        errorBox.textContent = err.message || 'Registration failed.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  }
};

window.auth = auth;
