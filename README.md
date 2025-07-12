# Product Calculator

A comprehensive web application for managing product calculations, quotations, and user management with an admin dashboard, built with Flask and SQLAlchemy.

## Features

- **User Authentication**: Secure login, registration, and password management
- **Role-Based Access Control**: Separate interfaces for admins and regular users
- **Admin Dashboard**: Comprehensive overview of system metrics and management
- **Quotation Management**: Create, view, and manage product quotations
- **User Management**: Admin interface for managing user accounts and permissions
- **Database Support**: SQLAlchemy ORM with support for SQLite, PostgreSQL, and MySQL
- **RESTful API**: JSON API for integration with other systems
- **Email Notifications**: Configurable email notifications for important events

## Project Structure

```
project/
├── app.py                  # Main application factory
├── config.py               # Configuration settings
├── manage.py               # Management script for database migrations and admin tasks
├── requirements.txt        # Python dependencies
├── run.py                  # Application entry point
├── wsgi.py                 # WSGI entry point for production
├── .env.example            # Example environment variables
├── setup.py                # Package installation script
├── extensions.py           # Flask extensions initialization
├── models.py               # Database models
├── static/                 # Static files (CSS, JS, images)
│   ├── css/
│   │   ├── admin.css       # Admin panel styles
│   │   └── styles.css      # Main application styles
│   └── js/
│       ├── admin.js        # Admin panel JavaScript
│       └── main.js         # Main application JavaScript
├── templates/              # HTML templates
│   ├── admin/              # Admin panel templates
│   │   ├── base.html       # Base template for admin
│   │   ├── dashboard.html  # Admin dashboard
│   │   └── manage_users.html  # User management
│   ├── auth/               # Authentication templates
│   ├── errors/             # Error pages
│   │   ├── 403.html        # Forbidden
│   │   ├── 404.html        # Not Found
│   │   └── 500.html        # Server Error
│   └── base.html           # Base template for frontend
└── blueprints/             # Application blueprints
    ├── admin/              # Admin routes
    │   ├── __init__.py
    │   └── routes.py
    ├── api/                # API endpoints
    ├── auth/               # Authentication routes
    └── user/               # User account routes
```

## Setup Instructions

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- SQLite (default) or PostgreSQL/MySQL database

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd product-calculator
   ```

2. **Set up a virtual environment**
   ```bash
   # On Windows
   python -m venv venv
   .\venv\Scripts\activate
   
   # On macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize the database**
   ```bash
   # Initialize migrations
   python manage.py db init
   
   # Create initial migration
   python manage.py db migrate -m "Initial migration"
   
   # Apply migrations
   python manage.py db upgrade
   ```

6. **Create an admin user**
   ```bash
   python manage.py create_admin
   ```

## 🏃‍♂️ Running the Application

### Development Mode
```bash
# Using Flask's built-in server
flask run

# Or using the run script
python run.py
```

### Production Mode
For production, use a WSGI server like Gunicorn or uWSGI:

```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 wsgi:application
```

## 🔧 Configuration

Edit the `.env` file to configure:
- Database connection (SQLite/PostgreSQL/MySQL)
- Email settings
- Security settings
- Application settings

## 📦 Deployment

The application can be deployed to various platforms:

### Heroku
```bash
# Create a new Heroku app
heroku create

# Set environment variables
heroku config:set FLASK_APP=run.py
heroku config:set FLASK_ENV=production

# Deploy to Heroku
git push heroku main
```

### Docker
A `Dockerfile` is included for containerized deployment:

```bash
# Build the image
docker build -t product-calculator .

# Run the container
docker run -d -p 5000:5000 --env-file .env product-calculator
```

## 📚 API Documentation

The application provides a RESTful API with the following endpoints:

- `GET /api/users` - List all users (admin only)
- `POST /api/users` - Create a new user
- `GET /api/quotations` - List all quotations
- `POST /api/quotations` - Create a new quotation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Flask](https://flask.palletsprojects.com/)
- Database management with [SQLAlchemy](https://www.sqlalchemy.org/)
- Frontend with [Bootstrap](https://getbootstrap.com/)
7. Access the application at `http://localhost:5000`

## API Documentation

The API documentation is available at `/api/docs` when running the development server.

## Development

### Code Style

- Follow PEP 8 for Python code
- Use 4 spaces for indentation
- Maximum line length of 120 characters
- Use docstrings for all functions and classes

### Git Workflow

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:
   ```bash
   git add .
   git commit -m "Add your commit message here"
   ```

3. Push your changes and create a pull request

## Testing

To run the test suite:

```bash
python -m pytest
```

## Deployment

For production deployment, use a production WSGI server like Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please contact [support@example.com](mailto:support@example.com).
