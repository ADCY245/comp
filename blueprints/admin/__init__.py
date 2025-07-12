from flask import Blueprint

# Create admin blueprint
admin_bp = Blueprint('admin', __name__, 
                    template_folder='../../../templates/admin',
                    static_folder='../../../static/admin')

# Import routes after creating the blueprint to avoid circular imports
from . import routes
