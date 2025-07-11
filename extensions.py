from pymongo import MongoClient, ASCENDING
from flask_login import LoginManager
from flask_mail import Mail
from flask_wtf.csrf import CSRFProtect
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os

# Initialize extensions
db = SQLAlchemy()
login_manager = LoginManager()
mail = Mail()
csrf = CSRFProtect()
cors = CORS(resources={r"/*": {"origins": "*"}})

# MongoDB client will be initialized in init_extensions
mongo = None

def init_extensions(app):
    """Initialize Flask extensions with the application."""
    global mongo, db
    
    # Initialize MongoDB if enabled
    if app.config.get('USE_MONGO', False) and app.config.get('MONGO_URI'):
        try:
            mongo = MongoClient(
                app.config['MONGO_URI'],
                tls=app.config.get('MONGO_TLS', 'true').lower() == 'true',
                tlsAllowInvalidCertificates=app.config.get('MONGO_TLS_ALLOW_INVALID_CERTS', 'false').lower() == 'true'
            )
            # Test the connection
            mongo.server_info()
            app.logger.info("Successfully connected to MongoDB")
        except Exception as e:
            app.logger.error(f"Failed to connect to MongoDB: {str(e)}")
            mongo = None
    
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
    
    # Initialize SQLAlchemy
    db.init_app(app)
    
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
