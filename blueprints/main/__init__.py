from flask import Blueprint

# Create main blueprint
main_bp = Blueprint('main', __name__,
                   template_folder='templates/main',
                   static_folder='static/main')

def init_main(app):
    # Any main blueprint specific initialization can go here
    pass

# Import routes after creating the blueprint to avoid circular imports
from . import routes
