// Helper function to round numbers to 2 decimal places
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

// Function to calculate item prices based on type
function calculateItemPrices(item) {
    // This function is no longer needed as calculations are done server-side
    // We'll keep it for backward compatibility
    if (!item.calculations) {
        if (item.type === 'mpack') {
            const price = parseFloat(item.unit_price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const gstPercent = parseFloat(item.gst_percent) || 18;
            
            const discountAmount = (price * quantity * discountPercent / 100);
            const priceAfterDiscount = (price * quantity) - discountAmount;
            const gstAmount = (priceAfterDiscount * gstPercent / 100);
            const finalTotal = priceAfterDiscount + gstAmount;
            
            item.calculations = {
                unitPrice: parseFloat(price.toFixed(2)),
                quantity: quantity,
                discountPercent: discountPercent,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                priceAfterDiscount: parseFloat(priceAfterDiscount.toFixed(2)),
                gstPercent: gstPercent,
                gstAmount: round(gstAmount, 2),
                finalTotal: round(finalTotal, 2)
            };
        } else if (item.type === 'blanket') {
            const basePrice = parseFloat(item.base_price) || 0;
            const barPrice = parseFloat(item.bar_price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const gstPercent = parseFloat(item.gst_percent) || 18;
            
            const pricePerUnit = basePrice + barPrice;
            const subtotal = pricePerUnit * quantity;
            const discountAmount = subtotal * (discountPercent / 100);
            const discountedSubtotal = subtotal - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            item.calculations = {
                pricePerUnit: round(pricePerUnit, 2),
                subtotal: round(subtotal, 2),
                discountAmount: round(discountAmount, 2),
                discountedSubtotal: round(discountedSubtotal, 2),
                gstAmount: round(gstAmount, 2),
                finalTotal: round(finalTotal, 2)
            };
        }
    }
    return item.calculations;
}

// Function to add item to cart
function addToCart(item, event) {
    item = calculateItemPrices(item);
    const addToCartBtn = event.target;
    const originalText = addToCartBtn.innerHTML;
    
    addToCartBtn.disabled = true;
    addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    fetch('/add_to_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify(item)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateCartCount();
            showToast('Success', 'Item added to cart', 'success');
        } else {
            showToast('Error', data.message || 'Failed to add item to cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error adding to cart:', error);
        showToast('Error', 'An error occurred while adding to cart', 'error');
    })
    .finally(() => {
        addToCartBtn.disabled = false;
        addToCartBtn.innerHTML = originalText;
    });
}

// Function to update cart count in the UI
function updateCartCount() {
    fetch('/get_cart_count')
        .then(response => response.json())
        .then(data => {
            const cartCount = document.getElementById('cart-count');
            if (cartCount) {
                cartCount.textContent = data.count;
                cartCount.style.display = data.count > 0 ? 'inline' : 'none';
            }
        })
        .catch(error => console.error('Error updating cart count:', error));
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
        toastContainer.style.zIndex = '1100';
        document.body.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.style.marginBottom = '10px';
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <strong>${title}</strong><br>${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    // Add to container
    toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Initialize price calculations when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Initialize cart handlers
    initializeCartCalculations();
    setupQuantityHandlers();
    setupRemoveHandlers();
    
    // Update cart totals and UI
    updateCartTotals();
    updateCartCount();
    
    // Show/hide empty cart message based on initial cart state
    const cartItems = document.querySelectorAll('.cart-item');
    const emptyCart = document.getElementById('emptyCart');
    const cartItemsContainer = document.getElementById('cartItems');
    
    if (cartItems.length === 0) {
        if (emptyCart) emptyCart.style.display = 'block';
        if (cartItemsContainer) cartItemsContainer.style.display = 'none';
    } else {
        if (emptyCart) emptyCart.style.display = 'none';
        if (cartItemsContainer) cartItemsContainer.style.display = 'block';
    }
});

function initializeCartCalculations() {
    const cartItems = document.querySelectorAll('.cart-item');
    cartItems.forEach(item => {
        calculateProductPrices(item);
    });
}

function updateCartTotals() {
    let total = 0; // total after GST per item
    let totalItems = 0;
    const cartItems = document.querySelectorAll('.cart-item');
    
    // Show/hide empty cart message
    const emptyCart = document.getElementById('emptyCart');
    const cartItemsContainer = document.getElementById('cartItems');
    
    if (cartItems.length === 0) {
        if (emptyCart) emptyCart.style.display = 'block';
        if (cartItemsContainer) cartItemsContainer.style.display = 'none';
        
        // Clear the cart summary
        const cartSummary = document.getElementById('cartSummary');
        if (cartSummary) {
            cartSummary.innerHTML = '';
        }
        return;
    } else {
        if (emptyCart) emptyCart.style.display = 'none';
        if (cartItemsContainer) cartItemsContainer.style.display = 'block';
    }
    
    cartItems.forEach(item => {
        const type = item.dataset.type;
        const quantity = parseInt(item.dataset.quantity) || 1;
        
        if (type === 'mpack') {
            // Get price from data attributes or calculations
            const unitPrice = parseFloat(item.dataset.unitPrice) || 0;
            const discountPercent = parseFloat(item.dataset.discountPercent) || 0;
            const gstPercent = parseFloat(item.dataset.gstPercent) || 12;
            
            // Calculate prices for mpack
            const subtotal = unitPrice * quantity;
            const discountAmount = subtotal * (discountPercent / 100);
            const discountedSubtotal = subtotal - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            // Update item's price display
            updateItemDisplay(item, {
                finalTotal,
                discountAmount,
                gstAmount,
                quantity
            });
            
            total += finalTotal;
            totalItems += quantity;
            
        } else if (type === 'blanket') {
            const basePrice = parseFloat(item.dataset.basePrice) || 0;
            const barPrice = parseFloat(item.dataset.barPrice) || 0;
            const pricePerUnit = basePrice + barPrice;
            const discountPercent = parseFloat(item.dataset.discountPercent) || 0;
            const gstPercent = parseFloat(item.dataset.gstPercent) || 18;
            
            // Calculate prices for blanket
            const subtotalItem = pricePerUnit * quantity;
            const discountAmount = subtotalItem * (discountPercent / 100);
            const discountedSubtotal = subtotalItem - discountAmount;
            const gstAmount = (discountedSubtotal * gstPercent) / 100;
            const finalTotal = discountedSubtotal + gstAmount;
            
            // Update item's price display
            updateItemDisplay(item, {
                finalTotal,
                discountAmount,
                gstAmount,
                quantity
            });
            
            total += finalTotal;
            totalItems += quantity;
        }
    });
    
    // Update the cart summary with total after GST
    const cartSummary = document.getElementById('cartSummary');
    if (cartSummary) {
        const orderTotal = total;
        cartSummary.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Order Summary</h5>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Total (${totalItems} ${totalItems === 1 ? 'item' : 'items'}):</span>

                        <span>₹${orderTotal.toFixed(2)}</span>

                    </div>
                    <button class="btn btn-primary w-100 mt-3">Proceed to Checkout</button>
                </div>
            </div>
        `;
    }
}

function setupQuantityHandlers() {
    // Handle quantity increase
    document.querySelectorAll('.quantity-increase').forEach(button => {
        button.addEventListener('click', function() {
            const index = this.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            if (input) {
                input.value = parseInt(input.value) + 1;
                updateCartItemQuantity(index, input.value);
            }
        });
    });
    
    // Handle quantity decrease
    document.querySelectorAll('.quantity-decrease').forEach(button => {
        button.addEventListener('click', function() {
            const index = this.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            if (input && parseInt(input.value) > 1) {
                input.value = parseInt(input.value) - 1;
                updateCartItemQuantity(index, input.value);
            }
        });
    });
    
    // Handle direct input
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', function() {
            const index = this.dataset.index;
            const value = parseInt(this.value) || 1;
            this.value = Math.max(1, value);
            updateCartItemQuantity(index, this.value);
        });
    });
}

function setupRemoveHandlers() {
    // Handle remove item
    document.querySelectorAll('.remove-item').forEach(button => {
        button.addEventListener('click', function() {
            const index = this.dataset.index;
            if (confirm('Are you sure you want to remove this item from your cart?')) {
                removeCartItem(index);
            }
        });
    });
}

function updateCartItemQuantity(index, newQuantity) {
    fetch('/update_cart_item', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({
            index: index,
            quantity: newQuantity
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the cart display
            const item = document.querySelector(`.cart-item[data-index="${index}"]`);
            if (item) {
                item.dataset.quantity = newQuantity;
                calculateProductPrices(item);
                updateCartTotals();
            }
            showToast('Success', 'Cart updated', 'success');
        } else {
            showToast('Error', data.message || 'Failed to update cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error updating cart:', error);
        showToast('Error', 'An error occurred while updating the cart', 'error');
    });
}

function removeCartItem(index) {
    fetch('/remove_from_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ index: parseInt(index) })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Remove the item from the DOM
            const item = document.querySelector(`.cart-item[data-index="${index}"]`);
            if (item) {
                item.remove();
                updateCartTotals();
                updateCartCount();
                showToast('Success', 'Item removed from cart', 'success');
                
                // Show empty cart message if no items left
                if (document.querySelectorAll('.cart-item').length === 0) {
                    document.getElementById('emptyCart').style.display = 'block';
                    document.getElementById('cartItems').style.display = 'none';
                }
            }
        } else {
            showToast('Error', data.error || 'Failed to remove item', 'error');
        }
    })
    .catch(error => {
        console.error('Error removing item:', error);
        showToast('Error', error.error || 'An error occurred while removing the item', 'error');
    });
}

function getCSRFToken() {
    // Get CSRF token from cookie or meta tag
    const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrftoken='))
        ?.split('=')[1];
    
    return cookieValue || document.querySelector('meta[name="csrf-token"]')?.content;
}

// Calculate product prices based on type
function calculateProductPrices(container) {
    if (!container || !container.dataset) return null;
    
    if (container.dataset.type === 'mpack') {
        return calculateMPackPrices(container);
    } else if (container.dataset.type === 'blanket') {
        return calculateBlanketPrices(container);
    }
    return null;
}

// Calculate MPack prices
function calculateMPackPrices(container) {
    try {
        // Get data attributes
        const unitPrice = parseFloat(container.dataset.unitPrice) || 0;
        const quantity = parseInt(container.dataset.quantity) || 1;
        const discountPercent = parseFloat(container.dataset.discountPercent) || 0;
        const gstPercent = parseFloat(container.dataset.gstPercent) || 18;
        
        // Calculate prices
        const subtotal = unitPrice * quantity;
        const discountAmount = subtotal * (discountPercent / 100);
        const priceAfterDiscount = subtotal - discountAmount;
        const gstAmount = (priceAfterDiscount * gstPercent) / 100;
        const finalTotal = priceAfterDiscount + gstAmount;
        
        // Update the data attributes for dynamic calculations
        container.dataset.unitPrice = unitPrice;
        container.dataset.quantity = quantity;
        container.dataset.discountPercent = discountPercent;
        container.dataset.gstPercent = gstPercent;
        
        // Find or create price elements
        let priceGrid = container.querySelector('.price-grid');
        if (!priceGrid) {
            priceGrid = document.createElement('div');
            priceGrid.className = 'price-grid';
            container.appendChild(priceGrid);
        } else {
            priceGrid.innerHTML = ''; // Clear existing content
        }
        
        // Create price rows
        const createPriceRow = (label, value, isBold = false) => {
            const row = document.createElement('div');
            row.className = `price-row d-flex justify-content-between ${isBold ? 'fw-bold' : ''}`;
            row.innerHTML = `
                <span class="price-label">${label}</span>
                <span class="price-value">${value}</span>
            `;
            return row;
        };
        
        // Add unit price row
        priceGrid.appendChild(createPriceRow('Unit Price:', `₹${unitPrice.toFixed(2)}`));
        // Add subtotal row
        priceGrid.appendChild(createPriceRow('Subtotal:', `₹${subtotal.toFixed(2)}`));
        
        // Add quantity row with controls
        const quantityRow = document.createElement('div');
        quantityRow.className = 'price-row d-flex justify-content-between align-items-center';
        quantityRow.innerHTML = `
            <span class="price-label">Quantity:</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary quantity-decrease" data-index="${container.dataset.index}">-</button>
                <input type="number" class="form-control form-control-sm mx-1 quantity-input" 
                       value="${quantity}" min="1" style="width: 60px;" 
                       data-index="${container.dataset.index}">
                <button class="btn btn-sm btn-outline-secondary quantity-increase" data-index="${container.dataset.index}">+</button>
            </div>
        `;
        priceGrid.appendChild(quantityRow);
        
        // Add discount row if applicable
        if (discountPercent > 0) {
            priceGrid.appendChild(createPriceRow(
                `Discount (${discountPercent}%):`, 
                `-₹${discountAmount.toFixed(2)}`
            ));
        }
        
        // Add GST row
        priceGrid.appendChild(createPriceRow(
            `GST (${gstPercent}%):`, 
            `₹${gstAmount.toFixed(2)}`
        ));
        
        // Add total row with border top
        const totalRow = createPriceRow('Total:', `₹${finalTotal.toFixed(2)}`, true);
        totalRow.classList.add('border-top', 'pt-2', 'mt-2');
        priceGrid.appendChild(totalRow);
        
        return {
            unitPrice,
            quantity,
            discountPercent,
            discountAmount,
            priceAfterDiscount,
            gstPercent,
            gstAmount,
            finalTotal
        };
        
    } catch (error) {
        console.error('Error in calculateMPackPrices:', error);
        return null;
    }
}

// Calculate Blanket prices
function calculateBlanketPrices(container) {
    // Get data attributes
    const basePrice = parseFloat(container.dataset.basePrice) || 0;
    const barPrice = parseFloat(container.dataset.barPrice) || 0;
    const quantity = parseInt(container.dataset.quantity) || 1;
    const discountPercent = parseFloat(container.dataset.discountPercent) || 0;
    const gstPercent = parseFloat(container.dataset.gstPercent) || 18;
    
    // Calculate prices
    const pricePerUnit = basePrice + barPrice;
    const subtotal = pricePerUnit * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;
    
    // Update the data attributes
    container.dataset.basePrice = basePrice;
    container.dataset.barPrice = barPrice;
    container.dataset.quantity = quantity;
    container.dataset.discountPercent = discountPercent;
    container.dataset.gstPercent = gstPercent;
    
    // Update the UI
    const priceGrid = container.querySelector('.price-grid');
    if (priceGrid) {
        priceGrid.innerHTML = '';
        
        const createPriceRow = (label, value, isBold = false) => {
            const row = document.createElement('div');
            row.className = `price-row d-flex justify-content-between ${isBold ? 'fw-bold' : ''}`;
            row.innerHTML = `
                <span class="price-label">${label}</span>
                <span class="price-value">${value}</span>
            `;
            return row;
        };
        
        // Add base price row
        priceGrid.appendChild(createPriceRow('Base Price:', `₹${basePrice.toFixed(2)}`));
        
        // Add bar price row if applicable
        if (barPrice > 0) {
            priceGrid.appendChild(createPriceRow('Barring:', `+₹${barPrice.toFixed(2)}`));
        }
        
        // Add unit price row
        priceGrid.appendChild(createPriceRow('Unit Price:', `₹${pricePerUnit.toFixed(2)}`));
        // Add subtotal row
        priceGrid.appendChild(createPriceRow('Subtotal:', `₹${subtotal.toFixed(2)}`));
        
        // Add quantity row with controls
        const quantityRow = document.createElement('div');
        quantityRow.className = 'price-row d-flex justify-content-between align-items-center';
        quantityRow.innerHTML = `
            <span class="price-label">Quantity:</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary quantity-decrease" data-index="${container.dataset.index}">-</button>
                <input type="number" class="form-control form-control-sm mx-1 quantity-input" 
                       value="${quantity}" min="1" style="width: 60px;" 
                       data-index="${container.dataset.index}">
                <button class="btn btn-sm btn-outline-secondary quantity-increase" data-index="${container.dataset.index}">+</button>
            </div>
        `;
        priceGrid.appendChild(quantityRow);
        
        // Add discount row if applicable
        if (discountPercent > 0) {
            priceGrid.appendChild(createPriceRow(
                `Discount (${discountPercent}%):`, 
                `-₹${discountAmount.toFixed(2)}`
            ));
        }
        
        // Add GST row
        priceGrid.appendChild(createPriceRow(
            `GST (${gstPercent}%):`, 
            `₹${gstAmount.toFixed(2)}`
        ));
        
        // Add total row
        priceGrid.appendChild(createPriceRow(
            'Total:', 
            `₹${finalTotal.toFixed(2)}`,
            true
        ));
    }
    
    return {
        basePrice,
        barPrice,
        pricePerUnit,
        quantity,
        discountPercent,
        discountAmount,
        discountedSubtotal,
        gstPercent,
        gstAmount,
        finalTotal
    };
}

// Update the item's price grid based on latest calculations
function updateItemDisplay(item, data) {
    if (!item) return;

    // Update dataset values so calculateProductPrices uses latest numbers
    if (data) {
        if (data.finalTotal !== undefined) item.dataset.finalTotal = data.finalTotal;
        if (data.discountAmount !== undefined) item.dataset.discountAmount = data.discountAmount;
        if (data.gstAmount !== undefined) item.dataset.gstAmount = data.gstAmount;
        if (data.quantity !== undefined) item.dataset.quantity = data.quantity;
    }

    // Re-run the per-item calculation to regenerate the price-grid (this builds subtotal rows, etc.)
    calculateProductPrices(item);
}

// End of file
