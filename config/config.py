"""
Configuration settings for the application.
This file should be kept out of version control.
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

class Config:
    """Base configuration class."""
    # MongoDB settings
    MONGODB_URI = os.environ.get('MONGODB_URI') or \
                 os.environ.get('MONGO_URI') or \
                 'mongodb://localhost:27017/'
    
    DB_NAME = os.environ.get('DB_NAME', 'moneda_db')
    
    # Security settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-me-in-production')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-dev-key-change-me')
    
    # Email settings
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ['true', '1', 't']
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'noreply@example.com')
    
    # Admin settings
    ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
    
    # Debug settings
    DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() in ['true', '1', 't']
    
    # Log level
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    
    @classmethod
    def init_app(cls, app):
        """Initialize configuration with the application instance."""
        # Configure logging
        import logging
        from logging.handlers import RotatingFileHandler
        import os
        
        # Ensure log directory exists
        if not os.path.exists('logs'):
            os.mkdir('logs')
        
        # File handler for logs
        file_handler = RotatingFileHandler('logs/app.log', maxBytes=10240, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        
        # Configure app logger
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO if not cls.DEBUG else logging.DEBUG)
        app.logger.info('Application startup')
        
        # Log MongoDB connection info (without password)
        if '@' in cls.MONGODB_URI:
            masked_uri = cls.MONGODB_URI.split('@')[0].split('//')[0] + '//****:****@' + cls.MONGODB_URI.split('@', 1)[1]
        else:
            masked_uri = cls.MONGODB_URI
            
        app.logger.info(f'MongoDB URI: {masked_uri}')
        app.logger.info(f'Database: {cls.DB_NAME}')


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    LOG_LEVEL = 'DEBUG'


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DB_NAME = 'test_moneda_db'
    WTF_CSRF_ENABLED = False


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    LOG_LEVEL = 'WARNING'


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
