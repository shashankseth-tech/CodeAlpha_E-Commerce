# ALPHA // STORE — Neo-Brutalist E-Commerce Store
> High-voltage Neo-Brutalist hardware store built with Node.js, Express, and persistent SQLite.

A high-performance full-stack e-commerce web application featuring raw performance tech gadgets, persistent SQLite database storage, user authentication, a slide-out shopping cart, product details with customer reviews, checkout order processing, and live order tracking.

---

## 🚀 Key Features

### 1. 🛍️ Product Listings & Discovery
- **Neo-Brutalist Catalog**: High-voltage neon aesthetics, hard offset black drop shadows, bold borders, and rotated sticker badges.
- **Dynamic Product Grid**: Displays products across categories (**Audio**, **Wearables**, **Computing**, **Cameras & Gear**, **Smart Home**).
- **Interactive Search**: Real-time debounce search by title, description, or features with keyboard shortcut (`/` to focus search).
- **Smart Filtering & Sorting**: Filter by category pills, max price range slider, in-stock availability toggle, and sort by featured, price (low/high), rating, and newest arrivals.
- **Wishlist**: Quick-save favorite items to local wishlist.

### 2. 🔍 Product Details Page & Reviews
- **Deep-Linkable Views**: Direct access via URL hashes (e.g. `http://localhost:3000/#product/1`).
- **Interactive Image Gallery**: High-res multi-angle thumbnail preview.
- **Specifications & Features**: Detailed technical bullet points and stock availability indicators.
- **Customer Ratings & Reviews**: Real-time review submission form with interactive 5-star selector and instant database update of product ratings.

### 3. 🛒 Shopping Cart Drawer
- **Slide-Over Brutalist Drawer**: Accessible from any page without losing context.
- **Quantity Adjustments**: Increment, decrement, or remove items with live subtotal calculation.
- **Discount & Promo Codes**:
  - `ALPHA15` — 15% discount
  - `ALPHA10` — 10% discount
  - `WELCOME20` — 20% discount
- **Free Shipping Threshold**: Dynamic progress bar (Free standard shipping on orders over $99).

### 4. 💳 Order Processing & Checkout
- **Customer Details**: Name, email, and shipping address inputs with client and server-side validation.
- **Payment Method Selection**: Simulated Credit/Debit Card with live card validation preview, PayPal Express, and Cash on Delivery.
- **Order Placement**: Automatically decrements product stock, clears the cart, and generates a unique Order ID (e.g., `CA-2026-8862`).
- **Order Confirmation**: Instant receipt summary with delivery breakdown and direct tracking button.

### 5. 👤 User Authentication & Profiles
- **User Registration & Login**: Password hashing with `bcryptjs` and secure `JWT` token authentication.
- **Persistent State**: Token stored in `localStorage` and attached via `Authorization: Bearer <token>` headers.
- **Order History & Live Tracking**: Visual order tracking timeline (`Order Placed` ➔ `Shipped` ➔ `Delivered`).
- **Admin Order Controls**: Admin users can update order statuses.

---

## 🛠️ Technology Stack

- **Frontend**: Semantic HTML5, Vanilla Modern CSS (Custom properties, Glassmorphism, Responsive Grid & Flexbox, Google Fonts Outfit & Plus Jakarta Sans), Modern JavaScript (ES6+).
- **Backend**: Express.js (Node.js v24), CORS, JSON Web Tokens (`jsonwebtoken`), Password encryption (`bcryptjs`).
- **Database**: SQLite database (`ecommerce.db`) powered by Node 24 native `node:sqlite` DatabaseSync.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The store will be live at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Demo Accounts

For instant testing, pre-configured demo credentials can be filled with one click in the **Sign In** modal:

| Role | Email | Password |
|---|---|---|
| **Demo Customer** | `alex@alphastore.io` | `alpha123` |
| **Demo Admin** | `admin@alphastore.io` | `admin123` |

---

## 📡 REST API Endpoints

### Products & Reviews
- `GET /api/products` - List products with query params (`category`, `search`, `minPrice`, `maxPrice`, `inStock`, `sort`)
- `GET /api/products/:id` - Fetch single product with reviews
- `POST /api/products/:id/reviews` - Submit product review
- `GET /api/categories` - Fetch category list and counts

### Authentication
- `POST /api/auth/register` - Create user account
- `POST /api/auth/login` - Authenticate user & return JWT
- `GET /api/auth/me` - Get logged-in user profile

### Shopping Cart
- `GET /api/cart` - Retrieve current cart items & totals
- `POST /api/cart` - Add item to cart
- `PUT /api/cart/:productId` - Update item quantity
- `DELETE /api/cart/:productId` - Remove item
- `DELETE /api/cart` - Clear entire cart

### Orders & Tracking
- `POST /api/orders` - Process checkout and place order
- `GET /api/orders` - View user orders (or all orders for admin)
- `GET /api/orders/:orderNumber` - Track order by order number
- `PATCH /api/admin/orders/:id/status` - Update order delivery status (Admin only)
- `GET /api/stats` - Store summary metrics

---

## 📁 Directory Structure

```
├── package.json
├── server.js              # Express REST API & static file server
├── db.js                  # SQLite database schema, initialization & seed data
├── ecommerce.db           # Persistent SQLite database file
├── README.md
└── public/
    ├── index.html         # Main storefront markup & modals
    ├── styles/
    │   └── main.css       # Design system, glassmorphism & responsive layout
    └── js/
        ├── api.js         # REST API client
        ├── auth.js        # Authentication & profile state manager
        ├── cart.js        # Shopping cart state & coupon engine
        └── app.js         # Core storefront app, filters, reviews & checkout
```
