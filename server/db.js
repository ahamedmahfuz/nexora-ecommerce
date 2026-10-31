

require("dotenv").config();
const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "test",
  ssl: process.env.DB_SSL === "true"
    ? { minVersion: "TLSv1.2" }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

async function setupDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(191) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin','user') DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(80) NOT NULL,
      description TEXT,
      price DECIMAL(12,2) NOT NULL,
      stock INT DEFAULT 0,
      image VARCHAR(1000),
      featured BOOLEAN DEFAULT FALSE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL,
      status VARCHAR(30) DEFAULT 'Placed',
      address TEXT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(150) NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  const [rows] = await db.query(
    "SELECT COUNT(*) AS total FROM products"
  );

  if (rows[0].total === 0) {
    const products = [
      ["Wireless Headphones", "Audio", "Premium wireless headphones", 7999, 20,
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800", 1],
      ["UltraBook Laptop", "Laptops", "Powerful lightweight laptop", 64999, 10,
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800", 1],
      ["Smartphone X", "Phones", "Next-generation smartphone", 42999, 15,
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800", 1],
      ["Smartwatch Active", "Wearables", "Smart fitness watch", 8999, 25,
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800", 1],
      ["Gaming Keyboard", "Accessories", "Mechanical RGB keyboard", 5499, 30,
        "https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=800", 0],
      ["Gaming Mouse", "Accessories", "Precision gaming mouse", 2499, 35,
        "https://images.unsplash.com/photo-1527814050087-3793815479db?w=800", 0]
    ];

    await db.query(
      `INSERT INTO products
      (name, category, description, price, stock, image, featured)
      VALUES ?`,
      [products]
    );
  }

  console.log("Database tables ready");
}

module.exports = { db, setupDatabase };
