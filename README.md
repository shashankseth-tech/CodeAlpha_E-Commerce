# ALPHA // STORE — Next-Gen Neo-Brutalist Hardware Store
> High-voltage Neo-Brutalist Full-Stack E-Commerce Store engineered for the CodeAlpha Web Development Internship.
> Built with Node.js, Express.js, native SQLite (node:sqlite DatabaseSync), and vanilla modern JavaScript.

A production-grade full-stack e-commerce web application featuring high-performance tech hardware, persistent SQLite database storage, JWT user authentication with role-based access control, interactive shopping cart drawer, verified customer reviews, coupons engine, multi-method checkout with Cash on Delivery and simulated cards, live courier order tracking, printable telemetry invoices, user profile settings, saved hardware wishlist, contact inquiries, and a complete Admin Command Center.

---

## 🚀 Key Features & Project Scope

### 1. 🛍️ Product Listings, Discovery & Categories
- **Neo-Brutalist Catalog**: High-voltage neon aesthetics, hard offset black drop shadows, bold borders, and rotated sticker badges.
- **Dynamic Product Grid**: Displays hardware units across categories (**Audio**, **Wearables**, **Computing**, **Cameras & Gear**, **Smart Home**).
- **Interactive Search**: Real-time debounce search by title, description, or features with keyboard shortcut (`/` to focus search).
- **Smart Filtering & Sorting**: Filter by category pills, max price range slider, in-stock availability toggle, and sort by featured, price (low/high), rating, and newest arrivals.
- **Saved Wishlist**: Quick-save favorite items to local and database wishlist with one-click "Move to Cart" feature.

### 2. 🔍 Product Details Page & Verified Reviews
- **Deep-Linkable Views**: Direct access via URL hashes (e.g. `http://localhost:3000/#product/1`).
- **Interactive Image Gallery**: High-res multi-angle thumbnail preview.
- **Specifications & Features**: Detailed technical bullet points, SKU identifiers, and real-time stock availability indicators.
- **Customer Ratings & Reviews**: Real-time review submission form with interactive 5-star selector and instant database update of product ratings.

### 3. 🛒 Shopping Cart Drawer & Coupons Engine
- **Slide-Over Brutalist Drawer**: Accessible from any page without losing context (`#cart`).
- **Quantity Adjustments**: Increment, decrement, or remove items with live subtotal calculation.
- **Persistent Database Cart**: Preserves cart data across page reloads and browser sessions.
- **Active Coupons Engine**:
  - `ALPHA15` — 15% discount
  - `ALPHA10` — 10% discount (orders over $50)
  - `WELCOME20` — 20% discount (orders over $100)
  - `CODEALPHA` — 15% developer partner discount
- **Free Shipping Threshold**: Dynamic progress bar (Free standard shipping on orders over $99).

### 4. 💳 Order Processing & Checkout
- **Customer Details**: Name, email, phone, and delivery address inputs with client and server-side validation.
- **Payment Method Selection**: Cash on Delivery (COD), Simulated Credit/Debit Card with live card validation preview, and PayPal Express.
- **Database Stock Integrity**: Validates stock availability on backend prior to order creation, prevents overselling, decrements inventory atomically, and clears the cart.
- **Order Confirmation**: Instant receipt summary with delivery breakdown and direct tracking button.

### 5. 📦 Order Telemetry, Tracking & Invoices
- **Visual Courier Timeline**: Live status progression (`Order Placed` ➔ `Air Courier Shipped` ➔ `Delivered` / `Cancelled`).
- **Order Details Modal & Printable Invoice**: Official receipt view with itemized pricing, recipient address, and printable invoice (`window.print()`).
- **Customer Order Cancellation**: Cancel pending orders with automatic inventory restocking.

### 6. 👤 Dedicated Full-Screen Authentication & User Profiles
- **Full-Screen Login & Registration Views**: Fully isolated from the storefront (`#login` / `#register`). Completely hides the store header, promotional banner, product catalog, cart drawer, and footer to deliver a clean, focused, distraction-free authentication experience.
- **Role-Based Redirection**: Automatically directs customers back to the active store/profile and routes administrators directly into the Admin Command Center upon authentication.
- **Quick Demo Access**: Instant one-click profile fill buttons for Demo Customer (`alex@alphastore.io`) and Demo Admin (`admin@alphastore.io`).
- **Profile & Security Controls**: Manage customer coordinates, phone numbers, and update account passwords with BCrypt hashing (`#profile`).
- **Role-Based Access Control**: Strict server-side separation between `customer` and `admin` roles across all protected API routes.

### 7. ⚙️ Admin Command Center (Admin Dashboard)
- **Live Store Telemetry**: Real-time metrics for Gross Revenue, Total Orders, Total Products, and Total Customers.
- **Low Stock Alerts**: Identifies hardware units with 15 or fewer units remaining.
- **Product Management (CRUD)**: Add new hardware products, update prices, stock, categories, descriptions, or delete products.
- **Order Management**: Real-time order fulfillment table with live status updates (`Processing`, `Shipped`, `Delivered`, `Cancelled`).
- **Coupons Management**: Create custom discount codes with percentage and minimum spend criteria.
- **Customer Directory**: View registered customer accounts with lifetime order counts and total spent.
- **Contact Inquiries**: Review incoming technical and warranty messages dispatched by customers.

### 8. 📄 Informational & Policy Dialogs
- **About Us Manifesto** (`#about`): Brand vision, 2-year warranty, 30-day lab trials.
- **Contact Us & Technical Escalation** (`#contact`): Interactive contact form submitting directly to SQLite database.
- **Help & FAQ** (`#faq`): Answers regarding dispatch, warranty, returns, and payment options.
- **Store Policies** (`#privacy`, `#terms`, `#returns`): Terms of Service, Privacy Policy, and 30-Day Zero Hassle Return Guarantee.

---

## 🛠️ Technology Stack

- **Frontend**: Semantic HTML5, Vanilla Modern CSS (CSS Custom Properties, Brutalist hard borders and drop shadows, Glassmorphism, Google Fonts Outfit & Space Grotesk), Modern JavaScript (ES6+).
- **Backend**: Express.js (Node.js v24), CORS, JSON Web Tokens (`jsonwebtoken`), Password encryption (`bcryptjs`).
- **Database**: SQLite database (`ecommerce.db`) powered by Node 24 native `node:sqlite` DatabaseSync with foreign key constraints and ACID consistency.

---

## ⚡ Quick Start & Run Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The application will be live at:
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Run Automated End-to-End Tests
To verify all 51 API routes, database operations, security constraints, and atomic transactions:
```bash
npm test
```

---

## 🔑 Demo Accounts

For instant testing, pre-configured demo credentials can be filled with one click in the **Sign In** modal:

| Role | Email | Password | Access Privileges |
|---|---|---|---|
| **Demo Customer** | `alex@alphastore.io` | `alpha123` | Browsing, Cart, Checkout, Wishlist, Order Tracking, Profile |
| **Demo Admin** | `admin@alphastore.io` | `admin123` | Full Storefront + Admin Command Center, Product & Category CRUD, Status Updates |

*(Legacy aliases `user@codealpha.tech` and `admin@codealpha.tech` are also supported for backward compatibility)*

---

## 📡 REST API Documentation

### Products & Categories
- `GET /api/categories` — List category titles, descriptions and live item counts
- `POST /api/admin/categories` — Create a new category *(Admin only)*
- `PUT /api/admin/categories/:name` — Rename category and update all assigned products *(Admin only)*
- `DELETE /api/admin/categories/:name` — Delete empty category *(Admin only)*
- `GET /api/products` — Filter products by category, search, minPrice, maxPrice, inStock, sort
- `GET /api/products/:id` — Single product details with reviews and related hardware
- `POST /api/products/:id/reviews` — Submit a customer review
- `POST /api/products` — Add a new product *(Admin only)*
- `PUT /api/products/:id` — Update product specifications *(Admin only)*
- `DELETE /api/products/:id` — Delete a product *(Admin only)*

### Wishlist (SQLite Synced)
- `GET /api/wishlist` — Retrieve customer's saved products *(Authenticated)*
- `POST /api/wishlist/:productId` — Toggle product in/out of customer wishlist *(Authenticated)*
- `DELETE /api/wishlist/:productId` — Explicitly remove item from wishlist *(Authenticated)*

### User Authentication & Profile
- `POST /api/auth/register` — Register a new account
- `POST /api/auth/login` — Sign in and receive JWT token
- `GET /api/auth/me` — Retrieve current user profile
- `PUT /api/auth/profile` — Update user name and phone number
- `PUT /api/auth/password` — Change password with current password verification

### Shopping Cart
- `GET /api/cart` — Retrieve items in cart and totals
- `POST /api/cart` — Add product to cart
- `PUT /api/cart/:productId` — Update item quantity
- `DELETE /api/cart/:productId` — Remove item from cart
- `DELETE /api/cart` — Clear entire cart

### Promo Coupons
- `POST /api/coupons/validate` — Validate promo code and calculate discount
- `GET /api/admin/coupons` — List all promo coupons *(Admin only)*
- `POST /api/admin/coupons` — Create or update promo coupon *(Admin only)*
- `DELETE /api/admin/coupons/:id` — Delete promo coupon *(Admin only)*

### Orders & Invoices (Atomic ACID Transactions)
- `POST /api/orders` — Process checkout, atomically decrement stock, and place order
- `GET /api/orders` — List user's orders (or all orders for admin)
- `GET /api/orders/:orderNumber` — Retrieve order receipt and telemetry *(Strict ownership check)*
- `POST /api/orders/:id/cancel` — Cancel order and atomically restock inventory *(Strict ownership check)*
- `PATCH /api/admin/orders/:id/status` — Update order status (`Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled`) *(Admin only)*

### Contact Inquiries
- `POST /api/contact` — Submit a customer inquiry message
- `GET /api/admin/contacts` — View inquiry messages *(Admin only)*

### Admin Analytics
- `GET /api/stats` — Quick store counts
- `GET /api/admin/dashboard` — Complete store metrics, revenue, and low stock alerts *(Admin only)*
- `GET /api/admin/customers` — Registered customer list with order counts *(Admin only)*

---

## 📁 Directory Structure

```
├── .env                   # Environment variables (PORT, JWT_SECRET)
├── .env.example           # Example environment template
├── package.json           # Node.js project manifest & test scripts
├── server.js              # Express REST API, auth & static file server
├── db.js                  # SQLite database schema, migrations & seed data
├── ecommerce.db           # Persistent SQLite database file
├── test-e2e.js            # Automated 51-step end-to-end test suite
├── README.md              # Project documentation & API manual
└── public/
    ├── index.html         # Storefront markup, drawer & modal windows
    ├── styles/
    │   └── main.css       # Design system, brutalist styling & responsive layout
    └── js/
        ├── api.js         # REST API client
        ├── auth.js        # Authentication & profile state manager
        ├── cart.js        # Shopping cart state & coupon engine
        └── app.js         # Core storefront app, filters, admin & checkout
```
