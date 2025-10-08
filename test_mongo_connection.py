import os
import sys
import pymongo
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError, OperationFailure

# Set console output encoding for Windows
if sys.platform == 'win32':
    import io
    import sys
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def test_mongodb_connection():
    """Test MongoDB connection and authentication."""
    # Get MongoDB URI from environment
    mongodb_uri = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URI')
    db_name = os.environ.get('DB_NAME', 'moneda_db')
    
    if not mongodb_uri:
        print("[ERROR] MONGODB_URI or MONGO_URI environment variable not set")
        print("Please set the MongoDB connection string in your environment variables")
        return False
    
    print(f"[TEST] MongoDB connection to: {mongodb_uri.split('@')[-1] if '@' in mongodb_uri else mongodb_uri}")
    print(f"[TEST] Database: {db_name}")
    
    try:
        # Connection options
        client_options = {
            'connectTimeoutMS': 5000,  # 5 second timeout
            'socketTimeoutMS': 5000,
            'serverSelectionTimeoutMS': 5000,
            'retryWrites': True,
            'w': 'majority'
        }
        
        # Add TLS/SSL options if using mongodb+srv
        if 'mongodb+srv' in mongodb_uri:
            client_options['tls'] = True
            client_options['tlsAllowInvalidCertificates'] = True
            client_options['tlsInsecure'] = True
        
        # Connect to MongoDB
        client = MongoClient(mongodb_uri, **client_options)
        
        # Test the connection
        client.admin.command('ping')
        print("[SUCCESS] Connected to MongoDB")
        
        # Test database access
        db = client[db_name]
        
        # Test collection access
        collections = db.list_collection_names()
        print(f"[INFO] Available collections: {', '.join(collections) if collections else 'None'}")
        
        # Test users collection
        if 'users' in collections:
            users_count = db.users.count_documents({})
            print(f"[INFO] Found {users_count} users in the database")
        
        # Test companies collection
        if 'companies' in collections:
            companies_count = db.companies.count_documents({})
            print(f"[INFO] Found {companies_count} companies in the database")
        
        return True
        
    except ConnectionFailure as e:
        print(f"[ERROR] Failed to connect to MongoDB: {str(e)}")
        print("Please check your connection string and network access")
    except ConfigurationError as e:
        print(f"[ERROR] Invalid MongoDB configuration: {str(e)}")
    except OperationFailure as e:
        if 'Authentication failed' in str(e):
            print("[ERROR] Authentication failed. Please check your username and password")
        elif 'bad auth' in str(e).lower():
            print("[ERROR] Authentication failed. Invalid credentials")
        else:
            print(f"[ERROR] Operation failed: {str(e)}")
    except Exception as e:
        print(f"[ERROR] An unexpected error occurred: {str(e)}")
    
    return False

if __name__ == '__main__':
    test_mongodb_connection()
