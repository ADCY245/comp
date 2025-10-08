import traceback
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash, send_from_directory, make_response, abort
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_wtf import FlaskForm
from flask_pymongo import PyMongo
from pymongo import MongoClient, errors
from pymongo.errors import ServerSelectionTimeoutError
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email
from waitress import serve
import os
import json
from datetime import datetime, timedelta, timezone
import uuid
import hashlib
import secrets
import smtplib
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from flask_login import current_user
import random
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from bson.objectid import ObjectId
import socket  # Added for socket.timeout and socket.gaierror
import logging
import sys
from pathlib import Path

# Define India timezone (IST - UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_india_time():
    """Get current time in India timezone (IST)"""
    return datetime.now(IST)

def get_next_quote_id():
    """Generate the next sequential quote ID in format CGI_PC_Q{number}"""
    if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
        try:
            # Find the highest existing quote number
            last_quote = mongo_db.quotations.find_one(
                {'quote_id': {'$regex': '^CGI_PC_Q\\d+$'}},
                sort=[('quote_id', -1)]  # Sort by quote_id in descending order
            )
            
            if last_quote and 'quote_id' in last_quote:
                # Extract the number part and increment
                last_number = int(last_quote['quote_id'].split('_')[-1][1:])
                next_number = last_number + 1
            else:
                next_number = 1
                
            return f"CGI_PC_Q{next_number}"
            
        except Exception as e:
            app.logger.error(f"Error generating sequential quote ID: {str(e)}")
            # Fallback to timestamp-based ID if there's an error
            return f"CGI_PC_{int(get_india_time().timestamp())}"
    else:
        # Fallback to timestamp-based ID if MongoDB is not available
        return f"CGI_PC_{int(get_india_time().timestamp())}"

# Import API blueprints (will be registered after app creation)
from api.customers import bp as customers_bp
from api.companies import bp as companies_bp

# Import MongoDB users module
try:
    from mongo_users import (
        find_user_by_id as mu_find_user_by_id,
        find_user_by_email_or_username as mu_find_user_by_email_or_username,
        create_user as mu_create_user,
        verify_password as mu_verify_password,
        update_user as mu_update_user,
        users_col
    )
    MONGO_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    print(f"MongoDB module not available: {e}")
    MONGO_AVAILABLE = False
    users_col = None

# Load environment variables
config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
if os.path.exists(config_path):
    load_dotenv(config_path)
else:
    # Fall back to .env file if config/config.env doesn't exist
    load_dotenv()

# Configure console output to use UTF-8 encoding
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Debug environment variables
print("\n=== Environment Variables ===")
print(f"MONGO_URI: {'Set' if os.getenv('MONGO_URI') else 'Not set'}")
print(f"DB_NAME: {os.getenv('DB_NAME', 'moneda_db')}")
print(f"USE_MONGO (env): {os.getenv('USE_MONGO', 'Not set')}")
print(f"JSON_FALLBACK (env): {os.getenv('JSON_FALLBACK', 'Not set')}")
print("===========================\n")

# CORS Configuration
from flask_cors import CORS
app = Flask(__name__)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# -------------------- Company selection enforcement --------------------

def company_required(view_func):
    """Decorator to ensure a company is selected before accessing product/cart pages.
    If a `company_id` query parameter is present, it will set the selected company
    in the session on-the-fly so that the request can proceed seamlessly.
    """
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        app.logger.info("[DEBUG] company_required decorator called for %s", request.path)
        
        # If session already has a selected company, allow
        selected_company = session.get('selected_company', {})
        app.logger.info("[DEBUG] Current selected_company from session: %s", selected_company)
        
        if selected_company.get('id'):
            app.logger.info("[DEBUG] Company already selected, allowing access")
            return view_func(*args, **kwargs)

        # Check for company_name and company_email in session as fallback
        if session.get('company_name') or session.get('company_email'):
            app.logger.info("[DEBUG] Found company_name/email in session, creating selected_company")
            session['selected_company'] = {
                'id': session.get('company_id'),
                'name': session.get('company_name', ''),
                'email': session.get('company_email', '')
            }
            session.modified = True
            return view_func(*args, **kwargs)

        # Attempt to use company_id from query parameters (first-time access)
        company_id = request.args.get('company_id')
        app.logger.info("[DEBUG] No company in session, checking for company_id in query params: %s", company_id)
        
        if company_id:
            # Lazy import to avoid circular dependencies
            from app import get_company_name_by_id, get_company_email_by_id  # type: ignore
            company_name = get_company_name_by_id(company_id) or ''
            company_email = get_company_email_by_id(company_id) or ''
            app.logger.info("[DEBUG] Found company details - name: %s, email: %s", company_name, company_email)
            
            if company_name or company_email:
                session['selected_company'] = {
                    'id': company_id,
                    'name': company_name,
                    'email': company_email
                }
                session['company_name'] = company_name
                session['company_email'] = company_email
                session['company_id'] = company_id  # Ensure company_id is set in session
                session.modified = True
                app.logger.info("[DEBUG] Updated session with company details")
                return view_func(*args, **kwargs)

        # Otherwise, redirect to company selection
        app.logger.warning("[DEBUG] No company selected, redirecting to company selection")
        flash('Please select a company first.', 'warning')
        return redirect(url_for('company_selection'))
    return wrapped_view

# -----------------------------------------------------------------------

CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "supports_credentials": True
    }
})

# -------------------- MongoDB configuration --------------------
# Admin email for alerts
ADMIN_ALERT_EMAIL = os.getenv('ADMIN_ALERT_EMAIL', 'athulnair3096@gmail.com')

# Helper to send alert email

def send_alert_email(subject: str, body: str):
    """Send an alert email to admin; relies on environment variables SMTP_HOST, SMTP_PORT, EMAIL_USER, EMAIL_PASS"""
    try:
        # Get email configuration
        smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', 587))
        email_user = os.getenv('EMAIL_USER')
        email_pass = os.getenv('EMAIL_PASS')
        
        # Log configuration for debugging
        app.logger.info(f"Email config - Host: {smtp_host}, Port: {smtp_port}, User: {email_user}")
        
        # Validate configuration
        if not all([email_user, email_pass]):
            error_msg = 'Email credentials not fully configured; missing EMAIL_USER or EMAIL_PASS'
            app.logger.error(error_msg)
            return False
            
        if not ADMIN_ALERT_EMAIL:
            error_msg = 'No admin email address configured'
            app.logger.error(error_msg)
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = email_user
        msg['To'] = ADMIN_ALERT_EMAIL
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email
        app.logger.info(f"Attempting to send email to {ADMIN_ALERT_EMAIL}")
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            if smtp_port == 587:
                server.starttls()
                server.ehlo()
            
            app.logger.info("Logging into SMTP server...")
            server.login(email_user, email_pass)
            
            app.logger.info("Sending email message...")
            server.send_message(msg)
            server.quit()
            
        app.logger.info("Email sent successfully")
        return True
        
    except smtplib.SMTPException as e:
        error_msg = f"SMTP error sending email: {str(e)}"
    except socket.timeout:
        error_msg = "SMTP connection timed out"
    except socket.gaierror:
        error_msg = "SMTP server address could not be resolved"
    except Exception as e:
        error_msg = f"Unexpected error sending email: {str(e)}"
    
    app.logger.error(error_msg, exc_info=True)
    return False

# Initialize MongoDB settings
# Enforce MongoDB usage - don't allow JSON fallback
MONGO_AVAILABLE = False
# Determine whether to use MongoDB or fall back to JSON storage.
# USE_MONGO can now be explicitly controlled via the USE_MONGO environment variable.
USE_MONGO_ENV = os.getenv('USE_MONGO')
if USE_MONGO_ENV is not None:
    USE_MONGO = USE_MONGO_ENV.lower() in ['1', 'true', 'yes']
else:
    # Default to True only if a MongoDB URI is present
    USE_MONGO = bool(os.getenv('MONGODB_URI') or os.getenv('MONGO_URI'))

# JSON_FALLBACK can be enabled with JSON_FALLBACK=true to allow a graceful
# fallback to flat-file JSON storage when the Mongo connection fails.
JSON_FALLBACK = os.getenv('JSON_FALLBACK', 'False').lower() in ['1', 'true', 'yes']

# Get MongoDB URI from environment variables
MONGODB_URI = os.getenv('MONGODB_URI') or os.getenv('MONGO_URI')
DB_NAME = os.getenv('DB_NAME', 'moneda_db')

# Initialize MongoDB client and collections
mongo_client = None
mongo_db = None
users_col = None

# Import MongoDB client and errors
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError

# Import mongo_users after initializing MongoDB connection
from mongo_users import init_mongo_connection, users_col as mongo_users_col

if not MONGODB_URI:
    try:
        from dotenv import load_dotenv
        load_dotenv()  # Load from .env file if it exists
        MONGODB_URI = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URI')
    except ImportError:
        pass  # python-dotenv not installed, continue without it

if not MONGODB_URI:
    error_msg = "❌ MongoDB connection string is required. Please set either MONGODB_URI or MONGO_URI environment variable"
    print(error_msg)
    raise ValueError(error_msg)
else:
    # Clean up the URI (remove any quotes or whitespace)
    MONGODB_URI = MONGODB_URI.strip('"\'').strip()
    
    print(f"✅ Found MongoDB URI in environment")
    # Mask password in the URI for security
    if '@' in MONGODB_URI:
        protocol_part = MONGODB_URI.split('@')[0]
        masked_uri = protocol_part.split('//')[0] + '//' + '****:****@' + MONGODB_URI.split('@', 1)[1]
        print(f"MongoDB URI: {masked_uri}")
    else:
        print(f"MongoDB URI: {MONGODB_URI}")

# Extract DB_NAME from MONGODB_URI if available, otherwise use default
DB_NAME = os.environ.get('DB_NAME', 'moneda_db')  # Default value

if MONGODB_URI:
    try:
        # Try to extract database name from connection string
        if 'mongodb+srv://' in MONGODB_URI:
            db_part = MONGODB_URI.split('mongodb+srv://')[1].split('?')[0]
        elif 'mongodb://' in MONGODB_URI:
            db_part = MONGODB_URI.split('mongodb://')[1].split('?')[0]
        else:
            db_part = ''
            
        if '/' in db_part:
            DB_NAME = db_part.split('/')[1].split('?')[0] or DB_NAME
    except Exception as e:
        print(f"⚠️ Could not extract DB name from URI: {e}")

print(f"Using database: {DB_NAME}")
print("==============================\n")

# Helper to ensure mongo_users users_col is initialized per process
def ensure_mongo_users_initialized():
    """Ensure `mongo_users.users_col` is ready in the current process."""
    global users_col, mongo_users_col

    if not (USE_MONGO and MONGO_AVAILABLE):
        return False

    if users_col is not None:
        return True

    if mongo_client is None or mongo_db is None:
        app.logger.error("MongoDB client or database not initialized")
        return False

    try:
        users_col = init_mongo_connection(mongo_client, mongo_db)
        mongo_users_col = users_col
        app.users_col = users_col
        app.logger.info("[DEBUG] Reinitialized mongo_users collection reference")
        return True
    except Exception as err:
        app.logger.error(f"Failed to initialize mongo_users collection: {err}")
        return False

# Expose helper on app for other modules
app.ensure_mongo_users_initialized = ensure_mongo_users_initialized


def initialize_mongodb():
    """Initialize MongoDB connection and set up collections with authentication"""
    global mongo_client, mongo_db, mongo_users_col, MONGO_AVAILABLE
    
    if not (USE_MONGO and MONGODB_URI):
        print("⚠️ MongoDB URI not provided or USE_MONGO is False. Using JSON fallback.")
        return False
    
    try:
        print("\n=== MongoDB Connection ===")
        # Mask the password in the logs
        masked_uri = MONGODB_URI
        if '@' in MONGODB_URI:
            parts = MONGODB_URI.split('@')
            masked_uri = f"mongodb+srv://****:****@{parts[1]}"
        print(f"MongoDB URI: {masked_uri}")
        print(f"Database: {DB_NAME}")
        
        # Connection parameters
        mongo_params = {
            'connectTimeoutMS': 10000,
            'socketTimeoutMS': 30000,  # Increased timeout for initial connection
            'maxPoolSize': 100,
            'minPoolSize': 1,
            'retryWrites': True,
            'w': 'majority',
            'serverSelectionTimeoutMS': 10000  # Increased timeout for server selection
        }
        
        # Clean the MongoDB URI
        parsed_uri = urlparse(MONGODB_URI)
        query = parse_qs(parsed_uri.query)
        
        # Remove any conflicting TLS parameters
        for param in ['tlsInsecure', 'tlsAllowInvalidCertificates']:
            if param in query:
                del query[param]
        
        # Rebuild the URI with cleaned query parameters
        clean_uri = urlunparse(parsed_uri._replace(query=urlencode(query, doseq=True)))
        
        print(f"Connecting to MongoDB with URI: {clean_uri.split('@')[-1] if '@' in clean_uri else clean_uri}")
        
        # Initialize MongoDB client
        mongo_client = MongoClient(clean_uri, **mongo_params)
        
        # Test the connection with authentication
        try:
            # This will force authentication
            mongo_client.admin.command('ping')
            print("✅ MongoDB server ping successful")
            
            # Get the database
            mongo_db = mongo_client[DB_NAME]
            
            # Initialize collections
            mongo_users_col = mongo_db.users
            
            # Try to access the collection with authentication
            try:
                # This will fail if not authenticated
                user_count = mongo_users_col.count_documents({})
                print(f"✅ Successfully connected to users collection ({user_count} users found)")
                
                # Create indexes if they don't exist
                mongo_users_col.create_index("email", unique=True)
                mongo_users_col.create_index("username", unique=True)
                
                MONGO_AVAILABLE = True
                print("✅ MongoDB initialization complete")
                return True
                
            except Exception as auth_error:
                print(f"❌ Authentication failed for database '{DB_NAME}': {str(auth_error)}")
                print("Please check if the database user has proper permissions.")
                raise
                
        except Exception as conn_error:
            print(f"❌ Failed to connect to MongoDB: {str(conn_error)}")
            print("Please check your MongoDB connection string and network settings.")
            raise
            
    except Exception as e:
        print(f"❌ Error initializing MongoDB: {str(e)}")
        print(traceback.format_exc())
        MONGO_AVAILABLE = False
        if not JSON_FALLBACK:
            raise RuntimeError("MongoDB connection failed and JSON fallback is disabled") from e

# Initialize MongoDB-related variables at module level
MONGO_AVAILABLE = False
mongo_client = None
mongo_db = None
mongo_users_col = None

# Initialize MongoDB connection
if USE_MONGO and MONGODB_URI:
    print("\n=== Initializing MongoDB Connection ===")
    try:
        if initialize_mongodb() and mongo_db is not None:
            print("✅ MongoDB initialized successfully")
            try:
                # Ensure mongo_users module has an initialized collection reference
                users_col = init_mongo_connection(mongo_client, mongo_db)
                mongo_users_col = users_col
                app.users_col = users_col
                print("✅ mongo_users collection initialized")
            except Exception as init_err:
                print(f"❌ Error initializing mongo_users collection: {init_err}")
                if not JSON_FALLBACK:
                    raise
        else:
            print("⚠️ MongoDB initialization failed")
    except Exception as e:
        print(f"❌ Error during MongoDB initialization: {str(e)}")
        if not JSON_FALLBACK:
            raise
        # Initialize mongo_users with the MongoDB connection
        try:
            mongo_users_col = init_mongo_connection(mongo_client, mongo_db)
            print("✅ Successfully initialized mongo_users with MongoDB connection")
        except Exception as e:
            print(f"❌ Error initializing mongo_users: {str(e)}")
            print(traceback.format_exc())
            if not JSON_FALLBACK:
                raise

# Initialize Flask-PyMongo
mongo = PyMongo()

# Add the api directory to the Python path
api_dir = str(Path(__file__).parent / 'api')
if api_dir not in sys.path:
    sys.path.append(api_dir)

# Final check and cleanup
if not MONGO_AVAILABLE:
    print("\n=== Using JSON Storage ===")
    print("MongoDB is not available, using JSON file storage")
    print("Data will be stored in the 'data' directory")
    print("==============================\n")
    
    # Clean up any MongoDB connections
    if 'mongo_client' in globals() and mongo_client is not None:
        try:
            mongo_client.close()
        except Exception as e:
            print(f"Error closing MongoDB connection: {e}")
        mongo_client = None
        mongo_db = None
        mongo_users_col = None
    
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Initialize users dictionary for JSON fallback
    users = {}
else:
    # Initialize users dictionary from MongoDB
    users = {}
    try:
        if mongo_users_col is not None:
            for user_doc in mongo_users_col.find():
                users[str(user_doc['_id'])] = user_doc
    except Exception as e:
        print(f"Error loading users from MongoDB: {e}")
        users = {}

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
    def __init__(self, id, email, username, password_hash, is_verified=False, otp_verified=False, cart=None, 
                 reset_token=None, reset_token_expiry=None, company_id=None, role='user', customers=None,
                 assigned_companies=None):
        self.id = id
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.otp_verified = otp_verified
        self.cart = cart if cart is not None else []
        self.reset_token = reset_token
        self.reset_token_expiry = reset_token_expiry
        self.company_id = company_id
        # Store role in lowercase for consistency
        self.role = role.lower() if role else 'user'
        # List of customer IDs directly assigned to this user
        self.customers = customers or []
        # List of company IDs - users will have access to all customers from these companies
        self.assigned_companies = assigned_companies or []
        
    def is_admin(self):
        return self.role == 'admin'
        
    def can_access_customer(self, customer_id):
        """Check if user can access a specific customer
        
        Returns True if:
        1. User is admin
        2. Customer is directly assigned to user
        3. Customer belongs to a company assigned to the user
        """
        if self.is_admin():
            return True
            
        # Check direct customer assignment
        if str(customer_id) in self.customers:
            return True
            
        # Check company-based access
        if hasattr(self, 'assigned_companies') and self.assigned_companies:
            # Get MongoDB instance
            from flask import current_app
            from bson import ObjectId
            
            try:
                # Get the customer's company ID
                customer = current_app.mongo_db.customers.find_one(
                    {'_id': ObjectId(customer_id)},
                    {'company_id': 1}
                )
                
                if customer and 'company_id' in customer:
                    # Check if the customer's company is in the user's assigned companies
                    return str(customer['company_id']) in self.assigned_companies
                    
            except Exception as e:
                current_app.logger.error(f"Error checking company-based access: {str(e)}")
                
        return False
        
    def get_accessible_customers(self):
        """Get all customer IDs that this user has access to
        
        Returns:
            list: List of customer IDs that the user can access
        """
        from flask import current_app
        from bson import ObjectId
        
        try:
            # If admin, return all customers
            if self.is_admin():
                return [str(c['_id']) for c in current_app.mongo_db.customers.find({}, {'_id': 1})]
                
            accessible_customers = set()
            
            # Add directly assigned customers
            accessible_customers.update(self.customers)
            
            # Add customers from assigned companies
            if hasattr(self, 'assigned_companies') and self.assigned_companies:
                # Convert company IDs to ObjectId for query
                company_ids = [ObjectId(cid) for cid in self.assigned_companies if cid]
                
                if company_ids:
                    # Find all customers from assigned companies
                    company_customers = current_app.mongo_db.customers.find(
                        {'company_id': {'$in': company_ids}},
                        {'_id': 1}
                    )
                    
                    # Add customer IDs to the set
                    for customer in company_customers:
                        accessible_customers.add(str(customer['_id']))
            
            return list(accessible_customers)
            
        except Exception as e:
            current_app.logger.error(f"Error getting accessible customers: {str(e)}")
            return []

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'is_verified': self.is_verified,
            'otp_verified': self.otp_verified,
            'reset_token': self.reset_token,
            'reset_token_expiry': self.reset_token_expiry.isoformat() if self.reset_token_expiry else None,
            'company_id': self.company_id,
            'role': self.role,
            'customers': self.customers,
            'assigned_companies': self.assigned_companies
        }

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_auth_token(self, expires_in=JWT_EXPIRATION):
        return jwt.encode(
            {'user_id': self.id, 'exp': datetime.utcnow() + timedelta(seconds=expires_in)},
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
# Customer Management
# ---------------------------------------------------------------------------

def get_all_customers():
    """Get all customers from the database or JSON fallback."""
    # First try to get from MongoDB if available
    if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
        try:
            # Check if customers collection exists
            collections = mongo_db.list_collection_names()
            if 'customers' not in collections:
                print("[INFO] 'customers' collection does not exist in MongoDB, using JSON fallback")
                return _get_customers_from_json()
                
            # Get customers from MongoDB
            customers = list(mongo_db.customers.find(
                {},
                {'_id': 1, 'name': 1, 'email': 1, 'assigned_to': 1, 'created_by': 1, 'created_at': 1}
            ))
            
            # Convert ObjectId to string
            for customer in customers:
                customer['id'] = str(customer.pop('_id'))
                
            return customers
            
        except Exception as e:
            print(f"[WARNING] Error fetching customers from MongoDB, falling back to JSON: {str(e)}")
            return _get_customers_from_json()
    else:
        # Use JSON fallback
        return _get_customers_from_json()

def _get_customers_from_json():
    """Get customers from JSON file."""
    json_path = os.path.join('static', 'data', 'customers.json')
    try:
        if not os.path.exists(json_path):
            print(f"[INFO] Customers JSON file not found at {json_path}, creating empty list")
            # Create empty customers file if it doesn't exist
            os.makedirs(os.path.dirname(json_path), exist_ok=True)
            with open(json_path, 'w') as f:
                json.dump([], f)
            return []
            
        with open(json_path, 'r') as f:
            customers = json.load(f)
            if not isinstance(customers, list):
                print("[WARNING] Customers JSON is not a list, initializing empty list")
                return []
            return customers
            
    except json.JSONDecodeError as e:
        print(f"[ERROR] Error parsing customers JSON: {str(e)}")
        return []
    except Exception as e:
        print(f"[ERROR] Error reading customers from JSON: {str(e)}")
        return []

def save_customer(customer_data, customer_id=None):
    """Save a customer to the database."""
    customer_data['updated_at'] = datetime.now().isoformat()
    
    if MONGO_AVAILABLE and USE_MONGO:
        try:
            from bson import ObjectId
            if customer_id:
                # Update existing customer
                result = mongo_db.customers.update_one(
                    {'_id': ObjectId(customer_id)},
                    {'$set': customer_data},
                    upsert=False
                )
                return result.modified_count > 0
            else:
                # Create new customer
                customer_data['created_at'] = customer_data['updated_at']
                result = mongo_db.customers.insert_one(customer_data)
                return str(result.inserted_id)
        except Exception as e:
            app.logger.error(f"Error saving customer to MongoDB: {str(e)}")
            return False
    else:
        # Fallback to JSON storage
        try:
            customers = get_all_customers()
            if customer_id:
                # Update existing customer
                for i, cust in enumerate(customers):
                    if str(cust.get('id')) == str(customer_id):
                        customer_data['id'] = customer_id
                        customers[i] = customer_data
                        break
            else:
                # Create new customer
                customer_data['id'] = str(uuid.uuid4())
                customer_data['created_at'] = customer_data['updated_at']
                customers.append(customer_data)
            
            with open(os.path.join('static', 'data', 'customers.json'), 'w') as f:
                json.dump(customers, f, indent=2)
            
            return customer_data['id']
        except Exception as e:
            app.logger.error(f"Error saving customer to JSON: {str(e)}")
            return False

# Customer Management Endpoints
@app.route('/api/customers', methods=['GET', 'POST'])
@login_required
def manage_customers():
    """Get all customers or create a new one."""
    if request.method == 'GET':
        customers = get_all_customers()
        return jsonify({'success': True, 'customers': customers})
    
    # Handle POST - Create new customer
    try:
        data = request.get_json()
        required_fields = ['name', 'email']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        # Prepare customer data
        customer_data = {
            'name': data['name'].strip(),
            'email': data['email'].lower().strip(),
            'phone': data.get('phone', '').strip(),
            'address': data.get('address', '').strip(),
            'created_by': current_user.id,
            'assigned_to': []
        }
        
        # If admin is assigning to a specific user
        if current_user.is_admin() and 'assigned_to' in data and data['assigned_to']:
            customer_data['assigned_to'] = [data['assigned_to']]
        else:
            # Auto-assign to current user if not admin
            customer_data['assigned_to'] = [current_user.id]
        
        # Save customer
        customer_id = save_customer(customer_data)
        if not customer_id:
            return jsonify({'success': False, 'error': 'Failed to save customer'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Customer created successfully',
            'customer_id': customer_id
        }), 201
        
    except Exception as e:
        app.logger.error(f"Error creating customer: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create customer'}), 500

@app.route('/api/customers/<customer_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def manage_customer(customer_id):
    """Get, update, or delete a specific customer."""
    if request.method == 'GET':
        customers = get_all_customers()
        customer = next((c for c in customers if str(c.get('id')) == str(customer_id)), None)
        if not customer:
            return jsonify({'success': False, 'error': 'Customer not found'}), 404
        return jsonify({'success': True, 'customer': customer})
    
    elif request.method == 'PUT':
        try:
            data = request.get_json()
            customer_data = {
                'name': data.get('name', '').strip(),
                'email': data.get('email', '').lower().strip(),
                'phone': data.get('phone', '').strip(),
                'address': data.get('address', '').strip()
            }
            
            # Only allow updating assignments if admin
            if current_user.is_admin() and 'assigned_to' in data:
                customer_data['assigned_to'] = data['assigned_to'] if isinstance(data['assigned_to'], list) else [data['assigned_to']]
            
            success = save_customer(customer_data, customer_id)
            if not success:
                return jsonify({'success': False, 'error': 'Failed to update customer'}), 500
                
            return jsonify({'success': True, 'message': 'Customer updated successfully'})
            
        except Exception as e:
            app.logger.error(f"Error updating customer: {str(e)}")
            return jsonify({'success': False, 'error': 'Failed to update customer'}), 500
    
    elif request.method == 'DELETE':
        if MONGO_AVAILABLE and USE_MONGO:
            try:
                from bson import ObjectId
                result = mongo_db.customers.delete_one({'_id': ObjectId(customer_id)})
                if result.deleted_count == 0:
                    return jsonify({'success': False, 'error': 'Customer not found'}), 404
            except Exception as e:
                app.logger.error(f"Error deleting customer from MongoDB: {str(e)}")
                return jsonify({'success': False, 'error': 'Failed to delete customer'}), 500
        else:
            try:
                customers = get_all_customers()
                initial_count = len(customers)
                customers = [c for c in customers if str(c.get('id')) != str(customer_id)]
                
                if len(customers) == initial_count:
                    return jsonify({'success': False, 'error': 'Customer not found'}), 404
                
                with open(os.path.join('static', 'data', 'customers.json'), 'w') as f:
                    json.dump(customers, f, indent=2)
            except Exception as e:
                app.logger.error(f"Error deleting customer from JSON: {str(e)}")
                return jsonify({'success': False, 'error': 'Failed to delete customer'}), 500
        
        return jsonify({'success': True, 'message': 'Customer deleted successfully'})

# ---------------------------------------------------------------------------
# Customer Assignment Helpers
# ---------------------------------------------------------------------------

def assign_customer_to_user(user_id, customer_id):
    """Assign a customer to a user."""
    customer_id = str(customer_id)
    if MONGO_AVAILABLE and USE_MONGO:
        if not ensure_mongo_users_initialized():
            app.logger.error("[assign_customer_to_user] users_col not initialized")
            return False
        try:
            from bson import ObjectId
            result = users_col.update_one(
                {'_id': ObjectId(user_id)},
                {'$addToSet': {'customers': customer_id}},
                upsert=False
            )
            return result.modified_count > 0
        except Exception as e:
            app.logger.error(f"Error assigning customer to user: {str(e)}")
            return False
    else:
        users = {}
        updated = False
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
        
        for user in users:
            if str(user['id']) == str(user_id):
                if 'customers' not in user:
                    user['customers'] = []
                if customer_id not in user['customers']:
                    user['customers'].append(customer_id)
                    updated = True
        
        if updated:
            with open(USERS_FILE, 'w') as f:
                json.dump(users, f, indent=2)
        return updated

def remove_customer_from_user(user_id, customer_id):
    """Remove a customer assignment from a user."""
    customer_id = str(customer_id)
    if MONGO_AVAILABLE and USE_MONGO:
        if not ensure_mongo_users_initialized():
            app.logger.error("[remove_customer_from_user] users_col not initialized")
            return False
        try:
            from bson import ObjectId
            result = users_col.update_one(
                {'_id': ObjectId(user_id)},
                {'$pull': {'customers': customer_id}}
            )
            return result.modified_count > 0
        except Exception as e:
            app.logger.error(f"Error removing customer from user: {str(e)}")
            return False
    else:
        users = []
        updated = False
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
        
        for user in users:
            if str(user['id']) == str(user_id):
                if 'customers' in user and customer_id in user.get('customers', []):
                    user['customers'].remove(customer_id)
                    updated = True
        
        if updated:
            with open(USERS_FILE, 'w') as f:
                json.dump(users, f, indent=2)
        return updated

def get_users_for_customer(customer_id):
    """Get all users who have access to a specific customer."""
    customer_id = str(customer_id)
    user_ids = []
    
    if MONGO_AVAILABLE and USE_MONGO:
        if not ensure_mongo_users_initialized():
            app.logger.error("[get_users_for_customer] users_col not initialized")
            return []
        try:
            users = users_col.find({'customers': customer_id}, {'_id': 1})
            user_ids = [str(user['_id']) for user in users]
        except Exception as e:
            app.logger.error(f"Error getting users for customer: {str(e)}")
    else:
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
            user_ids = [
                str(user['id']) 
                for user in users 
                if 'customers' in user and customer_id in user['customers']
            ]
    
    return user_ids

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
                    otp_verified=user_data.get('otp_verified', False),
                    cart=user_data.get('cart', []),
                    reset_token=user_data.get('reset_token'),
                    reset_token_expiry=datetime.fromisoformat(user_data.get('reset_token_expiry')) if user_data.get('reset_token_expiry') else None,
                    company_id=user_data.get('company_id')
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
            return {}  # Return empty dict after creating new file
        except Exception as e:
            print(f"Error creating users file: {e}")
        return {}

# ... (rest of the code remains the same)

@login_manager.user_loader
def load_user(user_id):
    """Load user by ID from either MongoDB or JSON."""
    if not user_id:
        return None
        
    if USE_MONGO and MONGO_AVAILABLE:
        try:
            # First try to use the users_col from app context
            if hasattr(app, 'users_col') and app.users_col is not None:
                from bson import ObjectId
                try:
                    user_data = app.users_col.find_one({"$or": [
                        {"_id": ObjectId(user_id)},
                        {"_id": user_id}
                    ]})
                    
                    if user_data:
                        # Convert MongoDB document to User object
                        return User(
                            id=str(user_data['_id']),
                            email=user_data.get('email'),
                            username=user_data.get('username'),
                            password_hash=user_data.get('password_hash'),
                            is_verified=user_data.get('is_verified', False),
                            otp_verified=user_data.get('otp_verified', False),
                            company_id=user_data.get('company_id'),
                            role=user_data.get('role', 'user'),
                            customers=user_data.get('customers', [])
                        )
                except Exception as e:
                    print(f"Error loading user {user_id} from MongoDB: {str(e)}")
            
            # Fall back to mongo_users module if direct collection access fails
            try:
                from mongo_users import find_user_by_id
                user_data = find_user_by_id(user_id)
                
                if user_data:
                    # Convert MongoDB document to User object
                    return User(
                        id=str(user_data['_id']),
                        email=user_data.get('email'),
                        username=user_data.get('username'),
                        password_hash=user_data.get('password_hash'),
                        is_verified=user_data.get('is_verified', False),
                        otp_verified=user_data.get('otp_verified', False),
                        company_id=user_data.get('company_id'),
                        role=user_data.get('role', 'user'),
                        customers=user_data.get('customers', [])
                    )
            except Exception as e:
                print(f"Error loading user {user_id} via mongo_users: {str(e)}")
                
        except Exception as e:
            print(f"Unexpected error in load_user: {str(e)}")
    
    # Fall back to JSON loading if MongoDB is not available or user not found
    if not hasattr(app, 'users'):
        app.users = _load_users_json()
    
    user_data = app.users.get(user_id)
    if user_data:
        return User(
            id=user_id,
            email=user_data.get('email'),
            username=user_data.get('username'),
            password_hash=user_data.get('password_hash'),
            is_verified=user_data.get('is_verified', False),
            otp_verified=user_data.get('otp_verified', False),
            company_id=user_data.get('company_id'),
            role=user_data.get('role', 'user'),
            customers=user_data.get('customers', [])
        )
    return None

def save_users(users_dict=None):
    """Legacy wrapper around _save_users_json."""
    return _save_users_json(users_dict)

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
if USE_MONGO and MONGO_AVAILABLE and mongo_users_col is not None:
    def load_users():
        users_local = {}
        try:
            print("Loading users from MongoDB...")
            for doc in mongo_users_col.find():
                # Convert ObjectId to string for the user ID
                user_id = str(doc['_id'])
                users_local[user_id] = User(
                    id=user_id,
                    email=doc.get('email'),
                    username=doc.get('username'),
                    password_hash=doc.get('password_hash'),
                    is_verified=doc.get('is_verified', False),
                    otp_verified=doc.get('otp_verified', False),
                    role=doc.get('role', 'user'),
                    company_id=doc.get('company_id'),
                    customers=doc.get('customers', []),
                    assigned_companies=doc.get('assigned_companies', [])
                )
            print(f"Successfully loaded {len(users_local)} users from MongoDB")
            return users_local
        except Exception as e:
            print(f"Error loading users from MongoDB: {e}")
            print(traceback.format_exc())
            if not JSON_FALLBACK:
                raise
            # Fall back to JSON if available
            return _load_users_json()
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

    users = load_users() # Initialize users from MongoDB
else:
    # Fallback to JSON versions defined above
    load_users = _load_users_json
    save_users = _save_users_json
    users = load_users() # Initialize users from JSON

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

# Initialize Flask app with logging
import logging
import sys
from logging.handlers import RotatingFileHandler

# Configure root logger
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler('app.log', maxBytes=10000, backupCount=1)
    ]
)

# Suppress Flask debug pin console output
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# Create Flask app instance
app = Flask(__name__)

# Configure secret key and session settings
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)  # Session expires after 12 hours
app.config['SESSION_COOKIE_SECURE'] = os.getenv('FLASK_ENV') == 'production'  # Only send cookie over HTTPS in production
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Helps with CSRF protection

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'  # Route name for the login page
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Add regex_search filter to Jinja2 environment
@app.template_filter('regex_search')
def regex_search_filter(s, pattern):
    """Check if the pattern matches the string."""
    if not s or not pattern:
        return False
    return bool(re.search(pattern, str(s)))

app.logger.info("Flask app initialized")

@app.route('/api/health')
def health_check():
    """Health check endpoint to verify MongoDB connection."""
    try:
        if MONGO_AVAILABLE and mongo_db is not None:
            # Test the connection by pinging the database
            mongo_client.server_info()
            return jsonify({
                'status': 'success',
                'message': 'MongoDB connection is healthy',
                'database': DB_NAME,
                'mongo_available': MONGO_AVAILABLE
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'MongoDB is not available',
                'database': DB_NAME,
                'mongo_available': MONGO_AVAILABLE,
                'use_mongo': USE_MONGO
            }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'MongoDB connection failed: {str(e)}',
            'database': DB_NAME,
            'mongo_available': MONGO_AVAILABLE,
            'use_mongo': USE_MONGO
        }), 500

# Register blueprints
app.register_blueprint(customers_bp)

# Compatibility routes for legacy frontend calls (expects /api/customers)
@app.route('/api/customers', methods=['GET', 'POST'])
@login_required
def legacy_customers_collection():
    """Proxy to `/api/v1/customers` for backwards compatibility."""
    if request.method == 'GET':
        return current_app.view_functions['customers.get_customers']()
    return current_app.view_functions['customers.create_customer']()


@app.route('/api/customers/<customer_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def legacy_customers_item(customer_id):
    """Proxy to `/api/v1/customers/<id>` for backwards compatibility."""
    if request.method == 'GET':
        return current_app.view_functions['customers.get_customer'](customer_id)
    if request.method == 'PUT':
        return current_app.view_functions['customers.update_customer'](customer_id)
    return current_app.view_functions['customers.delete_customer'](customer_id)
app.register_blueprint(companies_bp)

@app.route('/api/test-mongodb')
def test_mongodb():
    """Test MongoDB connection and authentication."""
    try:
        if not MONGO_AVAILABLE or not USE_MONGO or mongo_db is None:
            return jsonify({
                'status': 'error',
                'message': 'MongoDB not available',
                'MONGO_AVAILABLE': MONGO_AVAILABLE,
                'USE_MONGO': USE_MONGO,
                'mongo_db_is_none': mongo_db is None,
                'environment': {
                    'MONGODB_URI_set': bool(MONGODB_URI),
                    'DB_NAME': DB_NAME
                }
            }), 500
            
        # Test the connection with authentication
        mongo_client.admin.command('ping')
        
        # Try to access the database
        db = mongo_client[DB_NAME]
        user_count = db.users.count_documents({}) if 'users' in db.list_collection_names() else 0
        
        return jsonify({
            'status': 'success',
            'message': 'MongoDB connection successful',
            'database': DB_NAME,
            'collections': db.list_collection_names(),
            'user_count': user_count,
            'mongo_available': MONGO_AVAILABLE,
            'use_mongo': USE_MONGO
        })
        
    except Exception as e:
        error_type = type(e).__name__
        error_details = str(e)
        
        # Add more specific error details for common MongoDB errors
        if 'Authentication failed' in str(e):
            error_details = "Authentication failed. Please check your MongoDB username and password."
        elif 'bad auth : authentication failed' in str(e):
            error_details = "Authentication failed. The provided credentials are incorrect or the user doesn't have access to the database."
        elif 'No servers found yet' in str(e):
            error_details = "Could not connect to MongoDB server. Please check your connection string and network settings."
            
        return jsonify({
            'status': 'error',
            'message': f'MongoDB connection failed: {error_details}',
            'error_type': error_type,
            'database': DB_NAME,
            'mongo_available': MONGO_AVAILABLE,
            'use_mongo': USE_MONGO,
            'environment': {
                'MONGODB_URI_set': bool(MONGODB_URI),
                'DB_NAME': DB_NAME
            },
            'connection_details': {
                'authSource': 'admin',
                'authMechanism': 'SCRAM-SHA-256',
                'using_srv': 'mongodb+srv://' in (MONGODB_URI or '')
            }
        }), 500

@app.route('/api/debug/mongodb')
def debug_mongodb():
    """Debug endpoint to check MongoDB connection and collections."""
    try:
        if not MONGO_AVAILABLE or not USE_MONGO or mongo_db is None:
            return jsonify({
                'status': 'error',
                'message': 'MongoDB not available',
                'MONGO_AVAILABLE': MONGO_AVAILABLE,
                'USE_MONGO': USE_MONGO,
                'mongo_db_is_none': mongo_db is None
            })
            
        # Test the connection
        mongo_db.command('ping')
        
        # List all collections
        collections = mongo_db.list_collection_names()
        
        # Count documents in customers collection if it exists
        customer_count = 0
        if 'customers' in collections:
            customer_count = mongo_db.customers.count_documents({})
        
        return jsonify({
            'status': 'success',
            'collections': collections,
            'customer_count': customer_count,
            'database': mongo_db.name,
            'server_info': mongo_db.command('serverStatus')
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e),
            'type': type(e).__name__
        }), 500

# Initialize cart store
# -------------------- Cart storage abstractions --------------------
class MongoCartStore:
    """MongoDB-backed cart store with one cart document per user."""

    def __init__(self, db):
        self.col = db.get_collection('carts')
        app.logger.info("[DEBUG] Initialized MongoCartStore with collection: %s", self.col.name)

    def _doc(self, user_id):
        doc = self.col.find_one({"user_id": user_id})
        app.logger.debug(
            "[DEBUG] _doc(user_id=%s) - %s",
            user_id,
            f"Found document with {len(doc.get('products', []))} products" if doc else "No document found"
        )
        return doc or {}

    def get_cart(self, user_id):
        app.logger.debug("[DEBUG] get_cart(user_id=%s)", user_id)
        doc = self._doc(user_id)
        products = doc.get('products', [])
        app.logger.debug(
            "[DEBUG] Retrieved cart for user %s with %d products",
            user_id,
            len(products)
        )
        if products:
            app.logger.debug("[DEBUG] Sample product data: %s", str(products[0])[:200])
        return products

    def save_cart(self, user_id, products):
        app.logger.debug(
            "[DEBUG] save_cart(user_id=%s) - Saving %d products",
            user_id,
            len(products)
        )
        if products:
            app.logger.debug("[DEBUG] Sample product being saved: %s", str(products[0])[:200])
            
        result = self.col.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "products": products,
                    "updated_at": datetime.utcnow(),
                    "user_id": user_id  # Ensure user_id is set
                }
            },
            upsert=True
        )
        app.logger.debug(
            "[DEBUG] Cart save result - Matched: %d, Modified: %d, Upserted ID: %s",
            result.matched_count,
            result.modified_count,
            getattr(result, 'upserted_id', 'N/A')
        )
        return True

    def clear_cart(self, user_id):
        app.logger.info("[DEBUG] Clearing cart for user: %s", user_id)
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
    """Return a dict with a products list for the current user using MongoDB."""
    try:
        app.logger.info(f"[DEBUG] get_user_cart() called for user: {getattr(current_user, 'id', 'no-user')}")
        
        if not hasattr(current_user, 'id'):
            app.logger.warning("[DEBUG] No current_user.id, returning empty cart")
            return {"products": []}
            
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            app.logger.info("[DEBUG] Using MongoDB for cart storage")
            app.logger.info(f"[DEBUG] MongoDB status - MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}, mongo_db: {'available' if mongo_db is not None else 'None'}")
            
            try:
                products = cart_store.get_cart(current_user.id)
                app.logger.info(f"[DEBUG] Retrieved {len(products) if products else 0} products from MongoDB")
                if products:
                    app.logger.debug(f"[DEBUG] Sample product from MongoDB: {str(products[0])[:200]}...")
            except Exception as e:
                app.logger.error(f"[DEBUG] Error fetching cart from MongoDB: {str(e)}")
                products = []
            # Ensure all products have the correct structure
            for product in products:
                if 'calculations' not in product:
                    # If calculations are missing, recalculate them
                    if product.get('type') == 'blanket':
                        base_price = float(product.get('base_price', 0))
                        bar_price = float(product.get('bar_price', 0))
                        quantity = int(product.get('quantity', 1))
                        discount_percent = float(product.get('discount_percent', 0))
                        gst_percent = float(product.get('gst_percent', 18))
                        
                        price_per_unit = base_price + bar_price
                        subtotal = price_per_unit * quantity
                        discount_amount = subtotal * (discount_percent / 100)
                        discounted_subtotal = subtotal - discount_amount
                        gst_amount = (discounted_subtotal * gst_percent) / 100
                        final_total = discounted_subtotal + gst_amount
                        
                        product['calculations'] = {
                            'price_per_unit': round(price_per_unit, 2),
                            'subtotal': round(subtotal, 2),
                            'discount_amount': round(discount_amount, 2),
                            'discounted_subtotal': round(discounted_subtotal, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_total': round(final_total, 2)
                        }
                    elif product.get('type') == 'mpack':
                        price = float(product.get('unit_price', 0))
                        quantity = int(product.get('quantity', 1))
                        discount_percent = float(product.get('discount_percent', 0))
                        gst_percent = float(product.get('gst_percent', 12))
                        
                        discount_amount = (price * discount_percent / 100)
                        price_after_discount = price - discount_amount
                        gst_amount = (price_after_discount * gst_percent / 100)
                        final_unit_price = price_after_discount + gst_amount
                        final_total = final_unit_price * quantity
                        
                        product['calculations'] = {
                            'unit_price': round(price, 2),
                            'discount_amount': round(discount_amount, 2),
                            'price_after_discount': round(price_after_discount, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_unit_price': round(final_unit_price, 2),
                            'final_total': round(final_total, 2)
                        }
            
            return {"products": products or []}
            
        # If we get here, MongoDB is not available
        app.logger.warning("[DEBUG] MongoDB is not available for cart storage")
        app.logger.warning(f"[DEBUG] MONGO_AVAILABLE: {MONGO_AVAILABLE}, USE_MONGO: {USE_MONGO}, mongo_db: {'available' if 'mongo_db' in globals() and mongo_db is not None else 'None'}")
        return {"products": []}
        
    except Exception as e:
        print(f"Error in get_user_cart: {e}")
        import traceback
        traceback.print_exc()
        return {"products": []}

def save_user_cart(cart_dict):
    """Persist cart for current user using MongoDB."""
    try:
        if not hasattr(current_user, 'id'):
            print("Cannot save cart: No user ID available")
            return
            
        if not isinstance(cart_dict, dict) or 'products' not in cart_dict:
            print("Invalid cart format")
            return
            
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            cart_store.save_cart(current_user.id, cart_dict['products'])
        else:
            print("MongoDB is not available for cart storage")
            
    except Exception as e:
        print(f"Error in save_user_cart: {e}")
        import traceback
        traceback.print_exc()

# Initialize users dictionary (only for JSON fallback)
if USE_MONGO:
    users = {}
else:
    # Removed this line - it's causing the error
    # users = load_users()
    pass

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    if MONGO_AVAILABLE and USE_MONGO:
        if not ensure_mongo_users_initialized():
            app.logger.error("[AUTH] users_col not initialized; unable to load user")
            return None
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
                otp_verified=doc.get('otp_verified', False),
                company_id=doc.get('company_id'),
                role=doc.get('role', 'user')
            )
            print(f'Successfully loaded user: {user.email} (ID: {user.id})')
            return user
        except Exception as e:
            print(f"Error loading user {user_id}: {e}")
            return None
    else:
        print('MongoDB not available, falling back to JSON users')
        user_data = users.get(user_id) if hasattr(users, 'get') else None
        if user_data:
            return User(
                id=user_id,
                email=user_data['email'],
                username=user_data.get('username', user_data['email'].split('@')[0]),
                password_hash=user_data['password_hash'],
                is_verified=user_data.get('is_verified', False),
                otp_verified=user_data.get('otp_verified', False),
                cart=user_data.get('cart', []),
                reset_token=user_data.get('reset_token'),
                reset_token_expiry=user_data.get('reset_token_expiry'),
                company_id=user_data.get('company_id'),
                role=user_data.get('role', 'user')
            )
        return None

@app.route('/cart', endpoint='view_cart')
@login_required
@company_required
def cart():
    """Render the cart page with current cart contents and calculated totals.
    
    The Jinja template expects a cart object with products list and calculated totals.
    """
    try:
        # Get the current cart
        cart_data = get_user_cart()
        if not isinstance(cart_data, dict):
            cart_data = {"products": []}
        
        # Ensure products list exists
        cart_data.setdefault("products", [])
        
        # Calculate cart totals using the actual total field from each product
        total = 0
        if cart_data.get('products'):
            total = sum(
                float(p.get('calculations', {}).get('final_total', 0))
                for p in cart_data['products']
            )
            
            # If no calculations exist, fall back to total field
            if not total:
                total = sum(
                    float(p.get('total', 0))
                    for p in cart_data['products']
                )
            
            # Calculate discount amount if needed
            discount_amount = sum(
                float(p.get('calculations', {}).get('discount_amount', 0))
                for p in cart_data['products']
            )
            
            # Add calculated totals to the cart data
            cart_data['calculations'] = {
                'discount_amount': round(discount_amount, 2),
                'total': round(total, 2)
            }
        
        # Get company info with proper fallbacks
        selected_company = session.get('selected_company', {})
        
        # Get company name with fallbacks
        company_name = (
            selected_company.get('name') or 
            session.get('company_name') or 
            (hasattr(current_user, 'company_name') and current_user.company_name) or
            (current_user.company_id and get_company_name_by_id(current_user.company_id)) or 
            'Your Company'
        )
        
        # Get company email with fallbacks
        company_email = (
            selected_company.get('email') or 
            session.get('company_email') or
            (hasattr(current_user, 'company_email') and current_user.company_email) or
            (current_user.company_id and get_company_email_by_id(current_user.company_id)) or 
            ''
        )
        
        # Ensure session is updated with the latest values
        if company_name and company_name != 'Your Company':
            session['company_name'] = company_name
            session['company_email'] = company_email
            session['selected_company'] = {
                'name': company_name,
                'email': company_email
            }
            session.modified = True
            
        # Log the company info for debugging
        app.logger.info(f"Cart - Company: {company_name}, Email: {company_email}")
        return render_template('user/cart.html',
                           cart=cart_data,
                            products=cart_data.get('products', []),
                            company_name=company_name,
                            company_email=company_email,
                            # Calculate GST rates for each product
                            products_with_gst=[
                                {**p, 'gst_percent': 18.0 if p.get('type') == 'blanket' else 12.0}
                                for p in cart_data.get('products', [])
                            ],
                            calculations=cart_data.get('calculations', {
                                'subtotal': 0,
                                'gst_percent': 0,  # Will be calculated per product
                                'gst_amount': 0,
                                'total': 0
                            }))
        
    except Exception as e:
        error_msg = f"Error in cart route: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        app.logger.error(error_msg)
        # Create email content with quotation ID
        email_content = create_quotation_email_content(
            cart_data['products'], 
            company_name, 
            0,  # total_pre_gst
            0,  # gst_amount
            0,  # total_post_gst
            "",  # notes
            ""  # quotation_id
        )
        # Return empty cart with error message
        return render_template('user/cart.html', 
                           cart={"products": []}, 
                           error=str(e),
                           company_name='',
                           company_email='',
                           products_with_gst=[],
                           calculations={
                               'subtotal': 0,
                               'gst_percent': 0,
                               'gst_amount': 0,
                               'total': 0
                           })

@app.route('/clear_cart', methods=['POST'])
@login_required
def clear_cart():
    """Clear current user's cart"""
    try:
        if current_user.is_authenticated:
            # For logged-in users, clear the cart from the database
            if USE_MONGO and MONGO_AVAILABLE and mongo_db is not None:
                mongo_db.carts.update_one(
                    {'user_id': str(current_user.id)},
                    {'$set': {'products': []}},
                    upsert=True
                )
            else:
                # Fallback to session for non-MongoDB
                session['cart'] = {'products': []}
        else:
            # For non-logged-in users, clear the session cart
            session['cart'] = {'products': []}
        
        session.modified = True
        return jsonify({'success': True, 'message': 'Cart cleared successfully'})
    except Exception as e:
        print(f"Error clearing cart: {e}")
        return jsonify({'error': 'Failed to clear cart', 'message': str(e)})

@app.route('/add_to_cart', methods=['POST'])
@login_required
@company_required
def add_to_cart():
    try:
        # Get request data and validate
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400

        # Validate required fields for blanket
        required_fields = ['type', 'name', 'machine', 'length', 'width', 'unit', 'quantity', 'base_price', 'bar_price', 'gst_percent']
        if data.get('type') == 'blanket' and not all(data.get(field) is not None for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {required_fields}'
            }), 400

        # Calculate prices based on product type
        if data.get('type') == 'blanket':
            # Get all required fields with proper defaults
            base_price = float(data.get('base_price', 0))
            bar_price = float(data.get('bar_price', 0))
            quantity = int(data.get('quantity', 1))
            discount_percent = float(data.get('discount_percent', 0))
            gst_percent = float(data.get('gst_percent', 18))
            
            # Calculate prices
            unit_price = base_price + bar_price
            subtotal = unit_price * quantity
            discount_amount = subtotal * (discount_percent / 100)
            discounted_subtotal = subtotal - discount_amount
            gst_amount = (discounted_subtotal * gst_percent) / 100
            final_total = discounted_subtotal + gst_amount
            
            # Get dimensions and other details
            length = float(data.get('length', 0))
            width = float(data.get('width', 0))
            unit = data.get('unit', 'mm')
            
            # Convert area to square meters if needed
            area_sq_m = length * width
            if unit == 'mm':
                area_sq_m = (length / 1000) * (width / 1000)
            elif unit == 'in':
                area_sq_m = (length * 0.0254) * (width * 0.0254)
            
            # Create product with all details
            import uuid
            product = {
                'id': str(uuid.uuid4()),  # Add unique ID
                'type': 'blanket',
                'name': data.get('name', 'Custom Blanket'),
                'machine': data.get('machine', 'Unknown Machine'),
                'thickness': data.get('thickness', ''),
                'length': length,
                'width': width,
                'unit': unit,
                'bar_type': data.get('bar_type', 'None'),
                'bar_price': bar_price,
                'quantity': quantity,
                'base_price': base_price,
                'discount_percent': discount_percent,
                'gst_percent': gst_percent,
                'unit_price': round(unit_price, 2),
                'total_price': round(final_total, 2),
                'calculations': {
                    'areaSqM': round(area_sq_m, 4),
                    'ratePerSqMt': round(base_price / area_sq_m, 2) if area_sq_m > 0 else 0,
                    'basePrice': round(base_price, 2),
                    'pricePerUnit': round(unit_price, 2),
                    'subtotal': round(subtotal, 2),
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'discounted_subtotal': round(discounted_subtotal, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_price': round(final_total, 2)
                },
                'added_at': datetime.utcnow().isoformat()
            }
        else:
            # Handle other product types (mpack, etc.)
            import uuid
            product = {
                'id': str(uuid.uuid4()),  # Add unique ID
                'type': data.get('type'),
                'name': data.get('name'),
                'unit_price': float(data.get('unit_price', 0)),
                'quantity': int(data.get('quantity', 1)),
                'discount_percent': float(data.get('discount_percent', 0)),
                'gst_percent': float(data.get('gst_percent', 12)),  # 12% GST for MPack
                # Include MPack specific details
                'machine': data.get('machine', ''),
                'thickness': data.get('thickness', ''),
                'size': data.get('size', ''),
                'underpacking_type': data.get('underpacking_type', ''),  # Add underpacking type
                'added_at': datetime.utcnow().isoformat()  # Add timestamp for sorting
            }
            
            # Calculate prices for other product types if needed
            if product['type'] == 'mpack':
                price = product['unit_price']
                quantity = product['quantity']
                discount_percent = product['discount_percent']
                gst_percent = product['gst_percent']
                
                # Calculate prices
                discount_amount = (price * discount_percent / 100)
                price_after_discount = price - discount_amount
                gst_amount = (price_after_discount * gst_percent / 100)
                final_unit_price = price_after_discount + gst_amount
                final_total = final_unit_price * quantity
                
                # Set all price fields
                product['unit_price'] = round(price, 2)
                product['discount_amount'] = round(discount_amount, 2)
                product['price_after_discount'] = round(price_after_discount, 2)
                product['gst_amount'] = round(gst_amount, 2)
                product['final_unit_price'] = round(final_unit_price, 2)
                product['total_price'] = round(final_total, 2)
                
                # Store calculations
                product['calculations'] = {
                    'unit_price': product['unit_price'],
                    'discount_amount': product['discount_amount'],
                    'price_after_discount': product['price_after_discount'],
                    'gst_amount': product['gst_amount'],
                    'final_unit_price': product['final_unit_price'],
                    'final_total': product['total_price'],
                    'machine': product.get('machine', ''),
                    'thickness': product.get('thickness', ''),
                    'size': product.get('size', '')
                }
        
        # Get existing cart or create new one
        try:
            cart = get_user_cart()
            if not isinstance(cart, dict):
                cart = {'products': []}
            if 'products' not in cart:
                cart['products'] = []
            
            # Check if this is an update to an existing item
            item_id = data.get('item_id')
            if item_id:
                # Find and update the existing item
                item_updated = False
                for idx, item in enumerate(cart['products']):
                    if str(item.get('_id', '')) == str(item_id) or str(item.get('id', '')) == str(item_id):
                        # Update all fields from the new product data
                        cart['products'][idx].update(product)
                        item_updated = True
                        break
                
                if not item_updated:
                    return jsonify({
                        'success': False,
                        'error': 'Item not found in cart',
                        'message': 'The item you are trying to update was not found in your cart.'
                    }), 404
            else:
                # Check for duplicate products with same dimensions if force_add is not True
                if not data.get('force_add'):
                    duplicate_index = -1
                    product_type = product.get('type')
                    
                    if product_type == 'blanket':
                        for idx, item in enumerate(cart['products']):
                            if (item.get('type') == 'blanket' and 
                                abs(float(item.get('length', 0)) - float(product.get('length', 0))) < 0.01 and 
                                abs(float(item.get('width', 0)) - float(product.get('width', 0))) < 0.01 and 
                                item.get('thickness') == product.get('thickness') and
                                item.get('bar_type') == product.get('bar_type')):
                                duplicate_index = idx
                                break
                    
                    # Check for duplicate MPacks with same specifications
                    elif product_type == 'mpack':
                        for idx, item in enumerate(cart['products']):
                            if (item.get('type') == 'mpack' and 
                                item.get('machine') == product.get('machine') and
                                item.get('thickness') == product.get('thickness') and
                                item.get('size') == product.get('size') and
                                item.get('underpacking_type') == product.get('underpacking_type')):
                                duplicate_index = idx
                                break
                    
                    if duplicate_index >= 0:
                        # Return info about duplicate product
                        return jsonify({
                            'success': False,
                            'is_duplicate': True,
                            'duplicate_index': duplicate_index,
                            'message': 'A product with the same dimensions already exists in your cart.'
                        })
                
                # If no duplicate found and not an update, add the product to cart
                cart['products'].append(product)
            
            # Save updated cart
            save_user_cart(cart)
            
            # Get updated cart count
            updated_cart = get_user_cart()
            cart_count = len(updated_cart.get('products', [])) if updated_cart and isinstance(updated_cart, dict) else 0
            
            return jsonify({
                'success': True,
                'is_duplicate': False,
                'message': 'Product added to cart successfully',
                'cart_count': cart_count
            })
        except Exception as e:
            app.logger.error(f"Error saving cart: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Failed to save cart: {str(e)}'
            }), 500
    except Exception as e:
        app.logger.error(f"Error adding to cart: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Internal server error: {str(e)}'
        }), 500
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/get_cart', endpoint='api_get_cart')
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
    """Remove the product with the given ID from the user's cart."""
    data = request.get_json() or {}
    item_id = data.get('item_id')
    
    if not item_id:
        return jsonify({'error': 'Missing item_id'}), 400

    try:
        cart = get_user_cart()
        products = cart.get('products', [])
        
        # Find the item by ID
        initial_count = len(products)
        products = [p for p in products if p.get('id') != item_id]
        
        if len(products) < initial_count:
            # Item was found and removed
            save_user_cart({'products': products})
            return jsonify({
                'success': True,
                'cart_count': len(products),
                'message': 'Item removed from cart'
            })
            
        return jsonify({
            'success': False,
            'error': 'Item not found in cart',
            'cart_count': len(products)
        }), 404
        
    except Exception as e:
        app.logger.error(f'Error in remove_from_cart: {e}')
        return jsonify({
            'success': False,
            'error': 'Failed to remove item from cart',
            'details': str(e)
        }), 500


@app.route('/update_cart_item', methods=['POST'])
@login_required
def update_cart_item():
    """Update an existing cart item with new data."""
    if not current_user.is_authenticated:
        return jsonify({
            'success': False,
            'error': 'User not authenticated',
            'redirect': url_for('login')
        }), 401

    data = request.get_json()
    item_id = data.get('item_id')
    
    if not item_id:
        return jsonify({
            'success': False,
            'error': 'Item ID is required',
            'message': 'Please provide a valid item ID'
        }), 400
    
    # Get the current cart
    cart = get_user_cart()
    products = cart.get('products', [])
    
    # Find the item to update
    item_index = next((i for i, item in enumerate(products) 
                      if str(item.get('id')) == str(item_id) or 
                         str(item.get('_id')) == str(item_id)), None)
    
    if item_index is None:
        return jsonify({
            'success': False,
            'error': 'Item not found in cart',
            'message': 'The item you are trying to update was not found in your cart'
        }), 404
    
    # Update the item with new data
    item = products[item_index]
    
    # Update fields from the form data
    for key in ['quantity', 'length', 'width', 'thickness', 'size', 'machine', 'bar_type', 
               'discount_percent', 'gst_percent', 'unit_price', 'base_price', 'bar_price', 'name', 'type']:
        if key in data:
            item[key] = data[key]
    
    # Recalculate any calculated fields
    if 'quantity' in data or 'unit_price' in data or 'discount_percent' in data or 'gst_percent' in data:
        quantity = item.get('quantity', 1)
        discount_percent = float(item.get('discount_percent', 0))
        gst_percent = float(item.get('gst_percent', 18))  # Default to 18% GST if not specified
        
        # Handle blanket vs other product types differently
        if item.get('type') == 'blanket':
            # For blankets: keep base_price and bar_price separate for display
            base_price = float(item.get('base_price', 0)) or float(item.get('unit_price', 0))
            bar_price = float(item.get('bar_price', 0))
            
            # Calculate unit price (base + bar)
            unit_price = base_price + bar_price
            
            # Calculate subtotal (unit_price * quantity)
            subtotal = unit_price * quantity
            
            # Update the stored values
            item['base_price'] = base_price
            item['bar_price'] = bar_price
            item['unit_price'] = unit_price
        else:
            # For other products (mpack, etc.)
            unit_price = float(item.get('unit_price', 0))
            subtotal = unit_price * quantity
        
        # Calculate discount and final amounts
        discount_amount = (subtotal * discount_percent) / 100
        discounted_subtotal = subtotal - discount_amount
        gst_amount = (discounted_subtotal * gst_percent) / 100
        final_total = discounted_subtotal + gst_amount
        
        # Update calculations
        item['calculations'] = {
            'unit_price': unit_price,
            'quantity': quantity,
            'subtotal': subtotal,
            'discount_percent': discount_percent,
            'discount_amount': discount_amount,
            'discounted_subtotal': discounted_subtotal,
            'gst_percent': gst_percent,
            'gst_amount': gst_amount,
            'final_total': final_total
        }
        
        # Update the item's total_price field
        item['total_price'] = final_total
    
    # Save the updated cart
    cart['products'][item_index] = item
    save_user_cart(cart)
    
    return jsonify({
        'success': True,
        'message': 'Item updated successfully',
        'cart': cart
    })

@app.route('/update_cart_quantity', methods=['POST'])
@login_required
def update_cart_quantity():
    """Update the quantity of a product in the user's cart."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
            
        item_id = data.get('item_id')
        quantity = int(data.get('quantity', 1))
        
        # Validate quantity
        if quantity < 1:
            return jsonify({
                'success': False,
                'message': 'Quantity must be at least 1'
            }), 400
            
        if not item_id:
            return jsonify({
                'success': False,
                'message': 'Item ID is required'
            }), 400
        
        # Get current cart
        cart = get_user_cart()
        products = cart.get('products', [])
        
        # Find the item by ID
        item_updated = False
        updated_item = None
        
        for item in products:
            if str(item.get('id')) == str(item_id):
                # Update the quantity
                item['quantity'] = quantity
                
                # Recalculate prices if needed (for blankets)
                if item.get('type') == 'blanket':
                    # Recalculate blanket prices
                    base_price = item.get('base_price', 0)
                    bar_price = item.get('bar_price', 0)
                    discount_percent = item.get('discount_percent', 0)
                    gst_percent = item.get('gst_percent', 18)
                    
                    # Recalculate all values
                    price_per_unit = base_price + bar_price
                    subtotal = price_per_unit * quantity
                    discount_amount = subtotal * (discount_percent / 100)
                    discounted_subtotal = subtotal - discount_amount
                    gst_amount = (discounted_subtotal * gst_percent) / 100
                    final_total = discounted_subtotal + gst_amount
                    
                    # Update all price fields
                    item.update({
                        'unit_price': round(price_per_unit, 2),
                        'total_price': round(final_total, 2),
                        'calculations': {
                            **item.get('calculations', {}),
                            'subtotal': round(subtotal, 2),
                            'discount_amount': round(discount_amount, 2),
                            'discounted_subtotal': round(discounted_subtotal, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_price': round(final_total, 2)
                        }
                    })
                
                updated_item = item
                item_updated = True
                break
        
        if item_updated:
            # Save the updated cart
            save_user_cart({'products': products})
            
            return jsonify({
                'success': True,
                'message': 'Cart quantity updated',
                'cart_count': len(products),
                'updated_item': updated_item
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Item not found in cart',
                'cart_count': len(products)
            }), 404
    except Exception as e:
        app.logger.error(f'Error updating cart quantity: {str(e)}')
        return jsonify({
            'success': False,
            'message': 'An error occurred while updating the cart quantity',
            'error': str(e)
        }), 500

@app.route('/update_cart_discount', methods=['POST'])
@login_required
def update_cart_discount():
    """Update the discount percentage of a product in the user's cart."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
            
        item_id = data.get('item_id')
        discount_percent = float(data.get('discount_percent', 0))
        
        # Validate discount percentage
        if discount_percent < 0 or discount_percent > 100:
            return jsonify({
                'success': False,
                'message': 'Discount percentage must be between 0 and 100'
            }), 400
            
        if not item_id:
            return jsonify({
                'success': False,
                'message': 'Item ID is required'
            }), 400
        
        # Get current cart
        cart = get_user_cart()
        products = cart.get('products', [])
        
        # Find the item by ID
        item_updated = False
        updated_item = None
        
        for item in products:
            if str(item.get('id')) == str(item_id):
                # Update the discount percentage
                item['discount_percent'] = discount_percent
                
                # Recalculate prices based on product type
                if item.get('type') == 'blanket':
                    # Recalculate blanket prices
                    base_price = item.get('base_price', 0)
                    bar_price = item.get('bar_price', 0)
                    quantity = item.get('quantity', 1)
                    gst_percent = item.get('gst_percent', 18)
                    
                    price_per_unit = base_price + bar_price
                    subtotal = price_per_unit * quantity
                    discount_amount = subtotal * (discount_percent / 100)
                    discounted_subtotal = subtotal - discount_amount
                    gst_amount = (discounted_subtotal * gst_percent) / 100
                    final_total = discounted_subtotal + gst_amount
                    
                    # Update all price fields
                    item.update({
                        'unit_price': round(price_per_unit, 2),
                        'total_price': round(final_total, 2),
                        'calculations': {
                            **item.get('calculations', {}),
                            'subtotal': round(subtotal, 2),
                            'discount_amount': round(discount_amount, 2),
                            'discounted_subtotal': round(discounted_subtotal, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_price': round(final_total, 2)
                        }
                    })
                else:
                    # For mpacks and other product types
                    unit_price = item.get('unit_price', 0)
                    quantity = item.get('quantity', 1)
                    gst_percent = item.get('gst_percent', 18)
                    
                    subtotal = unit_price * quantity
                    discount_amount = subtotal * (discount_percent / 100)
                    discounted_subtotal = subtotal - discount_amount
                    gst_amount = (discounted_subtotal * gst_percent) / 100
                    final_total = discounted_subtotal + gst_amount
                    
                    # Update all price fields
                    item.update({
                        'total_price': round(final_total, 2),
                        'calculations': {
                            **item.get('calculations', {}),
                            'subtotal': round(subtotal, 2),
                            'discount_amount': round(discount_amount, 2),
                            'discounted_subtotal': round(discounted_subtotal, 2),
                            'gst_amount': round(gst_amount, 2),
                            'final_price': round(final_total, 2)
                        }
                    })
                
                updated_item = item
                item_updated = True
                break
        
        if item_updated:
            # Save the updated cart
            save_user_cart({'products': products})
            
            return jsonify({
                'success': True,
                'message': 'Cart discount updated',
                'cart_count': len(products),
                'updated_item': updated_item
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Item not found in cart',
                'cart_count': len(products)
            }), 404
    except Exception as e:
        app.logger.error(f'Error updating cart discount: {str(e)}')
        return jsonify({
            'success': False,
            'message': 'An error occurred while updating the cart discount',
            'error': str(e)
        }), 500

@app.route('/get_cart_count', endpoint='api_get_cart_count')
def get_cart_count():
    """Return the number of products currently in the user's cart."""
    try:
        if not current_user.is_authenticated:
            return jsonify({'count': 0})
            
        cart = get_user_cart()
        return jsonify({'count': len(cart.get('products', []))})
    except Exception as e:
        print(f"Error in get_cart_count: {e}")
        return jsonify({'count': 0})

def load_companies_data():
    """Load companies data from MongoDB or fall back to JSON file."""
    global mongo_db, USE_MONGO
    
    try:
        # Log MongoDB status
        app.logger.info(f"Loading companies - MongoDB status: Available={MONGO_AVAILABLE}, Using={USE_MONGO}, Connected={'Yes' if mongo_db is not None else 'No'}")
        
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                # Test the connection first
                mongo_db.command('ping')
                
                # Get companies from MongoDB with only the fields we need
                projection = {
                    '_id': 1,
                    'Company Name': 1,
                    'EmailID': 1,
                    'created_at': 1,
                    'created_by': 1
                }
                
                # Find all companies and sort by name for consistent ordering
                companies_cursor = mongo_db.companies.find({}, projection).sort('Company Name', 1)
                companies = list(companies_cursor)
                
                mapped_companies = []
                for company in companies:
                    try:
                        company_id = str(company.pop('_id'))
                        
                        # Get company data (we only store one set of fields now)
                        name = company.get('Company Name')
                        email = company.get('EmailID', '')
                        
                        # Skip if we don't have a valid name
                        if not name:
                            app.logger.warning(f"Skipping company with missing name: {company_id}")
                            continue
                            
                        # Ensure email is a string and properly formatted
                        email = str(email).strip() if email else ''
                        
                        mapped_companies.append({
                            'id': company_id,
                            'name': name,
                            'email': email,
                            'created_at': company.get('created_at'),
                            'created_by': company.get('created_by')
                        })
                        
                    except Exception as e:
                        app.logger.error(f"Error processing company {company.get('_id')}: {str(e)}")
                        continue
                        
                app.logger.info(f"Successfully loaded {len(mapped_companies)} companies from MongoDB")
                return mapped_companies
                
            except Exception as db_error:
                app.logger.error(f"MongoDB error in load_companies_data: {str(db_error)}")
                # Fall through to JSON fallback
                USE_MONGO = False
                
        # Fall back to JSON file if MongoDB is not available or there was an error
        companies_file = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
        app.logger.info(f"Falling back to loading companies from: {companies_file}")
        
        if os.path.exists(companies_file):
            try:
                with open(companies_file, 'r', encoding='utf-8') as f:
                    companies = json.load(f)
                    companies = companies.get('companies', [])
                    app.logger.info(f"Loaded {len(companies)} companies from JSON file")
                    return companies
            except Exception as e:
                app.logger.error(f"Error reading companies JSON file: {str(e)}")
        
        app.logger.warning("No companies data found in MongoDB or JSON file")
        return []
        
    except Exception as e:
        app.logger.error(f"Unexpected error in load_companies_data: {str(e)}", exc_info=True)
        return []

@app.route('/')
@app.route('/index')
@login_required
def index():
    try:
        companies = load_companies_data()
        
        # Ensure companies is a list before passing to template
        if not isinstance(companies, list):
            companies = []
            
        return render_template('user/index.html', companies=companies)
        
    except Exception as e:
        app.logger.error(f"Error in index route: {str(e)}")
        # Return empty companies list on error
        return render_template('user/index.html', companies=[])

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return jsonify({'success': True, 'redirectTo': '/index'}) if request.method == 'POST' else redirect(url_for('index'))
    
    if request.method == 'POST':
        # Handle POST request - this should never happen since we use API route
        return jsonify({'error': 'Use /api/auth/login for POST requests'}), 400
    
    return render_template('login.html')

@app.route('/signup')
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('signup.html')

@app.route('/company-selection', methods=['GET', 'POST'])
@login_required
def company_selection():
    if request.method == 'POST':
        company = request.form.get('company')
        email = request.form.get('email')
        
        if not company or not email:
            flash('Please select a company and enter an email', 'error')
            return redirect(url_for('company_selection'))
        
        # Save company info in session for convenience
        session['company'] = company
        session['email'] = email

        # Store a consistent dict for selected_company used by downstream routes
        session['selected_company'] = {
            'name': company,
            'email': email
        }
        
        # Redirect to product selection
        return redirect(url_for('product_selection'))
    
    return render_template('company_selection.html')

@app.route('/product_selection', methods=['GET', 'POST'])
@login_required
def product_selection():
    if request.method == 'POST':
        product_type = request.form.get('product_type')
        
        if not product_type:
            flash('Please select a product type', 'error')
            return redirect(url_for('product_selection'))
            
        # Save product type in session
        session['product_type'] = product_type
        
        # Redirect to appropriate product details page
        if product_type == 'blanket':
            return redirect(url_for('blankets'))
        elif product_type == 'mpack':
            return redirect(url_for('mpacks'))
            
    # Check if company is selected
    selected_company = session.get('selected_company')
    if not selected_company:
        return redirect(url_for('company_selection'))
    
    return render_template('product_selection.html')


@app.route('/select_company', methods=['GET', 'POST'])
@login_required
def select_company():
    app.logger.info(f"Select company request: {request.method}")
    
    if request.method == 'POST':
        try:
            # Get form data
            company_id = request.form.get('company_id')
            company_name = request.form.get('company_name')
            company_email = request.form.get('company_email')
            
            app.logger.info(f"Company selection - ID: {company_id}, Name: {company_name}")
            
            if not all([company_id, company_name, company_email]):
                app.logger.warning("Missing company information in form")
                flash('Please select a valid company', 'error')
                return redirect(url_for('company_selection'))
            
            # Update user's company in the database
            if USE_MONGO and MONGO_AVAILABLE:
                result = users_col.update_one(
                    {'_id': current_user.id},
                    {'$set': {
                        'company_id': company_id,
                        'company_name': company_name,
                        'company_email': company_email,
                        'updated_at': datetime.utcnow()
                    }}
                )
                app.logger.info(f"MongoDB update result: {result.matched_count} documents modified")
            else:
                # Fallback to JSON storage
                users = _load_users_json()
                user_id_str = str(current_user.id)
                if user_id_str in users:
                    users[user_id_str]['company_id'] = company_id
                    users[user_id_str]['company_name'] = company_name
                    users[user_id_str]['company_email'] = company_email
                    _save_users_json(users)
            
            # Update session
            session['company_id'] = company_id
            session['company_name'] = company_name
            session['company_email'] = company_email
            session['selected_company'] = {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
            
            # Ensure session is saved
            session.modified = True
            
            app.logger.info(f"Company selected: {company_name} ({company_id})")
            flash('Company selected successfully!', 'success')
            return redirect(url_for('product_selection'))
            
        except Exception as e:
            app.logger.error(f"Error in select_company: {str(e)}", exc_info=True)
            flash('An error occurred while processing your request. Please try again.', 'error')
            return redirect(url_for('company_selection'))
    
    # For GET requests, just render the template
    return render_template('company_selection.html')

# -------------------- Cart helper wrappers --------------------

def get_companies():
    try:
        # Load companies from static JSON file
        file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
        app.logger.info(f"Loading companies from: {file_path}")
        with open(file_path, 'r', encoding='utf-8') as f:
            companies = json.load(f)
            
        # Create a list to store unique companies (by email)
        unique_companies = {}
        
        # Process companies and ensure unique emails
        for i, company in enumerate(companies, 1):
            email = company.get('EmailID', '').strip().lower()
            name = company.get('Company Name', '').strip()
            
            # Skip if email is missing or already processed
            if not email or email in unique_companies:
                continue
                
            # Add to unique companies with a consistent ID based on email hash
            unique_id = hashlib.md5(email.encode('utf-8')).hexdigest()
            unique_companies[email] = {
                'id': unique_id,
                'name': name,
                'email': email
            }
        
        # Convert to list and sort by company name
        result = sorted(unique_companies.values(), key=lambda x: x['name'].lower())
        return result
        
    except Exception as e:
        app.logger.error(f"Error loading companies: {str(e)}")
        return []

# Redirect old forgot-password URL to reset-password
@app.route('/forgot-password')
def forgot_password_redirect():
    return redirect(url_for('reset_password_page'))

# API Routes

# Company Management
@app.route('/api/companies', methods=['GET'])
@app.route('/get_companies', methods=['GET'])  # Add this line to support both endpoints
@login_required
def api_get_companies():
    """Get all companies from the database"""
    try:
        companies = load_companies_data()  # Use the helper function directly
        if not companies:
            return jsonify({'error': 'No companies found'}), 404
            
        # Convert to list of dicts if it's a dict
        if isinstance(companies, dict):
            companies = [{'id': k, 'name': v.get('name'), 'email': v.get('email')} 
                        for k, v in companies.items()]
            
        return jsonify(companies)
    except Exception as e:
        app.logger.error(f"Error getting companies: {str(e)}")
        return jsonify({'error': 'Failed to load companies'}), 500

# Machines list endpoint
@app.route('/api/machines', methods=['GET'])
@login_required
def api_get_machines():
    """Return list of machines.
    Primary design: store machines inside a single *master* document that has an
    array field called `machines`.  If such a document doesn’t exist (e.g. data
    migrated differently), fall back to scanning the whole collection and
    returning each document’s id / name pair.  This guarantees the endpoint
    always returns an array of objects like: [{"id": 1, "name": "Heidelberg"}, …]
    """
    if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
        return jsonify([])

    try:
        # Preferred structure – one master document with `machines` array
        master_doc = mongo_db.machine.find_one({'machines': {'$exists': True}})
        if master_doc and isinstance(master_doc.get('machines'), list):
            return jsonify(master_doc.get('machines', []))

        # Fallback: each machine as its own document
        cursor = mongo_db.machine.find({}, {'_id': 0, 'id': 1, 'name': 1})
        machines = []
        for doc in cursor:
            # Some datasets might store ObjectIds or missing incremental id.
            # Ensure we always provide an `id` (string) and `name`.
            m_id = str(doc.get('id', doc.get('_id')))
            m_name = doc.get('name')
            if m_name:
                machines.append({'id': m_id, 'name': m_name})

        return jsonify(machines)
    except Exception as e:
        app.logger.error(f"Error fetching machines: {str(e)}")
        return jsonify([])

@app.route('/api/session/update', methods=['POST'])
@login_required
def api_update_session():
    """Update session data such as selected_company from the frontend."""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400

    data = request.get_json()

    # Update any keys that the frontend sends (e.g., selected_company)
    allowed_keys = {'selected_company', 'company_id', 'company_name', 'company_email'}
    updated_any = False
    for key in allowed_keys:
        if key in data:
            session[key] = data[key]
            updated_any = True

    if updated_any:
        session.modified = True
        return jsonify({'status': 'success', 'message': 'Session updated'}), 200
    else:
        return jsonify({'status': 'error', 'message': 'No valid keys provided'}), 400

# ---------------------- Static JSON Data Endpoints ----------------------

@app.route('/blanket_categories')
@login_required
def api_blanket_categories():
    """Serve blanket categories JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'blanket_categories.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("blanket_categories.json not found at %s", file_path)
        return jsonify({'error': 'Blanket categories data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading blanket_categories.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/blanket_data')
@login_required
def api_blanket_data():
    """Serve blankets data JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'blankets.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("blankets.json not found at %s", file_path)
        return jsonify({'error': 'Blankets data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading blankets.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/thickness_data')
@login_required
def api_thickness_data():
    """Serve thickness data JSON to frontend."""
    try:
        # Prefer blankets folder thickness.json, fallback to static/data/thickness.json
        primary_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'thickness.json')
        fallback_path = os.path.join(app.root_path, 'static', 'data', 'thickness.json')
        file_path = primary_path if os.path.exists(primary_path) else fallback_path
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("thickness.json not found at %s", file_path)
        return jsonify({'error': 'Thickness data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading thickness.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/bar_data')
@login_required
def api_bar_data():
    """Serve bar data JSON to frontend."""
    try:
        file_path = os.path.join(app.root_path, 'static', 'products', 'blankets', 'bar.json')
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        app.logger.error("bar.json not found at %s", file_path)
        return jsonify({'error': 'Bar data not found'}), 404
    except Exception as e:
        app.logger.error("Error reading bar.json: %s", e)
        return jsonify({'error': 'Internal server error'}), 500

# Company Search Endpoint
@app.route('/api/companies/search', methods=['GET'])
@login_required
def search_companies():
    """Search for companies by name"""
    query = request.args.get('q', '').lower().strip()
    if not query or len(query) < 2:
        return jsonify([])
    
    try:
        # Search in MongoDB if available
        if MONGO_AVAILABLE and USE_MONGO:
            # Search in both name and address fields
            regex_pattern = f'.*{re.escape(query)}.*'
            companies = list(mongo_db.companies.find({
                '$or': [
                    {'name': {'$regex': regex_pattern, '$options': 'i'}},
                    {'address': {'$regex': regex_pattern, '$options': 'i'}}
                ]
            }).limit(10))
            
            # Convert ObjectId to string for JSON serialization
            for company in companies:
                company['id'] = str(company.pop('_id'))
        else:
            # Fallback to JSON file if needed
            companies_file = os.path.join('data', 'companies.json')
            if os.path.exists(companies_file):
                with open(companies_file, 'r') as f:
                    all_companies = json.load(f)
                
                # Simple case-insensitive search
                companies = [
                    {**c, 'id': c['id']} for c in all_companies 
                    if query in c.get('name', '').lower() or 
                       query in c.get('address', '').lower()
                ][:10]
            else:
                companies = []
        
        return jsonify(companies)
    except Exception as e:
        app.logger.error(f"Error searching companies: {str(e)}")
        return jsonify({'error': 'Failed to search companies'}), 500

@app.route('/api/update_company', methods=['POST'])
@login_required
def update_user_company():
    """Update the current user's company"""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400
    
    data = request.get_json()
    company_id = data.get('company_id')
    
    if not company_id:
        return jsonify({'status': 'error', 'message': 'Company ID is required'}), 400
    
    try:
        # Update user's company in the database
        if MONGO_AVAILABLE and USE_MONGO and users_col is not None:
            # Ensure company_id is stored in the correct BSON type when possible
            try:
                company_id_casted = ObjectId(company_id)
            except Exception:
                # Keep the original value if it is not a valid ObjectId
                company_id_casted = company_id

            # Update in MongoDB only – do not create new user docs here
            result = users_col.update_one(
                {'_id': current_user.id},
                {'$set': {'company_id': company_id_casted}}
            )
            if result.matched_count == 0:
                # User document missing – create it so that the company can be saved
                user_doc = users_col.find_one({'_id': current_user.id})
                if not user_doc:
                    new_doc = {
                        '_id': current_user.id,
                        'username': getattr(current_user, 'username', str(current_user.id)),
                        'username_lower': (getattr(current_user, 'username', '') or str(current_user.id)).lower(),
                        'email': getattr(current_user, 'email', ''),
                        'company_id': company_id_casted,
                    }
                    try:
                        users_col.insert_one(new_doc)
                    except Exception as dup_err:
                        # Handle duplicate key gracefully
                        try:
                            from pymongo.errors import DuplicateKeyError
                            if isinstance(dup_err, DuplicateKeyError):
                                app.logger.warning("Duplicate key on user insert, falling back to update: %s", dup_err)
                                # Ensure username_lower is unique by appending user id
                                safe_username_lower = f"user_{current_user.id}"
                                users_col.update_one(
                                    {'_id': current_user.id},
                                    {'$set': {
                                        'company_id': company_id_casted,
                                        'username_lower': safe_username_lower
                                    }},
                                    upsert=True
                                )
                            else:
                                app.logger.error("Error inserting user doc: %s", dup_err)
                        except ImportError:
                            app.logger.error("pymongo DuplicateKeyError not available; error: %s", dup_err)
                else:
                    # If a document exists but was not matched (unlikely), update company_id
                    users_col.update_one({'_id': current_user.id}, {'$set': {'company_id': company_id_casted}})
            # No error even if modified_count == 0 (company already set)
        else:
            # Update in JSON file
            users = load_users()
            if str(current_user.id) not in users:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
                
            users[str(current_user.id)]['company_id'] = company_id
            save_users()
        
        # Update session
        session['company_id'] = company_id
        
        # Get company details for response
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with company details
        session['company_name'] = company_name
        session['company_email'] = company_email
        
        return jsonify({
            'status': 'success',
            'message': 'Company updated successfully',
            'company': {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error updating user company: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

def load_users():
    """Load users from JSON file"""
    try:
        users_file = os.path.join(os.path.dirname(__file__), 'data', 'users.json')
        if os.path.exists(users_file):
            with open(users_file, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        app.logger.error(f"Error loading users: {str(e)}")
        return {}

def save_users(users):
    """Save users to JSON file"""
    try:
        users_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(users_dir, exist_ok=True)
        users_file = os.path.join(users_dir, 'users.json')
        with open(users_file, 'w') as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        app.logger.error(f"Error saving users: {str(e)}")

@app.route('/update_company', methods=['POST'])
@app.route('/api/user/update-company', methods=['POST'])
@login_required
def update_company():
    """Update the current user's company from product pages"""
    if not request.is_json:
        return jsonify({'status': 'error', 'message': 'Request must be JSON'}), 400
    
    data = request.get_json()
    company_id = data.get('company_id')
    company_name = data.get('company_name')
    company_email = data.get('company_email')
    
    if not all([company_id, company_name, company_email]):
        return jsonify({'status': 'error', 'message': 'Company ID, name, and email are required'}), 400
    
    try:
        # Update user's company in the database
        if MONGO_AVAILABLE and USE_MONGO and users_col is not None:
            # Update or create in MongoDB
            # Ensure we target the correct user document and avoid inserting duplicates
            from bson import ObjectId
            try:
                user_filter = {'_id': ObjectId(current_user.id)} if ObjectId.is_valid(str(current_user.id)) else {'_id': current_user.id}
            except Exception:
                user_filter = {'_id': current_user.id}

            # First, check if the user exists and handle the username_lower field
            user = users_col.find_one(user_filter)
            update_data = {
                'company_id': company_id,
                'company_name': company_name,
                'company_email': company_email,
                'updated_at': datetime.utcnow()
            }
            
            # If user exists, update the document
            if user:
                # If username_lower is missing or null, set a default value to avoid index conflicts
                if 'username_lower' not in user or user.get('username_lower') is None:
                    update_data['username_lower'] = str(user.get('username', '')).lower() or f'user_{current_user.id}'.lower()
                
                # Update the document
                result = users_col.update_one(
                    user_filter,
                    {'$set': update_data}
                )
            else:
                # If user doesn't exist, try to find by email
                if hasattr(current_user, 'email') and current_user.email:
                    user = users_col.find_one({'email': current_user.email})
                    if user:
                        # Update the found user
                        if 'username_lower' not in user or user.get('username_lower') is None:
                            update_data['username_lower'] = str(user.get('username', '')).lower() or f'user_{user["_id"]}'.lower()
                        
                        result = users_col.update_one(
                            {'_id': user['_id']},
                            {'$set': update_data}
                        )
                    else:
                        # If no user found by email, create a new one with required fields
                        update_data.update({
                            '_id': current_user.id,
                            'email': current_user.email,
                            'username': getattr(current_user, 'username', f'user_{current_user.id}'),
                            'username_lower': getattr(current_user, 'username', f'user_{current_user.id}').lower(),
                            'created_at': datetime.utcnow()
                        })
                        users_col.insert_one(update_data)
                        result = type('obj', (object,), {'matched_count': 1})  # Mock result object
        else:
            # Update in JSON file
            users = load_users()
            user_id = str(current_user.id)
            if user_id not in users:
                users[user_id] = {}
                
            users[user_id]['company_id'] = company_id
            users[user_id]['company_name'] = company_name
            users[user_id]['company_email'] = company_email
            users[user_id]['updated_at'] = datetime.utcnow().isoformat()
            save_users(users)
        
        # Update session with company information
        session['company_id'] = company_id
        session['company_name'] = company_name
        session['company_email'] = company_email
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session.modified = True  # Ensure session is saved
        
        return jsonify({
            'status': 'success',
            'message': 'Company updated successfully',
            'company': {
                'id': company_id,
                'name': company_name,
                'email': company_email
            }
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        app.logger.error(f"Error updating company: {str(e)}\n{error_trace}")
        
        # Prepare error details for the response
        error_details = {
            'status': 'error',
            'message': 'Failed to update company information.',
            'error': str(e),
            'error_type': type(e).__name__
        }
        
        # Add more context based on error type
        if 'MongoDB' in error_details['error_type'] or 'pymongo' in error_details['error_type']:
            error_details['message'] = 'Database connection error. Please try again later.'
            
        # Log the full error for debugging
        app.logger.error(f"Returning error response: {error_details}")
        
        return jsonify(error_details), 500

# ---------------------------------------------------------------------------
# Company and Machine Creation Routes
# ---------------------------------------------------------------------------

@app.route('/add_company')
@login_required
def add_company():
    """Render form page to add a new company"""
    return render_template('user/add_company.html')


@app.route('/add_machine')
@login_required
def add_machine():
    """Render form page to add a new machine"""
    return render_template('user/add_machine.html')


# ----------------------------- API Endpoints ------------------------------

@app.route('/api/add_company', methods=['POST'])
@login_required
def api_add_company():
    """Handle AJAX request to create a new company"""
    if not request.is_json:
        return jsonify({'success': False, 'message': 'Invalid request, JSON expected.'}), 400

    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    app.logger.info(f"Received request to add company: {name} <{email}>")

    if not name or not email:
        app.logger.warning("Missing name or email in request")
        return jsonify({'success': False, 'message': 'Name and email are required.'}), 400

    try:
        # Use the global mongo_db connection
        global mongo_db, USE_MONGO
        
        # Log MongoDB connection status
        app.logger.info(f"MongoDB status - Available: {MONGO_AVAILABLE}, Using: {USE_MONGO}, Connection: {'Yes' if mongo_db is not None else 'No'}")
        
        # Check MongoDB connection
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                # Test the connection
                mongo_db.command('ping')
                app.logger.info("Successfully pinged MongoDB")
            except Exception as e:
                app.logger.error(f"MongoDB ping failed: {str(e)}")
                USE_MONGO = False
                mongo_db = None

        # Check for existing company with same name or email
        if mongo_db is not None:
            try:
                # Check for existing company in MongoDB (case-insensitive)
                existing_company = mongo_db.companies.find_one({
                    '$or': [
                        {'Company Name': {'$regex': f'^{name}$', '$options': 'i'}},
                        {'EmailID': {'$regex': f'^{email}$', '$options': 'i'}}
                    ]
                })
                
                if existing_company:
                    return jsonify({
                        'success': False, 
                        'message': 'A company with this name or email already exists.'
                    }), 400
                    
                # Insert new company with consistent field names (only one set of fields)
                company_data = {
                    'Company Name': name.strip(),
                    'EmailID': email.lower().strip(),
                    'created_at': datetime.utcnow(),
                    'created_by': str(current_user.id)
                }
                app.logger.info(f"Inserting company data: {company_data}")
                result = mongo_db.companies.insert_one(company_data)
                company_id = str(result.inserted_id)
                app.logger.info(f"Successfully inserted company into MongoDB with ID: {company_id}")
                
            except Exception as db_error:
                app.logger.error(f"Database error in api_add_company: {str(db_error)}", exc_info=True)
                # Fall through to JSON fallback
                app.logger.info("Falling back to JSON storage due to database error")
                mongo_db = None  # Force fallback to JSON
                raise db_error
        else:
            # JSON fallback implementation
            companies_file = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            os.makedirs(os.path.dirname(companies_file), exist_ok=True)
            
            # Load existing companies
            companies = []
            if os.path.exists(companies_file):
                with open(companies_file, 'r', encoding='utf-8') as f:
                    companies = json.load(f) or []
            
            # Check for duplicates
            if any(company.get('Company Name') == name or company.get('EmailID') == email 
                  for company in companies):
                return jsonify({
                    'success': False, 
                    'message': 'A company with this name or email already exists.'
                }), 400
            
            # Add new company
            company_id = str(len(companies) + 1)
            companies.append({
                'id': company_id,
                'Company Name': name,
                'EmailID': email,
                'created_at': datetime.utcnow().isoformat(),
                'created_by': str(current_user.id)
            })
            
            # Save back to file
            with open(companies_file, 'w', encoding='utf-8') as f:
                json.dump(companies, f, ensure_ascii=False, indent=2)

        # Log the successful addition
        app.logger.info(f"Company added successfully - Name: {name}, Email: {email}")
        
        # Try to send notification email (non-blocking)
        try:
            user_identity = getattr(current_user, 'email', getattr(current_user, 'username', 'Unknown User'))
            email_sent = send_alert_email(
                subject='Database Update: New Company Added',
                body=f"{user_identity} added a new company ({name}, {email}) on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC"
            )
        except Exception as email_error:
            app.logger.error(f"Error sending notification email: {str(email_error)}")
            email_sent = False
        
        # Return success response regardless of email status
        response = {
            'success': True, 
            'message': 'Company added successfully',
            'id': company_id
        }
        
        if email_sent:
            app.logger.info("Notification email sent successfully")
            response['message'] += '. Notification email sent.'
        else:
            app.logger.warning("Company added but failed to send notification email")
            response['message'] += '. Failed to send notification email.'
            response['warning'] = 'Email notification failed'
            
        return jsonify(response)
        
    except Exception as e:
        app.logger.error(f"Error adding company: {str(e)}", exc_info=True)
        error_message = str(e)
        
        # Provide more specific error messages for common issues
        if "duplicate key error" in error_message.lower():
            error_message = "A company with this name or email already exists."
        elif "timed out" in error_message.lower() or "connection" in error_message.lower():
            error_message = "Could not connect to the database. Please try again later."
            
        return jsonify({
            'success': False, 
            'message': f'Failed to add company: {error_message}'
        }), 500

@app.route('/api/add_machine', methods=['POST'])
@login_required
def api_add_machine():
    """Handle AJAX request to create a new machine"""
    if not request.is_json:
        return jsonify({'success': False, 'message': 'Invalid request, JSON expected.'}), 400

    data = request.get_json()
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Machine name is required.'}), 400

    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            # Store machines in a single document that contains an array field `machines`
            # Find the document that holds the array (first document that has `machines`)
            master_doc = mongo_db.machine.find_one({'machines': {'$exists': True}})
            if master_doc is None:
                # Create master doc if it doesn't exist
                next_id = 1
                mongo_db.machine.insert_one({'machines': [{'id': next_id, 'name': name}]})
            else:
                machines_arr = master_doc.get('machines', [])
                # Check if machine with this name already exists
                if any(m.get('name') == name for m in machines_arr):
                    return jsonify({'success': False, 'message': 'A machine with this name already exists.'}), 400
                    
                # Determine next incremental id based on existing array length / max id
                if machines_arr:
                    next_id = max([m.get('id', 0) for m in machines_arr]) + 1
                else:
                    next_id = 1
                mongo_db.machine.update_one(
                    {'_id': master_doc['_id']},
                    {'$push': {'machines': {'id': next_id, 'name': name, 'description': description, 'created_at': datetime.utcnow()}}},
                    upsert=True
                )
            machine_id = str(next_id)
            # Send alert email
            user_identity = getattr(current_user, 'email', getattr(current_user, 'username', 'Unknown User'))
            send_alert_email(
                subject='Database Update: New Machine Added',
                body=f"{user_identity} added a new machine ({name}) on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}"
            )
        else:
            # File-based storage fallback
            os.makedirs(os.path.dirname(machines_file), exist_ok=True)
            machines_data = {"machines": []}
            if os.path.exists(machines_file):
                with open(machines_file, 'r', encoding='utf-8') as f:
                    machines_data = json.load(f) or {"machines": []}
            
            machines = machines_data.get('machines', [])
            
            # Check if machine with this name already exists
            if any(m.get('name') == name for m in machines):
                return jsonify({'success': False, 'message': 'A machine with this name already exists.'}), 400

            # Determine next ID
            next_id = (machines[-1]['id'] + 1) if machines else 1
            machines.append({
                'id': next_id, 
                'name': name, 
                'description': description,
                'created_at': datetime.utcnow().isoformat()
            })
            machines_data['machines'] = machines
            with open(machines_file, 'w', encoding='utf-8') as f:
                json.dump(machines_data, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True, 'message': 'Machine added successfully.', 'id': machine_id})
    except Exception as e:
        app.logger.error(f"Error adding machine: {e}")
        return jsonify({'success': False, 'message': 'Failed to add machine.'}), 500

# Step 1: Request Password Reset - Send OTP to email
# Step 2: Verify OTP
@app.route('/api/auth/request-password-reset', methods=['POST'])
def api_request_password_reset():
    data = request.get_json()
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    # Find user by email
    user = None
    if MONGO_AVAILABLE and USE_MONGO:
        doc = mu_find_user_by_email_or_username(email)
        if doc and doc.get('email', '').lower() == email:
            user = doc
    else:
        for u in users.values():
            if u.email.lower() == email:
                user = u
                break

    if not user:
        # Don't reveal if email exists for security
        return jsonify({'success': True, 'message': 'If an account with that email exists, a password reset OTP has been sent.'})

    # Generate OTP
    otp = ''.join(random.choices('0123456789', k=6))
    otp_expiry = datetime.utcnow() + timedelta(minutes=10)

    # Store OTP in user's record
    if MONGO_AVAILABLE and USE_MONGO:
        users_col.update_one(
            {'_id': user['_id']},
            {'$set': {
                'reset_token': otp,
                'reset_token_expiry': otp_expiry
            }}
        )
    else:
        user.reset_token = otp
        user.reset_token_expiry = otp_expiry
        save_users()

    # Send email with OTP
    try:
        msg = MIMEMultipart()
        msg['From'] = f'"{EMAIL_FROM_NAME}" <{EMAIL_FROM}>'
        msg['To'] = email
        msg['Subject'] = 'Password Reset OTP'
        
        body = f"""
        <h2>Password Reset Request</h2>
        <p>You have requested to reset your password. Please use the following OTP to proceed:</p>
        <h3 style="font-size: 24px; letter-spacing: 5px; margin: 20px 0;">{otp}</h3>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            
        return jsonify({
            'success': True, 
            'message': 'If an account with that email exists, a password reset OTP has been sent.'
        })
    except Exception as e:
        app.logger.error(f'Error sending password reset email: {str(e)}')
        return jsonify({'error': 'Failed to send password reset email. Please try again later.'}), 500

@app.route('/api/auth/verify-reset-otp', methods=['POST'])
def api_verify_reset_otp():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        otp = data.get('otp', '').strip()

        if not all([email, otp]):
            return jsonify({'error': 'Email and OTP are required'}), 400

        user = None
        if MONGO_AVAILABLE and USE_MONGO:
            doc = mu_find_user_by_email_or_username(email)
            if doc and doc.get('email', '').lower() == email:
                user = doc
        else:
            for u in users.values():
                if u.email.lower() == email:
                    user = u
                    break

        if not user:
            return jsonify({'error': 'No account found with that email'}), 404

        stored_otp = user.get('reset_token') if isinstance(user, dict) else user.reset_token
        stored_expiry = user.get('reset_token_expiry') if isinstance(user, dict) else user.reset_token_expiry

        if not stored_otp or stored_otp != otp:
            return jsonify({'error': 'Invalid OTP'}), 400

        if stored_expiry and stored_expiry < datetime.utcnow():
            return jsonify({'error': 'OTP has expired'}), 400

        return jsonify({'success': True, 'message': 'OTP verified successfully'})

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
        new_password = data.get('new_password', '').strip()
        
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
            'redirectTo': '/login'  # Redirect to login page after successful reset
        })
        
    except Exception as e:
        print(f"Password reset error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/quotation_preview')
@login_required
@company_required
def quotation_preview():
    app.logger.info("[DEBUG] quotation_preview() called")
    
    # Get current date and time in IST
    current_datetime = datetime.utcnow()
    ist = timezone(timedelta(hours=5, minutes=30))
    current_datetime_ist = current_datetime.replace(tzinfo=timezone.utc).astimezone(ist)
    formatted_datetime = current_datetime_ist.strftime('%Y-%m-%d %H:%M:%S')
    quote_date = current_datetime_ist.strftime('%Y-%m-%d')
    quote_time = current_datetime_ist.strftime('%H:%M:%S')
    
    cart = get_user_cart()
    app.logger.info(f"[DEBUG] Cart contains {len(cart.get('products', []))} products")
    
    if not cart.get('products'):
        app.logger.warning("[DEBUG] Empty cart, redirecting to cart page")
        flash('Your cart is empty', 'warning')
        return redirect(url_for('cart'))

    # Get company info from selected_company dict first, then fallback to direct session values
    selected_company = session.get('selected_company', {})
    app.logger.info(f"[DEBUG] Selected company from session: {selected_company}")
    
    customer_name = selected_company.get('name') or session.get('company_name', '')
    customer_email = selected_company.get('email') or session.get('company_email', '')
    app.logger.info(f"[DEBUG] Resolved customer: {customer_name} <{customer_email}>")
    
    # If we have company ID but no name/email, try to look it up
    if not customer_name and 'company_id' in session:
        try:
            company_id = session['company_id']
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
            
            company = next((c for c in companies if str(c.get('id')) == str(company_id)), None)
            if company:
                customer_name = company.get('Company Name', customer_name)
                customer_email = company.get('EmailID', customer_email)
        except Exception as e:
            app.logger.error(f"Error looking up company info: {str(e)}")
    
    # Ensure values are stored in both places for consistency
    if customer_name or customer_email:
        if not isinstance(selected_company, dict):
            selected_company = {}
        
        if customer_name:
            selected_company['name'] = customer_name
            session['company_name'] = customer_name
        if customer_email:
            selected_company['email'] = customer_email
            session['company_email'] = customer_email
        
        session['selected_company'] = selected_company

    # Ensure all items have required fields and calculate subtotal
    subtotal = 0
    for item in cart.get('products', []):
        # Ensure all required fields exist with defaults
        item.setdefault('type', '')
        item.setdefault('quantity', 1)
        item.setdefault('discount_percent', 0)
        item.setdefault('gst_percent', 18)  # Default GST for mpack
        item.setdefault('unit_price', 0)
        item.setdefault('base_price', 0)
        item.setdefault('bar_price', 0)
        
        if item['type'] == 'mpack':
            # Calculate mpack total matching cart template's approach
            price = float(item['unit_price'])
            quantity = int(item['quantity'])
            discount_percent = float(item['discount_percent'])
            gst_percent = float(item['gst_percent'])
            
            subtotal = price * quantity
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            price_after_discount = subtotal - discount_amount
            gst_amount = (price_after_discount * gst_percent / 100) if gst_percent else 0
            final_total = price_after_discount + gst_amount
            
            # Store calculations in the item
            item['calculations'] = {
                'unit_price': round(price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'price_after_discount': round(price_after_discount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
            
        elif item['type'] == 'blanket':
            # Calculate blanket total matching cart template's approach
            base_price = float(item.get('base_price', 0))
            bar_price = float(item.get('bar_price', 0))
            quantity = int(item.get('quantity', 1))
            discount_percent = float(item.get('discount_percent', 0))
            gst_percent = float(item.get('gst_percent', 18))
            
            # Calculate unit price as base + bar price
            unit_price = base_price + bar_price
            
            # Calculate subtotal (unit price * quantity)
            subtotal = unit_price * quantity
            
            # Calculate discount amount
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            
            # Apply discount to get discounted subtotal
            discounted_subtotal = subtotal - discount_amount
            
            # Calculate GST on discounted amount
            gst_amount = (discounted_subtotal * gst_percent / 100)
            
            # Final total after discount and GST
            final_total = discounted_subtotal + gst_amount
            
            # Store calculations in the item
            item['calculations'] = {
                'base_price': round(base_price, 2),
                'bar_price': round(bar_price, 2),
                'unit_price': round(unit_price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'discounted_subtotal': round(subtotal - discount_amount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
            
        else:
            # Handle other product types
            price = float(item.get('unit_price', 0))
            quantity = int(item.get('quantity', 1))
            discount_percent = float(item.get('discount_percent', 0))
            gst_percent = float(item.get('gst_percent', 12))
            
            subtotal = price * quantity
            discount_amount = (subtotal * discount_percent / 100) if discount_percent else 0
            discounted_subtotal = subtotal - discount_amount
            gst_amount = (discounted_subtotal * gst_percent / 100) if gst_percent else 0
            final_total = discounted_subtotal + gst_amount
            
            item['calculations'] = {
                'unit_price': round(price, 2),
                'quantity': quantity,
                'subtotal': round(subtotal, 2),
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'gst_percent': gst_percent,
                'gst_amount': round(gst_amount, 2),
                'final_total': round(final_total, 2)
            }
            item_subtotal = final_total
        
        subtotal += item_subtotal
    
    # Calculate final totals with appropriate tax rates and discounts
    subtotal_blankets = 0
    subtotal_mpacks = 0
    discount_blankets = 0
    discount_mpacks = 0
    
    for item in cart.get('products', []):
        item_calc = item.get('calculations', {})
        item_subtotal = item_calc.get('subtotal', 0)
        item_discount = item_calc.get('discount_amount', 0)
        
        if item.get('type') == 'blanket':
            subtotal_blankets += item_subtotal
            discount_blankets += item_discount
        else:  # Assume mpacks for other types
            subtotal_mpacks += item_subtotal
            discount_mpacks += item_discount
    
    # Calculate amounts after discount
    subtotal_after_discount_blankets = max(0, subtotal_blankets - discount_blankets)
    subtotal_after_discount_mpacks = max(0, subtotal_mpacks - discount_mpacks)
    
    # Calculate GST for each category (on discounted amount)
    gst_blankets = subtotal_after_discount_blankets * 0.18  # 18% GST for blankets
    gst_mpacks = subtotal_after_discount_mpacks * 0.12      # 12% GST for mpacks
    
    # Calculate final totals
    subtotal_before_discount = subtotal_blankets + subtotal_mpacks
    total_discount = discount_blankets + discount_mpacks
    subtotal_after_discount = subtotal_after_discount_blankets + subtotal_after_discount_mpacks
    total_gst = gst_blankets + gst_mpacks
    total = subtotal_after_discount + total_gst
    
    # Round to 2 decimal places for display
    subtotal_before_discount = round(subtotal_before_discount, 2)
    total_discount = round(total_discount, 2)
    subtotal_after_discount = round(subtotal_after_discount, 2)
    total = round(total, 2)
    total_gst = round(total_gst, 2)

    # Ensure session is saved before rendering the template
    session.modified = True
    
    # Calculate cart_total as the subtotal after discount but before taxes
    cart_total = subtotal_after_discount
    
    context = {
        'cart': cart,
        'quote_date': quote_date,
        'quote_time': quote_time,
        'company_name': customer_name,
        'company_email': customer_email,
        'now': current_datetime,  # Add current datetime object for the template
        'calculations': {
            'subtotal_before_discount': subtotal_before_discount,
            'total_discount': total_discount,
            'subtotal_after_discount': subtotal_after_discount,
            'total': total,
            'gst_breakdown': {
                'blankets': {
                    'subtotal': round(subtotal_blankets, 2),
                    'discount': round(discount_blankets, 2),
                    'subtotal_after_discount': round(subtotal_after_discount_blankets, 2),
                    'gst': round(gst_blankets, 2),
                    'rate': 18
                },
                'mpacks': {
                    'subtotal': round(subtotal_mpacks, 2),
                    'discount': round(discount_mpacks, 2),
                    'subtotal_after_discount': round(subtotal_after_discount_mpacks, 2),
                    'gst': round(gst_mpacks, 2),
                    'rate': 12
                },
                'total_gst': round(total_gst, 2)
            }
        },
        'cart_total': subtotal_after_discount  # cart_total is the subtotal after discount but before taxes
    }
    
    return render_template('user/quotation.html', **context)

# ---------------------------------------------------------------------------
# Send Quotation Route
# ---------------------------------------------------------------------------
@app.route('/send_quotation', methods=['POST'])
@login_required
@company_required
def send_quotation():
    """Generate quotation from current cart and email it to customer and CGI."""
    try:
        # Parse optional notes from request body
        data = request.get_json() or {}
        notes = (data.get('notes') or '').strip()

        # Fetch cart
        cart = get_user_cart()
        products = cart.get('products', [])
    except Exception as e:
        app.logger.error(f"Error fetching cart or parsing data: {str(e)}")
        return jsonify({
            'error': f'Failed to fetch cart or parse data: {str(e)}',
            'details': str(e)
        }), 500

    try:
        if not products:
            return jsonify({'error': 'Cart is empty'}), 400

        # Get company info with proper fallbacks - prioritize database over session
        customer_name = 'Not specified'
        customer_email = ''
        
        # First try to get from user's company_id if available
        if hasattr(current_user, 'company_id') and current_user.company_id:
            customer_name = get_company_name_by_id(current_user.company_id)
            customer_email = get_company_email_by_id(current_user.company_id)
        
        # If not found in user's company_id, try session
        if customer_name == 'Not specified' or not customer_email:
            selected_company = session.get('selected_company', {})
            if not isinstance(selected_company, dict):
                selected_company = {}
            
            # Get from session if available
            if not customer_email:
                customer_email = (
                    selected_company.get('email') or 
                    session.get('company_email') or 
                    (hasattr(current_user, 'email') and current_user.email) or 
                    ''
                )
            
            if customer_name == 'Not specified':
                customer_name = (
                    selected_company.get('name') or 
                    session.get('company_name') or 
                    (hasattr(current_user, 'company_name') and current_user.company_name) or 
                    'Not specified'
                )
        
        # Final fallback to user's email if still no email
        if not customer_email and hasattr(current_user, 'email'):
            customer_email = current_user.email
        
        if not customer_email:
            return jsonify({'error': 'Customer email is required'}), 400
            
        # Update session with the latest values
        if customer_name and customer_name != 'Not specified':
            # Update user's company info in database if using MongoDB
            if MONGO_AVAILABLE and USE_MONGO and hasattr(current_user, 'id'):
                try:
                    users_col.update_one(
                        {'_id': current_user.id},
                        {'$set': {
                            'company_name': customer_name,
                            'company_email': customer_email,
                            'company_id': current_user.company_id if hasattr(current_user, 'company_id') else None
                        }}
                    )
                except Exception as e:
                    app.logger.error(f"Error updating user's company info: {str(e)}")
            
            # Update session
            session['company_name'] = customer_name
            session['company_email'] = customer_email
            session['selected_company'] = {
                'name': customer_name,
                'email': customer_email,
                'id': current_user.company_id if hasattr(current_user, 'company_id') else session.get('company_id', '')
            }
            session.modified = True

        # Send to customer, operations email, and current user (remove duplicates)
        user_email = current_user.email if hasattr(current_user, 'email') else None
        recipients = list({email for email in [customer_email, 'operations@chemo.in', user_email] if email})

        # Get current date in India timezone
        today = get_india_time().strftime('%d/%m/%Y')

        # Table rows with header
        rows_html = """
        <table style='width: 100%; border-collapse: collapse; margin: 20px 0;'>
            <thead>
                <tr style='background-color: #1a5276; color: white;'>
                    <th style='padding: 10px; text-align: left;'>Item</th>
                    <th style='padding: 10px; text-align: left;'>Machine</th>
                    <th style='padding: 10px; text-align: left;'>Product Type</th>
                    <th style='padding: 10px; text-align: left;'>Type</th>
                    <th style='padding: 10px; text-align: left;'>Thickness</th>
                    <th style='padding: 10px; text-align: left;'>Size</th>
                    <th style='padding: 10px; text-align: left;'>Barri...</th>
                    <th style='padding: 10px; text-align: right;'>Qty</th>
                    <th style='padding: 10px; text-align: right;'>Price</th>
                    <th style='padding: 10px; text-align: right;'>Discount</th>
                </tr>
            </thead>
            <tbody>
        """
        
        subtotal = 0
        for idx, p in enumerate(products, start=1):
            machine = p.get('machine', '')
            prod_type = p.get('type', '')
            
            # Dimensions
            if p.get('size'):
                dimensions = p['size']
            else:
                length = p.get('length') or ''
                width = p.get('width') or ''
                unit = p.get('unit', '')
                dimensions = f"{length} x {width} {unit}" if length and width else '----'
            
            qty = p.get('quantity', 1)
            
            # Calculate total based on product type
            if prod_type == 'mpack':
                # Always recalculate MPack totals to ensure fresh values after quantity changes
                unit_price = float(p.get('unit_price', 0))
                discount_percent = float(p.get('discount_percent', 0))
                gst_percent = float(p.get('gst_percent', 12))  # 12% GST for MPack

                subtotal_val = unit_price * qty
                discount_amount = (subtotal_val * discount_percent / 100) if discount_percent else 0
                taxable_amount = subtotal_val - discount_amount
                gst_amount = taxable_amount * gst_percent / 100
                total_val = taxable_amount + gst_amount
                
                # Store discount percent for email template
                p['discount_percent_display'] = discount_percent
                
                # Add discount percent to calculations for display
                p['calculations'] = p.get('calculations', {})
                p['calculations']['discount_percent'] = discount_percent

                # Update (or create) calculations dict so subsequent routes remain consistent
                p['calculations'] = {
                    'unit_price': round(unit_price, 2),
                    'quantity': qty,
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'taxable_amount': round(taxable_amount, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_total': round(total_val, 2)
                }
                
            elif prod_type == 'blanket':
                # Always recalculate Blanket totals as well
                base_price = float(p.get('base_price', 0))
                bar_price = float(p.get('bar_price', 0))
                unit_price = base_price + bar_price
                discount_percent = float(p.get('discount_percent', 0))
                gst_percent = float(p.get('gst_percent', 18))

                subtotal_val = unit_price * qty
                discount_amount = subtotal_val * discount_percent / 100 if discount_percent else 0
                taxable_amount = subtotal_val - discount_amount
                gst_amount = taxable_amount * gst_percent / 100
                total_val = taxable_amount + gst_amount

                # Sync calculations back to product
                p['calculations'] = {
                    'unit_price': round(unit_price, 2),
                    'quantity': qty,
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'taxable_amount': round(taxable_amount, 2),
                    'gst_percent': gst_percent,
                    'gst_amount': round(gst_amount, 2),
                    'final_total': round(total_val, 2)
                }
            
            subtotal += total_val
            
            rows_html += f"""
                <tr>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{idx}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{machine}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{'Underpacking' if prod_type == 'mpack' else prod_type if prod_type else '----'}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>
                        {p.get('blanket_type', p.get('name', '----')) if prod_type == 'blanket' 
                        else p.get('underpacking_type', '----').replace('_', ' ').title() if prod_type == 'mpack' 
                        else p.get('name', '----')}
                    </td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('thickness', '----')}{' mm' if p.get('type') == 'blanket' and p.get('thickness') else (' mm' if p.get('thickness') and not str(p.get('thickness', '')).endswith(('mm', 'micron', 'in', 'cm')) and float(p.get('thickness', 0)) >= 1 else '')}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{dimensions}</td>
                    <td style='padding: 8px; border: 1px solid #ddd;'>{p.get('bar_type', '----') if prod_type == 'blanket' else '----'}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{qty}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>₹{p.get('unit_price', p.get('base_price', 0)):,.2f}</td>
                    <td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{p.get('discount_percent', 0):.1f}%</td>
                </tr>
            """
        
        # Close the table
        rows_html += """
            </tbody>
        </table>
        <p>For more information, please contact: <a href='mailto:info@chemo.in'>info@chemo.in</a></p>
        <p>This quotation is not a contract or invoice. It is our best estimate.</p>
        """

        # Calculate discount information from products
        blanket_discounts = [p.get('discount_percent', 0) for p in products if p.get('type') == 'blanket' and p.get('discount_percent', 0) > 0]
        mpack_discounts = [p.get('discount_percent', 0) for p in products if p.get('type') == 'mpack' and p.get('discount_percent', 0) > 0]
        
        # Generate discount text for email
        discount_text = []
        if blanket_discounts:
            discount_text.append(f"{max(blanket_discounts):.1f}% ")
        if mpack_discounts:
            discount_text.append(f"{max(mpack_discounts):.1f}% ")
        discount_text = ", ".join(discount_text)
        
        # Recalculate all product amounts to ensure consistency
        for p in products:
            # Get basic values with proper defaults
            unit_price = float(p.get('unit_price', 0) or 0)
            quantity = int(p.get('quantity', 1) or 1)
            discount_percent = float(p.get('discount_percent', 0) or 0)
            
            # Calculate basic values
            total_price = unit_price * quantity
            discount_amount = (total_price * discount_percent) / 100
            taxable_amount = total_price - discount_amount
            
            # Determine GST rate based on product type
            product_type = p.get('type')
            if product_type == 'blanket':
                gst_rate = 0.18  # 18% for blankets
            elif product_type == 'mpack':
                gst_rate = 0.12  # 12% for mpack
            else:
                gst_rate = 0.18  # Default to 18%
            
            # Calculate GST and final amount
            gst_amount = round(taxable_amount * gst_rate, 2)
            final_total = round(taxable_amount + gst_amount, 2)
            
            # Update product calculations
            p['calculations'] = {
                'unit_price': unit_price,
                'quantity': quantity,
                'discount_percent': discount_percent,
                'discount_amount': round(discount_amount, 2),
                'taxable_amount': round(taxable_amount, 2),
                'gst_rate': int(gst_rate * 100),  # Store as percentage
                'gst_amount': gst_amount,
                'total_price': round(total_price, 2),
                'final_total': final_total
            }
        
        # Calculate totals from recalculated product data
        subtotal = sum(
            float(p.get('calculations', {}).get('total_price', 0) or 0)
            for p in products
        )
        
        total_discount = sum(
            float(p.get('calculations', {}).get('discount_amount', 0) or 0)
            for p in products
        )
        
        total_gst = sum(
            float(p.get('calculations', {}).get('gst_amount', 0) or 0)
            for p in products
        )
        
        # Calculate total amount after GST
        total_post_gst = round((subtotal - total_discount) + total_gst, 2)
        
        # Ensure no negative values
        subtotal = max(0, subtotal)
        total_discount = max(0, total_discount)
        total_gst = max(0, total_gst)
        total_post_gst = max(0, total_post_gst)
        
        # Determine if we should show the discount row
        show_discount = bool(blanket_discounts or mpack_discounts)
        
        # Generate a sequential quote ID
        quote_id = get_next_quote_id()

        # Build email content with improved table layout and consistent white background
        email_content = f"""
        <div style='font-family: Arial, sans-serif; color: #333; max-width: 1200px; margin: 0 auto; line-height: 1.6; background-color: #e0caa9; padding: 20px;'>
          <div style='background-color: white; border-radius: 0.5rem; box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075); padding: 2rem; margin-bottom: 1.5rem;'>
            <div style='text-align: center; margin-bottom: 2rem;'>
              <img src='https://i.ibb.co/1GVLnJcc/image-2025-07-04-163516213.png' alt='CGI Logo' style='max-width: 200px; margin-bottom: 1rem;'>
              <h2 style='margin: 0 0 0.5rem 0; color: #2c3e50;'>QUOTATION</h2>
              <p style='color: #6c757d; margin: 0; font-size: 0.9rem;'>{today}</p>
            </div>
            
            <div style='display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem;'>
              <!-- Company Information -->
              <div style='flex: 1; min-width: 300px; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden; background-color: white;'>
                <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125); display: flex; justify-content: space-between; align-items: center;'>
                  <h5 style='margin: 0; font-size: 1rem;'>Company Information</h5>
                  <span style='background-color: #198754; color: white; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 10px;'>Verified</span>
                </div>
                <div style='padding: 1.25rem; height: 100%; display: flex; flex-direction: column;'>
                  <div style='flex: 1;'>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Company Name</div>
                      <div style='font-weight: 600;'>CGI - Chemo Graphics INTERNATIONAL</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Address</div>
                      <div>113, 114 High Tech Industrial Centre,<br>Caves Rd, Jogeshwari East,<br>Mumbai, Maharashtra 400060</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Email</div>
                      <div><a href='mailto:info@chemo.in' style='color: #0d6efd; text-decoration: none;'>info@chemo.in</a></div>
                    </div>
                  </div>
                  <div style='padding-top: 1rem; margin-top: auto; border-top: 1px solid #e9ecef;'>
                    <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Prepared by:</div>
                    <div style='font-weight: 600;'>{current_user.username}</div>
                    <div><a href='mailto:{current_user.email}' style='color: #0d6efd; text-decoration: none;'>{current_user.email}</a></div>
                  </div>
                </div>
              </div>
              
              <!-- Customer Information -->
              <div style='flex: 1; min-width: 300px; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden; background-color: white;'>
                <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125); display: flex; justify-content: space-between; align-items: center;'>
                  <h5 style='margin: 0; font-size: 1rem;'>Customer Information</h5>
                  <span style='background-color: #198754; color: white; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 10px;'>Verified</span>
                </div>
                <div style='padding: 1.25rem; height: 100%; display: flex; flex-direction: column;'>
                  <div style='flex: 1;'>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Company Name</div>
                      <div style='font-weight: 600;'>{customer_name}</div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Email</div>
                      <div><a href='mailto:{customer_email}' style='color: #0d6efd; text-decoration: none;'>{customer_email}</a></div>
                    </div>
                    <div style='margin-bottom: 1rem;'>
                      <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Date</div>
                      <div>{today}</div>
                    </div>
                  </div>
                  <div style='padding-top: 1rem; margin-top: auto; border-top: 1px solid #e9ecef;'>
                    <div style='color: #6c757d; font-size: 0.8rem; margin-bottom: 0.25rem;'>Quotation #</div>
                    <div style='font-weight: 600;'>{quote_id}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style='margin: 1.5rem 0; border: 1px solid #dee2e6; border-radius: 0.25rem; overflow: hidden;'>
              <div style='background-color: #f8f9fa; padding: 0.75rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.125);'>
                <h5 style='margin: 0; font-size: 1rem;'>Quotation Details</h5>
              </div>
              <div style='padding: 1.5rem; background-color: white;'>
                <p style='margin-bottom: 1rem;'>Hello,</p>
                <p style='margin-bottom: 1rem;'>This is {current_user.username} from CGI.</p>
                <p style='margin-bottom: 1.5rem;'>Here is the proposed quotation for the required products:</p>
                {'<p style="margin-bottom: 1.5rem;"><strong>Notes:</strong><br>' + notes + '</p>' if notes else ''}
                
                <div style='overflow-x: auto; margin: 1.5rem 0;'>
{rows_html}
                </div>
                
                <!-- Tax and Total Breakdown -->
                <div style='margin: 2rem 0;'>
                    <div style='display: flex; justify-content: flex-end;'>
                        <div style='width: 50%;'>
                            <table style='width: 100%; border-collapse: collapse;'>
                                <tbody>
                                    <tr>
                                        <td style='padding: 8px; text-align: right; width: 70%;'>Subtotal (Pre-Discount):</td>
                                        <td style='padding: 8px; text-align: right; width: 30%;'>₹{sum((p.get('unit_price', p.get('base_price', 0))) * p.get('quantity', 1) for p in products):,.2f}</td>
                                    </tr>
                                    {f'''
                                    <tr style="display: {'table-row' if show_discount else 'none'};">
                                        <td style="padding: 8px; text-align: right;">Discount :</td>
                                        <td style="padding: 8px; text-align: right; color: #dc3545;">-₹{total_discount:,.2f}</td>
                                    </tr>
                                    ''' if True else ''}
                                    <tr style='border-top: 1px solid #dee2e6;'>
                                        <td style='padding: 8px; text-align: right; font-weight: bold;'>Total (Pre-GST):</td>
                                        <td style='padding: 8px; text-align: right; font-weight: bold;'>₹{sum(p.get("calculations", {}).get("taxable_amount", p.get("calculations", {}).get("subtotal", 0)) for p in products):,.2f}</td>
                                    </tr>
                                
                                    {f'''
                                    <tr>
                                        <td style='padding: 8px; text-align: right;'>GST (9.0% CGST + 9.0% SGST):</td>
                                        <td style='padding: 8px; text-align: right;'>₹{sum(p.get("calculations", {}).get("gst_amount", 0) for p in products if p.get("type") == "blanket"):,.2f}</td>
                                    </tr>
                                    ''' if any(p.get("type") == "blanket" for p in products) else ''}
                                    
                                    {f'''
                                    <tr>
                                        <td style='padding: 8px; text-align: right;'>GST (12.0%):</td>
                                        <td style='padding: 8px; text-align: right;'>₹{sum(p.get("calculations", {}).get("gst_amount", 0) for p in products if p.get("type") == "mpack"):,.2f}</td>
                                    </tr>
                                    ''' if any(p.get("type") == "mpack" for p in products) else ''}
                                    
                                    <tr style='border-top: 1px solid #dee2e6;'>
                                        <td style='padding: 8px; text-align: right; font-weight: bold;'>Total:</td>
                                        <td style='padding: 8px; text-align: right; font-weight: bold;'>₹{sum(p.get("calculations", {}).get("final_total", 0) for p in products):,.2f}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <p style='margin: 2rem 0 1rem 0;'>Thank you for your business!<br>— Team CGI</p>
              </div>
            </div>
            
            <div style='margin-top: 1.5rem; padding: 1rem; background-color: #f8f9fa; border-radius: 0.25rem; text-align: center;'>
              <p style='color: #6c757d; font-size: 0.8rem; margin: 0;'>
                This quotation is not a contract or invoice. It is our best estimate.
              </p>
            </div>
          </div>
        </div>
        """

        # Total is same as subtotal since amounts already include any taxes
        total = subtotal
        

        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg['To'] = ', '.join(recipients)
        msg['Subject'] = f"Quotation from Chemo INTERNATIONAL - {today}"
        
        # Attach HTML version
        part = MIMEText(email_content, 'html')
        msg.attach(part)


        # Initialize email_sent flag
        email_sent = False
        
        # Check if email configuration is valid
        if all([SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD]):
            try:
                # Send the email
                if str(SMTP_PORT) == '465':
                    server = smtplib.SMTP_SSL(SMTP_SERVER, int(SMTP_PORT))
                else:
                    server = smtplib.SMTP(SMTP_SERVER, int(SMTP_PORT))
                    if str(SMTP_PORT) == '587':  # Explicitly use STARTTLS for port 587
                        server.starttls()
                
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
                server.quit()
                app.logger.info("Quotation email sent successfully")
                email_sent = True
            except Exception as e:
                app.logger.error(f"Failed to send email: {str(e)}")
                email_sent = False
        else:
            app.logger.warning("Email configuration is incomplete. Email will not be sent.")

        # Prepare quotation data for database
        quotation_data = {
            'quote_id': quote_id,
            'user_id': str(current_user.id) if hasattr(current_user, 'id') else '',
            'username': current_user.username if hasattr(current_user, 'username') else '',
            'user_email': current_user.email if hasattr(current_user, 'email') else '',
            'company_name': customer_name,  # This is the company name, not necessarily the user's name
            'company_email': customer_email,  # This is the company email
            'customer_name': customer_name,  # For backward compatibility
            'customer_email': customer_email,  # For backward compatibility
            'products': products,
            'subtotal': round(float(subtotal), 2),
            'total_discount': round(float(total_discount), 2),
            'total_gst': round(float(total_gst), 2),
            'total_amount': round(float(total_post_gst), 2),
            'total_amount_pre_gst': max(0, round(float(subtotal - total_discount), 2)),  # Ensure non-negative
            'notes': notes,
            'date_created': get_india_time(),
            'email_content': email_content
        }
        
        # Save to database
        saved_quote_id = save_quotation_to_db(quotation_data)
        if not saved_quote_id:
            app.logger.error("Failed to save quotation to database")
        else:
            app.logger.info(f"Quotation saved to database with ID: {saved_quote_id}")
        
        # Clear cart after saving to database and attempting to send email
        clear_cart()
        
        # Keep selected_company in the session
        # This ensures the company selection persists after sending a quotation
        
        return jsonify({
            'success': True,
            'message': 'Quotation processed successfully',
            'email_sent': email_sent,
            'quote_id': quote_id,
            'company': {
                'id': session.get('selected_company', {}).get('id'),
                'name': session.get('selected_company', {}).get('name'),
                'email': session.get('selected_company', {}).get('email')
            }
        })
    except Exception as e:
        app.logger.error(f"Error sending quotation: {str(e)}")
        return jsonify({
            'error': 'Failed to send quotation',
            'details': str(e)
        }), 500

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
                msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
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
            if not ensure_mongo_users_initialized():
                app.logger.error("[REGISTER] users_col not initialized")
                return jsonify({'error': 'Authentication service unavailable'}), 503
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
            'redirectTo': '/index',  # Redirect to index after successful registration
            'user': {
                'id': new_user.id,
                'email': new_user.email,
                'username': new_user.username
            }
        })
        
    except Exception as e:
        print(f"Registration error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/login', methods=['GET', 'POST', 'OPTIONS'])
def api_login():
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'success': True})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    try:
        app.logger.info("=== Login Request ===")
        app.logger.info(f"Method: {request.method}")
        
        # Check content type to determine how to parse the request
        content_type = request.headers.get('Content-Type', '').lower()
        
        if 'application/json' in content_type:
            data = request.get_json()
            if not data:
                app.logger.error("No JSON data received")
                return jsonify({
                    'success': False,
                    'error': 'No JSON data received',
                    'message': 'Please provide login credentials in JSON format'
                }), 400
        else:
            data = request.form.to_dict()
            if not data:
                app.logger.error("No form data received")
                return jsonify({
                    'success': False,
                    'error': 'No form data received',
                    'message': 'Please provide login credentials'
                }), 400

        identifier = (data.get('identifier') or data.get('email') or data.get('username', '')).strip()
        password = (data.get('password') or '').strip()
        
        app.logger.info(f'Login attempt - Identifier: {identifier}')
        
        if not identifier or not password:
            app.logger.error('Login failed: Missing identifier or password')
            return jsonify({
                'success': False,
                'error': 'Email/username and password are required',
                'message': 'Please provide both email/username and password'
            }), 400

        # Check if MongoDB is available and should be used
        if not MONGO_AVAILABLE or not USE_MONGO or not ensure_mongo_users_initialized():
            error_msg = 'MongoDB authentication is required but not available'
            app.logger.error(error_msg)
            return jsonify({
                'success': False,
                'error': 'Authentication service unavailable',
                'message': 'Authentication service is currently unavailable. Please try again later.'
            }), 503
            
        try:
            from mongo_users import find_user_by_email_or_username, verify_password
            
            app.logger.info('=== MongoDB Authentication ===')
            app.logger.info(f'Database: {users_col.database.name}')
            app.logger.info(f'Collection: {users_col.name}')
            app.logger.info(f'Looking up user: {identifier}')
            
            # Find user by email or username in Mongo (case-insensitive)
            doc = find_user_by_email_or_username(identifier)
            
            if not doc:
                app.logger.warning(f'User not found: {identifier}')
                return jsonify({
                    'success': False,
                    'error': 'Invalid credentials',
                    'message': 'Invalid email/username or password. Please try again.'
                }), 401
            
            app.logger.info(f'User found - ID: {doc.get("_id")}, Email: {doc.get("email")}')
            
            # Verify password
            app.logger.info('Verifying password...')
            if not verify_password(doc, password):
                app.logger.warning('Password verification failed')
                return jsonify({
                    'success': False,
                    'error': 'Invalid credentials',
                    'message': 'Invalid email/username or password. Please try again.'
                }), 401
            
            # Create user object for Flask-Login
            user = User(
                id=str(doc['_id']),
                email=doc['email'],
                username=doc['username'],
                password_hash=doc['password_hash'],
                is_verified=doc.get('is_verified', False),
                otp_verified=doc.get('otp_verified', False),
                company_id=doc.get('company_id'),
                role=doc.get('role', 'user')
            )
            
            # Log in the user
            login_user(user, remember=True)
            
            # Update last login timestamp
            try:
                users_col.update_one(
                    {'_id': doc['_id']},
                    {'$set': {'last_login': datetime.utcnow()}}
                )
            except Exception as e:
                app.logger.error(f'Error updating last login: {str(e)}')
            
            # Set session variables
            session['user_id'] = str(user.id)
            session['user_email'] = user.email
            session['username'] = user.username
            
            app.logger.info(f'Successfully logged in user: {user.email}')
            
            # Return success response
            return jsonify({
                'success': True,
                'message': 'Login successful',
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'username': user.username,
                    'is_verified': user.is_verified,
                    'otp_verified': user.otp_verified,
                    'company_id': user.company_id,
                    'role': user.role
                },
                'redirectTo': '/index'
            })
            
        except Exception as e:
            app.logger.error(f'Error during login: {str(e)}')
            app.logger.error(traceback.format_exc())
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'An error occurred during authentication. Please try again.'
            }), 500
            
    except Exception as e:
        app.logger.error(f'Unexpected error in login endpoint: {str(e)}')
        app.logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An unexpected error occurred. Please try again later.'
        }), 500

@app.route('/api/auth/logout', methods=['GET', 'POST'])
@login_required
def api_logout():
    try:
        logout_user()
        session.clear()  # Clear the session data
        if request.method == 'POST':
            return jsonify({'success': True, 'message': 'Logged out successfully'})
        return redirect(url_for('login'))
    except Exception as e:
        print(f"Logout error: {str(e)}")
        if request.method == 'POST':
            return jsonify({'error': 'Internal server error'}), 500
        flash('An error occurred during logout', 'error')
        return redirect(url_for('home'))

@app.route('/api/auth/user', methods=['GET'])
def api_user():
    try:
        if current_user.is_authenticated:
            user_data = {
                'success': True,
                'user': {
                    'id': current_user.id,
                    'email': current_user.email,
                    'username': current_user.username,
                    'company_id': getattr(current_user, 'company_id', None)
                }
            }
            return jsonify(user_data)
        else:
            return jsonify({'error': 'Not logged in'}), 401
    except Exception as e:
        print(f"User error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/profile/account')
@login_required
def api_profile_account():
    user = current_user
    return jsonify({
        'username': user.username,
        'email': user.email,
        'created_at': user.created_at.strftime('%Y-%m-%d'),
        'company_id': user.company_id,
        'role': user.role if hasattr(user, 'role') else 'user'
    })



@app.route('/api/profile/update', methods=['POST'])
@login_required
def api_profile_update():
    data = request.get_json()
    user_id = current_user.get_id()
    
    if not user_id:
        return jsonify({'error': 'User not found'}), 404
    
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            user = mu_find_user_by_id(user_id)
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            # Update user fields
            if 'username' in data:
                user['username'] = data['username']
            if 'email' in data:
                user['email'] = data['email']
            
            # Save to MongoDB
            mu_update_user(user_id, user)
            
            return jsonify({'success': True, 'message': 'Profile updated successfully'})
        else:
            return jsonify({'error': 'Database not available'}), 500
            
    except Exception as e:
        app.logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500

# Admin Dashboard
@app.route('/admin/dashboard')
@login_required
def admin_dashboard():
    """Admin dashboard view – accessible only to users with role 'admin'.
    Adds verbose logging so we can debug any remaining 403 errors in prod.
    """
    # Extra diagnostics
    app.logger.info("[ADMIN_DASH] is_authenticated=%s, role=%s", current_user.is_authenticated, getattr(current_user, 'role', None))

    if not current_user.is_authenticated:
        app.logger.warning("[ADMIN_DASH] Anonymous access – redirecting to login")
        return redirect(url_for('login', next=request.path))

    if getattr(current_user, 'role', None) != 'admin':
        app.logger.warning("[ADMIN_DASH] Forbidden – user %s lacks admin role", current_user.get_id())
        abort(403)

    return render_template('admin/dashboard.html', title='Admin Dashboard', user=current_user)

# Admin Dashboard API Endpoints
@app.route('/api/admin/stats')
@login_required
def admin_stats():
    """Get admin dashboard statistics."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        stats = {
            'total_users': 0,
            'active_sessions': 0,
            'total_quotations': 0,
            'recent_activity': []
        }
        
        if MONGO_AVAILABLE and USE_MONGO:
            # Get total users count
            users_count = mongo_db.users.count_documents({})
            stats['total_users'] = users_count
            
            # Get total quotations count
            if 'quotations' in mongo_db.list_collection_names():
                stats['total_quotations'] = mongo_db.quotations.count_documents({})
            
            # Get active sessions (for now just count logged in users)
            # In a real app, you'd track active sessions in Redis or similar
            stats['active_sessions'] = 1  # Placeholder
            
            # Get recent activity (last 5 registered users)
            recent_users = list(mongo_db.users.find(
                {},
                {'username': 1, 'email': 1, 'created_at': 1, 'role': 1}
            ).sort('created_at', -1).limit(5))
            
            for user in recent_users:
                stats['recent_activity'].append({
                    'message': f"New user registered: {user.get('username', user.get('email', 'Unknown'))}",
                    'timestamp': user.get('created_at', datetime.utcnow()).strftime('%Y-%m-%d'),
                    'role': user.get('role', 'user')
                })
        else:
            # Fallback to JSON data
            users = _load_users_json()
            stats['total_users'] = len(users) if users else 0
            stats['active_sessions'] = 1
            
        return jsonify(stats)
    except Exception as e:
        app.logger.error(f"Error in admin_stats: {str(e)}")
        return jsonify({
            'error': 'Failed to load admin statistics',
            'total_users': 0,
            'active_sessions': 0,
            'total_quotations': 0,
            'recent_activity': []
        }), 500

# Admin Management Routes


def _serialize_admin_user_doc(user_doc):
    """Convert a user document into a JSON-serializable admin payload."""

    def _convert(value):
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, list):
            return [_convert(item) for item in value]
        if isinstance(value, dict):
            return {key: _convert(val) for key, val in value.items()}
        return value

    role = user_doc.get('role', 'user')
    customers_raw = user_doc.get('customers') or user_doc.get('customers_assigned') or []
    customers_clean = _convert(customers_raw)

    payload = {
        'id': _convert(user_doc.get('_id')),
        'username': user_doc.get('username', ''),
        'email': user_doc.get('email', ''),
        'role': role,
        'company_name': user_doc.get('company_name', ''),
        'company_id': _convert(user_doc.get('company_id', '')),
        'company_email': user_doc.get('company_email', ''),
        'is_verified': bool(user_doc.get('is_verified', False)),
        'customers': [] if role == 'admin' else customers_clean,
        'customers_count': 0 if role == 'admin' else len(customers_clean),
        'created_at': _convert(user_doc.get('created_at')),
        'updated_at': _convert(user_doc.get('updated_at')),
        'assigned_companies': _convert(user_doc.get('assigned_companies', [])),
    }

    for field in ('phone', 'status', 'last_login'):
        if field in user_doc:
            payload[field] = _convert(user_doc[field])

    return payload


@app.route('/api/admin/users', methods=['GET', 'POST'])
@login_required
def admin_manage_users():
    """Get list of all users or create a new user with customer assignments."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    if request.method == 'POST':
        # Handle user creation
        try:
            data = request.get_json()
            
            # Validate required fields
            required_fields = ['username', 'email', 'password', 'role']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            # Check if user already exists
            if MONGO_AVAILABLE and USE_MONGO:
                if mongo_db.users.find_one({'email': data['email'].lower()}):
                    return jsonify({'error': 'User with this email already exists'}), 400
            else:
                users = _load_users_json()
                if any(u.get('email', '').lower() == data['email'].lower() for u in users.values()):
                    return jsonify({'error': 'User with this email already exists'}), 400
            
            # Create user data
            user_data = {
                'username': data['username'].strip(),
                'email': data['email'].lower().strip(),
                'password_hash': generate_password_hash(data['password']),
                'role': data['role'].lower(),
                'is_verified': True,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'customers': []
            }
            
            # Add optional fields if provided
            if 'company_id' in data:
                user_data['company_id'] = data['company_id']
            if 'company_name' in data:
                user_data['company_name'] = data['company_name']
            
            # Save user to database
            if MONGO_AVAILABLE and USE_MONGO:
                result = mongo_db.users.insert_one(user_data)
                user_id = str(result.inserted_id)
            else:
                users = _load_users_json()
                user_id = str(uuid.uuid4())
                users[user_id] = user_data
                _save_users_json(users)
            
            # Assign customers if provided (and user is not admin)
            if data['role'].lower() != 'admin' and 'customers' in data and isinstance(data['customers'], list):
                for customer_id in data['customers']:
                    assign_customer_to_user(user_id, customer_id)
            
            return jsonify({
                'success': True,
                'message': 'User created successfully',
                'user_id': user_id
            }), 201
            
        except Exception as e:
            app.logger.error(f"Error creating user: {str(e)}")
            return jsonify({'error': 'Failed to create user'}), 500
    
    # Handle GET request (list users)
    try:
        users_list = []
        
        if MONGO_AVAILABLE and USE_MONGO:
            if not ensure_mongo_users_initialized():
                app.logger.error("[ADMIN] users_col not initialized before listing users")
                return jsonify({'error': 'Authentication service unavailable'}), 503

            for user_doc in mongo_db.users.find({}):
                users_list.append(_serialize_admin_user_doc(user_doc))
        else:
            for user_id, user in _load_users_json().items():
                doc = dict(user)
                doc['_id'] = user_id
                users_list.append(_serialize_admin_user_doc(doc))
        
        return jsonify({'success': True, 'users': users_list})
        
    except Exception as e:
        app.logger.error(f"Error getting users list: {str(e)}")
        return jsonify({'error': 'Failed to load users list'}), 500


# Remove the old GET /api/admin/users endpoint since we've combined it with POST
# in the route above
@login_required
def admin_get_users():
    """Get list of all users with their customer assignments."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        users_list = []
        
        if MONGO_AVAILABLE and USE_MONGO:
            if not ensure_mongo_users_initialized():
                app.logger.error("[ADMIN] users_col not initialized before listing users")
                return jsonify({'error': 'Authentication service unavailable'}), 503

            for user_doc in mongo_db.users.find({}):
                users_list.append(_serialize_admin_user_doc(user_doc))
        else:
            for user_id, user in _load_users_json().items():
                doc = dict(user)
                doc['_id'] = user_id
                users_list.append(_serialize_admin_user_doc(doc))
        
        return jsonify({'success': True, 'users': users_list})
        
    except Exception as e:
        app.logger.error(f"Error getting users list: {str(e)}")
        return jsonify({'error': 'Failed to load users list'}), 500


@app.route('/api/admin/users/<user_id>')
@login_required
def admin_get_user(user_id):
    """Get single user details with customer assignments."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            user_doc = mu_find_user_by_id(user_id)
            if user_doc:
                # Get customer assignments
                customer_ids = user_doc.get('customers', [])
                
                # If user is admin, they have access to all customers
                if user_doc.get('role') == 'admin':
                    customer_ids = []
                    
                user_data = {
                    'id': str(user_doc['_id']),
                    'username': user_doc.get('username', ''),
                    'email': user_doc.get('email', ''),
                    'role': user_doc.get('role', 'user'),
                    'company_name': user_doc.get('company_name', ''),
                    'company_id': user_doc.get('company_id', ''),
                    'is_verified': user_doc.get('is_verified', False),
                    'customers': customer_ids  # Include customer assignments
                }
                return jsonify({'success': True, 'user': user_data})
        else:
            # Fallback to JSON file
            users = _load_users_json()
            user = users.get(user_id)
            if user:
                customer_ids = user.get('customers', [])
                
                # If user is admin, they have access to all customers
                if user.get('role') == 'admin':
                    customer_ids = []
                    
                user_data = {
                    'id': user_id,
                    'username': user.get('username', ''),
                    'email': user.get('email', ''),
                    'role': user.get('role', 'user'),
                    'company_name': user.get('company_name', ''),
                    'company_id': user.get('company_id', ''),
                    'is_verified': user.get('is_verified', False),
                    'customers': customer_ids  # Include customer assignments
                }
                return jsonify({'success': True, 'user': user_data})
        
        return jsonify({'error': 'User not found'}), 404
        
    except Exception as e:
        app.logger.error(f"Error getting user: {str(e)}")
        return jsonify({'error': 'Failed to load user'}), 500


def save_quotation_to_db(quotation_data):
    """Save quotation to database."""
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            result = mongo_db.quotations.insert_one(quotation_data)
            return str(result.inserted_id)
        else:
            # For JSON fallback, you could save to a quotations.json file
            app.logger.warning("Quotation not saved - MongoDB not available")
            return None
    except Exception as e:
        app.logger.error(f"Error saving quotation: {str(e)}")
        return None



# Admin Management Routes
@app.route('/admin/manage-users')
@login_required
def admin_manage_users_page():
    """Admin user management page."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    return render_template('admin/manage_users.html', title='Manage Users', user=current_user)


@app.route('/admin/manage-customers')
@login_required
def admin_manage_customers():
    """Admin customer management page."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    return render_template('admin/manage_customers.html', title='Manage Customers', user=current_user)


@app.route('/admin/company-assignments')
@login_required
def manage_company_assignments():
    """Admin page for managing user-company assignments."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    return render_template('admin/manage_company_assignments.html', title='Manage Company Assignments', user=current_user)


@app.route('/api/admin/users/<user_id>', methods=['PUT'])
@login_required
def admin_update_user(user_id):
    """Update user details including customer assignments."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        data = request.get_json()
        update_data = {}
        
        # Basic user info updates
        if 'username' in data:
            update_data['username'] = data['username'].strip()
        if 'email' in data:
            update_data['email'] = data['email'].strip().lower()
        if 'role' in data:
            update_data['role'] = data['role'].lower()
        if 'password' in data and data['password'].strip():
            from werkzeug.security import generate_password_hash
            update_data['password_hash'] = generate_password_hash(data['password'].strip())
        
        update_data['updated_at'] = datetime.now()
        
        # Handle customer assignments if provided
        if 'customers' in data and isinstance(data['customers'], list):
            # First, get current assignments to determine what changed
            if MONGO_AVAILABLE and USE_MONGO:
                from bson import ObjectId
                current_user_data = mongo_db.users.find_one({'_id': ObjectId(user_id)})
            else:
                current_user_data = None
                if os.path.exists(USERS_FILE):
                    with open(USERS_FILE, 'r') as f:
                        users = json.load(f)
                        for u in users:
                            if str(u['id']) == str(user_id):
                                current_user_data = u
                                break
            
            if current_user_data:
                # Get current assignments
                current_customers = set(current_user_data.get('customers', []))
                new_customers = set(str(cid) for cid in data['customers'] if cid)
                
                # Find added and removed customers
                added_customers = new_customers - current_customers
                removed_customers = current_customers - new_customers
                
                # Update the user's customer list
                if MONGO_AVAILABLE and USE_MONGO:
                    mongo_db.users.update_one(
                        {'_id': ObjectId(user_id)},
                        {'$set': {'customers': list(new_customers)}}
                    )
                else:
                    if os.path.exists(USERS_FILE):
                        with open(USERS_FILE, 'r+') as f:
                            users = json.load(f)
                            for u in users:
                                if str(u['id']) == str(user_id):
                                    u['customers'] = list(new_customers)
                                    break
                            f.seek(0)
                            json.dump(users, f, indent=2)
                            f.truncate()
        
        # Update other user data
        if update_data:
            if MONGO_AVAILABLE and USE_MONGO:
                from bson import ObjectId
                result = mongo_db.users.update_one(
                    {'_id': ObjectId(user_id)},
                    {'$set': update_data}
                )
                
                if result.modified_count > 0 or 'customers' in data:
                    return jsonify({
                        'success': True, 
                        'message': 'User updated successfully',
                        'user_id': user_id
                    })
                else:
                    return jsonify({'error': 'User not found or no changes made'}), 404
            else:
                # JSON fallback
                updated = False
                if os.path.exists(USERS_FILE):
                    with open(USERS_FILE, 'r+') as f:
                        users = json.load(f)
                        for user in users:
                            if str(user['id']) == str(user_id):
                                user.update(update_data)
                                updated = True
                                break
                        if updated:
                            f.seek(0)
                            json.dump(users, f, indent=2)
                            f.truncate()
                
                if updated or 'customers' in data:
                    return jsonify({
                        'success': True, 
                        'message': 'User updated successfully',
                        'user_id': user_id
                    })
                else:
                    return jsonify({'error': 'User not found or no changes made'}), 404
        
        return jsonify({'error': 'No valid updates provided'}), 400
        
    except Exception as e:
        app.logger.error(f"Error updating user: {str(e)}")
        return jsonify({'error': 'Failed to update user'}), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@login_required
def admin_delete_user(user_id):
    """Delete user."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            from bson import ObjectId
            result = mongo_db.users.delete_one({'_id': ObjectId(user_id)})
            
            if result.deleted_count > 0:
                return jsonify({'success': True, 'message': 'User deleted successfully'})
            else:
                return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'error': 'Database not available'}), 500
        
    except Exception as e:
        app.logger.error(f"Error deleting user: {str(e)}")
        return jsonify({'error': 'Failed to delete user'}), 500

# Company Management APIs
        app.logger.error(f"Error fetching customers: {str(e)}")
        return jsonify({'error': 'Failed to fetch customers'}), 500


@app.route('/api/admin/companies', methods=['GET'])
@login_required
def admin_get_companies():
    """Get companies with pagination."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        page = int(request.args.get('page', 0))
        limit = int(request.args.get('limit', 10))
        skip = page * limit
        
        companies_list = []
        
        if MONGO_AVAILABLE and USE_MONGO:
            companies_cursor = mongo_db.companies.find({}).skip(skip).limit(limit)
            
            for company_doc in companies_cursor:
                company_data = {
                    'id': str(company_doc['_id']),
                    'name': company_doc.get('Company Name', ''),
                    'email': company_doc.get('EmailID', ''),
                    'address': company_doc.get('Address', ''),
                    'created_at': company_doc.get('created_at', '')
                }
                companies_list.append(company_data)
        
        return jsonify({'success': True, 'companies': companies_list})
        
    except Exception as e:
        app.logger.error(f"Error getting companies: {str(e)}")
        return jsonify({'error': 'Failed to load companies'}), 500

@app.route('/api/admin/companies/<company_id>')
@login_required
def get_company(company_id):
    """Get a single company by ID."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        if not company_id:
            return jsonify({'error': 'Company ID is required'}), 400
            
        if MONGO_AVAILABLE and USE_MONGO:
            from bson.objectid import ObjectId
            
            # Validate if the ID is a valid ObjectId
            if not ObjectId.is_valid(company_id):
                return jsonify({'error': 'Invalid company ID format'}), 400
                
            company_doc = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
            
            if not company_doc:
                return jsonify({'error': 'Company not found'}), 404
                
            company_data = {
                'id': str(company_doc['_id']),
                'name': company_doc.get('Company Name', ''),
                'email': company_doc.get('EmailID', ''),
                'address': company_doc.get('Address', ''),
                'phone': company_doc.get('Phone', ''),
                'gst_number': company_doc.get('GST Number', ''),
                'created_at': company_doc.get('created_at', '')
            }
            
            return jsonify({'success': True, 'company': company_data})
        else:
            # Fallback to JSON file
            companies_file = os.path.join('static', 'data', 'companies.json')
            if os.path.exists(companies_file):
                with open(companies_file, 'r') as f:
                    companies = json.load(f)
                    
                company = next((c for c in companies if str(c.get('id')) == company_id), None)
                if company:
                    return jsonify({'success': True, 'company': company})
            
            return jsonify({'error': 'Company not found'}), 404
            
    except Exception as e:
        app.logger.error(f"Error getting company: {str(e)}")
        return jsonify({'error': 'Failed to get company details'}), 500

@app.route('/api/admin/companies/search')
@login_required
def admin_search_companies():
    """Search companies."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        query = request.args.get('q', '').strip()
        companies_list = []
        
        if query and MONGO_AVAILABLE and USE_MONGO:
            import re
            regex_pattern = f'.*{re.escape(query)}.*'
            companies_cursor = mongo_db.companies.find({
                '$or': [
                    {'Company Name': {'$regex': regex_pattern, '$options': 'i'}},
                    {'EmailID': {'$regex': regex_pattern, '$options': 'i'}}
                ]
            }).limit(20)
            
            for company_doc in companies_cursor:
                company_data = {
                    'id': str(company_doc['_id']),
                    'name': company_doc.get('Company Name', ''),
                    'email': company_doc.get('EmailID', ''),
                    'address': company_doc.get('Address', '')
                }
                companies_list.append(company_data)
        
        return jsonify({'success': True, 'companies': companies_list})
        
    except Exception as e:
        app.logger.error(f"Error searching companies: {str(e)}")
        return jsonify({'error': 'Failed to search companies'}), 500

# Quotation Management
@app.route('/admin/quotations')
@login_required
def admin_quotations():
    """Admin quotations management page."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    return render_template('admin/quotations.html', title='Quotation Management', user=current_user)

@app.route('/api/admin/quotations')
@login_required
def admin_get_quotations():
    """Get all quotations for admin."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        quotations_list = []
        
        if MONGO_AVAILABLE and USE_MONGO:
            # Check if quotations collection exists
            if 'quotations' in mongo_db.list_collection_names():
                # Sort by date_created in descending order (newest first)
                quotations_cursor = mongo_db.quotations.find({}).sort('date_created', -1)
                
                for quot_doc in quotations_cursor:
                    # Format the date for display in IST (UTC+5:30)
                    created_at = quot_doc.get('date_created')
                    if created_at and isinstance(created_at, datetime):
                        # Convert UTC to IST (UTC+5:30)
                        ist = timezone(timedelta(hours=5, minutes=30))
                        created_at_ist = created_at.replace(tzinfo=timezone.utc).astimezone(ist)
                        formatted_date = created_at_ist.strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        formatted_date = str(created_at) if created_at else 'N/A'
                    
                    # Calculate total amount pre-GST (subtotal - discount)
                    subtotal = float(quot_doc.get('subtotal', 0))
                    discount = float(quot_doc.get('total_discount', 0))
                    total_pre_gst = max(0, subtotal - discount)
                    
                    quotation_data = {
                        'id': str(quot_doc.get('_id', '')),  # Use MongoDB _id as the primary ID
                        'quote_id': quot_doc.get('quote_id', ''),  # Human-readable quote ID
                        'user_id': quot_doc.get('user_id', ''),
                        'username': '',  # Not stored in quotation_data currently
                        'user_email': quot_doc.get('user_email', ''),
                        'company_name': quot_doc.get('customer_name', 'No Company'),
                        'company_email': quot_doc.get('customer_email', ''),
                        'total_amount_pre_gst': total_pre_gst,
                        'total_amount_post_gst': float(quot_doc.get('total_amount', 0)),
                        'created_at': formatted_date,
                        'products_count': len(quot_doc.get('products', []))
                    }
                    quotations_list.append(quotation_data)
        
        return jsonify({'success': True, 'quotations': quotations_list})
        
    except Exception as e:
        app.logger.error(f"Error getting quotations: {str(e)}")
        return jsonify({'error': 'Failed to load quotations'}), 500

@app.route('/api/admin/quotations/<quotation_id>')
@login_required
def admin_get_quotation_details(quotation_id):
    """Get detailed quotation for admin view."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    quotation = None
    try:
        if MONGO_AVAILABLE and USE_MONGO:
            from bson import ObjectId
            # Try to find by quote_id first
            quotation = mongo_db.quotations.find_one({'quote_id': quotation_id})
            
            # If not found by quote_id, try by _id if it looks like an ObjectId
            if not quotation and len(quotation_id) == 24:
                try:
                    quotation = mongo_db.quotations.find_one({'_id': ObjectId(quotation_id)})
                except Exception as e:
                    app.logger.warning(f"Invalid ObjectId format: {str(e)}")
                    pass
            
            if not quotation:
                return jsonify({'error': 'Quotation not found'}), 404
                
            # Get user details if user_id exists
            username = ''
            user_email = ''
            if 'user_id' in quotation:
                user = None
                if MONGO_AVAILABLE and USE_MONGO:
                    user = mongo_db.users.find_one({'_id': ObjectId(quotation['user_id'])})
                
                if not user and os.path.exists(USERS_JSON):
                    with open(USERS_JSON, 'r') as f:
                        users = json.load(f)
                        user = next((u for u in users if u['id'] == quotation['user_id']), None)
                
                if user:
                    username = user.get('username', '')
                    user_email = user.get('email', '')
            
            # Convert ObjectId to string for JSON serialization
            if '_id' in quotation:
                quotation['_id'] = str(quotation['_id'])
            if 'user_id' in quotation:
                quotation['user_id'] = str(quotation['user_id'])
            
            # Calculate amounts from products if available
            products = quotation.get('products', [])
            
            # Recalculate all amounts to ensure consistency
            for p in products:
                # Get basic values with proper defaults
                unit_price = float(p.get('unit_price', 0) or 0)
                quantity = float(p.get('quantity', 1) or 1)
                discount_percent = float(p.get('discount_percent', 0) or 0)
                
                # Calculate basic values
                total_price = unit_price * quantity
                discount_amount = (total_price * discount_percent) / 100
                taxable_amount = total_price - discount_amount
                
                # Determine GST rate based on product type
                product_type = p.get('type')
                gst_rate = 0.18  # Default to 18%
                if product_type == 'mpack':
                    gst_rate = 0.12  # 12% for mpack
                
                # Calculate GST
                gst_amount = round(taxable_amount * gst_rate, 2)
                
                # Update product calculations
                if 'calculations' not in p:
                    p['calculations'] = {}
                
                p['calculations'].update({
                    'unit_price': unit_price,
                    'quantity': quantity,
                    'discount_percent': discount_percent,
                    'discount_amount': round(discount_amount, 2),
                    'taxable_amount': round(taxable_amount, 2),
                    'gst_rate': int(gst_rate * 100),  # Store as percentage
                    'gst_amount': gst_amount,
                    'total_price': round(total_price, 2),
                    'final_total': round(taxable_amount + gst_amount, 2)
                })
            
            # Calculate totals from recalculated product data
            subtotal = sum(
                float(p.get('calculations', {}).get('total_price', 0) or 0)
                for p in products
            )
            
            total_discount = sum(
                float(p.get('calculations', {}).get('discount_amount', 0) or 0)
                for p in products
            )
            
            # Calculate GST for each product based on its type
            total_gst = 0
            for p in products:
                product_type = p.get('type')
                price = float(p.get('calculations', {}).get('total_price', 0) or 0)
                discount = float(p.get('calculations', {}).get('discount_amount', 0) or 0)
                taxable_amount = price - discount
                
                if product_type == 'blanket':
                    gst_rate = 0.18  # 18% GST for blankets
                elif product_type == 'mpack':
                    gst_rate = 0.12  # 12% GST for mpack
                else:
                    gst_rate = 0.18  # Default to 18% for any other product type
                
                product_gst = round(taxable_amount * gst_rate, 2)
                total_gst += product_gst
                
                # Update the product's calculations
                if 'calculations' not in p:
                    p['calculations'] = {}
                p['calculations']['gst_amount'] = product_gst
                p['calculations']['gst_rate'] = int(gst_rate * 100)  # Store as percentage
            
            # Calculate total amount before GST (subtotal - discount)
            total_amount_pre_gst = max(0, subtotal - total_discount)
            
            # Calculate final total (after GST)
            total_amount = round(total_amount_pre_gst + total_gst, 2)
            
            # Prepare the response data
            formatted_quotation = {
                'id': quotation.get('quote_id', str(quotation.get('_id', ''))),
                'quote_id': quotation.get('quote_id', 'N/A'),
                'mongo_id': str(quotation.get('_id', '')),  # Keep for reference if needed
                'company_name': quotation.get('company_name', quotation.get('customer_name', 'N/A')),
                'company_email': quotation.get('company_email', quotation.get('customer_email', 'N/A')),
                'products': products,
                'subtotal': round(float(subtotal), 2),
                'total_discount': round(float(total_discount), 2),
                'total_gst': round(float(total_gst), 2),
                'total_amount': round(float(total_amount), 2),
                'total_amount_pre_gst': round(float(total_amount_pre_gst), 2),
                'notes': quotation.get('notes', ''),
                'status': quotation.get('status', 'unknown'),
                'email_sent': quotation.get('email_sent', False),
                'created_at': quotation.get('date_created', '').isoformat() if hasattr(quotation.get('date_created'), 'isoformat') else str(quotation.get('date_created', '')),
                'email_content': quotation.get('email_content', ''),
                'username': username,
                'user_email': user_email,
                # Add raw fields for debugging
                '_raw_user_id': quotation.get('user_id', ''),
                '_raw_username': username,
                '_raw_user_email': user_email,
                # Add calculation details for debugging
                '_calculated': {
                    'subtotal': round(float(subtotal), 2),
                    'total_discount': round(float(total_discount), 2),
                    'total_gst': round(float(total_gst), 2),
                    'total_amount_pre_gst': round(float(total_amount_pre_gst), 2),
                    'total_amount': round(float(total_amount), 2),
                    'calculation_method': 'recalculated_on_demand'
                }
            }
            
            return jsonify({'success': True, 'quotation': formatted_quotation})
        
    except Exception as e:
        app.logger.error(f"Error getting quotation details: {str(e)}")
        app.logger.error(traceback.format_exc())  # Add full traceback to logs
        return jsonify({'error': 'Failed to get quotation details', 'details': str(e)}), 500

# Active Sessions API
@app.route('/api/admin/active-sessions')
@login_required
def admin_get_active_sessions():
    """Get active user sessions with details."""
    if getattr(current_user, 'role', None) != 'admin':
        abort(403)
    
    try:
        # For now, we'll show currently logged in users
        # In a production app, you'd track active sessions in Redis or database
        active_sessions = []
        
        # Add current admin user
        if current_user.is_authenticated:
            # Get current user's cart
            cart = get_user_cart()
            cart_total = 0
            
            for product in cart.get('products', []):
                cart_total += product.get('total_price', 0)
            
            # Get current time in IST
            from datetime import datetime, timezone
            ist = timezone.utc.offset(datetime.now(), 19800)  # +5:30 hours = 19800 seconds
            current_time_ist = datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S')
            
            session_data = {
                'user_id': current_user.id,
                'username': current_user.username,
                'email': current_user.email,
                'role': getattr(current_user, 'role', 'user'),
                'company_name': session.get('company_name', 'Not selected'),
                'company_email': session.get('company_email', ''),
                'cart_amount': cart_total,
                'cart_items_count': len(cart.get('products', [])),
                'last_activity': current_time_ist
            }
            active_sessions.append(session_data)
        
        return jsonify({'success': True, 'sessions': active_sessions})
        
    except Exception as e:
        app.logger.error(f"Error getting active sessions: {str(e)}")
        return jsonify({'error': 'Failed to load active sessions'}), 500

# Product pages
@app.route('/mpacks')
@login_required
@company_required
def mpacks():
    # Get company_id from query parameters
    company_id = request.args.get('company_id')
    
    # Initialize company info
    company_name = ''
    company_email = ''
    
    # If company_id is provided in the URL
    if company_id:
        # Try to get company info by ID
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with the selected company
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session['company_name'] = company_name
        session['company_email'] = company_email
    else:
        # Fall back to session data if no company_id in URL
        selected_company = session.get('selected_company', {})
        company_name = selected_company.get('name') or session.get('company_name')
        company_email = selected_company.get('email') or session.get('company_email')
        company_id = selected_company.get('id') or session.get('company_id')
        
        # Fall back to user's company info if not found
        if not company_name and hasattr(current_user, 'company_name'):
            company_name = current_user.company_name
        if not company_email and hasattr(current_user, 'company_email'):
            company_email = current_user.company_email
        if not company_id and hasattr(current_user, 'company_id'):
            company_id = current_user.company_id
    
    # Update session with final values
    session['company_name'] = company_name
    session['company_email'] = company_email
    session['company_id'] = company_id
            
    # Log the company info being sent to template
    app.logger.info(f"Rendering mpacks with company: {company_name}, email: {company_email}")
    
    response = render_template('user/products/chemicals/mpack.html', 
                           current_company={
                               'id': company_id,
                               'name': company_name,
                               'email': company_email
                           })
    
    app.logger.info("Template rendered successfully")
    return response

@app.route('/blankets')
@login_required
@company_required
def blankets():
    # Get company_id from query parameters
    company_id = request.args.get('company_id')
    
    # Debug log current session
    app.logger.debug(f"Session data: {dict(session)}")
    app.logger.debug(f"Current user: {current_user}")
    
    # Initialize company info
    company_name = ''
    company_email = ''
    
    # If company_id is provided in the URL
    if company_id:
        # Try to get company info by ID
        company_name = get_company_name_by_id(company_id)
        company_email = get_company_email_by_id(company_id)
        
        # Update session with the selected company
        session['selected_company'] = {
            'id': company_id,
            'name': company_name,
            'email': company_email
        }
        session['company_name'] = company_name
        session['company_email'] = company_email
        session['company_id'] = company_id
    else:
        # Fall back to session data if no company_id in URL
        selected_company = session.get('selected_company', {})
        company_name = selected_company.get('name') or session.get('company_name')
        company_email = selected_company.get('email') or session.get('company_email')
        company_id = selected_company.get('id') or session.get('company_id')
        
        # Fall back to user's company info if not found
        if not company_name and hasattr(current_user, 'company_name'):
            company_name = current_user.company_name
        if not company_email and hasattr(current_user, 'company_email'):
            company_email = current_user.company_email
        if not company_id and hasattr(current_user, 'company_id'):
            company_id = current_user.company_id
    
    # Update session with final values
    session['company_name'] = company_name
    session['company_email'] = company_email
    session['company_id'] = company_id
            
    # Log the company info being sent to template
    app.logger.info(f"Rendering blankets with company: {company_name}, email: {company_email}")
    
    # Create response and set company data in the session cookie
    response = make_response(render_template('user/products/blankets/blankets.html',
                         company_name=company_name,
                         company_email=company_email,
                         company_id=company_id,
                         current_company={
                             'id': company_id,
                             'name': company_name,
                             'email': company_email
                         }))
    
    # Set company info in cookies for client-side access
    response.set_cookie('company_name', company_name or '', httponly=True, samesite='Lax')
    response.set_cookie('company_email', company_email or '', httponly=True, samesite='Lax')
    response.set_cookie('company_id', str(company_id) if company_id else '', httponly=True, samesite='Lax')
    
    return response

# Reset password page
@app.route('/reset-password')
def reset_password_page():
    # Ensure we're using the reset_password.html from the root templates directory
    return render_template('reset_password.html')

# Helper functions to get company name and email by ID
def get_company_name_by_id(company_id):
    """Get company name by ID.
    Priority: MongoDB -> JSON fallback."""
    try:
        # Try MongoDB first
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                doc = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
            except Exception:
                doc = mongo_db.companies.find_one({'_id': company_id})
            if doc:
                normalized = {k.lower().replace(' ', ''): v for k, v in doc.items()}
                for key in ['name', 'companyname', 'company_name']:
                    if key in normalized and normalized[key]:
                        return normalized[key]
        # Skip JSON fallback when MongoDB is enabled
        if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
            # Fallback to JSON file lookup
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
                # Convert company_id to int if it's a string
                try:
                    idx = int(company_id) - 1
                    if 0 <= idx < len(companies):
                        return companies[idx].get('Company Name', '')
                except (ValueError, TypeError):
                    # If company_id is not a number, try to find by exact match in ID field
                    for company in companies:
                        if str(company.get('id', '')).lower() == str(company_id).lower():
                            return company.get('Company Name', '')

    except Exception as e:
        app.logger.error(f"Error getting company name: {e}")
    return ''

def get_company_email_by_id(company_id):
    """Get company email by ID.
    Priority: MongoDB -> JSON fallback."""
    try:
        if MONGO_AVAILABLE and USE_MONGO and mongo_db is not None:
            try:
                doc = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
            except Exception:
                doc = mongo_db.companies.find_one({'_id': company_id})
            if doc:
                normalized = {k.lower().replace(' ', ''): v for k, v in doc.items()}
                for key in ['email', 'emailid', 'email_id', 'emailid']:
                    if key in normalized and normalized[key]:
                        return normalized[key]
        # Skip JSON fallback when MongoDB is enabled
        if not (MONGO_AVAILABLE and USE_MONGO and mongo_db is not None):
            file_path = os.path.join(app.root_path, 'static', 'data', 'company_emails.json')
            with open(file_path, 'r') as f:
                companies = json.load(f)
                # Convert company_id to int if it's a string
                try:
                    idx = int(company_id) - 1
                    if 0 <= idx < len(companies):
                        return companies[idx].get('EmailID', '')
                except (ValueError, TypeError):
                    # If company_id is not a number, try to find by exact match in ID field
                    for company in companies:
                        if str(company.get('id', '')).lower() == str(company_id).lower():
                            return company.get('EmailID', '')
    except Exception as e:
        app.logger.error(f"Error getting company email: {e}")
        return ''

# Error handling
@app.errorhandler(404)
def page_not_found(e):
    # Default to user template
    return render_template('user/404.html'), 404



@app.route('/profile')
@login_required
def profile():
    """Render the profile page for the currently authenticated user."""
    user = current_user
    company_name = ''
    if hasattr(user, 'company_id') and user.company_id:
        company_name = get_company_name_by_id(user.company_id)
    return render_template('profile/profile.html',
                           user=user,
                           company_name=company_name,
                           get_company_name_by_id=get_company_name_by_id)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                             'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Start app
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    if os.environ.get('FLASK_ENV') == 'production':
        serve(app, host="0.0.0.0", port=port)
    else:
        app.run(host='0.0.0.0', port=port, debug=True)

# Initialize users dictionary after all function definitions
if USE_MONGO:
    users = {}
else:
    users = load_users()
    print(f"Loaded {len(users)} users from file")