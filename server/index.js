
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db, setupDatabase } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("Set a secure JWT_SECRET of at least 32 characters in .env");
}

// CORS configuration
const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:5173"
)
  .split(",")
  .map(origin => origin.trim().replace(/\/$/, ""));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "100kb" }));

// Async route helper
const asyncRoute = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Authentication middleware
function auth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message: "Please log in first"
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!Number.isSafeInteger(payload.id)) {
      return res.status(401).json({
        message: "Invalid authentication token"
      });
    }

    req.user = { id: payload.id };
    next();
  } catch {
    res.status(401).json({
      message: "Session expired or invalid token"
    });
  }
}

// Admin middleware
const admin = asyncRoute(async (req, res, next) => {
  const [users] = await db.query(
    "SELECT role FROM users WHERE id = ?",
    [req.user.id]
  );

  if (users[0]?.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required"
    });
  }

  next();
});

// Health check
app.get("/api/health", asyncRoute(async (req, res) => {
  await db.query("SELECT 1");

  res.json({
    server: "running",
    database: "connected"
  });
}));

// TEMPORARY: Database troubleshooting route
// Remove this route before deploying publicly.
app.get("/api/db-check", asyncRoute(async (req, res) => {
  const [databaseRows] = await db.query(
    "SELECT DATABASE() AS database_name"
  );

  const [tables] = await db.query("SHOW TABLES");

  res.json({
    database: databaseRows[0]?.database_name,
    tables: tables.map(row => Object.values(row)[0])
  });
}));

// Register new customer
app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100 ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 191 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      message: "Enter a valid name, email and password (8–72 characters)"
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db.query(
    "SELECT id FROM users WHERE email = ?",
    [normalizedEmail]
  );

  if (existing.length) {
    return res.status(409).json({
      message: "Email is already registered"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await db.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
    [name.trim(), normalizedEmail, hashedPassword]
  );

  res.status(201).json({
    message: "Registration successful. Please log in."
  });
}));

// Login
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      message: "Email and password are required"
    });
  }

  const [users] = await db.query(
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()]
  );

  const user = users[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({
      message: "Invalid email or password"
    });
  }

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}));

// Get logged-in user
app.get("/api/auth/me", auth, asyncRoute(async (req, res) => {
  const [users] = await db.query(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [req.user.id]
  );

  if (!users.length) {
    return res.status(401).json({
      message: "Account not found"
    });
  }

  res.json(users[0]);
}));

// Get all products
app.get("/api/products", asyncRoute(async (req, res) => {
  const [products] = await db.query(
    "SELECT * FROM products ORDER BY featured DESC, id DESC"
  );

  res.json(products);
}));

function validateProduct(product) {
  if (!product || typeof product !== "object") {
    return false;
  }

  return (
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    product.name.length <= 150 &&
    typeof product.category === "string" &&
    product.category.trim().length > 0 &&
    product.category.length <= 80 &&
    Number.isFinite(Number(product.price)) &&
    Number(product.price) >= 0 &&
    Number.isInteger(Number(product.stock)) &&
    Number(product.stock) >= 0 &&
    (product.image == null ||
      (typeof product.image === "string" &&
       product.image.length <= 1000)) &&
    (product.description == null ||
      typeof product.description === "string")
  );
}

function productValues(product) {
  return [
    product.name.trim(),
    product.category.trim(),
    product.description || "",
    Number(product.price),
    Number(product.stock),
    product.image || "",
    product.featured ? 1 : 0
  ];
}

// Admin: Add product
app.post("/api/products", auth, admin, asyncRoute(async (req, res) => {
  if (!validateProduct(req.body)) {
    return res.status(400).json({
      message: "Invalid product details"
    });
  }

  const [result] = await db.query(
    `INSERT INTO products
     (name, category, description, price, stock, image, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    productValues(req.body)
  );

  res.status(201).json({
    id: result.insertId,
    message: "Product added successfully"
  });
}));

// Admin: Update product
app.put("/api/products/:id", auth, admin, asyncRoute(async (req, res) => {
  if (!validateProduct(req.body)) {
    return res.status(400).json({
      message: "Invalid product details"
    });
  }

  const [result] = await db.query(
    `UPDATE products
     SET name = ?, category = ?, description = ?,
         price = ?, stock = ?, image = ?, featured = ?
     WHERE id = ?`,
    [...productValues(req.body), req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      message: "Product not found"
    });
  }

  res.json({
    message: "Product updated successfully"
  });
}));

// Admin: Delete product
app.delete("/api/products/:id", auth, admin, asyncRoute(async (req, res) => {
  const [result] = await db.query(
    "DELETE FROM products WHERE id = ?",
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      message: "Product not found"
    });
  }

  res.json({
    message: "Product deleted successfully"
  });
}));

// Customer: Checkout
app.post("/api/orders", auth, asyncRoute(async (req, res) => {
  const { items, address, paymentMethod } = req.body || {};

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 50 ||
    typeof address !== "string" ||
    address.trim().length < 10 ||
    address.length > 1000 ||
    paymentMethod !== "COD"
  ) {
    return res.status(400).json({
      message: "Invalid checkout information"
    });
  }

  const quantities = new Map();

  for (const item of items) {
    const id = Number(item.id);
    const quantity = Number(item.quantity);

    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return res.status(400).json({
        message: "Invalid product or quantity"
      });
    }

    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }

  if ([...quantities.values()].some(quantity => quantity > 20)) {
    return res.status(400).json({
      message: "Maximum 20 units per product"
    });
  }

  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const purchasedItems = [];
    let total = 0;

    // Stable order reduces risk of transaction deadlocks.
    const sortedItems = [...quantities.entries()]
      .sort((a, b) => a[0] - b[0]);

    for (const [productId, quantity] of sortedItems) {
      const [products] = await connection.query(
        "SELECT * FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );

      const product = products[0];

      if (!product || product.stock < quantity) {
        const error = new Error(
          "Product unavailable or insufficient stock"
        );
        error.status = 409;
        throw error;
      }

      const price = Number(product.price);

      total += price * quantity;

      purchasedItems.push({
        productId,
        productName: product.name,
        quantity,
        price
      });

      await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [quantity, productId]
      );
    }

    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (user_id, total, address, payment_method, status)
       VALUES (?, ?, ?, ?, 'Placed')`,
      [req.user.id, total, address.trim(), "COD"]
    );

    for (const item of purchasedItems) {
      await connection.query(
        `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, price)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orderResult.insertId,
          item.productId,
          item.productName,
          item.quantity,
          item.price
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      message: "Order placed successfully",
      orderId: orderResult.insertId
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    if (error.status) {
      return res.status(error.status).json({
        message: error.message
      });
    }

    throw error;
  } finally {
    connection.release();
  }
}));

// Customer: My orders
app.get("/api/orders/my", auth, asyncRoute(async (req, res) => {
  const [orders] = await db.query(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC",
    [req.user.id]
  );

  const [items] = await db.query(
    `SELECT oi.*
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ?`,
    [req.user.id]
  );

  res.json(
    orders.map(order => ({
      ...order,
      items: items.filter(item => item.order_id === order.id)
    }))
  );
}));

// Admin: All orders
app.get("/api/admin/orders", auth, admin, asyncRoute(async (req, res) => {
  const [orders] = await db.query(
    `SELECT
       o.*,
       u.name AS customer_name,
       u.email AS customer_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC`
  );

  res.json(orders);
}));

// Admin: Update order tracking status
app.patch(
  "/api/admin/orders/:id",
  auth,
  admin,
  asyncRoute(async (req, res) => {
    const allowedStatuses = [
      "Placed",
      "Processing",
      "Shipped",
      "Delivered"
    ];

    if (!allowedStatuses.includes(req.body?.status)) {
      return res.status(400).json({
        message: "Invalid order status"
      });
    }

    const [result] = await db.query(
      "UPDATE orders SET status = ? WHERE id = ?",
      [req.body.status, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    res.json({
      message: "Order status updated successfully"
    });
  })
);

// Handle unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API endpoint not found"
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "This record already exists"
    });
  }

  if (
    error.code === "ER_ROW_IS_REFERENCED_2" ||
    error.code === "ER_ROW_IS_REFERENCED"
  ) {
    return res.status(409).json({
      message: "Cannot delete a product with existing order history"
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON request"
    });
  }

  res.status(500).json({
    message: "Internal server error"
  });
});

// Start server only after database setup succeeds
async function startServer() {
  try {
    await setupDatabase();

    app.listen(PORT, () => {
      console.log("-----------------------------------");
      console.log("NEXORA E-Commerce Backend");
      console.log(`Server running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
      console.log(`Database: http://localhost:${PORT}/api/db-check`);
      console.log("-----------------------------------");
    });
  } catch (error) {
    console.error("Database setup failed:", error.message);
    process.exit(1);
  }
}

startServer();
