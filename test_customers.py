import sys
import os
import json

# Add the current directory to the Python path
sys.path.insert(0, os.path.abspath('.'))

# Import the get_all_customers function
from app import get_all_customers, _get_customers_from_json

def test_customer_loading():
    print("Testing customer loading...")
    
    # Test the direct JSON loading function
    print("\nTesting _get_customers_from_json():")
    try:
        customers = _get_customers_from_json()
        print(f"Successfully loaded {len(customers)} customers from JSON")
        for i, customer in enumerate(customers[:3], 1):  # Print first 3 customers
            print(f"  {i}. {customer.get('name')} ({customer.get('email')})")
        if len(customers) > 3:
            print(f"  ... and {len(customers) - 3} more")
    except Exception as e:
        print(f"Error loading customers from JSON: {str(e)}")
    
    # Test the main get_all_customers function
    print("\nTesting get_all_customers():")
    try:
        customers = get_all_customers()
        print(f"Successfully loaded {len(customers)} customers")
        for i, customer in enumerate(customers[:3], 1):  # Print first 3 customers
            print(f"  {i}. {customer.get('name')} ({customer.get('email')})")
        if len(customers) > 3:
            print(f"  ... and {len(customers) - 3} more")
    except Exception as e:
        print(f"Error loading customers: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Ensure we're using JSON fallback
    os.environ["USE_MONGO"] = "false"
    test_customer_loading()
