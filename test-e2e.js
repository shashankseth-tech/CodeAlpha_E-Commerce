/**
 * End-to-End Automated Validation Test for ALPHA // STORE
 */
const http = require('http');

async function runTests() {
  console.log('>>> [TEST] Starting ALPHA // STORE End-to-End Test Suite...');
  
  // Set test port
  process.env.PORT = '3088';
  process.env.JWT_SECRET = 'test-secret-suite-2026';
  
  // Require server (starts server on port 3088)
  require('./server.js');

  // Helper for requests
  function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: 'localhost',
        port: 3088,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
          ...headers
        }
      };

      const req = http.request(opts, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      });

      req.on('error', err => reject(err));
      if (postData) req.write(postData);
      req.end();
    });
  }

  // Wait 1.5s for server listen
  await new Promise(r => setTimeout(r, 1500));

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 0. Static Frontend Assets & Integrity
    console.log('\n--- 0. Testing Static Assets & Frontend Integrity ---');
    const htmlRes = await request('GET', '/');
    assert(htmlRes.status === 200 && typeof htmlRes.raw === 'string' && htmlRes.raw.includes('products-grid'), 'GET / serves HTML with storefront catalog');
    assert(htmlRes.raw.includes('id="cart-drawer"') && htmlRes.raw.includes('id="auth-modal"'), 'HTML contains required shopping cart drawer and auth modal');
    assert(htmlRes.raw.includes('id="auth-fullscreen-view"') && htmlRes.raw.includes('id="storefront-app"'), 'HTML contains isolated full-screen authentication view and storefront wrapper');
    assert(htmlRes.raw.includes('id="fs-login-form"') && htmlRes.raw.includes('id="fs-register-form"'), 'HTML contains dedicated full-screen login and registration forms');
    assert(htmlRes.raw.includes('id="product-editor-modal"') && htmlRes.raw.includes('id="admin-modal"'), 'HTML contains admin dashboard and product management modals');

    const cssRes = await request('GET', '/styles/main.css');
    assert(cssRes.status === 200 && typeof cssRes.raw === 'string', 'GET /styles/main.css serves stylesheet');
    const openBraces = (cssRes.raw.match(/\{/g) || []).length;
    const closeBraces = (cssRes.raw.match(/\}/g) || []).length;
    assert(openBraces === closeBraces && openBraces > 0, `main.css braces are perfectly balanced (${openBraces} opens, ${closeBraces} closes)`);

    const appJsRes = await request('GET', '/js/app.js');
    assert(appJsRes.status === 200 && !appJsRes.raw.includes('SyntaxError'), 'GET /js/app.js serves application script');

    // 1. Categories
    console.log('\n--- 1. Testing Products & Categories ---');
    const catRes = await request('GET', '/api/categories');
    assert(catRes.status === 200 && catRes.data.categories.length >= 5, 'GET /api/categories returns 5+ categories');

    // 2. Products List
    const prodRes = await request('GET', '/api/products');
    assert(prodRes.status === 200 && prodRes.data.products.length >= 10, 'GET /api/products returns catalog items');

    // 3. Search & Category Filter
    const searchRes = await request('GET', '/api/products?search=Apex');
    assert(searchRes.status === 200 && searchRes.data.products.length >= 1, 'GET /api/products?search=Apex matches headphones');

    const filterRes = await request('GET', '/api/products?category=Audio');
    assert(filterRes.status === 200 && filterRes.data.products.every(p => p.category === 'Audio'), 'GET /api/products?category=Audio filters strictly by category');

    // 4. Product Details
    const detailRes = await request('GET', '/api/products/1');
    assert(detailRes.status === 200 && detailRes.data.product.id === 1, 'GET /api/products/1 returns product details with reviews');

    // 5. Submit Review
    const revRes = await request('POST', '/api/products/1/reviews', {
      name: 'Jordan Lee',
      rating: 5,
      comment: 'Unbelievable acoustic staging and noise isolation. 10/10.'
    });
    assert(revRes.status === 200 && revRes.data.success === true, 'POST /api/products/:id/reviews submits verified review');

    // 6. User Registration & Duplicate Rejection
    console.log('\n--- 2. Testing Authentication & User Profiles ---');
    const uniqueEmail = `test_${Date.now()}@alphastore.io`;
    const regRes = await request('POST', '/api/auth/register', {
      name: 'Test Customer',
      email: uniqueEmail,
      password: 'password123'
    });
    assert(regRes.status === 201 && regRes.data.token, 'POST /api/auth/register creates user and returns JWT');

    const dupRes = await request('POST', '/api/auth/register', {
      name: 'Duplicate',
      email: uniqueEmail,
      password: 'password123'
    });
    assert(dupRes.status === 400, 'POST /api/auth/register rejects duplicate email address');

    // 7. Login
    const loginRes = await request('POST', '/api/auth/login', {
      email: uniqueEmail,
      password: 'password123'
    });
    assert(loginRes.status === 200 && loginRes.data.token, 'POST /api/auth/login logs in customer');
    const customerToken = loginRes.data.token;
    const customerAuth = { 'Authorization': `Bearer ${customerToken}` };

    // 8. User Profile Get & Update
    const meRes = await request('GET', '/api/auth/me', null, customerAuth);
    assert(meRes.status === 200 && meRes.data.user.email === uniqueEmail, 'GET /api/auth/me returns authenticated user details');

    const profileRes = await request('PUT', '/api/auth/profile', {
      name: 'Test Customer Updated',
      phone: '+1 555-999-8888'
    }, customerAuth);
    assert(profileRes.status === 200 && profileRes.data.user.phone === '+1 555-999-8888', 'PUT /api/auth/profile updates profile');

    // 9. Password Change
    const passRes = await request('PUT', '/api/auth/password', {
      currentPassword: 'password123',
      newPassword: 'newsecurepassword456'
    }, customerAuth);
    assert(passRes.status === 200 && passRes.data.success === true, 'PUT /api/auth/password updates password');

    // 10. Cart Flow
    console.log('\n--- 3. Testing Cart & Coupon Validation ---');
    const addToCartRes = await request('POST', '/api/cart', { productId: 1, quantity: 2 }, customerAuth);
    assert(addToCartRes.status === 200, 'POST /api/cart adds product to cart');

    const getCartRes = await request('GET', '/api/cart', null, customerAuth);
    assert(getCartRes.status === 200 && getCartRes.data.items.length === 1 && getCartRes.data.totalQuantity === 2, 'GET /api/cart returns stored items');

    const updateCartRes = await request('PUT', '/api/cart/1', { quantity: 1 }, customerAuth);
    assert(updateCartRes.status === 200, 'PUT /api/cart/:id updates quantity');

    // 11. Coupon Validation
    const couponRes = await request('POST', '/api/coupons/validate', { code: 'ALPHA15', subtotal: 300 });
    assert(couponRes.status === 200 && couponRes.data.discountPercent === 15, 'POST /api/coupons/validate validates ALPHA15 (15%)');

    // 12. Checkout & Order Placement
    console.log('\n--- 4. Testing Order Processing & Stock Integrity ---');
    const orderPayload = {
      customerName: 'Test Customer Updated',
      customerEmail: uniqueEmail,
      shippingAddress: '100 Silicon Way, Austin, TX 78701',
      paymentMethod: 'Cash on Delivery',
      promoCode: 'ALPHA15',
      items: [{ id: 1, quantity: 1 }]
    };

    const prodBefore = (await request('GET', '/api/products/1')).data.product;
    const initialStock = prodBefore.stock_count;

    const orderRes = await request('POST', '/api/orders', orderPayload, customerAuth);
    assert(orderRes.status === 201 && orderRes.data.order && orderRes.data.order.orderNumber, 'POST /api/orders places order and returns order number');

    const createdOrder = orderRes.data.order;

    // Verify stock decremented
    const prodAfter = (await request('GET', '/api/products/1')).data.product;
    assert(prodAfter.stock_count === initialStock - 1, `Inventory properly decremented from ${initialStock} to ${prodAfter.stock_count}`);

    // Verify cart cleared
    const cartAfterOrder = await request('GET', '/api/cart', null, customerAuth);
    assert(cartAfterOrder.data.items.length === 0, 'Cart is automatically cleared after order placement');

    // 13. Order History & Single Order Lookup
    const ordersRes = await request('GET', '/api/orders', null, customerAuth);
    assert(ordersRes.status === 200 && ordersRes.data.orders.length >= 1, 'GET /api/orders returns user order history');

    const singleOrderRes = await request('GET', `/api/orders/${createdOrder.orderNumber}`, null, customerAuth);
    assert(singleOrderRes.status === 200 && singleOrderRes.data.order.order_number === createdOrder.orderNumber, 'GET /api/orders/:orderNumber retrieves invoice telemetry');

    // 14. Order Cancellation and Restock
    const cancelRes = await request('POST', `/api/orders/${createdOrder.id}/cancel`, null, customerAuth);
    assert(cancelRes.status === 200 && cancelRes.data.status === 'Cancelled', 'POST /api/orders/:id/cancel cancels order');

    const prodRestocked = (await request('GET', '/api/products/1')).data.product;
    assert(prodRestocked.stock_count === initialStock, `Inventory restocked back to ${initialStock} upon cancellation`);

    // 14b. Wishlist API (SQLite Database Integration)
    console.log('\n--- 4b. Testing SQLite Wishlist Integration ---');
    const wishAdd = await request('POST', '/api/wishlist/2', null, customerAuth);
    assert(wishAdd.status === 201 && wishAdd.data.inWishlist === true, 'POST /api/wishlist/2 saves product to SQLite wishlist');

    const wishGet = await request('GET', '/api/wishlist', null, customerAuth);
    assert(wishGet.status === 200 && wishGet.data.wishlist.some(p => p.id === 2), 'GET /api/wishlist returns saved items from SQLite database');

    const wishToggle = await request('POST', '/api/wishlist/2', null, customerAuth);
    assert(wishToggle.status === 200 && wishToggle.data.inWishlist === false, 'POST /api/wishlist/2 toggles product out of wishlist');

    // 14c. Order Ownership and Security Enforcement
    console.log('\n--- 4c. Testing Order Ownership & Security Authorization ---');
    // Register Customer B
    const custBEmail = `attacker_${Date.now()}@alphastore.io`;
    const regB = await request('POST', '/api/auth/register', {
      name: 'Intruder User',
      email: custBEmail,
      password: 'password123'
    });
    const custBAuth = { 'Authorization': `Bearer ${regB.data.token}` };

    // Create a new order for Customer A
    const orderForASnapshot = await request('POST', '/api/orders', {
      customerName: 'Test Customer',
      customerEmail: uniqueEmail,
      shippingAddress: '742 Evergreen Terrace, Springfield, OR',
      paymentMethod: 'Cash on Delivery (COD)',
      items: [{ id: 1, quantity: 1 }]
    }, customerAuth);
    assert(orderForASnapshot.status === 201, 'Customer A creates valid order');
    const orderA = orderForASnapshot.data.order;

    // Customer B attempts to view Customer A's order -> 403 Forbidden
    const hijackView = await request('GET', `/api/orders/${orderA.orderNumber}`, null, custBAuth);
    assert(hijackView.status === 403, 'Customer B cannot view Customer A order (403 Forbidden)');

    // Customer B attempts to cancel Customer A's order -> 403 Forbidden
    const hijackCancel = await request('POST', `/api/orders/${orderA.id}/cancel`, null, custBAuth);
    assert(hijackCancel.status === 403, 'Customer B cannot cancel Customer A order (403 Forbidden)');

    // Customer A can view their own order
    const legitView = await request('GET', `/api/orders/${orderA.orderNumber}`, null, customerAuth);
    assert(legitView.status === 200 && legitView.data.order.order_number === orderA.orderNumber, 'Customer A can view their own order (200 OK)');

    // 15. Admin Management Flow
    console.log('\n--- 5. Testing Admin Authorization & Management ---');
    // Normal user denied admin
    const unauthorizedAdmin = await request('GET', '/api/admin/dashboard', null, customerAuth);
    assert(unauthorizedAdmin.status === 403, 'Unauthorized user blocked from /api/admin/dashboard (403 Forbidden)');

    // Login as Admin
    const adminLoginRes = await request('POST', '/api/auth/login', {
      email: 'admin@alphastore.io',
      password: 'admin123'
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data.user.role === 'admin', 'Login as Admin succeeds');
    const adminToken = adminLoginRes.data.token;
    const adminAuth = { 'Authorization': `Bearer ${adminToken}` };

    // Admin Dashboard Telemetry
    const admDashRes = await request('GET', '/api/admin/dashboard', null, adminAuth);
    if (!admDashRes.data || !admDashRes.data.metrics) {
      console.log('admDashRes debug:', admDashRes);
    }
    assert(admDashRes.status === 200 && admDashRes.data.metrics && admDashRes.data.metrics.products >= 10, 'GET /api/admin/dashboard returns store telemetry');

    // Admin Customers List
    const admCustRes = await request('GET', '/api/admin/customers', null, adminAuth);
    assert(admCustRes.status === 200 && admCustRes.data.customers.length >= 2, 'GET /api/admin/customers returns user directory');

    // Admin Add Product
    const newProdRes = await request('POST', '/api/products', {
      name: 'Alpha Quantum Cyber Deck 2026',
      tagline: 'Custom tactile cyberdeck with cybernetic rotary encoders',
      category: 'Computing',
      price: 549.99,
      original_price: 699.99,
      badge: 'Limited Drop',
      image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
      description: 'Handcrafted mechanical cyberdeck with high-speed serial bus.',
      stock_count: 8,
      is_featured: 1
    }, adminAuth);
    assert(newProdRes.status === 201 && newProdRes.data.productId, 'Admin POST /api/products deploys new product');
    const newProdId = newProdRes.data.productId;

    // Admin Edit Product
    const editProdRes = await request('PUT', `/api/products/${newProdId}`, {
      price: 499.99,
      stock_count: 10
    }, adminAuth);
    assert(editProdRes.status === 200, 'Admin PUT /api/products/:id updates price and stock');

    // Admin Delete Product
    const delProdRes = await request('DELETE', `/api/products/${newProdId}`, null, adminAuth);
    assert(delProdRes.status === 200, 'Admin DELETE /api/products/:id removes product');

    // Admin Coupons Management
    const newCoupRes = await request('POST', '/api/admin/coupons', {
      code: `SUMMER_${Date.now()}`,
      discount_percent: 30,
      min_purchase: 150
    }, adminAuth);
    assert(newCoupRes.status === 201, 'Admin POST /api/admin/coupons creates new coupon');

    // Admin Category Management CRUD
    console.log('\n--- 5b. Testing Admin Category Management ---');
    const newCatName = `Robotics_${Date.now()}`;
    const createCatRes = await request('POST', '/api/admin/categories', {
      name: newCatName,
      description: 'Autonomous robotics, servos, and microcontrollers'
    }, adminAuth);
    assert(createCatRes.status === 201, `Admin creates new category "${newCatName}" (201 Created)`);

    const updatedCatName = `Aero_${newCatName}`;
    const renameCatRes = await request('PUT', `/api/admin/categories/${encodeURIComponent(newCatName)}`, {
      name: updatedCatName,
      description: 'Aerospace micro-avionics'
    }, adminAuth);
    assert(renameCatRes.status === 200, `Admin renames category to "${updatedCatName}" (200 OK)`);

    // Cannot delete category with products
    const delBlocked = await request('DELETE', `/api/admin/categories/Audio`, null, adminAuth);
    assert(delBlocked.status === 400, 'Deleting category with assigned products is rejected (400 Bad Request)');

    // Can delete empty category
    const delCatRes = await request('DELETE', `/api/admin/categories/${encodeURIComponent(updatedCatName)}`, null, adminAuth);
    assert(delCatRes.status === 200, 'Deleting empty category succeeds (200 OK)');

    // Admin Status Update (including Pending)
    const updateStatusRes = await request('PATCH', `/api/admin/orders/${orderA.id}/status`, {
      status: 'Pending'
    }, adminAuth);
    assert(updateStatusRes.status === 200, 'Admin can update order status to "Pending" (200 OK)');

    // Contact Form Inquiries
    console.log('\n--- 6. Testing Contact Us & Inquiries ---');
    const contactRes = await request('POST', '/api/contact', {
      name: 'Morgan Freeman',
      email: 'morgan@example.com',
      subject: 'Warranty inquiry',
      message: 'Does the 2-year warranty cover international courier replacement?'
    });
    assert(contactRes.status === 201, 'POST /api/contact receives customer inquiry');

    const admContactRes = await request('GET', '/api/admin/contacts', null, adminAuth);
    assert(admContactRes.status === 200 && admContactRes.data.messages.length >= 1, 'Admin GET /api/admin/contacts retrieves inquiry messages');

    console.log(`\n========================================`);
    console.log(`TOTAL TESTS: ${passed + failed}`);
    console.log(`PASSED:      ${passed}`);
    console.log(`FAILED:      ${failed}`);
    console.log(`========================================`);

    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled Test Failure:', err);
    process.exit(1);
  }
}

runTests();
