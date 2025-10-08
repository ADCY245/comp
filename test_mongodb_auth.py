import os
import sys
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get MongoDB connection string from environment
MONGODB_URI = os.getenv('MONGODB_URI') or os.getenv('MONGO_URI')
DB_NAME = os.getenv('DB_NAME', 'moneda_db')

if not MONGODB_URI:
    print("❌ Error: MONGODB_URI or MONGO_URI environment variable not set")
    sys.exit(1)

def test_mongodb_connection():
    """Test MongoDB connection and authentication"""
    try:
        print("\n=== Testing MongoDB Connection ===")
        print(f"Connecting to: {MONGODB_URI.split('@')[-1] if '@' in MONGODB_URI else MONGODB_URI}")
        
        # Connection parameters
        client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000
        )
        
        # Test the connection
        client.admin.command('ping')
        print("✅ Successfully connected to MongoDB")
        
        # Get database and collection
        db = client[DB_NAME]
        users_col = db['users']
        
        # Test collection access
        user_count = users_col.count_documents({})
        print(f"✅ Successfully accessed 'users' collection. Found {user_count} users.")
        
        # Test user lookup
        test_email = "operations@chemo.in"
        print(f"\n=== Testing User Lookup ===")
        print(f"Looking up user: {test_email}")
        
        # Import the find_user_by_email_or_username function from mongo_users
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from mongo_users import find_user_by_email_or_username
        
        user = find_user_by_email_or_username(test_email)
        
        if user:
            print(f"✅ User found in MongoDB:")
            print(f"   ID: {user.get('_id')}")
            print(f"   Email: {user.get('email')}")
            print(f"   Username: {user.get('username')}")
            print(f"   Role: {user.get('role', 'user')}")
            
            # Test password verification
            from mongo_users import verify_password
            print("\n=== Testing Password Verification ===")
            test_password = input("Enter password to test (or press Enter to skip): ").strip()
            
            if test_password:
                is_valid = verify_password(user, test_password)
                if is_valid:
                    print("✅ Password is valid")
                else:
                    print("❌ Invalid password")
            else:
                print("Skipped password verification")
                
        else:
            print(f"❌ User not found: {test_email}")
            print("\nAvailable users in the database:")
            for i, u in enumerate(users_col.find({}, {'email': 1, 'username': 1, 'role': 1, '_id': 0}).limit(5)):
                print(f"  {i+1}. {u.get('email')} (Username: {u.get('username')}, Role: {u.get('role', 'user')})")
        
        return True
        
    except ConnectionFailure as e:
        print(f"❌ Failed to connect to MongoDB: {str(e)}")
    except OperationFailure as e:
        print(f"❌ MongoDB operation failed: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
    
    return False

if __name__ == "__main__":
    test_mongodb_connection()
