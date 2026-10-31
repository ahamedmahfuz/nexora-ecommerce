
import { useEffect, useState } from "react";
import {
  ShoppingCart, Search, User, Menu, X, ArrowRight,
  Plus, Minus, Trash2, Package, Truck, ShieldCheck,
  Zap, Headphones, LogOut, ShoppingBag, CheckCircle2,
  Star, Edit3, Lock, Sparkles, CreditCard
} from "lucide-react";
import { api, currency } from "./api";

const blankProduct = {
  name: "",
  category: "Audio",
  description: "",
  price: "",
  stock: "",
  image: "",
  featured: false
};

const categories = [
  "All", "Audio", "Laptops", "Phones",
  "Accessories", "Wearables", "Cameras"
];

export default function App() {
  const [page, setPage] = useState("home");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nexora_cart") || "[]");
    } catch {
      return [];
    }
  });
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [orders, setOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "", email: "", password: ""
  });
  const [address, setAddress] = useState("");
  const [productForm, setProductForm] = useState(blankProduct);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === "admin";
  const cartCount = cart.reduce((s, p) => s + p.quantity, 0);
  const total = cart.reduce(
    (s, p) => s + Number(p.price) * p.quantity, 0
  );

  useEffect(() => {
    localStorage.setItem("nexora_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    async function initialize() {
      try {
        if (localStorage.getItem("nexora_token")) {
          try {
            setUser(await api("/auth/me"));
          } catch {
            localStorage.removeItem("nexora_token");
          }
        }
        await refreshProducts();
      } catch (error) {
        setNotice(error.message);
      }
    }
    initialize();
  }, []);

  async function refreshProducts() {
    setProducts(await api("/products"));
  }

  function navigate(destination) {
    setPage(destination);
    setMenuOpen(false);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function message(text) {
    setNotice(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToCart(product) {
    const found = cart.find(p => p.id === product.id);
    if (product.stock <= 0 ||
        (found && found.quantity >= Math.min(product.stock, 20))) {
      message("Maximum available quantity reached");
      return;
    }

    setCart(previous => {
      const existing = previous.find(p => p.id === product.id);
      return existing
        ? previous.map(p => p.id === product.id
            ? { ...p, quantity: p.quantity + 1 } : p)
        : [...previous, { ...product, quantity: 1 }];
    });
    message("Added to cart!");
  }

  function changeQuantity(id, amount) {
    setCart(previous => previous.map(p =>
      p.id === id
        ? {
            ...p,
            quantity: Math.max(
              1, Math.min(p.stock, 20, p.quantity + amount)
            )
          }
        : p
    ));
  }

  async function handleAuth(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (authMode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(authForm)
        });
        setAuthMode("login");
        message("Registration successful. Please sign in.");
      } else {
        const result = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify(authForm)
        });
        localStorage.setItem("nexora_token", result.token);
        setUser(result.user);
        navigate("home");
        message(`Welcome, ${result.user.name}!`);
      }
      setAuthForm({ name: "", email: "", password: "" });
    } catch (error) {
      message(error.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("nexora_token");
    setUser(null);
    setOrders([]);
    setAdminOrders([]);
    navigate("home");
  }

  async function loadOrders() {
    try {
      setOrders(await api("/orders/my"));
    } catch (error) {
      message(error.message);
    }
  }

  async function loadAdminOrders() {
    try {
      setAdminOrders(await api("/admin/orders"));
    } catch (error) {
      message(error.message);
    }
  }

  async function checkout(event) {
    event.preventDefault();
    if (!user) return navigate("login");
    setBusy(true);

    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map(p => ({
            id: p.id, quantity: p.quantity
          })),
          address,
          paymentMethod: "COD"
        })
      });
      setCart([]);
      setAddress("");
      await refreshProducts();
      await loadOrders();
      navigate("orders");
      message(`Order #${result.orderId} placed successfully!`);
    } catch (error) {
      message(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(
        editingId ? `/products/${editingId}` : "/products",
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(productForm)
        }
      );
      setProductForm(blankProduct);
      setEditingId(null);
      await refreshProducts();
      message("Product saved successfully");
    } catch (error) {
      message(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm("Delete this product?")) return;
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      await refreshProducts();
      message("Product deleted");
    } catch (error) {
      message(error.message);
    }
  }

  function editProduct(product) {
    setEditingId(product.id);
    setProductForm({
      name: product.name,
      category: product.category,
      description: product.description || "",
      price: product.price,
      stock: product.stock,
      image: product.image || "",
      featured: Boolean(product.featured)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeOrderStatus(id, status) {
    try {
      await api(`/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadAdminOrders();
      message("Order status updated");
    } catch (error) {
      message(error.message);
    }
  }

  const visibleProducts = products.filter(p =>
    (category === "All" || p.category === category) &&
    `${p.name} ${p.category} ${p.description}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const ProductGrid = ({ items }) => (
    <div className="product-grid">
      {items.map(product => (
        <article className="product-card" key={product.id}>
          <div className="product-image">
            <img src={product.image} alt={product.name} />
            {Boolean(product.featured) && (
              <span className="product-badge">FEATURED</span>
            )}
          </div>
          <div className="product-info">
            <span className="eyebrow">{product.category}</span>
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <div className="rating">
              <Star size={14} fill="currentColor" />
              Premium Selection
            </div>
            <div className="product-bottom">
              <strong>{currency(product.price)}</strong>
              <button className="add-button"
                disabled={product.stock <= 0}
                onClick={() => addToCart(product)}>
                <Plus size={20} />
              </button>
            </div>
            <small>{product.stock} in stock</small>
          </div>
        </article>
      ))}
      {items.length === 0 && (
        <div className="empty-state">No products found.</div>
      )}
    </div>
  );

  return (
    <div className="app">
      <div className="announcement">
        <Zap size={14} /> NEXT-GEN TECHNOLOGY. ELEVATED EVERYDAY.
      </div>

      <header className="header">
        <div className="container nav">
          <button className="logo" onClick={() => navigate("home")}>
            NEX<span>O</span>RA.
          </button>
          <nav className={menuOpen ? "nav-links open" : "nav-links"}>
            <button onClick={() => navigate("home")}>Home</button>
            <button onClick={() => navigate("shop")}>Shop</button>
            {user && (
              <button onClick={() => {
                loadOrders();
                navigate("orders");
              }}>My Orders</button>
            )}
            {isAdmin && (
              <button onClick={() => {
                loadAdminOrders();
                navigate("admin");
              }}>Dashboard</button>
            )}
          </nav>
          <div className="nav-actions">
            <button className="icon-button"
              onClick={() => navigate("cart")}>
              <ShoppingCart size={21} />
              {cartCount > 0 && (
                <span className="cart-count">{cartCount}</span>
              )}
            </button>
            <button className="icon-button"
              onClick={() => user ? logout() : navigate("login")}>
              {user ? <LogOut size={21} /> : <User size={21} />}
            </button>
            <button className="icon-button mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="notice container">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")}><X size={16} /></button>
        </div>
      )}

      <main>
        {page === "home" && (
          <>
            <section className="hero">
              <div className="container hero-inner">
                <div className="hero-content">
                  <span className="hero-tag">
                    <Sparkles size={15} /> THE FUTURE IS HERE
                  </span>
                  <h1>TECH THAT<br />MOVES <em>YOU.</em></h1>
                  <p>
                    Discover the next generation of electronics.
                    Precision-engineered devices for a life without limits.
                  </p>
                  <button className="btn btn-primary"
                    onClick={() => navigate("shop")}>
                    Explore Collection <ArrowRight size={18} />
                  </button>
                </div>
                <div className="hero-visual">
                  <div className="hero-orbit"></div>
                  <img
                    src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1100"
                    alt="Premium headphones"
                  />
                  <div className="floating-label">
                    <Headphones />
                    <div>
                      <strong>IMMERSIVE AUDIO</strong>
                      <small>Engineered to inspire</small>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="benefits container">
              <div><Truck /> RELIABLE DELIVERY</div>
              <div><ShieldCheck /> SECURE CHECKOUT</div>
              <div><Zap /> NEXT-GEN TECH</div>
              <div><Headphones /> DEDICATED SUPPORT</div>
            </section>

            <section className="section container">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">HANDPICKED FOR YOU</span>
                  <h2>Featured <em>Essentials.</em></h2>
                </div>
                <button className="text-link"
                  onClick={() => navigate("shop")}>
                  View All <ArrowRight size={17} />
                </button>
              </div>
              <ProductGrid items={products.filter(p => p.featured).slice(0, 4)} />
            </section>

            <section className="promo container">
              <span className="eyebrow">DISCOVER YOUR EDGE</span>
              <h2>BUILT FOR THE <em>BOLD.</em></h2>
              <p>Performance meets design. Your next upgrade starts here.</p>
              <button className="btn btn-primary"
                onClick={() => navigate("shop")}>
                Shop Now <ArrowRight size={18} />
              </button>
            </section>

            <section className="section container">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE NEXORA EDIT</span>
                  <h2>Explore <em>Everything.</em></h2>
                </div>
              </div>
              <ProductGrid items={products} />
            </section>
          </>
        )}

        {page === "shop" && (
          <section className="section container page-section">
            <span className="eyebrow">THE COLLECTION</span>
            <h1 className="page-title">Explore <em>Technology.</em></h1>
            <p className="page-description">
              Discover electronics designed for everyday life.
            </p>
            <div className="search-box">
              <Search size={20} />
              <input placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="category-list">
              {categories.map(c => (
                <button key={c}
                  className={category === c ? "category active" : "category"}
                  onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <ProductGrid items={visibleProducts} />
          </section>
        )}

        {page === "cart" && (
          <section className="section container page-section">
            <span className="eyebrow">YOUR SELECTION</span>
            <h1 className="page-title">Shopping <em>Cart.</em></h1>
            {cart.length === 0 ? (
              <div className="empty-state">
                <ShoppingCart size={48} />
                <h2>Your cart is empty</h2>
                <button className="btn btn-primary"
                  onClick={() => navigate("shop")}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="checkout-layout">
                <div className="cart-items">
                  {cart.map(item => (
                    <div className="cart-item" key={item.id}>
                      <img src={item.image} alt={item.name} />
                      <div className="cart-details">
                        <span className="eyebrow">{item.category}</span>
                        <h3>{item.name}</h3>
                        <strong>{currency(item.price)}</strong>
                        <div className="quantity-control">
                          <button onClick={() => changeQuantity(item.id, -1)}>
                            <Minus size={15} />
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => changeQuantity(item.id, 1)}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                      <button className="delete-button"
                        onClick={() => setCart(cart.filter(p => p.id !== item.id))}>
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </div>
                <aside className="summary-card">
                  <h2>Order Summary</h2>
                  <div className="summary-line">
                    <span>Subtotal</span><strong>{currency(total)}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Shipping</span><strong>FREE</strong>
                  </div>
                  <div className="summary-line total">
                    <span>Total</span><strong>{currency(total)}</strong>
                  </div>
                  <button className="btn btn-primary full"
                    onClick={() => navigate(user ? "checkout" : "login")}>
                    Checkout <ArrowRight size={18} />
                  </button>
                </aside>
              </div>
            )}
          </section>
        )}

        {page === "checkout" && (
          <section className="section container page-section">
            <span className="eyebrow">FINAL STEP</span>
            <h1 className="page-title">Secure <em>Checkout.</em></h1>
            {!user ? (
              <div className="empty-state">
                <Lock size={42} />
                <h3>Please sign in</h3>
                <button className="btn btn-primary"
                  onClick={() => navigate("login")}>Sign In</button>
              </div>
            ) : cart.length === 0 ? (
              <div className="empty-state">Your cart is empty.</div>
            ) : (
              <div className="checkout-layout">
                <form className="form-card" onSubmit={checkout}>
                  <h2>Delivery Details</h2>
                  <label>Name</label>
                  <input value={user.name} disabled />
                  <label>Email</label>
                  <input value={user.email} disabled />
                  <label>Delivery Address</label>
                  <textarea rows="5" required minLength="10"
                    maxLength="1000" value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="House number, street, city, PIN code" />
                  <h3>Payment Method</h3>
                  <div className="payment-option">
                    <CreditCard />
                    <div>
                      <strong>Cash on Delivery (Demo)</strong>
                      <p>No online payment is collected.</p>
                    </div>
                  </div>
                  <button className="btn btn-primary full" disabled={busy}>
                    {busy ? "Processing..." : "Place Order"}
                  </button>
                </form>
                <aside className="summary-card">
                  <h2>Your Order</h2>
                  {cart.map(p => (
                    <div className="summary-line" key={p.id}>
                      <span>{p.name} × {p.quantity}</span>
                      <strong>{currency(p.price * p.quantity)}</strong>
                    </div>
                  ))}
                  <div className="summary-line total">
                    <span>Total</span><strong>{currency(total)}</strong>
                  </div>
                </aside>
              </div>
            )}
          </section>
        )}

        {page === "login" && (
          <section className="auth-section">
            <div className="auth-card">
              <span className="eyebrow">WELCOME TO NEXORA</span>
              <h1>{authMode === "login" ? "Welcome " : "Join the "}
                <em>{authMode === "login" ? "Back." : "Future."}</em>
              </h1>
              <p>Access your NEXORA account.</p>
              <form onSubmit={handleAuth}>
                {authMode === "register" && (
                  <>
                    <label>Full Name</label>
                    <input required maxLength="100"
                      value={authForm.name}
                      onChange={e => setAuthForm({
                        ...authForm, name: e.target.value
                      })} />
                  </>
                )}
                <label>Email Address</label>
                <input type="email" required maxLength="191"
                  value={authForm.email}
                  onChange={e => setAuthForm({
                    ...authForm, email: e.target.value
                  })} />
                <label>Password</label>
                <input type="password" required minLength="8"
                  value={authForm.password}
                  onChange={e => setAuthForm({
                    ...authForm, password: e.target.value
                  })} />
                <button className="btn btn-primary full" disabled={busy}>
                  {busy ? "Please wait..." :
                    authMode === "login" ? "Sign In" : "Create Account"}
                </button>
              </form>
              <p className="auth-switch">
                {authMode === "login"
                  ? "Don't have an account?" : "Already registered?"}
                <button onClick={() => setAuthMode(
                  authMode === "login" ? "register" : "login"
                )}>
                  {authMode === "login" ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>
          </section>
        )}

        {page === "orders" && (
          <section className="section container page-section">
            <span className="eyebrow">YOUR PURCHASES</span>
            <h1 className="page-title">Order <em>History.</em></h1>
            {!user ? (
              <div className="empty-state">
                <h3>Please sign in</h3>
                <button className="btn btn-primary"
                  onClick={() => navigate("login")}>Sign In</button>
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <Package size={48} />
                <h3>No orders yet</h3>
                <button className="btn btn-primary"
                  onClick={() => navigate("shop")}>Shop Now</button>
              </div>
            ) : (
              <div className="order-list">
                {orders.map(order => (
                  <article className="order-card" key={order.id}>
                    <div className="order-top">
                      <div>
                        <span className="eyebrow">ORDER #{order.id}</span>
                        <h3>{currency(order.total)}</h3>
                        <p>{new Date(order.created_at).toLocaleDateString("en-IN")}</p>
                      </div>
                      <span className="status">{order.status}</span>
                    </div>
                    {order.items.map(item => (
                      <div className="order-product" key={item.id}>
                        <span>{item.product_name} × {item.quantity}</span>
                        <strong>{currency(item.price * item.quantity)}</strong>
                      </div>
                    ))}
                    <div className="tracking">
                      {["Placed", "Processing", "Shipped", "Delivered"]
                        .map((step, i) => (
                          <div key={step}
                            className={i <= ["Placed", "Processing",
                              "Shipped", "Delivered"].indexOf(order.status)
                              ? "track-step done" : "track-step"}>
                            <div className="track-dot"></div>
                            <span>{step}</span>
                          </div>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {page === "admin" && (
          <section className="section container page-section">
            {!isAdmin ? (
              <div className="empty-state">
                <Lock size={48} />
                <h2>Admin Access Required</h2>
              </div>
            ) : (
              <>
                <span className="eyebrow">STORE MANAGEMENT</span>
                <h1 className="page-title">Admin <em>Dashboard.</em></h1>
                <div className="stats-grid">
                  <div className="stat-card">
                    <Package /><span>Products</span>
                    <strong>{products.length}</strong>
                  </div>
                  <div className="stat-card">
                    <ShoppingBag /><span>Orders</span>
                    <strong>{adminOrders.length}</strong>
                  </div>
                  <div className="stat-card">
                    <CreditCard /><span>Order Value</span>
                    <strong>{currency(adminOrders.reduce(
                      (s, o) => s + Number(o.total), 0
                    ))}</strong>
                  </div>
                </div>

                <div className="admin-section">
                  <h2>{editingId ? "Edit Product" : "Add Product"}</h2>
                  <form className="admin-form" onSubmit={saveProduct}>
                    <div>
                      <label>Product Name</label>
                      <input required value={productForm.name}
                        onChange={e => setProductForm({
                          ...productForm, name: e.target.value
                        })} />
                    </div>
                    <div>
                      <label>Category</label>
                      <select value={productForm.category}
                        onChange={e => setProductForm({
                          ...productForm, category: e.target.value
                        })}>
                        {categories.slice(1).map(c => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Price</label>
                      <input type="number" min="0" step="0.01" required
                        value={productForm.price}
                        onChange={e => setProductForm({
                          ...productForm, price: e.target.value
                        })} />
                    </div>
                    <div>
                      <label>Stock</label>
                      <input type="number" min="0" required
                        value={productForm.stock}
                        onChange={e => setProductForm({
                          ...productForm, stock: e.target.value
                        })} />
                    </div>
                    <div className="wide">
                      <label>Image URL</label>
                      <input value={productForm.image}
                        onChange={e => setProductForm({
                          ...productForm, image: e.target.value
                        })} />
                    </div>
                    <div className="wide">
                      <label>Description</label>
                      <textarea rows="3" value={productForm.description}
                        onChange={e => setProductForm({
                          ...productForm, description: e.target.value
                        })} />
                    </div>
                    <label className="checkbox-label wide">
                      <input type="checkbox"
                        checked={productForm.featured}
                        onChange={e => setProductForm({
                          ...productForm, featured: e.target.checked
                        })} />
                      Featured Product
                    </label>
                    <div className="wide form-actions">
                      <button className="btn btn-primary" disabled={busy}>
                        {editingId ? "Update Product" : "Add Product"}
                      </button>
                      {editingId && (
                        <button type="button" className="btn btn-outline"
                          onClick={() => {
                            setEditingId(null);
                            setProductForm(blankProduct);
                          }}>Cancel</button>
                      )}
                    </div>
                  </form>
                </div>

                <div className="admin-section">
                  <h2>Product Inventory</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th><th>Price</th>
                          <th>Stock</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map(p => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{currency(p.price)}</td>
                            <td>{p.stock}</td>
                            <td>
                              <button className="table-action"
                                onClick={() => editProduct(p)}>
                                <Edit3 size={16} />
                              </button>
                              <button className="table-action danger"
                                onClick={() => deleteProduct(p.id)}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-section">
                  <h2>Manage Orders</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th><th>Customer</th>
                          <th>Total</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminOrders.map(o => (
                          <tr key={o.id}>
                            <td>#{o.id}</td>
                            <td>{o.customer_name}</td>
                            <td>{currency(o.total)}</td>
                            <td>
                              <select value={o.status}
                                onChange={e => changeOrderStatus(
                                  o.id, e.target.value
                                )}>
                                {["Placed", "Processing", "Shipped", "Delivered"]
                                  .map(s => <option key={s}>{s}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="container footer-main">
          <div>
            <div className="footer-logo">NEX<span>O</span>RA.</div>
            <p>Elevating everyday life through exceptional technology.</p>
          </div>
          <div>
            <h4>EXPLORE</h4>
            <button onClick={() => navigate("home")}>Home</button>
            <button onClick={() => navigate("shop")}>Products</button>
            <button onClick={() => navigate("cart")}>Cart</button>
          </div>
          <div>
            <h4>ACCOUNT</h4>
            <button onClick={() => navigate("login")}>Login</button>
            <button onClick={() => {
              if (user) loadOrders();
              navigate("orders");
            }}>Orders</button>
          </div>
        </div>
        <div className="container footer-bottom">
          © {new Date().getFullYear()} NEXORA — Academic E-Commerce Project
        </div>
      </footer>
    </div>
  );
}
