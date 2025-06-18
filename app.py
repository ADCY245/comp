from flask import Flask, render_template, send_from_directory, request, redirect, url_for, jsonify, flash, session, make_response, send_file
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from waitress import serve
import os
import json
from datetime import datetime, timedelta
import uuid
import hashlib
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
import jwt
import random
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# Import MongoDB users module
try:
    from mongo_users import (
        find_user_by_id as mu_find_user_by_id,
        find_user_by_email_or_username as mu_find_user_by_email_or_username,
        create_user as mu_create_user,
        verify_password as mu_verify_password,
        users_col
    )
    MONGO_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    print(f"MongoDB module not available: {e}")
    MONGO_AVAILABLE = False
    users_col = None

# Load environment variables
load_dotenv()

# Debug environment variables
print("\n=== Environment Variables ===")
print(f"MONGO_URI: {'Set' if os.getenv('MONGO_URI') else 'Not set'}")
print(f"DB_NAME: {os.getenv('DB_NAME', 'moneda_db')}")
print(f"USE_MONGO: {os.getenv('USE_MONGO', 'Not set')}")
print("===========================\n")

# JWT Configuration

# -------------------- MongoDB configuration --------------------
# Initialize MongoDB if available
MONGO_AVAILABLE = False
USE_MONGO = os.environ.get('USE_MONGO', 'true').lower() == 'true'  # Default to True
DB_NAME = os.environ.get('DB_NAME', 'moneda_db')  # Get DB_NAME from environment or use default
MONGO_URI = os.getenv('MONGO_URI', '').strip()

mongo_client = None
mongo_db = None
users_col = None

print("\n=== MongoDB Configuration ===")
print(f"USE_MONGO: {USE_MONGO}")
print(f"MONGO_URI: {'Set' if MONGO_URI else 'Not set'}")
print(f"DB_NAME: {DB_NAME}")

if MONGO_URI and USE_MONGO:
    try:
        print("Attempting to connect to MongoDB...")
        
        # Updated MongoDB connection with SSL options
        from pymongo import MongoClient
        from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError
        
        # Initialize connection variables
        mongo_client = None
        connection_successful = False
        
        try:
            import certifi
            CA_FILE = certifi.where()
        except ImportError:
            CA_FILE = None
            print("⚠️  certifi not installed; proceeding without custom CA bundle")
        # First try with SSL and valid CA bundle
        try:
            mongo_client = MongoClient(
                MONGO_URI,
                tls=True,
                tlsCAFile=certifi.where(),  # Use certifi CA bundle
                retryWrites=True,
                w='majority',
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
                serverSelectionTimeoutMS=10000,
                maxIdleTimeMS=10000
            )
            # Test the connection
            mongo_client.admin.command('ping')
            print("✅ MongoDB connection successful with SSL")
            connection_successful = True
        except Exception as e:
            print(f"❌ MongoDB TLS connection failed: {str(e)}")
            print("Attempting connection with allowInvalidCertificates...")
            try:
                mongo_client = MongoClient(
                    MONGO_URI,
                    tls=True,
                    tlsCAFile=certifi.where(),  # Use certifi CA bundle
                    tlsAllowInvalidCertificates=True,
                    retryWrites=True,
                    w='majority',
                    connectTimeoutMS=10000,
                    socketTimeoutMS=10000,
                    serverSelectionTimeoutMS=10000,
                    maxIdleTimeMS=10000
                )
                # Test the connection
                mongo_client.admin.command('ping')
                print("✅ MongoDB connection successful with invalid certificates")
                connection_successful = True
            except Exception as e2:
                print(f"❌ MongoDB connection with invalid certificates also failed: {str(e2)}")
        
        # Set connection status and initialise collections only if successful
        if connection_successful and mongo_client:
            MONGO_AVAILABLE = True
            print("✅ MongoDB connection successful")

            # Set up database and collections
            mongo_db = mongo_client[DB_NAME]
            users_col = mongo_db['users']
        else:
            MONGO_AVAILABLE = False
            print("❌ MongoDB connection failed – this application requires MongoDB. Exiting.")
            raise SystemExit("MongoDB connection required but unavailable")
        
        # Initialize mongo_users with the connection
        try:
            from mongo_users import init_mongo_connection
            users_col = init_mongo_connection(mongo_client, mongo_db)
            print("✅ mongo_users initialized successfully")
            
            # Print database stats
            print(f"Using database: {mongo_db.name}")
            collections = mongo_db.list_collection_names()
            print(f"Collections: {collections}")
            
            if users_col is not None:
                try:
                    user_count = users_col.count_documents({})
                    print(f"Users count: {user_count}")
                except Exception as e:
                    print(f"⚠️ Could not count users: {str(e)}")
            
            MONGO_AVAILABLE = True
            
        except Exception as e:
            print(f"❌ Error initializing mongo_users: {str(e)}")
            raise
        
    except Exception as e:
        print(f"❌ Unexpected error during MongoDB setup: {str(e)}")
        print("Falling back to JSON storage")
        MONGO_AVAILABLE = False
        
    except Exception as e:
        print(f"❌ MongoDB connection error: {str(e)}")
        print("Falling back to JSON storage")
        MONGO_AVAILABLE = False
        mongo_client = None
        mongo_db = None
        users_col = None
else:
    print("MongoDB not enabled in configuration")
    
print("==============================\n")
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION = 3600  # 1 hour

# Email Configuration
SMTP_SERVER = os.getenv('SMTP_HOST')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USER')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
EMAIL_FROM = os.getenv('EMAIL_FROM')
EMAIL_FROM_NAME = os.getenv('EMAIL_FROM_NAME')

# Frontend URL for email links
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# Persistent file paths (Render users can attach a Disk at /var/data or set USERS_FILE_PATH/CART_FILE_PATH)
def _resolve_data_dir():
    # Determine writable directory for persistence
    preferred = os.getenv('DATA_DIR', '/var/data')
    try:
        os.makedirs(preferred, exist_ok=True)
        test_path = os.path.join(preferred, '.write_test')
        with open(test_path, 'w') as fp:
            fp.write('ok')
        os.remove(test_path)
        return preferred
    except Exception:
        fallback = os.path.join('static', 'data')
        os.makedirs(fallback, exist_ok=True)
        return fallback

DATA_DIR = _resolve_data_dir()
USERS_FILE = os.getenv('USERS_FILE_PATH', os.path.join(DATA_DIR, 'users.json'))
CART_FILE = os.getenv('CART_FILE_PATH', os.path.join(DATA_DIR, 'cart.json'))

# User class
class User(UserMixin):
    def __init__(self, id, email, username, password_hash, is_verified=False, otp_verified=False, cart=None, reset_token=None, reset_token_expiry=None):
        self.id = id
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.otp_verified = otp_verified
        self.cart = cart if cart is not None else []
        self.reset_token = reset_token
        self.reset_token_expiry = reset_token_expiry

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'password_hash': self.password_hash,
            'is_verified': self.is_verified,
            'reset_token': self.reset_token,
            'reset_token_expiry': self.reset_token_expiry.isoformat() if self.reset_token_expiry else None,
            'otp_verified': self.otp_verified
        }

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_auth_token(self, expires_in=JWT_EXPIRATION):
        return jwt.encode(
            {'user_id': self.id, 'exp': time() + expires_in},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM
        )

    @staticmethod
    def verify_auth_token(token):
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return data.get('user_id')
        except:
            return None

# ---------------------------------------------------------------------------
# JSON persistence helpers
# ---------------------------------------------------------------------------
# Existing private helpers (_load_users_json / _save_users_json) are used by
# the rest of the code via these thin wrappers so the earlier calls to
# load_users()/save_users() continue to work without refactor.

def _load_users_json():
    """Load users from JSON file."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Try to read the file
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                    content = '{}'
                users_data = json.loads(content)
        except (FileNotFoundError, json.JSONDecodeError):
            # If file doesn't exist or is invalid JSON, create a new empty file
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                f.write('{}')
            users_data = {}
            
        users = {}
        for user_id, user_data in users_data.items():
            try:
                # Ensure all required fields exist
                if not all(key in user_data for key in ['email', 'username', 'password_hash']):
                    print(f"Skipping invalid user data: missing required fields")
                    continue
                
                users[user_id] = User(
                    id=user_id,
                    email=user_data['email'],
                    username=user_data['username'],
                    password_hash=user_data['password_hash'],
                    is_verified=user_data.get('is_verified', False),
                    reset_token=user_data.get('reset_token'),
                    reset_token_expiry=datetime.fromisoformat(user_data.get('reset_token_expiry')) if user_data.get('reset_token_expiry') else None,
                    otp_verified=user_data.get('otp_verified', False)
                )
            except Exception as e:
                print(f"Error loading user {user_id}: {e}")
                continue
        return users
    except Exception as e:
        print(f"Error loading users: {e}")
        try:
            # Create a fresh empty file with proper encoding
            os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                f.write('{}')
        except Exception as e:
            print(f"Error creating users file: {e}")
        return {}

# Public aliases expected by legacy code -------------------------------------

def load_users():
    """Legacy wrapper around _load_users_json."""
    return _load_users_json()

def save_users(users_dict=None):
    """Legacy wrapper around _save_users_json."""
    return _save_users_json(users_dict)

# Load users at startup for JSON fallback
users = load_users()

def _save_users_json(users_dict=None):
    """Save users to JSON file. If no argument is provided, saves the global users dictionary."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Get the users data to save
        if users_dict is None:
            users_dict = users
            
        # Create a temporary file
        temp_file = USERS_FILE + '.tmp'
        
        # Convert users to dictionary format
        user_data = {user_id: user.to_dict() for user_id, user in users_dict.items()}
        
        # Write to temporary file
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, indent=2)
        
        # Replace original file with temporary file atomically
        try:
            os.replace(temp_file, USERS_FILE)
        except FileNotFoundError:
            # If file doesn't exist, just rename the temp file
            os.rename(temp_file, USERS_FILE)
        
        # Verify the file was saved correctly
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                saved_data = json.load(f)
                if len(saved_data) != len(user_data):
                    raise Exception("File save verification failed")
        except Exception as e:
            print(f"Error verifying saved file: {e}")
            return False
        
        return True
    except Exception as e:
        print(f"Error saving users: {e}")
        try:
            # Clean up temp file if it exists
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception as cleanup_error:
            print(f"Error cleaning up temp file: {cleanup_error}")
        return False

# ----- Mongo wrappers overriding JSON if USE_MONGO -----
if USE_MONGO:
    def load_users():
        users_local = {}
        try:
            for doc in users_col.find():
                users_local[doc['_id']] = User(
                    id=doc['_id'],
                    email=doc.get('email'),
                    username=doc.get('username'),
                    password_hash=doc.get('password_hash'),
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False),
                    reset_token=doc.get('reset_token'),
                    reset_token_expiry=doc.get('reset_token_expiry')
                )
        except Exception as e:
            print(f"Error loading users from MongoDB: {e}")
        return users_local

    def save_users(users_dict=None):
        try:
            if users_dict is None:
                users_dict = users
            for uid, user in users_dict.items():
                users_col.update_one({'_id': uid}, {'$set': user.to_dict()}, upsert=True)
            return True
        except Exception as e:
            print(f"Error saving users to MongoDB: {e}")
            return False
else:
    # Fallback to JSON versions defined above
    load_users = _load_users_json
    save_users = _save_users_json

# Add logging for debugging
print(f"SMTP Configuration:\n"
      f"SMTP_HOST: {SMTP_SERVER}\n"
      f"SMTP_PORT: {SMTP_PORT}\n"
      f"SMTP_USER: {SMTP_USERNAME}\n"
      f"EMAIL_FROM: {EMAIL_FROM}")

def check_email_config():
    """Check if email configuration is valid."""
    if not SMTP_SERVER or not SMTP_USERNAME or not SMTP_PASSWORD or not EMAIL_FROM:
        print("Warning: Email configuration is incomplete")
        return False
    return True

# Initialize email configuration
email_config_valid = check_email_config()

def refresh_email_config():
    """Periodically refresh email configuration."""
    global email_config_valid
    email_config_valid = check_email_config()

# Initialize Flask app
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')

# Initialize cart store
# -------------------- Cart storage abstractions --------------------
class MongoCartStore:
    """MongoDB-backed cart store with one cart document per user."""

    def __init__(self, db):
        self.col = db.get_collection('carts')

    def _doc(self, user_id):
        return self.col.find_one({"user_id": user_id}) or {}

    def get_cart(self, user_id):
        doc = self._doc(user_id)
        return doc.get('products', [])

    def save_cart(self, user_id, products):
        self.col.update_one(
            {"user_id": user_id},
            {"$set": {"products": products, "updated_at": datetime.utcnow()}},
            upsert=True
        )
        return True

    def clear_cart(self, user_id):
        return self.save_cart(user_id, [])


# Fallback JSON/in-memory version ----------------------------------
class CartStore:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.cart = cls._load_cart()
        return cls._instance
    
    @staticmethod
    def _load_cart():
        try:
            if os.path.exists(CART_FILE):
                with open(CART_FILE, 'r') as f:
                    return json.load(f)
            return {"products": []}
        except Exception as e:
            print(f"Error loading cart: {e}")
            return {"products": []}
    
    @staticmethod
    def _save_cart(cart):
        try:
            os.makedirs(os.path.dirname(CART_FILE), exist_ok=True)
            with open(CART_FILE, 'w') as f:
                json.dump(cart, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving cart: {e}")
            return False
    
    def get_cart(self):
        return self.cart
    
    def save_cart(self, cart):
        self.cart = cart
        return self._save_cart(cart)

# Choose the appropriate cart store implementation
if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
    print("Using MongoCartStore for cart persistence")
    cart_store = MongoCartStore(mongo_db)
else:
    print("Using local JSON CartStore for cart persistence")
    cart_store = CartStore()

# -------------------- Cart helper wrappers --------------------

def get_user_cart():
    """Return a dict with a products list for the current user, using MongoDB if available."""
    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            products = cart_store.get_cart(current_user.id)
            return {"products": products or []}
        else:
            # Fallback to JSON storage
            cart = cart_store.get_cart()
            if not isinstance(cart, dict):
                cart = {"products": []}
            cart.setdefault("products", [])
            return cart
    except Exception as e:
        print(f"Error in get_user_cart: {e}")
        return {"products": []}

def save_user_cart(cart_dict):
    """Persist cart for current user using MongoDB if available."""
    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            cart_store.save_cart(current_user.id, cart_dict.get("products", []))
        else:
            # Fallback to JSON storage
            cart_store.save_cart(cart_dict)
    except Exception as e:
        print(f"Error in save_user_cart: {e}")
        raise


# Initialize users dictionary (only for JSON fallback)
if USE_MONGO:
    users = {}
else:
    users = load_users()
    print(f"Loaded {len(users)} users from file")

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    if MONGO_AVAILABLE and USE_MONGO:
        try:
            print(f'Loading user from MongoDB with ID: {user_id}')
            doc = mu_find_user_by_id(user_id)
            if not doc:
                print(f'User not found in MongoDB with ID: {user_id}')
                return None
                
            user = User(
                id=str(doc['_id']),  # Convert ObjectId to string
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False)
            )
            print(f'Successfully loaded user: {user.email} (ID: {user.id})')
            return user
        except Exception as e:
            print(f"Error loading user {user_id}: {e}")
            return None
    else:
        print('MongoDB not available, falling back to JSON users')
        return users.get(user_id) if hasattr(users, 'get') else None

@app.route('/')
def home():
    if current_user.is_authenticated:
        return redirect(url_for('display'))
    return redirect(url_for('login'))

@app.route('/display')
@login_required
def display():
    return render_template('display.html')

@app.route('/cart')
@login_required
def cart():
    """Render the cart page."""
    cart_data = get_user_cart()
    return render_template('cart.html', cart=cart_data)
    """Render the cart page with current cart contents.

    The Jinja template expects a ``cart`` object with a ``products`` list. We
    fetch the persisted cart from ``cart_store`` and guarantee the structure so
    that template rendering never fails even when the cart is empty.
    """
    # Get the current cart; fall back to an empty structure if something goes wrong
    cart_data = cart_store.get_cart()
    if not isinstance(cart_data, dict):
        cart_data = {"products": []}

    # Ensure required keys exist
    cart_data.setdefault("products", [])

    return render_template('cart.html', cart=cart_data)

@app.route('/clear_cart', methods=['POST'])
@login_required
def clear_cart():
    try:
        save_user_cart({'products': []})
        flash('Cart cleared', 'success')
    except Exception as e:
        print(f"Error clear_cart: {e}")
        flash('Error clearing cart', 'danger')
    return redirect(url_for('cart'))
    """Clear current user's cart"""
    try:
        cart_store.save_cart({'products': []})
        flash('Cart cleared', 'success')
    except Exception as e:
        print(f"Error clearing cart: {e}")
        flash('Error clearing cart', 'danger')
    return redirect(url_for('cart'))

@app.route('/add_to_cart', methods=['POST'])
@login_required
def add_to_cart():
    try:
        product = request.get_json() or {}
        cart = get_user_cart()
        cart['products'].append(product)
        save_user_cart(cart)
        return jsonify({
            'success': True,
            'cart_count': len(cart['products'])
        })
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        product = {
            'id': data.get('id'),
            'name': data.get('name'),
            'price': float(data.get('price', 0)),
            'quantity': int(data.get('quantity', 1)),
            'image': data.get('image', '')
        }

        # Get current cart
        cart = get_user_cart()
        products = cart.get('products', [])
        
        # Check if product already exists in cart
        product_exists = False
        for i, item in enumerate(products):
            if item.get('id') == product['id']:
                products[i]['quantity'] += product['quantity']  # Update quantity if exists
                product_exists = True
                break
                
        if not product_exists:
            products.append(product)
        
        # Save updated cart
        save_user_cart({'products': products})
        
        return jsonify({
            'success': True,
            'message': 'Product added to cart successfully',
            'cart_count': len(products)
        })
    except Exception as e:
        print(f"Error adding to cart: {e}")
        return jsonify({'error': 'Failed to add to cart'}), 500

@app.route('/get_cart')
@login_required
def get_cart():
    """Return the current user's cart as JSON."""
    try:
        cart = get_user_cart()
        return jsonify(cart)
    except Exception as e:
        print(f"Error get_cart: {e}")
        return jsonify({'error': 'Failed to get cart', 'products': []}), 500

@app.route('/remove_from_cart', methods=['POST'])
@login_required
def remove_from_cart():
    """Remove the product at `index` from the user's cart."""
    data = request.get_json() or {}
    try:
        idx = int(data.get('index'))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid index'}), 400

    try:
        cart = get_user_cart()
        products = cart.get('products', [])
        
        if 0 <= idx < len(products):
            products.pop(idx)
            save_user_cart({'products': products})
            return jsonify({
                'success': True,
                'cart_count': len(products)
            })
            
        return jsonify({'error': 'invalid index'}), 400
    except Exception as e:
        print(f"Error in remove_from_cart: {e}")
        return jsonify({'error': 'Failed to remove item from cart'}), 500
        

@app.route('/get_cart_count')
@login_required
def get_cart_count():
    """Return the number of products currently in the user's cart."""
    try:
        cart = get_user_cart()
        return jsonify({'count': len(cart.get('products', []))})
    except Exception as e:
        print(f"Error in get_cart_count: {e}")
        return jsonify({'count': 0}), 500

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/signup')
def signup():
    return render_template('signup.html')

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email')
        if not email:
            flash('Email is required', 'danger')
            return redirect(url_for('forgot_password'))
        # Ensure latest users loaded
        global users
        users = load_users()
                # Find user by email
        if USE_MONGO:
            doc = mu.find_user_by_email_or_username(email)
            if not doc:
                flash('No account with that email', 'danger')
                return redirect(url_for('forgot_password'))
            user_obj = User(
                id=doc['_id'],
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False)
            )
        else:
            user_obj = None
            for u in users.values():
                if u.email == email:
                    user_obj = u
                    break
        if not user_obj:
            flash('No account with that email', 'danger')
            return redirect(url_for('forgot_password'))
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        if USE_MONGO:
            # persist OTP in Mongo
            mu.update_user(user_obj.id, {
                "reset_token": otp,
                "reset_token_expiry": datetime.now() + timedelta(minutes=10)
            })
        else:
            user_obj.reset_token = otp
            user_obj.reset_token_expiry = datetime.now() + timedelta(minutes=10)
            save_users()
        # Email OTP (if SMTP configured)
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
                msg['To'] = email
                msg['Subject'] = "Password Reset OTP"
                body = f"Your password reset OTP is: {otp}\nThis code will expire in 10 minutes."
                msg.attach(MIMEText(body, 'plain'))
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    if SMTP_USERNAME and SMTP_PASSWORD:
                        server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.sendmail(EMAIL_FROM, email, msg.as_string())
            except Exception as e:
                print(f"SMTP send error: {e}")
        flash('OTP sent to your email address', 'success')
        return redirect(url_for('reset_password'))
    return render_template('forgot_password.html')

# API Routes
@app.route('/api/request-otp', methods=['POST'])
def api_request_otp():
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
            
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        
        # Store OTP in user session with proper expiry format
        session['otp'] = otp
        session['otp_expiry'] = (datetime.now() + timedelta(minutes=5)).isoformat()
        
        # Send OTP to email
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"""{EMAIL_FROM_NAME} <{EMAIL_FROM}>"""
                msg['To'] = email
                msg['Subject'] = 'Your OTP for Registration'
                
                body = f"Your OTP is: {otp}\nThis OTP will expire in 5 minutes."
                msg.attach(MIMEText(body, 'plain'))
                
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
            except Exception as e:
                print(f"Error sending email: {str(e)}")
                return jsonify({'error': 'Failed to send OTP. Please try again later.'}), 500
                
        return jsonify({
            'success': True,
            'message': 'OTP has been sent to your email'
        })
        
    except Exception as e:
        print(f"OTP request error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/verify-otp', methods=['POST'])
def api_verify_otp():
    try:
        data = request.get_json()
        otp = data.get('otp')
        
        if not otp:
            return jsonify({'error': 'OTP is required'}), 400
            
        # Get stored OTP from session
        stored_otp = session.get('otp')
        otp_expiry = session.get('otp_expiry')
        
        if not stored_otp:
            return jsonify({'error': 'No OTP requested. Please request OTP first.'}), 400
            
        if otp_expiry and datetime.now() > datetime.fromisoformat(str(otp_expiry)):
            return jsonify({'error': 'OTP has expired. Please request a new OTP.'}), 400
            
        if otp != stored_otp:
            return jsonify({'error': 'Invalid OTP'}), 401
            
        # Clear OTP from session after successful verification
        session.pop('otp', None)
        session.pop('otp_expiry', None)
        
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully'
        })
        
    except Exception as e:
        print(f"OTP verification error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/register/complete', methods=['POST'])
def api_register_complete():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        print(f"\n🔍 Registration attempt for: {email} ({username})")
        print(f"MongoDB Status - Available: {MONGO_AVAILABLE}, Using: {USE_MONGO}")
        print(f"Users Collection: {users_col}")
        if users_col is not None:
            print(f"Collection name: {users_col.name}")
            print(f"Database name: {users_col.database.name}")
        
        otp = data.get('otp', '').strip()  # Get OTP if provided

        # Input validation
        if not all([email, username, password]):
            return jsonify({'error': 'Email, username, and password are required'}), 400
            
        print(f'Registration attempt - Email: {email}, Username: {username}')

        if MONGO_AVAILABLE and USE_MONGO:
            try:
                # Check for existing user
                existing_user = mu_find_user_by_email_or_username(email) or mu_find_user_by_email_or_username(username)
                if existing_user:
                    print(f'Registration failed: User already exists with email/username: {email}/{username}')
                    return jsonify({'error': 'Email or username already exists'}), 400
                
                # Create user in MongoDB
                print('Creating new user in MongoDB...')
                print(f'User details - Email: {email}, Username: {username}')
                
                # Debug: Check if we can access the users collection
                print(f'Users collection exists: {users_col is not None}')
                if users_col is not None:
                    print(f'Current users in DB: {users_col.count_documents({})}')
                
                # Create user and retrieve document
                user_id = mu_create_user(email, username, password)
                print(f'User created with ID: {user_id}')
                
                # Try to retrieve user document using both UUID and ObjectId formats
                doc = mu_find_user_by_id(user_id)
                if not doc:
                    try:
                        from bson import ObjectId
                        doc = mu_find_user_by_id(ObjectId(user_id))
                    except Exception as e:
                        print(f"Error retrieving user document: {str(e)}")
                        traceback.print_exc()
                        return jsonify({'error': 'Failed to create user in database'}), 500
                
                print(f'Retrieved user document: {doc is not None}')
                
                if not doc:
                    traceback.print_exc()
                    return jsonify({'error': 'Failed to create user in database'}), 500
                
                new_user = User(
                    id=str(doc['_id']),
                    email=doc['email'],
                    username=doc['username'],
                    password_hash=doc['password_hash'],
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False)
                )
                
            except Exception as e:
                print(f"❌ MongoDB Error: {str(e)}")
                traceback.print_exc()
                return jsonify({'error': 'Failed to create user in database'}), 500
        else:
            # Fallback to JSON storage
            print('Using JSON storage fallback')
            users = load_users()
            
            # Check for existing user
            if any(u.email == email or u.username == username for u in users.values()):
                return jsonify({'error': 'Email or username already exists'}), 400
                
            user_id = str(uuid.uuid4())
            new_user = User(user_id, email, username, password)
            new_user.set_password(password)
            users[user_id] = new_user
            
            if not save_users():
                return jsonify({'error': 'Failed to save user data'}), 500

        # Auto-login the newly registered user
        login_user(new_user)
        print(f'User {username} registered and logged in successfully')
        
        return jsonify({
            'success': True,
            'message': 'Registration successful',
            'redirectTo': '/display',  # Changed from '/login' to '/display'
            'user': {
                'id': new_user.id,
                'email': new_user.email,
                'username': new_user.username
            }
        })
        
    except Exception as e:
        print(f"Registration error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json()
        identifier = (data.get('identifier') or data.get('email') or data.get('username', '')).strip()
        password = (data.get('password') or '').strip()
        
        print(f'Login attempt - Identifier: {identifier}')
        
        if not identifier or not password:
            print('Login failed: Missing identifier or password')
            return jsonify({'error': 'Email/username and password are required'}), 400
            
        if MONGO_AVAILABLE and USE_MONGO:
            try:
                print('\n=== Login Debug ===')
                print(f'MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}')
                print(f'Users collection: {users_col}')
                if users_col is not None:
                    print(f'Collection name: {users_col.name}, DB: {users_col.database.name}')
                
                print('Attempting to find user in MongoDB...')
                # Find user by email or username in Mongo (case-insensitive)
                doc = mu_find_user_by_email_or_username(identifier)
                
                if not doc:
                    print(f'❌ User not found for identifier: {identifier}')
                    return jsonify({'error': 'Invalid email/username or password'}), 401
                    
                print(f'✅ User found in MongoDB:')
                print(f'   Email: {doc.get("email")} (stored in DB)')
                print(f'   Username: {doc.get("username")} (stored in DB)')
                print(f'   ID: {doc.get("_id")}')
                print(f'   Has password_hash: {"password_hash" in doc}')
                
                # Ensure we have the correct case for the username from the DB
                # This ensures we return the exact case that was used during registration
                identifier = doc.get('email', identifier) if '@' in identifier else doc.get('username', identifier)
                
                # Verify password
                print('\nVerifying password...')
                is_password_correct = mu_verify_password(doc, password)
                print(f'Password verification result: {is_password_correct}')
                
                if not is_password_correct:
                    print('❌ Password verification failed')
                    return jsonify({'error': 'Invalid email/username or password'}), 401
                
                # Create user object
                user = User(
                    id=str(doc['_id']),
                    email=doc['email'],
                    username=doc['username'],
                    password_hash=doc['password_hash'],
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False)
                )
                
                print(f'Successfully created user object for login: {user.email} (ID: {user.id})')
                
                # Log the user in
                login_user(user)
                print(f'User {user.username} logged in successfully')
                
                return jsonify({
                    'success': True,
                    'message': 'Login successful',
                    'redirectTo': '/display',
                    'user': {
                        'id': str(user.id),  # Ensure ID is string for JSON serialization
                        'email': user.email,
                        'username': user.username
                    }
                })
                
            except Exception as e:
                print(f'MongoDB login error: {str(e)}')
                import traceback
                traceback.print_exc()
                return jsonify({'error': 'Authentication service unavailable'}), 500

        # ---------------- JSON fallback path -----------------
        print('Falling back to JSON user storage')
        global users
        users = load_users()
        
        # Check if user exists in our loaded users
        user = None
        for user_id, u in users.items():
            if u.email == identifier or u.username == identifier:
                user = u
                break
                
        if not user:
            # If user not found in loaded users, try to load from file directly
            try:
                with open(USERS_FILE, 'r', encoding='utf-8') as f:
                    all_users = json.load(f)
                    for user_id, user_data in all_users.items():
                        if user_data.get('email') == identifier or user_data.get('username') == identifier:
                            # Create User object from file data
                            user = User(
                                id=user_id,
                                email=user_data['email'],
                                username=user_data['username'],
                                password_hash=user_data['password_hash'],
                                is_verified=user_data.get('is_verified', False),
                                otp_verified=user_data.get('otp_verified', False)
                            )
                            # Add to our users dictionary
                            users[user_id] = user
                            break
            except Exception as e:
                print(f"Error loading user from file: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500
                
        if not user:
            print(f'User not found in JSON storage for identifier: {identifier}')
            return jsonify({'error': 'Invalid email/username or password'}), 401
            
        if not user.check_password(password):
            print('Password verification failed for JSON user')
            return jsonify({'error': 'Invalid email/username or password'}), 401
            
        login_user(user)
        print(f'User {user.username} logged in successfully (JSON storage)')
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'redirectTo': '/display',
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username
            }
        })
        
    except Exception as e:
        print(f"Unexpected login error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'An unexpected error occurred during login'}), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    try:
        logout_user()
        return jsonify({'success': True, 'message': 'Logged out successfully'})
    except Exception as e:
        print(f"Logout error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/user', methods=['GET'])
def api_user():
    try:
        if current_user.is_authenticated:
            return jsonify({
                'success': True,
                'user': {
                    'id': current_user.id,
                    'email': current_user.email,
                    'username': current_user.username
                }
            })
        else:
            return jsonify({'error': 'Not logged in'}), 401
    except Exception as e:
        print(f"User error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/request-password-reset', methods=['POST'])
def api_request_password_reset():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
            
        print(f"Password reset requested for email: {email}")
            
        # Find user by email
        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            print("Looking up user in MongoDB...")
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
                print(f"User found in MongoDB: {user['email']} (ID: {user['_id']})")
        else:
            # Fallback to JSON storage
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break
                
        if not user:
            print(f"No user found with email: {email}")
            return jsonify({'error': 'No account found with that email'}), 404
            
        # Generate OTP
        otp = str(random.randint(100000, 999999))
        reset_data = {
            'reset_token': otp,
            'reset_token_expiry': datetime.utcnow() + timedelta(minutes=10)
        }
        
        if MONGO_AVAILABLE and USE_MONGO:
            print(f"Updating reset token for user {user['_id']}")
            users_col.update_one(
                {'_id': user['_id']},
                {'$set': reset_data}
            )
        else:
            # Fallback to JSON storage
            user.reset_token = otp
            user.reset_token_expiry = datetime.utcnow() + timedelta(minutes=10)
            save_users()
        
        # Send OTP to email (similar to signup flow)
        if email_config_valid:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
                msg['To'] = email
                msg['Subject'] = "Password Reset OTP"
                
                body = f"""
                Your password reset OTP is: {otp}
                This code will expire in 10 minutes.
                """
                msg.attach(MIMEText(body, 'plain'))
                
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
                    print(f"Password reset email sent to {email}")
            except Exception as e:
                print(f"Error sending email: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({'error': 'Failed to send OTP. Please try again later.'}), 500
        else:
            print("Email configuration is invalid, cannot send OTP")
                
        return jsonify({
            'success': True,
            'message': 'OTP has been sent to your email',
            'email': email  # Return the email for client-side reference
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/verify-reset-otp', methods=['POST'])
def api_verify_reset_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()
        
        if not all([email, otp]):
            return jsonify({'error': 'Email and OTP are required'}), 400
            
        print(f"Verifying OTP for email: {email}")
            
        # Find user by email
        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            print("Looking up user in MongoDB...")
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
                print(f"User found in MongoDB: {user['email']} (ID: {user['_id']})")
        else:
            # Fallback to JSON storage
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break
                
        if not user:
            print(f"No user found with email: {email}")
            return jsonify({'error': 'No account found with that email'}), 404
            
        # Verify OTP
        stored_otp = user.get('reset_token') if isinstance(user, dict) else user.reset_token
        stored_expiry = user.get('reset_token_expiry') if isinstance(user, dict) else user.reset_token_expiry
        
        print(f"Verifying OTP - Stored: {stored_otp}, Provided: {otp}")
        
        if not stored_otp or stored_otp != otp:
            print("Invalid OTP")
            return jsonify({'error': 'Invalid OTP'}), 400
            
        if stored_expiry and stored_expiry < datetime.utcnow():
            print("OTP expired")
            return jsonify({'error': 'OTP has expired'}), 400
            
        # If we get here, OTP is valid
        print("OTP verified successfully")
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully',
            'email': email,  # Return the email for client-side reference
            'otp': otp      # Return the OTP for client-side reference
        })
        
    except Exception as e:
        print(f"OTP verification error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()
        new_password = data.get('newPassword', '').strip()
        
        if not all([email, otp, new_password]):
            return jsonify({'error': 'Email, OTP, and new password are required'}), 400
            
        print(f"Resetting password for email: {email}")
            
        # Find user by email
        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            print("Looking up user in MongoDB...")
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
                print(f"User found in MongoDB: {user['email']} (ID: {user['_id']})")
        else:
            # Fallback to JSON storage
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break
                
        if not user:
            print(f"No user found with email: {email}")
            return jsonify({'error': 'No account found with that email'}), 404
            
        # Verify OTP
        stored_otp = user.get('reset_token') if isinstance(user, dict) else user.reset_token
        stored_expiry = user.get('reset_token_expiry') if isinstance(user, dict) else user.reset_token_expiry
        
        print(f"Verifying OTP - Stored: {stored_otp}, Provided: {otp}")
        
        if not stored_otp or stored_otp != otp:
            print("Invalid OTP")
            return jsonify({'error': 'Invalid OTP'}), 400
            
        if stored_expiry and stored_expiry < datetime.utcnow():
            print("OTP expired")
            return jsonify({'error': 'OTP has expired'}), 400
            
        # Update password
        if MONGO_AVAILABLE and USE_MONGO:
            print(f"Updating password for user {user['_id']}")
            # Create a new User instance to use its password hashing
            temp_user = User(
                id=str(user['_id']),
                email=user['email'],
                username=user['username'],
                password_hash=user.get('password_hash', '')
            )
            temp_user.set_password(new_password)
            
            # Update the user in MongoDB
            users_col.update_one(
                {'_id': user['_id']},
                {'$set': {
                    'password_hash': temp_user.password_hash,
                    'reset_token': None,
                    'reset_token_expiry': None
                }}
            )
            print("Password updated successfully in MongoDB")
        else:
            # Fallback to JSON storage
            user.set_password(new_password)
            user.reset_token = None
            user.reset_token_expiry = None
            save_users()
        
        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully',
            'redirectTo': '/login'
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

# ... (rest of the code remains the same)

@app.route('/chemicals/<filename>')
def chemicals(filename):
    return send_from_directory('static/data/chemicals', filename)

@app.route('/blankets_data/<filename>')
def blankets_data(filename):
    return send_from_directory('static/data/blankets', filename)

@app.route('/chemicals_data/<filename>')
def chemicals_data(filename):
    return send_from_directory('static/data/chemicals', filename)

@app.route('/static/data/blankets/<filename>')
def static_blankets(filename):
    return send_from_directory('static/data/blankets', filename)

@app.route('/static/data/chemicals/<filename>')
def static_chemicals(filename):
    return send_from_directory('static/data/chemicals', filename)

# Product pages
@app.route('/mpack')
@login_required
def mpack_page():
    return render_template('products/chemicals/mpack.html')

@app.route('/blankets')
@login_required
def blankets_page():
    return render_template('products/blankets/blankets.html')

@app.route('/reset-password')
def reset_password_page():
    return render_template('reset_password.html')


# Error handling
@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

# Start app
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    if os.environ.get('FLASK_ENV') == 'production':
        serve(app, host="0.0.0.0", port=port)
    else:
        app.run(host='0.0.0.0', port=port, debug=True)
