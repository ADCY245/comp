#!/usr/bin/env python
import os
from flask_script import Manager, Server
from flask_migrate import Migrate, MigrateCommand
from app import create_app, db
from app.models import User, Company, Product, Quotation, QuotationItem

# Create the Flask application instance
app = create_app()

# Initialize the manager and migration
manager = Manager(app)
migrate = Migrate(app, db)

# Add the migration command
manager.add_command('db', MigrateCommand)

# Add a development server command
manager.add_command("runserver", Server(host='0.0.0.0', port=5000))

@manager.shell
def make_shell_context():
    """Create a Python shell with the application context and database models."""
    return {
        'app': app,
        'db': db,
        'User': User,
        'Company': Company,
        'Product': Product,
        'Quotation': Quotation,
        'QuotationItem': QuotationItem
    }

@manager.command
def create_admin():
    """Create an admin user."""
    from werkzeug.security import generate_password_hash
    
    email = input("Enter admin email: ")
    password = input("Enter admin password: ")
    
    if not email or not password:
        print("Error: Email and password are required")
        return
    
    # Check if user already exists
    if User.query.filter_by(email=email).first():
        print(f"Error: User with email {email} already exists")
        return
    
    # Create admin user
    admin = User(
        email=email,
        password_hash=generate_password_hash(password),
        is_admin=True,
        is_active=True,
        email_verified=True
    )
    
    db.session.add(admin)
    db.session.commit()
    print(f"Admin user {email} created successfully")

if __name__ == '__main__':
    manager.run()
