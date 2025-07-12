from flask import Blueprint
from flask_login import LoginManager
from extensions import login_manager

# Create auth blueprint
auth_bp = Blueprint('auth', __name__, 
                   template_folder='templates/auth',
                   static_folder='static/auth')

def init_auth(app):
    # Initialize login manager
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'

# Import routes after creating the blueprint to avoid circular imports
from . import routes
