from flask import Flask
from flask_login import LoginManager
from flask_mail import Mail
from flask_cors import CORS
from pymongo import MongoClient
from config import config
import os

# Initialize extensions
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message_category = 'info'

mail = Mail()

# Initialize MongoDB client
db = None


def create_app(config_name='default'):
    """Create and configure the Flask application."""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    
    # Initialize extensions
    login_manager.init_app(app)
    mail.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})
    
    # Initialize MongoDB
    global db
    client = MongoClient(app.config['MONGODB_URI'])
    db = client.get_database()
    
    # Register blueprints
    from blueprints.main import main_bp
    from blueprints.auth import auth_bp
    from blueprints.admin import admin_bp
    from blueprints.user import user_bp
    from blueprints.api import api_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(user_bp, url_prefix='/user')
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Error handlers
    from .errors import init_error_handlers
    init_error_handlers(app)
    
    # Shell context
    @app.shell_context_processor
    def make_shell_context():
        return {
            'db': db,
            'User': User  # Assuming you have a User model
        }
    
    return app


# Import models after app creation to avoid circular imports
from .models import User

# User loader for Flask-Login
@login_manager.user_loader
def load_user(user_id):
    user_data = db.users.find_one({'_id': user_id})
    if user_data:
        return User(user_data)
    return None
