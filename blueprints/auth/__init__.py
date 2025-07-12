from flask import Blueprint

# Create auth blueprint
auth_bp = Blueprint('auth', __name__, 
                   template_folder='../../../templates/auth',
                   static_folder='../../../static/auth')

# Import routes after creating the blueprint to avoid circular imports
from . import routes
