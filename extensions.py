from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail
from flask_wtf.csrf import CSRFProtect
from flask_cors import CORS

# Initialize extensions
db = SQLAlchemy()
login_manager = LoginManager()
mail = Mail()
csrf = CSRFProtect()
cors = CORS(resources={r"/*": {"origins": "*"}})

def init_extensions(app):
    """Initialize Flask extensions with the application."""
    # Initialize SQLAlchemy
    db.init_app(app)
    
    # Initialize LoginManager
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'
    
    # Initialize Mail
    mail.init_app(app)
    
    # Initialize CSRF Protection
    csrf.init_app(app)
    
    # Initialize CORS
    cors.init_app(app)
    
    # Import models to ensure they are registered with SQLAlchemy
    from app.models import User, Company, Product, Quotation, QuotationItem
    
    # Create database tables
    with app.app_context():
        db.create_all()
