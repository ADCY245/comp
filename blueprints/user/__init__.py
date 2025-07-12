from flask import Blueprint

# Create user blueprint
user_bp = Blueprint('user', __name__, 
                   template_folder='../../../templates/user',
                   static_folder='../../../static/user')

# Import routes after creating the blueprint to avoid circular imports
from . import routes
