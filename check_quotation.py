from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Connect to MongoDB
mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
client = MongoClient(mongo_uri)
db = client.get_database('pathways')

# Find the specific quotation
quotation = db.quotations.find_one({'quote_id': '688b17b162f239949eb16e03'})
if not quotation:
    print('Quotation not found')
else:
    # Print relevant fields
    print(f"Quote ID: {quotation.get('quote_id')}")
    print(f"Subtotal: {quotation.get('subtotal')}")
    print(f"Total Discount: {quotation.get('total_discount')}")
    print(f"Total GST: {quotation.get('total_gst')}")
    print(f"Total Amount: {quotation.get('total_amount')}")
    print(f"Total Amount Pre-GST: {quotation.get('total_amount_pre_gst')}")
    print("\nProducts:")
    for i, product in enumerate(quotation.get('products', []), 1):
        print(f"\nProduct {i}:")
        print(f"  Name: {product.get('name')}")
        print(f"  Quantity: {product.get('quantity')}")
        print(f"  Unit Price: {product.get('unit_price')}")
        print(f"  Total Price: {product.get('total_price')}")
        print(f"  Calculations: {product.get('calculations', {})}")
