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
            'Content-Type': 'application/json'
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

// Function to get CSRF token from cookies
function getCSRFToken() {
    const name = 'csrf_token=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }
    return '';
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

// Update company display in the cart
function updateCompanyDisplay(name, email) {
    const companyNameEl = document.getElementById('companyName');
    const companyInfoEl = document.getElementById('companyInfo');
    
    if (name && name !== 'undefined' && name !== 'Your Company') {
        companyNameEl.textContent = name;
    } else {
        companyNameEl.textContent = 'Your Company';
    }
    
    if (email && email !== 'undefined' && email !== 'email@example.com') {
        companyInfoEl.innerHTML = `<a href="mailto:${email}" id="companyEmail" class="text-muted mb-0" style="text-decoration: none;">${email}</a>`;
    } else {
        companyInfoEl.innerHTML = '<p class="text-muted mb-0" id="companyEmail">No email provided</p>';
    }
}

// Initialize company info from session storage
function initCompanyInfo() {
    const storedCompany = localStorage.getItem('selectedCompany');
    if (storedCompany) {
        try {
            const company = JSON.parse(storedCompany);
            updateCompanyDisplay(company.name, company.email);
        } catch (e) {
            console.error('Error parsing stored company:', e);
        }
    }
}

// Update company display in the navigation
function updateNavCompanyDisplay(companyName) {
    const companyDisplay = document.getElementById('companyNameDisplay');
    if (companyDisplay && companyName) {
        companyDisplay.textContent = companyName;
    }
}

// Initialize all cart handlers
function initializeCart() {
    console.log('Initializing cart...');
    
    // Store original quantities when page loads
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.setAttribute('data-original-quantity', input.value);
    });
    
    // Set up event handlers first
    console.log('Setting up quantity handlers...');
    setupQuantityHandlers();
    
    console.log('Setting up remove handlers...');
    setupRemoveHandlers();
    
    // Initialize calculations
    console.log('Initializing cart calculations...');
    initializeCartCalculations();
    
    // Update UI
    console.log('Updating cart UI...');
    updateCartCount();
    updateCartTotals();
    
    // Check if we need to show the empty cart message
    const cartItems = document.querySelectorAll('.cart-item');
    const emptyCartDiv = document.getElementById('emptyCart');
    const cartItemsDiv = document.getElementById('cartItems');
    
    console.log(`Found ${cartItems.length} cart items`);
    
    if (cartItems.length === 0) {
        console.log('No cart items, showing empty cart message');
        if (emptyCartDiv) emptyCartDiv.style.display = 'block';
        if (cartItemsDiv) cartItemsDiv.style.display = 'none';
    } else {
        console.log('Cart has items, showing cart contents');
        if (emptyCartDiv) emptyCartDiv.style.display = 'none';
        if (cartItemsDiv) cartItemsDiv.style.display = 'block';
    }
}

// Function to handle removing second MPack if present
function removeSecondMpack() {
    const mpacks = document.querySelectorAll('.cart-item[data-type="mpack"]');
    if (mpacks.length > 1) {
        mpacks[1].remove();
        updateCartTotals();
        showToast('Notice', 'Only one MPack can be in the cart. The additional MPack has been removed.', 'info');
    }
}

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Hide the cart initially to prevent layout flash
    const cartContainer = document.getElementById('cartItems');
    if (cartContainer) {
        cartContainer.style.visibility = 'hidden';
    }
    
    // Initialize company info
    initCompanyInfo();
    
    // Set up continue shopping buttons
    const continueShoppingButtons = document.querySelectorAll('#continueShoppingBtn, #continueShoppingBtnBottom');
    continueShoppingButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                // Get company ID from session storage or URL
                const companyId = sessionStorage.getItem('companyId') || 
                                 new URLSearchParams(window.location.search).get('company_id');
                
                if (companyId) {
                    // If we have a company ID, load products for that company
                    window.location.href = `/products?company_id=${companyId}`;
                } else {
                    // Fallback to regular products page
                    window.location.href = '/products';
                }
            } catch (error) {
                console.error('Error continuing shopping:', error);
                // Fallback to regular products page on error
                window.location.href = '/products';
            }
        });
    });
    
    // Set up checkout button
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/checkout';
        });
    }
    
    // Set up change company button
    const changeCompanyBtn = document.getElementById('changeCompanyBtn');
    if (changeCompanyBtn) {
        changeCompanyBtn.addEventListener('click', function() {
            window.location.href = '/select-product';
        });
    }
    
    // Set up mutation observer for cart changes
    if (cartContainer) {
        const observer = new MutationObserver(function() {
            checkForDuplicateMpacks();
            // Show the cart after initial render
            cartContainer.style.visibility = 'visible';
        });
        observer.observe(cartContainer, { 
            childList: true, 
            subtree: true,
            attributes: true,
            characterData: true
        });
        
        // Show cart after a short delay if mutation observer doesn't trigger
        setTimeout(() => {
            if (cartContainer.style.visibility !== 'visible') {
                cartContainer.style.visibility = 'visible';
            }
        }, 500);
    }
    
    // Initialize the cart
    initializeCart();
    
    // Check for duplicate mpacks on initial load
    checkForDuplicateMpacks();
    
    console.log('Cart initialization complete');
});

// Initialize cart calculations
function initializeCartCalculations() {
    const cartItems = document.querySelectorAll('.cart-item');
    cartItems.forEach(item => {
        // Only calculate prices, no quantity handlers
        if (item.dataset.type === 'mpack') {
            calculateMPackPrices(item);
        } else if (item.dataset.type === 'blanket') {
            calculateBlanketPrices(item);
        }
    });
}

// Function to calculate MPack prices
function calculateMPackPrices(item) {
    const unitPrice = parseFloat(item.getAttribute('data-unit-price') || 0);
    const quantity = parseInt(item.querySelector('.quantity-input')?.value || 1);
    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || 0);
    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || 12);
    
    // Calculate prices
    const subtotal = unitPrice * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const total = discountedSubtotal + gstAmount;
    
    return {
        subtotal: round(subtotal, 2),
        discountAmount: round(discountAmount, 2),
        discountedSubtotal: round(discountedSubtotal, 2),
        gstAmount: round(gstAmount, 2),
        total: round(total, 2)
    };
}

// Function to calculate blanket prices
function calculateBlanketPrices(item) {
    const basePrice = parseFloat(item.getAttribute('data-base-price') || 0);
    const barPrice = parseFloat(item.getAttribute('data-bar-price') || 0);
    const quantity = parseInt(item.querySelector('.quantity-input')?.value || 1);
    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || 0);
    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || 12);
    
    // Get the selected size and calculate size factor
    const sizeSelect = item.querySelector('.size-select');
    let sizeFactor = 1.0;
    if (sizeSelect) {
        const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
        sizeFactor = parseFloat(selectedOption.getAttribute('data-factor') || 1.0);
    }
    
    // Calculate prices
    const baseSubtotal = basePrice * quantity * sizeFactor;
    const barSubtotal = barPrice * quantity;
    const subtotal = baseSubtotal + barSubtotal;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const total = discountedSubtotal + gstAmount;
    
    return {
        baseSubtotal: round(baseSubtotal, 2),
        barSubtotal: round(barSubtotal, 2),
        subtotal: round(subtotal, 2),
        discountAmount: round(discountAmount, 2),
        discountedSubtotal: round(discountedSubtotal, 2),
        gstAmount: round(gstAmount, 2),
        total: round(total, 2),
        sizeFactor: sizeFactor
    };
}

// Function to calculate item prices based on type
function calculateItemPrices(item) {
    if (!item) return null;
    
    const type = item.getAttribute('data-type');
    if (type === 'mpack') {
        return calculateMPackPrices(item);
    } else if (type === 'blanket') {
        return calculateBlanketPrices(item);
    }
    return null;
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
        const orderTotal = Math.round(total * 100) / 100;
        cartSummary.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Order Summary</h5>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">Total (${totalItems} ${totalItems === 1 ? 'item' : 'items'}):</span>
                <span class="fw-bold fs-5">₹${orderTotal.toFixed(2)}</span>
            </div>
        </div>
    </div>
    `;
    }
}

// Function to handle quantity changes
function handleQuantityChange(event) {
    const input = event.target;
    const container = input.closest('.cart-item');
    const index = container ? container.dataset.index : null;
    
    if (index === null) {
        console.error('Could not find cart item index');
        return;
    }
    
    let newQuantity = parseInt(input.value);
    
    // Ensure quantity is at least 1
    if (isNaN(newQuantity) || newQuantity < 1) {
        newQuantity = 1;
        input.value = 1;
    } else {
        // Update the input value to ensure it's a valid number
        input.value = newQuantity;
    }
    
    // Update the quantity immediately
    updateCartItemQuantity(parseInt(index), newQuantity);
}



// Function to update cart item quantity
function updateCartItemQuantity(index, newQuantity) {
    const csrfToken = getCSRFToken();
    const cartItem = document.querySelector(`.cart-item[data-index="${index}"]`);
    
    if (!cartItem) {
        console.error('Cart item not found in DOM');
        return;
    }
    
    // Show loading state
    const quantityInput = cartItem.querySelector('.quantity-input');
    const originalValue = quantityInput.value;
    quantityInput.disabled = true;
    
    fetch('/update_cart_quantity', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            index: index,
            quantity: newQuantity
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Update the UI with the new data from the server
            if (data.updated_item) {
                // Update the cart item's data attributes
                const item = data.updated_item;
                cartItem.setAttribute('data-unit-price', item.unit_price || 0);
                cartItem.setAttribute('data-quantity', item.quantity || 1);
                
                // Update the quantity input
                const quantityInput = cartItem.querySelector('.quantity-input');
                if (quantityInput) {
                    quantityInput.value = item.quantity || 1;
                }
                
                // Update price displays
                const priceElements = cartItem.querySelectorAll('.price-value, .subtotal-value, .total-value');
                priceElements.forEach(el => {
                    if (el.classList.contains('subtotal-value')) {
                        const subtotal = (item.unit_price || 0) * (item.quantity || 1);
                        el.textContent = `₹${subtotal.toFixed(2)}`;
                    } else if (el.classList.contains('total-value')) {
                        const subtotal = (item.unit_price || 0) * (item.quantity || 1);
                        const discount = subtotal * ((item.discount_percent || 0) / 100);
                        const total = (subtotal - discount) * (1 + (item.gst_percent || 18) / 100);
                        el.textContent = `₹${total.toFixed(2)}`;
                    } else {
                        el.textContent = `₹${parseFloat(item.unit_price || 0).toFixed(2)}`;
                    }
                });
                
                // Recalculate totals
                updateCartTotals();
                updateCartCount();
                showToast('Success', 'Quantity updated', 'success');
            } else {
                // Fallback if updated_item is not provided
                updateCartTotals();
                updateCartCount();
                showToast('Success', 'Quantity updated', 'success');
            }
        } else {
            throw new Error(data.message || 'Failed to update quantity');
        }
    })
    .catch(error => {
        console.error('Error updating quantity:', error);
        // Revert to original value on error
        quantityInput.value = originalValue;
        showToast('Error', error.message || 'An error occurred while updating quantity', 'error');
    })
    .finally(() => {
        quantityInput.disabled = false;
    });
}

// Function to set up quantity handlers
function setupQuantityHandlers() {
    // Handle quantity increase
    document.addEventListener('click', function(event) {
        if (event.target.closest('.quantity-increase')) {
            const button = event.target.closest('.quantity-increase');
            const input = button.parentElement.querySelector('.quantity-input');
            input.value = parseInt(input.value) + 1;
            input.dispatchEvent(new Event('change'));
        }
        
        // Handle quantity decrease
        if (event.target.closest('.quantity-decrease')) {
            const button = event.target.closest('.quantity-decrease');
            const input = button.parentElement.querySelector('.quantity-input');
            if (parseInt(input.value) > 1) {
                input.value = parseInt(input.value) - 1;
                input.dispatchEvent(new Event('change'));
            }
        }
    });
    
    // Handle direct input changes
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', handleQuantityChange);
    });
}

// Function to set up remove handlers
function setupRemoveHandlers() {
    document.querySelectorAll('.remove-item-form').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const index = this.dataset.index;
            removeFromCart(e, index);
        });
    });
}

// Function to remove item from cart
function removeFromCart(event, index) {
    if (!confirm('Are you sure you want to remove this item from your cart?')) {
        return;
    }

    const csrfToken = getCSRFToken();
    
    fetch('/remove_from_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            index: parseInt(index)
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Remove the item from the DOM
            const itemElement = event.target.closest('.cart-item');
            if (itemElement) {
                itemElement.remove();
            }
            
            // Update cart totals and count
            updateCartTotals();
            updateCartCount();
            
            showToast('Success', 'Item removed from cart', 'success');
        } else {
            showToast('Error', data.message || 'Failed to remove item from cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error removing from cart:', error);
        showToast('Error', 'An error occurred while removing the item', 'error');
    });
}

// Function to check for duplicate mpacks
function checkForDuplicateMpacks() {
    const mpacks = Array.from(document.querySelectorAll('.cart-item[data-type="mpack"]'));
    if (mpacks.length > 1) {
        showToast('Notice', 'You have multiple MPacks in your cart. Please note that only one MPack can be used per order.', 'info');
    }
}

// Function to update item display
function updateItemDisplay(item, data) {
    if (!item || !data) return;
    
    // Update the data attributes
    if (data.unit_price !== undefined) {
        item.setAttribute('data-unit-price', data.unit_price);
    }
    
    if (data.quantity !== undefined) {
        item.setAttribute('data-quantity', data.quantity);
        const quantityInput = item.querySelector('.quantity-input');
        if (quantityInput) {
            quantityInput.value = data.quantity;
        }
    }
    
    // Update the price display
    const priceElement = item.querySelector('.price-value');
    if (priceElement && data.unit_price !== undefined) {
        priceElement.textContent = `₹${parseFloat(data.unit_price).toFixed(2)}`;
    }
    
    // Update subtotal if available
    const subtotalElement = item.querySelector('.subtotal-value');
    if (subtotalElement && data.subtotal !== undefined) {
        subtotalElement.textContent = `₹${parseFloat(data.subtotal).toFixed(2)}`;
    }
    
    // Update total if available
    const totalElement = item.querySelector('.total-value');
    if (totalElement && data.total !== undefined) {
        totalElement.textContent = `₹${parseFloat(data.total).toFixed(2)}`;
    }
    
    // Recalculate prices based on item type
    if (item.dataset.type === 'mpack') {
        calculateMPackPrices(item);
    } else if (item.dataset.type === 'blanket') {
        calculateBlanketPrices(item);
    }
}

// End of file
