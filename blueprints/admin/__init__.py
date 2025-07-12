from flask import Blueprint
import os

# Get the directory of the current file
current_dir = os.path.dirname(os.path.abspath(__file__))

# Create admin blueprint
admin_bp = Blueprint(
    'admin', 
    __name__,
    template_folder=os.path.join(current_dir, '../../../templates/admin'),
    static_folder=os.path.join(current_dir, '../../../static/admin')
)

# Import routes after creating the blueprint to avoid circular imports
from . import routes
