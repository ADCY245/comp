// Dealer-specific cart functionality
const cartContainer = document.getElementById('cart-container');

// Helper function to round numbers to 2 decimal places
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

// Function to get cart from localStorage
function getCart() {
    const cart = localStorage.getItem('dealer_cart');
    if (cart) {
        return JSON.parse(cart);
    }
    return {
        items: [],
        company_id: localStorage.getItem('companyId') || '',
        company_name: localStorage.getItem('companyName') || '',
        company_email: localStorage.getItem('companyEmail') || ''
    };
}

// Function to save cart to localStorage
function saveCart(cart) {
    localStorage.setItem('dealer_cart', JSON.stringify(cart));
}

// Function to update cart count in the UI
function updateCartCount() {
    const cart = getCart();
    const countElements = document.querySelectorAll('.cart-count, #cart-count');
    
    countElements.forEach(el => {
        if (cart.items.length > 0) {
            el.textContent = cart.items.length;
            el.style.display = 'inline-block';
        } else {
            el.style.display = 'none';
        }
    });
    
    return cart.items.length;
}

// Function to show toast notifications
function showToast(title, message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Set toast content
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <strong>${title}</strong><br>${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add toast to container
    toastContainer.appendChild(toast);
    
    // Auto-remove toast after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
    
    // Add click handler to close button
    const closeButton = toast.querySelector('.btn-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        });
    }
}

// Function to update cart empty state
function updateCartEmptyState() {
    const cart = getCart();
    const emptyCartElement = document.getElementById('empty-cart');
    const cartItemsElement = document.getElementById('cart-items');
    const cartSummaryElement = document.getElementById('cart-summary');
    
    if (cart.items.length === 0) {
        if (emptyCartElement) emptyCartElement.style.display = 'block';
        if (cartItemsElement) cartItemsElement.style.display = 'none';
        if (cartSummaryElement) cartSummaryElement.style.display = 'none';
    } else {
        if (emptyCartElement) emptyCartElement.style.display = 'none';
        if (cartItemsElement) cartItemsElement.style.display = 'block';
        if (cartSummaryElement) cartSummaryElement.style.display = 'block';
    }
}

// Function to add item to cart
function addToCart(item, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Get current cart
    const cart = getCart();
    
    // Add item to cart
    cart.items.push(item);
    
    // Save updated cart
    saveCart(cart);
    
    // Update UI
    updateCartCount();
    
    // Show success message
    showToast('Success', 'Item added to cart', 'success');
    
    // If this was triggered by a button, show the cart
    if (event && event.target) {
        window.location.href = '/dealer/cart';
    }
}

// Function to remove item from cart
function removeFromCart(index) {
    const cart = getCart();
    if (index >= 0 && index < cart.items.length) {
        cart.items.splice(index, 1);
        saveCart(cart);
        updateCartCount();
        renderCart();
        showToast('Success', 'Item removed from cart', 'success');
    }
}

// Function to render cart items
function renderCart() {
    const cart = getCart();
    const cartItemsElement = document.getElementById('cart-items');
    
    if (!cartItemsElement) return;
    
    if (cart.items.length === 0) {
        cartItemsElement.innerHTML = '<tr><td colspan="5" class="text-center">Your cart is empty</td></tr>';
        return;
    }
    
    let html = '';
    cart.items.forEach((item, index) => {
        html += `
            <tr>
                <td>${item.name || 'Unnamed Item'}</td>
                <td>${item.quantity || 1}</td>
                <td>₹${item.price || '0.00'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    cartItemsElement.innerHTML = html;
    updateCartEmptyState();
}

// Function to initialize cart
function initCart() {
    // Update cart count on page load
    updateCartCount();
    
    // If we're on the cart page, render the cart
    if (window.location.pathname.includes('/dealer/cart')) {
        renderCart();
    }
    
    // Add event listener for remove buttons
    document.addEventListener('click', function(e) {
        if (e.target.closest('.remove-from-cart')) {
            e.preventDefault();
            const index = parseInt(e.target.closest('.remove-from-cart').dataset.index);
            removeFromCart(index);
        }
    });
}

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initCart();
});

// Make functions available globally
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartCount = updateCartCount;
