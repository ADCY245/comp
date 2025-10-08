import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError, ServerSelectionTimeoutError

def test_mongodb_connection():
    # Get MongoDB URI from environment or use default localhost
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    db_name = os.getenv('DB_NAME', 'moneda_db')
    
    print(f"Testing MongoDB connection to: {mongo_uri}")
    print(f"Database: {db_name}")
    
    try:
        # Try to connect to MongoDB
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        
        # The ismaster command is cheap and does not require auth
        client.admin.command('ismaster')
        print("✅ Successfully connected to MongoDB")
        
        # List all databases
        print("\nAvailable databases:")
        for db in client.list_database_names():
            print(f"- {db}")
        
        # Check if our target database exists
        if db_name in client.list_database_names():
            print(f"\n✅ Database '{db_name}' exists")
            db = client[db_name]
            
            # Check if users collection exists
            collections = db.list_collection_names()
            print("\nCollections in the database:")
            for col in collections:
                print(f"- {col}")
                
            if 'users' in collections:
                users_count = db.users.count_documents({})
                print(f"\n✅ 'users' collection exists with {users_count} documents")
                
                # Show first few users (without sensitive data)
                print("\nSample users:")
                for user in db.users.find({}, {'email': 1, 'username': 1, '_id': 0}).limit(3):
                    print(f"- {user}")
            else:
                print("\n❌ 'users' collection does not exist")
        else:
            print(f"\n❌ Database '{db_name}' does not exist")
            
    except ServerSelectionTimeoutError:
        print("❌ Could not connect to MongoDB: Server selection timeout")
    except ConnectionFailure as e:
        print(f"❌ Could not connect to MongoDB: {str(e)}")
    except ConfigurationError as e:
        print(f"❌ MongoDB configuration error: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    test_mongodb_connection()
