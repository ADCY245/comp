from flask import jsonify, request, current_app
from flask_login import login_required, current_user
from functools import wraps
import jwt
import time
from extensions import mongo
from bson.objectid import ObjectId

# Helper function to verify JWT token
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
            
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
            
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = mongo_db.users.find_one({'_id': ObjectId(data['user_id'])})
        except:
            return jsonify({'message': 'Token is invalid!'}), 401
            
        return f(current_user, *args, **kwargs)
    
    return decorated

# User routes
@api_bp.route('/users', methods=['GET'])
@login_required
def get_users():
    # Only admins can access all users
    if not current_user.is_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    users = []
    for user in mongo_db.users.find():
        users.append({
            'id': str(user['_id']),
            'username': user['username'],
            'email': user['email'],
            'is_admin': user.get('is_admin', False),
            'is_verified': user.get('is_verified', False)
        })
    
    return jsonify(users)

@api_bp.route('/users/<user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    # Users can only access their own data unless they're admins
    if str(current_user.id) != user_id and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    user = mongo_db.users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    return jsonify({
        'id': str(user['_id']),
        'username': user['username'],
        'email': user['email'],
        'is_admin': user.get('is_admin', False),
        'is_verified': user.get('is_verified', False),
        'company_id': user.get('company_id')
    })

# Company routes
@api_bp.route('/companies', methods=['GET'])
def get_companies():
    companies = []
    for company in mongo_db.companies.find():
        companies.append({
            'id': str(company['_id']),
            'name': company['name'],
            'email': company.get('email', ''),
            'phone': company.get('phone', '')
        })
    
    return jsonify(companies)

@api_bp.route('/companies/<company_id>', methods=['GET'])
def get_company(company_id):
    company = mongo_db.companies.find_one({'_id': ObjectId(company_id)})
    if not company:
        return jsonify({'error': 'Company not found'}), 404
        
    return jsonify({
        'id': str(company['_id']),
        'name': company['name'],
        'email': company.get('email', ''),
        'phone': company.get('phone', ''),
        'address': company.get('address', {})
    })

# Quotation routes
@api_bp.route('/quotations', methods=['GET'])
@login_required
def get_quotations():
    # Admins can see all quotations, users can only see their own
    query = {'user_id': str(current_user.id)}
    if current_user.is_admin:
        query = {}
        
    quotations = []
    for quote in mongo_db.quotations.find(query):
        quotations.append({
            'id': str(quote['_id']),
            'quote_number': quote.get('quote_number', ''),
            'user_id': quote['user_id'],
            'company_id': quote.get('company_id'),
            'status': quote.get('status', 'draft'),
            'total': quote.get('total', 0),
            'created_at': quote.get('created_at', ''),
            'items': quote.get('items', [])
        })
    
    return jsonify(quotations)

@api_bp.route('/quotations/<quote_id>', methods=['GET'])
@login_required
def get_quotation(quote_id):
    quote = mongo_db.quotations.find_one({'_id': ObjectId(quote_id)})
    if not quote:
        return jsonify({'error': 'Quotation not found'}), 404
        
    # Check permissions
    if str(quote['user_id']) != str(current_user.id) and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    return jsonify({
        'id': str(quote['_id']),
        'quote_number': quote.get('quote_number', ''),
        'user_id': quote['user_id'],
        'company_id': quote.get('company_id'),
        'status': quote.get('status', 'draft'),
        'total': quote.get('total', 0),
        'created_at': quote.get('created_at', ''),
        'items': quote.get('items', []),
        'notes': quote.get('notes', '')
    })

@api_bp.route('/quotations', methods=['POST'])
@login_required
def create_quotation():
    data = request.get_json()
    
    # Basic validation
    if not data or 'items' not in data or not isinstance(data['items'], list):
        return jsonify({'error': 'Invalid request data'}), 400
    
    # Calculate total
    total = sum(item.get('price', 0) * item.get('quantity', 0) for item in data['items'])
    
    # Create new quotation
    quote = {
        'user_id': str(current_user.id),
        'company_id': data.get('company_id'),
        'items': data['items'],
        'status': 'draft',
        'total': total,
        'notes': data.get('notes', ''),
        'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'updated_at': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    result = mongo_db.quotations.insert_one(quote)
    quote['_id'] = str(result.inserted_id)
    
    return jsonify(quote), 201

# Product routes
@api_bp.route('/products', methods=['GET'])
def get_products():
    products = []
    for product in mongo_db.products.find():
        products.append({
            'id': str(product['_id']),
            'name': product['name'],
            'description': product.get('description', ''),
            'price': product['price'],
            'category': product.get('category', ''),
            'in_stock': product.get('in_stock', True)
        })
    
    return jsonify(products)

# Cart routes
@api_bp.route('/cart', methods=['GET'])
@login_required
def get_cart():
    user = mongo_db.users.find_one({'_id': ObjectId(current_user.id)})
    return jsonify(user.get('cart', []))

@api_bp.route('/cart', methods=['POST'])
@login_required
def update_cart():
    data = request.get_json()
    if not data or 'items' not in data or not isinstance(data['items'], list):
        return jsonify({'error': 'Invalid request data'}), 400
    
    # Update user's cart
    mongo_db.users.update_one(
        {'_id': ObjectId(current_user.id)},
        {'$set': {'cart': data['items']}}
    )
    
    return jsonify({'message': 'Cart updated successfully'})
