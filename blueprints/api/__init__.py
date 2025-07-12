from flask import Blueprint

# Create API blueprint
api_bp = Blueprint('api', __name__)

# Import routes after creating the blueprint to avoid circular imports
from . import routes
