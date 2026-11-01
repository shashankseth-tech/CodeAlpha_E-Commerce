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
    window.app?.loadWishlist();
    return res;
  },

  async register(name, email, password) {
    const res = await window.api.register(name, email, password);
    this.currentUser = res.user;
    this.notify();
    window.app?.loadWishlist();
    return res;
  },

  logout() {
    window.api.logout();
    this.currentUser = null;
    this.notify();
    window.app?.showToast('You have been signed out.', 'info');
  },

  openFullscreenAuth(mode = 'login') {
    const fsView = document.getElementById('auth-fullscreen-view');
    const storeApp = document.getElementById('storefront-app');
    if (!fsView) return;

    if (storeApp) storeApp.style.display = 'none';
    fsView.classList.remove('hidden');
    window.scrollTo(0, 0);

    if (mode === 'register') {
      this.showFullscreenRegister();
    } else {
      this.showFullscreenLogin();
    }
  },

  closeFullscreenAuth(redirectHash = true) {
    const fsView = document.getElementById('auth-fullscreen-view');
    const storeApp = document.getElementById('storefront-app');
    if (fsView) fsView.classList.add('hidden');
    if (storeApp) storeApp.style.display = '';

    if (redirectHash) {
      if (window.location.hash === '#login' || window.location.hash === '#register') {
        history.pushState("", document.title, window.location.pathname + window.location.search);
      }
    }
  },

  showFullscreenLogin() {
    const loginCard = document.getElementById('auth-screen-login');
    const registerCard = document.getElementById('auth-screen-register');
    const loginErr = document.getElementById('fs-login-error');
    if (loginErr) loginErr.classList.add('hidden');

    if (loginCard) loginCard.classList.remove('hidden');
    if (registerCard) registerCard.classList.add('hidden');
    if (window.location.hash !== '#login') {
      window.location.hash = '#login';
    }
    setTimeout(() => document.getElementById('fs-login-email')?.focus(), 100);
  },

  showFullscreenRegister() {
    const loginCard = document.getElementById('auth-screen-login');
    const registerCard = document.getElementById('auth-screen-register');
    const regErr = document.getElementById('fs-register-error');
    if (regErr) regErr.classList.add('hidden');

    if (registerCard) registerCard.classList.remove('hidden');
    if (loginCard) loginCard.classList.add('hidden');
    if (window.location.hash !== '#register') {
      window.location.hash = '#register';
    }
    setTimeout(() => document.getElementById('fs-reg-name')?.focus(), 100);
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
    const userMenuAdminLink = document.getElementById('user-menu-admin-link');

    if (this.currentUser) {
      if (userMenuText) userMenuText.textContent = this.currentUser.name.split(' ')[0];
      if (userAvatar) {
        userAvatar.src = this.currentUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(this.currentUser.name)}`;
        userAvatar.classList.remove('hidden');
      }
      if (userProfileName) userProfileName.textContent = this.currentUser.name;
      if (userProfileEmail) userProfileEmail.textContent = this.currentUser.email;
      if (userProfileRole) {
        userProfileRole.textContent = this.currentUser.role.toUpperCase();
        userProfileRole.className = `brutalist-tag ${this.currentUser.role === 'admin' ? 'tag-warning' : 'tag-neon'}`;
      }
      userBtn?.setAttribute('data-logged-in', 'true');

      // Admin toggles
      if (this.currentUser.role === 'admin') {
        adminNavBtn?.classList.remove('hidden');
        userMenuAdminLink?.classList.remove('hidden');
      } else {
        adminNavBtn?.classList.add('hidden');
        userMenuAdminLink?.classList.add('hidden');
      }

      // Populate profile card
      const pName = document.getElementById('profile-card-name');
      const pEmail = document.getElementById('profile-card-email');
      const pRole = document.getElementById('profile-card-badge');
      const pAvatar = document.getElementById('profile-card-avatar');
      const pInName = document.getElementById('profile-input-name');
      const pInPhone = document.getElementById('profile-input-phone');

      if (pName) pName.textContent = this.currentUser.name;
      if (pEmail) pEmail.textContent = this.currentUser.email;
      if (pRole) pRole.textContent = this.currentUser.role.toUpperCase();
      if (pAvatar) pAvatar.src = this.currentUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(this.currentUser.name)}`;
      if (pInName) pInName.value = this.currentUser.name || '';
      if (pInPhone) pInPhone.value = this.currentUser.phone || '';
    } else {
      if (userMenuText) userMenuText.textContent = 'Sign In';
      if (userAvatar) userAvatar.classList.add('hidden');
      userBtn?.setAttribute('data-logged-in', 'false');
      adminNavBtn?.classList.add('hidden');
      userMenuAdminLink?.classList.add('hidden');
    }
  },

  bindEvents() {
    const userBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    const logoutBtn = document.getElementById('logout-btn');
    const authModal = document.getElementById('auth-modal');

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

    // Profile & wishlist navigation links
    document.getElementById('user-menu-profile-link')?.addEventListener('click', () => {
      userDropdown?.classList.remove('active');
      window.app?.openProfileModal();
    });

    document.getElementById('user-menu-wishlist-link')?.addEventListener('click', () => {
      userDropdown?.classList.remove('active');
      window.app?.openWishlistModal();
    });

    document.getElementById('user-menu-admin-link')?.addEventListener('click', () => {
      userDropdown?.classList.remove('active');
      window.app?.openAdminModal();
    });

    document.getElementById('admin-nav-btn')?.addEventListener('click', () => {
      window.app?.openAdminModal();
    });

    // Profile modal tabs
    const tabInfo = document.getElementById('tab-profile-info');
    const tabSecurity = document.getElementById('tab-profile-security');
    const formInfo = document.getElementById('form-update-profile');
    const formSecurity = document.getElementById('form-update-password');

    tabInfo?.addEventListener('click', () => {
      tabInfo.classList.add('active');
      tabSecurity?.classList.remove('active');
      formInfo?.classList.remove('hidden');
      formSecurity?.classList.add('hidden');
    });

    tabSecurity?.addEventListener('click', () => {
      tabSecurity.classList.add('active');
      tabInfo?.classList.remove('active');
      formSecurity?.classList.remove('hidden');
      formInfo?.classList.add('hidden');
    });

    // Update profile form
    formInfo?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profile-input-name').value.trim();
      const phone = document.getElementById('profile-input-phone').value.trim();
      const submitBtn = formInfo.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      try {
        const res = await window.api.updateProfile({ name, phone });
        this.currentUser = res.user;
        this.notify();
        window.app?.showToast('Profile updated successfully!', 'success');
      } catch (err) {
        window.app?.showToast(err.message || 'Failed to update profile', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'SAVE PROFILE CHANGES';
      }
    });

    // Update password form
    formSecurity?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('profile-current-password').value;
      const newPassword = document.getElementById('profile-new-password').value;
      const submitBtn = formSecurity.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';
      try {
        const res = await window.api.updatePassword({ currentPassword, newPassword });
        window.app?.showToast(res.message || 'Password updated successfully!', 'success');
        formSecurity.reset();
      } catch (err) {
        window.app?.showToast(err.message || 'Password update failed', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'UPDATE SECURITY PASSWORD';
      }
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

    // Full-screen demo fill buttons
    document.getElementById('fs-demo-user-btn')?.addEventListener('click', () => {
      const emailInput = document.getElementById('fs-login-email');
      const pwInput = document.getElementById('fs-login-password');
      if (emailInput) emailInput.value = 'alex@alphastore.io';
      if (pwInput) pwInput.value = 'alpha123';
    });

    document.getElementById('fs-demo-admin-btn')?.addEventListener('click', () => {
      const emailInput = document.getElementById('fs-login-email');
      const pwInput = document.getElementById('fs-login-password');
      if (emailInput) emailInput.value = 'admin@alphastore.io';
      if (pwInput) pwInput.value = 'admin123';
    });

    // Forgot password trigger
    document.getElementById('fs-forgot-pw-link')?.addEventListener('click', () => {
      const email = document.getElementById('fs-login-email')?.value.trim();
      if (!email) {
        alert('Enter your email address in the field below, or click "👤 CUSTOMER DEMO" / "⚙️ ADMIN DEMO" to sign in instantly.');
        document.getElementById('fs-login-email')?.focus();
      } else {
        alert(`Password reset link dispatched to ${email}. In demo mode, you can sign in directly using the pre-configured Demo credentials above.`);
      }
    });

    // Full-screen login form submission
    const fsLoginForm = document.getElementById('fs-login-form');
    fsLoginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('fs-login-email').value.trim();
      const password = document.getElementById('fs-login-password').value;
      const errorBox = document.getElementById('fs-login-error');
      const submitBtn = document.getElementById('fs-login-submit-btn');

      if (errorBox) {
        errorBox.textContent = '';
        errorBox.classList.add('hidden');
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'AUTHENTICATING...';
      }

      try {
        await this.login(email, password);
        this.closeFullscreenAuth(true);

        // Role-based routing after login
        if (this.currentUser && this.currentUser.role === 'admin') {
          window.app?.showToast(`Welcome Administrator ${this.currentUser.name}! Command center active.`, 'success');
          window.app?.openAdminModal();
        } else {
          window.app?.showToast(`Welcome back, ${this.currentUser.name}!`, 'success');
        }
        await window.cart?.load();
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || 'Login failed. Please check credentials.';
          errorBox.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'SIGN IN TO ACCOUNT →';
        }
      }
    });

    // Full-screen register form submission
    const fsRegisterForm = document.getElementById('fs-register-form');
    fsRegisterForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('fs-reg-name').value.trim();
      const email = document.getElementById('fs-reg-email').value.trim();
      const password = document.getElementById('fs-reg-password').value;
      const errorBox = document.getElementById('fs-register-error');
      const submitBtn = document.getElementById('fs-reg-submit-btn');

      if (errorBox) {
        errorBox.textContent = '';
        errorBox.classList.add('hidden');
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'CREATING ACCOUNT...';
      }

      try {
        await this.register(name, email, password);
        this.closeFullscreenAuth(true);
        window.app?.showToast(`Account created! Welcome to Alpha Store, ${this.currentUser.name}!`, 'success');
        await window.cart?.load();
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || 'Registration failed.';
          errorBox.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'CREATE ACCOUNT & ENTER →';
        }
      }
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
