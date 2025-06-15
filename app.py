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
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Configuration
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

# Add logging for debugging
print(f"SMTP Configuration:\n"
      f"SMTP_HOST: {SMTP_SERVER}\n"
      f"SMTP_PORT: {SMTP_PORT}\n"
      f"SMTP_USER: {SMTP_USERNAME}\n"
      f"EMAIL_FROM: {EMAIL_FROM}")

# Check for missing required environment variables
def check_email_config():
    if not all([SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM]):
        print("Warning: Missing required email configuration. Please check your environment variables:")
        print(f"SMTP_SERVER: {SMTP_SERVER}")
        print(f"SMTP_PORT: {SMTP_PORT}")
        print(f"SMTP_USERNAME: {SMTP_USERNAME}")
        print(f"SMTP_PASSWORD: {SMTP_PASSWORD and '***' or 'not set'}")
        print(f"EMAIL_FROM: {EMAIL_FROM}")
        return False
    return True

# Initialize email configuration
email_config_valid = check_email_config()

# Re-check email config periodically
def refresh_email_config():
    global email_config_valid
    email_config_valid = check_email_config()
# Initialize Flask app
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = os.getenv('SECRET_KEY', 'dev-key-123')

# Configuration
app.config['SESSION_COOKIE_SECURE'] = os.getenv('FLASK_ENV') == 'production'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# File paths
USERS_FILE = os.path.join(app.root_path, 'static', 'data', 'users.json')
CART_FILE = os.path.join(app.root_path, 'static', 'data', 'cart.json')

# Ensure data directory exists
os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)

# Initialize cart store
class CartStore:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.cart = {"products": []}
        return cls._instance
    
    def get_cart(self):
        return self.cart
    
    def save_cart(self, cart):
        self.cart = cart
        return True

# Initialize cart store
cart_store = CartStore()

# User class
class User(UserMixin):
    def __init__(self, id, email, username, password_hash, is_verified=False, otp_verified=False, cart=None):
        self.id = id
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.otp_verified = otp_verified
        self.cart = cart if cart is not None else []

    def to_dict(self):
        """Convert user object to dictionary for JSON serialization."""
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
        payload = {
            'user_id': self.id,
            'exp': datetime.utcnow() + timedelta(seconds=expires_in)
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    @staticmethod
    def verify_auth_token(token):
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return data.get('user_id')
        except:
            return None

# Initialize users dictionary
users = {}

# User loading and saving functions
def load_users():
    global users
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Create or overwrite the file with proper encoding
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            f.write('{}')
            
        # Read the file back to ensure it's properly created
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content.strip():
                content = '{}'
            users_data = json.loads(content)
            
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
    except Exception as e:
        print(f"Error loading users: {e}")
        # Create a fresh empty file with proper encoding
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            f.write('{}')
        users = {}

def save_users(users_dict=None):
    """Save users to JSON file. If no argument is provided, saves the global users dictionary."""
    try:
        if users_dict is None:
            users_dict = users
        
        # Ensure the data directory exists
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        
        # Convert users to dictionary
        user_data = {}
        for user_id, user in users_dict.items():
            try:
                user_data[user_id] = user.to_dict()
            except Exception as e:
                print(f"Error converting user {user_id} to dict: {e}")
                continue
        
        # Write to a temporary file first with UTF-8 encoding
        temp_file = USERS_FILE + '.tmp'
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(user_data, f, indent=2)
        
        # Atomically replace the original file
        os.replace(temp_file, USERS_FILE)
        
        print(f"Successfully saved {len(user_data)} users to {USERS_FILE}")
        
        # Also update the file format if it's in old format
        try:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
                if isinstance(existing_data, dict) and 'users' in existing_data:
                    with open(USERS_FILE, 'w', encoding='utf-8') as f:
                        json.dump(existing_data['users'], f, indent=2)
        except Exception as e:
            print(f"Error updating file format: {e}")
        
        return True
        
    except Exception as e:
        import traceback
        print(f"Error saving users: {e}")
        print(f"Stack trace: {traceback.format_exc()}")
        return False

# Load users on startup
load_users()

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

def login_required_custom(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# OTP storage
otp_store = {}

def generate_otp(email, otp_type='verification'):
    """Generate and store OTP for the given email and type"""
    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit OTP
    expiry = datetime.utcnow() + timedelta(minutes=10)  # 10 minutes expiry
    
    otp_store[email] = {
        'otp': otp,
        'expiry': expiry,
        'type': otp_type,
        'attempts': 0,
        'verified': False
    }
    return otp

def verify_otp(email, otp, otp_type='verification'):
    """Verify if the OTP is valid"""
    if email not in otp_store:
        print(f"OTP not found for email: {email}")
        return False, "OTP not found"
    
    otp_data = otp_store[email]
    
    # Check if OTP matches and not expired
    if (otp_data['otp'] == otp and 
        otp_data['expiry'] > datetime.utcnow() and 
        otp_data['type'] == otp_type):
        
        # Mark as verified for one-time use
        otp_data['verified'] = True
        return True, "OTP verified successfully"
    
    # Increment failed attempts
    otp_data['attempts'] += 1
    
    # Clear after too many attempts
    if otp_data['attempts'] >= 5:
        del otp_store[email]
        return False, "Too many failed attempts"
    
    if otp_data['expiry'] < datetime.utcnow():
        return False, "OTP has expired"
    
    return False, "Invalid OTP code"

def send_otp_email(email, otp_type='verification'):
    """Send OTP to user's email"""
    # Generate OTP
    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit OTP
    expiry = datetime.utcnow() + timedelta(minutes=10)
    
    # Store OTP
    otp_store[email] = {
        'otp': otp,
        'expiry': expiry,
        'type': otp_type,
        'attempts': 0,
        'verified': False
    }
    
    # Prepare email content
    if otp_type == 'verification':
        subject = "Verify Your Email Address"
        body = f"""
        <h2>Email Verification</h2>
        <p>Your verification code is: <strong>{otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        """
    else:  # password_reset
        subject = "Password Reset Request"
        body = f"""
        <h2>Password Reset</h2>
        <p>Your password reset code is: <strong>{otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        """
    
    # Send email and return result
    result = send_email(email, subject, body, is_html=True)
    if not result.get('success', False):
        # Remove stored OTP if email sending failed
        del otp_store[email]
    
    return result

# Email utility
def send_email(to_email, subject, body, is_html=False):
    try:
        if not email_config_valid:
            print("Email configuration is not valid. Skipping email sending.")
            return {
                'success': False,
                'error': 'Email configuration is not valid'
            }
        
        refresh_email_config()  # Re-check config before sending
        if not email_config_valid:
            return {
                'success': False,
                'error': 'Email configuration is not valid'
            }
        
        print(f"Attempting to send email to: {to_email}")
        print(f"Using SMTP server: {SMTP_SERVER}:{SMTP_PORT}")
        print(f"From: {EMAIL_FROM_NAME} <{EMAIL_FROM}>")
        
        msg = MIMEMultipart()
        msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        
        if is_html:
            msg.attach(MIMEText(body, 'html'))
        else:
            msg.attach(MIMEText(body, 'plain'))
        
        print("Connecting to SMTP server...")
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            print("Starting TLS...")
            server.starttls()
            print("Logging in...")
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            print("Sending email...")
            server.send_message(msg)
            print("Email sent successfully")
        
        return {
            'success': True,
            'message': 'Email sent successfully'
        }
    except smtplib.SMTPAuthenticationError as e:
        print(f"SMTP Authentication Error: {e}")
        print(f"Username: {SMTP_USERNAME}")
        print("Please check your email and password. If using Gmail, make sure you've enabled 'Less secure app access' or use an App Password.")
        return {
            'success': False,
            'error': str(e)
        }
    except smtplib.SMTPException as e:
        print(f"SMTP Error: {e}")
        return {
            'success': False,
            'error': str(e)
        }
    except Exception as e:
        print(f"Unexpected error sending email: {e}")
        return {
            'success': False,
            'error': str(e)
        }

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

def login_required_custom(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

CART_FILE = os.path.join('static', 'data', 'cart.json')

# Initialize cart file if it doesn't exist
if not os.path.exists(CART_FILE):
    with open(CART_FILE, 'w') as f:
        json.dump({"products": []}, f)

# ---------- ROUTES ---------- #

@app.route('/display')
@login_required_custom
def display():
    try:
        return render_template('display.html')
    except Exception as e:
        print(f"Error rendering display page: {e}")
        return "Error loading display page", 500

@app.route('/')
def home():
    user_id = session.get('user_id')
    user = users.get(user_id) if user_id else None
    
    if user:
        login_user(user)
        return redirect(url_for('display'))
    return redirect(url_for('login'))

# Auth Routes
@app.route('/api/request-otp', methods=['POST'])
def request_otp():
    data = request.get_json()
    email = data.get('email')
    otp_type = data.get('type', 'verification')
    
    if not email:
        return jsonify({
            'success': False,
            'error': 'Email is required'
        }), 400
    
    # Check if user exists for password reset
    if otp_type == 'password_reset':
        user = next((u for u in users.values() if u.email == email), None)
        if not user:
            return jsonify({
                'success': False,
                'error': 'No account found with this email'
            }), 404
    
    # Generate OTP first
    otp = generate_otp(email, otp_type)
    print(f"Generated OTP: {otp} for email: {email}")
    
    # Send OTP email
    email_result = send_email(email, 
                        "Verification Code" if otp_type == 'verification' else "Password Reset Code",
                        f"Your verification code is: {otp}\nThis code will expire in 10 minutes.",
                        is_html=False)
    
    if email_result.get('success', False):
        print(f"OTP sent successfully to {email}")
        return jsonify({
            'success': True,
            'message': email_result.get('message', 'Verification code sent successfully'),
            'email': email
        }), 200
    else:
        print(f"Failed to send OTP to {email}")
        return jsonify({
            'success': False,
            'error': email_result.get('error', 'Failed to send verification code. Please check your connection and try again.')
        }), 500

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp_endpoint():
    try:
        data = request.get_json()
        email = data.get('email')
        otp = data.get('otp')
        otp_type = data.get('type', 'verification')
        
        if not email or not otp:
            return jsonify({
                'success': False,
                'error': 'Email and OTP are required'
            }), 400
        
        verified, message = verify_otp(email, otp, otp_type)
        if verified:
            return jsonify({
                'success': True,
                'message': message,
                'verified': True,
                'email': email
            }), 200
        else:
            print(f"OTP verification failed for {email}: {message}")
            return jsonify({
                'success': False,
                'error': message
            }), 400
    except Exception as e:
        print(f"Error in OTP verification: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to verify OTP. Please try again.'
        }), 500

@app.route('/api/auth/register/initiate', methods=['POST'])
def api_register_initiate():
    data = request.get_json()
    email = data.get('email', '').strip()
    
    if not email:
        return jsonify({'success': False, 'error': 'Email is required'}), 400
        
    # Allow any email for testing
    if not '@' in email:
        return jsonify({'success': False, 'error': 'Please enter a valid email address'}), 400
        
    if any(u.email == email for u in users.values()):
        return jsonify({'success': False, 'error': 'Email already registered'}), 400
    
    # Generate and send OTP
    if send_otp_email(email, 'verification'):
        return jsonify({
            'success': True, 
            'message': 'Verification code sent to your email',
            'email': email,
            'redirectTo': url_for('login')
        })
    else:
        return jsonify({'success': False, 'error': 'Failed to send verification code'}), 500

@app.route('/api/auth/register/complete', methods=['POST'])
def api_register_complete():
    try:
        data = request.get_json()
        print(f"Registration data received: {data}")
        
        email = data.get('email', '').strip()
        otp = data.get('otp', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        confirm_password = data.get('confirmPassword', '').strip()
        
        print(f"Validating registration data: email={email}, username={username}, password length={len(password)}")
        
        # Validate inputs
        if not all([email, otp, username, password, confirm_password]):
            print("Validation failed: missing required fields")
            return jsonify({'success': False, 'error': 'All fields are required'}), 400
        
        if password != confirm_password:
            print("Validation failed: passwords do not match")
            return jsonify({'success': False, 'error': 'Passwords do not match'}), 400
        
        if len(password) < 8:
            print("Validation failed: password too short")
            return jsonify({'success': False, 'error': 'Password must be at least 8 characters long'}), 400
        
        if any(u.username.lower() == username.lower() for u in users.values()):
            print(f"Validation failed: username {username} already exists")
            return jsonify({'success': False, 'error': 'Username already taken'}), 400
        
        # Verify OTP
        if not verify_otp(email, otp, 'verification'):
            print("Validation failed: OTP verification failed")
            return jsonify({'success': False, 'error': 'Invalid or expired verification code'}), 400
        
        # Create new user
        user_id = str(uuid.uuid4())
        print(f"Creating new user with ID: {user_id}")
        
        new_user = User(
            id=user_id,
            email=email,
            username=username,
            password_hash=generate_password_hash(password),
            is_verified=True,
            otp_verified=True
        )
        
        print(f"Adding user to users dictionary: {user_id}")
        users[user_id] = new_user
        
        print(f"Saving users to file with {len(users)} users")
        if not save_users(users):
            return jsonify({
                'success': False,
                'error': 'Failed to save user data. Please try registering again.',
                'redirectTo': url_for('login')
            }), 500
        
        # Don't log the user in automatically, redirect to login page
        return jsonify({
            'success': True,
            'message': 'Registration successful! You can now log in.',
            'redirectTo': url_for('login')
        })
        
    except Exception as e:
        print(f"Error during registration: {str(e)}")
        import traceback
        print(f"Stack trace: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': 'An error occurred during registration'}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    login = data.get('login', '').strip()  # Can be email or username
    password = data.get('password', '').strip()
    
    # Validate inputs
    if not login:
        return jsonify({'success': False, 'error': 'Email or username is required'}), 400
    if not password:
        return jsonify({'success': False, 'error': 'Password is required'}), 400
    
    # Try to find user by email or username (case-insensitive)
    user = next(
        (u for u in users.values() 
         if u.email.lower() == login.lower() or u.username.lower() == login.lower()),
        None
    )
    
    # Check if user exists
    if not user:
        return jsonify({
            'success': False, 
            'error': 'Invalid login credentials. Please check your email/username and password.'
        }), 401
    
    # Check password
    if not user.check_password(password):
        return jsonify({
            'success': False, 
            'error': 'Invalid login credentials. Please check your email/username and password.'
        }), 401
    
    # Check if user is verified
    if not user.is_verified:
        return jsonify({
            'success': False, 
            'error': 'Please verify your email address before logging in. Check your inbox for the verification link.'
        }), 403
    
    # Log the user in
    login_user(user)
    token = user.generate_auth_token()
    
    # Return success response with redirect to display page
    return jsonify({
        'success': True,
        'message': 'Login successful',
        'token': token,
        'redirectTo': url_for('display'),
        'user': {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'is_verified': user.is_verified
        }
    })

@app.route('/api/auth/forgot-password', methods=['POST'])
def api_forgot_password():
    data = request.get_json()
    email = data.get('email', '').strip()
    
    if not email:
        return jsonify({'success': False, 'error': 'Email is required'}), 400
    
    # Find user by email (case-insensitive)
    user = next((u for u in users.values() if u.email.lower() == email.lower()), None)
    if not user:
        # Return success even if email not found to prevent user enumeration
        return jsonify({
            'success': True,
            'message': 'If an account exists with this email, a password reset link has been sent.',
            'redirectTo': url_for('login')
        })
    
    # Send OTP email
    if send_otp_email(email, 'password_reset'):
        return jsonify({
            'success': True,
            'message': 'If an account exists with this email, a password reset link has been sent.',
            'redirectTo': url_for('login')
        })
    else:
        return jsonify({'success': False, 'error': 'Failed to send verification code'}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    data = request.get_json()
    token = data.get('token')
    new_password = data.get('newPassword')
    
    user = next((u for u in users.values() if u.reset_token == token and u.reset_token_expiry > datetime.utcnow()), None)
    
    if not user:
        return jsonify({'success': False, 'message': 'Invalid or expired token'}), 400
    
    user.set_password(new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    save_users(users)
    
    return jsonify({
        'success': True, 
        'message': 'Password reset successfully. You can now log in with your new password.',
        'redirectTo': url_for('login')
    })

@app.route('/verify-email/<token>')
def verify_email(token):
    user = next((u for u in users.values() if getattr(u, 'verification_token', None) == token), None)
    
    if user and not user.is_verified:
        user.is_verified = True
        user.verification_token = None
        save_users(users)
        flash('Email verified successfully! You can now log in.', 'success')
    else:
        flash('Invalid or expired verification link', 'error')
    
    return redirect(url_for('login'))

# Frontend Routes
@app.route('/login')
def login():
    # Clear any existing session
    session.clear()
    
    # Get the next URL from query parameter
    next_url = request.args.get('next')
    if next_url and not is_safe_url(next_url):
        next_url = url_for('display')
    
    # Store the next URL in session
    if next_url:
        session['next_url'] = next_url
    
    return render_template('login.html')

@app.route('/signup', methods=['GET'])
def signup():
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return render_template('signup.html')

@app.route('/forgot-password', methods=['GET'])
def forgot_password():
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return render_template('forgot_password.html')

@app.route('/reset-password/<token>', methods=['GET'])
def reset_password(token):
    return send_from_directory('public/reset-password', 'index.html')

@app.route('/api/auth/logout')
@login_required
def api_logout():
    logout_user()
    session.pop('user_id', None)
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/blankets')
@login_required_custom
def blankets():
    return render_template('products/blankets/blankets.html')

@app.route('/mpack')
def mpack():
    return render_template('products/chemicals/mpack.html')

@app.route('/cart')
@login_required_custom
def cart():
    try:
        print("\n=== [CART ROUTE] Loading cart data ===")
        
        # Get company info from URL parameters with empty defaults
        company_name = request.args.get('company', '')
        company_email = request.args.get('email', '')
        
        # If no company in URL, try to get from session
        if not company_name:
            company_name = session.get('company_name', 'Your Company')
        else:
            session['company_name'] = company_name
            
        if not company_email:
            company_email = session.get('company_email', '')
        else:
            session['company_email'] = company_email
            
        print(f"[CART ROUTE] Company: {company_name}, Email: {company_email}")
        
        # Load cart data
        cart_data = load_cart()
        print(f"[CART ROUTE] Raw cart data from file: {cart_data}")
        
        # Initialize cart if it doesn't exist
        if cart_data is None:
            print("[CART ROUTE] Cart data is None, initializing empty cart")
            cart_data = {"products": []}
            save_cart(cart_data)
        
        # Ensure products is a list
        if not isinstance(cart_data.get('products'), list):
            print(f"[CART ROUTE] Products is not a list (type: {type(cart_data.get('products'))}), initializing empty list")
            cart_data['products'] = []
            save_cart(cart_data)
        
        # Debug output
        print(f"[CART ROUTE] Number of products in cart: {len(cart_data.get('products', []))}")
        for i, product in enumerate(cart_data.get('products', []), 1):
            print(f"[CART ROUTE] Product {i}:")
            print(f"  Name: {product.get('name', 'Unnamed')}")
            print(f"  Type: {product.get('type', 'unknown')}")
            print(f"  Calculations: {product.get('calculations', 'No calculations')}")
            
        # Ensure all products have required fields
        for product in cart_data.get('products', []):
            if 'id' not in product:
                product['id'] = str(uuid.uuid4())
            if 'added_at' not in product:
                product['added_at'] = datetime.now().isoformat()
                
            # Ensure calculations exist for MPack products
            if product.get('type') == 'mpack':
                print(f"[CART ROUTE] Processing MPack product: {product.get('name')}")
                # Ensure all required fields exist
                product['unit_price'] = product.get('unit_price', 0)
                product['quantity'] = product.get('quantity', 1)
                product['discount_percent'] = product.get('discount_percent', 0)
                product['gst_percent'] = product.get('gst_percent', 12)
                
                # Calculate derived values
                subtotal = product['unit_price'] * product['quantity']
                discount_amount = subtotal * (product['discount_percent'] / 100)
                price_after_discount = subtotal - discount_amount
                gst_amount = (price_after_discount * product['gst_percent']) / 100
                final_total = price_after_discount + gst_amount
                
                # Update product with calculations
                product['calculations'] = {
                    'unitPrice': product['unit_price'],
                    'quantity': product['quantity'],
                    'subtotal': subtotal,
                    'discountPercent': product['discount_percent'],
                    'discountAmount': discount_amount,
                    'priceAfterDiscount': price_after_discount,
                    'gstPercent': product['gst_percent'],
                    'gstAmount': gst_amount,
                    'finalTotal': final_total
                }
                
                # Update the product's total_price to match the calculated final total
                product['total_price'] = final_total
                
        # Save any updates
        save_cart(cart_data)
            
        # Calculate total price - use the pre-calculated total_price which already includes GST
        total_price = 0
        for item in cart_data['products']:
            try:
                # The item's total_price is already calculated with GST in the add_to_cart function
                item_total = float(item.get('total_price', 0))
                total_price += item_total
                
                # Debug log
                print(f"Item: {item.get('name', 'Unknown')}, Total: {item_total}, Type: {item.get('type', 'unknown')}")
                
            except (ValueError, TypeError) as e:
                print(f"Error processing item price: {e}")
                continue
                
        print(f"Calculated total price: {total_price}")  # Debug log
        return render_template('cart.html', 
                            cart=cart_data, 
                            total=round(total_price, 2),
                            company_name=company_name,
                            company_email=company_email)
        
    except Exception as e:
        import traceback
        print(f"Error in cart route: {str(e)}")
        print("Full traceback:")
        print(traceback.format_exc())
        # Return empty cart in case of error
        return render_template('cart.html', 
                            cart={"products": []}, 
                            total=0,
                            company_name='Your Company',
                            company_email='email@example.com'), 500

# ---------- STATIC FILE SERVING ---------- #

@app.route('/blankets-data/<path:filename>')
def blankets_data(filename):
    return send_from_directory('static/products/blankets', filename)

@app.route('/chemicals-data/<path:filename>')
def chemicals_data(filename):
    return send_from_directory('static/chemicals', filename)

# ---------- CART HANDLING ---------- #

def load_cart():
    try:
        # For Render, use in-memory store
        cart = cart_store.get_cart()
        # Ensure the cart has the products list
        if 'products' not in cart:
            cart = {"products": []}
        return cart
    except Exception as e:
        print(f"Error loading cart: {e}")
        return {"products": []}

def save_cart(cart):
    try:
        # For Render, use in-memory store
        return cart_store.save_cart(cart)
    except Exception as e:
        print(f"Error saving cart: {e}")
        # For local development, you can uncomment the backup code
        # backup_file = f"{CART_FILE}.bak.{int(datetime.now().timestamp())}"
        # try:
        #     with open(backup_file, 'w') as f:
        #         json.dump(cart, f, indent=2)
        #     print(f"Cart backup saved to {backup_file}")
        # except Exception as backup_error:
        #     print(f"Failed to save backup: {backup_error}")
        return False

from flask import request, jsonify

@app.route('/add_to_cart', methods=['POST'])
def add_to_cart():
    print("\n=== Add to Cart Request ===")
    print(f"Request data: {request.data}")
    
    if not request.is_json:
        error_msg = "Invalid JSON in request"
        print(f"Error: {error_msg}")
        return jsonify({"success": False, "message": error_msg}), 400
    
    try:
        product = request.get_json()
        print(f"Product data received: {json.dumps(product, indent=2)}")
        
        cart = load_cart()
        print(f"Current cart before add: {json.dumps(cart, indent=2)}")
        
        # Add timestamp and ensure ID exists
        if 'id' not in product:
            product['id'] = str(uuid.uuid4())
        if 'added_at' not in product:
            product['added_at'] = datetime.now().isoformat()
        
        # Check if the cart has space (limit to 100 items)
        if len(cart['products']) >= 100:
            error_msg = "Cart is full. Maximum 100 items allowed."
            print(error_msg)
            return jsonify({"success": False, "message": error_msg}), 400
        
        # Add the new product
        cart['products'].append(product)
        print(f"Cart after adding product: {json.dumps(cart, indent=2)}")
        
        # Save the cart
        save_cart(cart)
        
        # Verify the cart was saved
        saved_cart = load_cart()
        print(f"Cart after save (verification): {json.dumps(saved_cart, indent=2)}")
        print(f"Number of products in saved cart: {len(saved_cart.get('products', []))}")
        
        response = {
            "success": True, 
            "message": "Product added to cart.",
            "cart_count": len(cart['products'])
        }
        print(f"Sending response: {json.dumps(response, indent=2)}")
        return jsonify(response), 201
        
    except Exception as e:
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500

@app.route('/get_cart_count')
def get_cart_count():
    try:
        cart = load_cart()
        return jsonify({
            'success': True,
            'count': len(cart.get('products', [])),
            'total': sum(float(item.get('total_price', 0)) for item in cart.get('products', []))
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/remove_from_cart', methods=['POST'])
def remove_from_cart():
    product_id = request.form['product_id']
    cart = load_cart()
    cart['products'] = [item for item in cart['products'] if item['id'] != product_id]
    save_cart(cart)
    return redirect(url_for('cart'))

@app.route('/clear_cart', methods=['POST'])
def clear_cart():
    try:
        cart = {"products": []}
        save_cart(cart)
        flash('All items have been removed from your cart.', 'success')
    except Exception as e:
        flash('An error occurred while clearing the cart.', 'error')
        app.logger.error(f"Error clearing cart: {str(e)}")
    return redirect(url_for('cart'))

@app.route('/send_invoice', methods=['POST'])
def send_invoice():
    try:
        cart = load_cart()
        if not cart.get('products'):  # Check if cart is empty
            flash('Your cart is empty. Add items before sending an invoice.', 'warning')
            return redirect(url_for('cart'))
            
        # Here you would typically generate and send the invoice
        # For now, we'll just clear the cart
        cart = {"products": []}
        save_cart(cart)
        
        flash('Invoice has been sent successfully!', 'success')
        return redirect(url_for('cart'))
    except Exception as e:
        flash('An error occurred while sending the invoice.', 'error')
        app.logger.error(f"Error sending invoice: {str(e)}")
        return redirect(url_for('cart'))

# ---------- START APP ---------- #



# Ensure the instance folder exists
try:
    os.makedirs(app.instance_path)
except OSError:
    pass

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 3000))
    if os.environ.get('FLASK_ENV') == 'production':
        serve(app, host="0.0.0.0", port=port)
    else:
        app.run(host='0.0.0.0', port=port, debug=True)
