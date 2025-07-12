from datetime import datetime
from bson import ObjectId
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

class User(UserMixin):
    """User model for authentication and profile management."""
    
    def __init__(self, user_data=None):
        if user_data:
            self.id = str(user_data.get('_id'))
            self.username = user_data.get('username')
            self.email = user_data.get('email')
            self.password_hash = user_data.get('password_hash')
            self.is_admin = user_data.get('is_admin', False)
            self.is_verified = user_data.get('is_verified', False)
            self.created_at = user_data.get('created_at', datetime.utcnow())
            self.updated_at = user_data.get('updated_at', datetime.utcnow())
            self.last_login = user_data.get('last_login')
            self.company_id = user_data.get('company_id')
            self.profile = user_data.get('profile', {})
    
    def set_password(self, password):
        """Create hashed password."""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check hashed password."""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert user object to dictionary."""
        return {
            'username': self.username,
            'email': self.email,
            'is_admin': self.is_admin,
            'is_verified': self.is_verified,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'last_login': self.last_login,
            'company_id': self.company_id,
            'profile': self.profile
        }
    
    def save(self, db):
        """Save user to database."""
        user_data = self.to_dict()
        user_data['password_hash'] = self.password_hash
        
        if hasattr(self, 'id'):
            # Update existing user
            result = db.users.update_one(
                {'_id': ObjectId(self.id)},
                {'$set': user_data}
            )
            return result.modified_count > 0
        else:
            # Create new user
            user_data['created_at'] = datetime.utcnow()
            result = db.users.insert_one(user_data)
            self.id = str(result.inserted_id)
            return result.acknowledged


class Company:
    """Company model for organization management."""
    
    def __init__(self, company_data=None):
        if company_data:
            self.id = str(company_data.get('_id'))
            self.name = company_data.get('name')
            self.email = company_data.get('email')
            self.phone = company_data.get('phone')
            self.address = company_data.get('address', {})
            self.created_at = company_data.get('created_at', datetime.utcnow())
            self.updated_at = company_data.get('updated_at', datetime.utcnow())
    
    def to_dict(self):
        """Convert company object to dictionary."""
        return {
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
    
    def save(self, db):
        """Save company to database."""
        company_data = self.to_dict()
        
        if hasattr(self, 'id'):
            # Update existing company
            result = db.companies.update_one(
                {'_id': ObjectId(self.id)},
                {'$set': company_data}
            )
            return result.modified_count > 0
        else:
            # Create new company
            company_data['created_at'] = datetime.utcnow()
            result = db.companies.insert_one(company_data)
            self.id = str(result.inserted_id)
            return result.acknowledged


class Product:
    """Product model for inventory management."""
    
    def __init__(self, product_data=None):
        if product_data:
            self.id = str(product_data.get('_id'))
            self.name = product_data.get('name')
            self.description = product_data.get('description')
            self.price = product_data.get('price', 0.0)
            self.category = product_data.get('category')
            self.sku = product_data.get('sku')
            self.stock = product_data.get('stock', 0)
            self.image_url = product_data.get('image_url')
            self.is_active = product_data.get('is_active', True)
            self.created_at = product_data.get('created_at', datetime.utcnow())
            self.updated_at = product_data.get('updated_at', datetime.utcnow())
    
    def to_dict(self):
        """Convert product object to dictionary."""
        return {
            'name': self.name,
            'description': self.description,
            'price': self.price,
            'category': self.category,
            'sku': self.sku,
            'stock': self.stock,
            'image_url': self.image_url,
            'is_active': self.is_active,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
    
    def save(self, db):
        """Save product to database."""
        product_data = self.to_dict()
        
        if hasattr(self, 'id'):
            # Update existing product
            result = db.products.update_one(
                {'_id': ObjectId(self.id)},
                {'$set': product_data}
            )
            return result.modified_count > 0
        else:
            # Create new product
            product_data['created_at'] = datetime.utcnow()
            result = db.products.insert_one(product_data)
            self.id = str(result.inserted_id)
            return result.acknowledged


class Quotation:
    """Quotation model for managing customer quotes."""
    
    def __init__(self, quotation_data=None):
        if quotation_data:
            self.id = str(quotation_data.get('_id'))
            self.quote_number = quotation_data.get('quote_number')
            self.user_id = quotation_data.get('user_id')
            self.company_id = quotation_data.get('company_id')
            self.items = quotation_data.get('items', [])
            self.subtotal = quotation_data.get('subtotal', 0.0)
            self.tax = quotation_data.get('tax', 0.0)
            self.discount = quotation_data.get('discount', 0.0)
            self.total = quotation_data.get('total', 0.0)
            self.status = quotation_data.get('status', 'draft')  # draft, sent, accepted, rejected, expired
            self.notes = quotation_data.get('notes', '')
            self.valid_until = quotation_data.get('valid_until')
            self.created_at = quotation_data.get('created_at', datetime.utcnow())
            self.updated_at = quotation_data.get('updated_at', datetime.utcnow())
    
    def to_dict(self):
        """Convert quotation object to dictionary."""
        return {
            'quote_number': self.quote_number,
            'user_id': self.user_id,
            'company_id': self.company_id,
            'items': self.items,
            'subtotal': self.subtotal,
            'tax': self.tax,
            'discount': self.discount,
            'total': self.total,
            'status': self.status,
            'notes': self.notes,
            'valid_until': self.valid_until,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
    
    def calculate_totals(self):
        """Calculate subtotal, tax, and total based on items."""
        self.subtotal = sum(item.get('price', 0) * item.get('quantity', 0) for item in self.items)
        self.total = self.subtotal + self.tax - self.discount
    
    def save(self, db):
        """Save quotation to database."""
        quotation_data = self.to_dict()
        quotation_data['updated_at'] = datetime.utcnow()
        
        if hasattr(self, 'id'):
            # Update existing quotation
            result = db.quotations.update_one(
                {'_id': ObjectId(self.id)},
                {'$set': quotation_data}
            )
            return result.modified_count > 0
        else:
            # Create new quotation
            quotation_data['created_at'] = datetime.utcnow()
            if not self.quote_number:
                # Generate quote number (you might want to implement a better numbering system)
                count = db.quotations.count_documents({}) + 1
                self.quote_number = f"QT-{datetime.now().strftime('%Y%m%d')}-{count:04d}"
                quotation_data['quote_number'] = self.quote_number
            
            result = db.quotations.insert_one(quotation_data)
            self.id = str(result.inserted_id)
            return result.acknowledged
