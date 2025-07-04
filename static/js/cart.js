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

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Initialize company info
    initCompanyInfo();
    
    // Handle change company button click
    const changeCompanyBtn = document.getElementById('changeCompanyBtn');
    if (changeCompanyBtn) {
        changeCompanyBtn.addEventListener('click', function() {
            // Redirect to product selection page which will handle company change
            window.location.href = '/select-product';
        });
    }
    
    // Initialize the cart
    initializeCart();
    
    // Add debug logs for remove button clicks
    document.addEventListener('click', function(event) {
        if (event.target.closest('.remove-item-form')) {
            console.log('Remove button clicked');
        }
    });
});

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

function setupQuantityHandlers() {
    console.log('Setting up quantity handlers...');
    
    // Use event delegation for quantity inputs
    document.addEventListener('input', function(event) {
        const input = event.target;
        if (input.matches('.quantity-input')) {
            console.log('Quantity input changed:', input.value);
            const index = input.dataset.index;
            console.log('Item index:', index);
            
            // Find the closest cart item container
            const cartItem = input.closest('.cart-item');
            if (!cartItem) {
                console.error('Cart item container not found');
                return;
            }
            
            // Find the update button within the same cart item
            const updateBtn = cartItem.querySelector('.update-quantity-btn');
            console.log('Update button found:', updateBtn);
            
            if (updateBtn) {
                // Ensure the button has the correct data-index
                if (updateBtn.dataset.index !== index) {
                    updateBtn.dataset.index = index;
                }
                
                // Get the original quantity from the data attribute
                const originalQty = parseInt(input.getAttribute('data-original-quantity') || input.value);
                const newQty = parseInt(input.value) || 1;
                
                // Enable/disable button based on whether quantity has changed
                updateBtn.disabled = (newQty === originalQty);
                
                // Change button style based on state
                if (newQty === originalQty) {
                    updateBtn.classList.remove('btn-success');
                    updateBtn.classList.add('btn-outline-success');
                } else {
                    updateBtn.classList.remove('btn-outline-success');
                    updateBtn.classList.add('btn-success');
                }
            } else {
                console.error('Update button not found in cart item');
            }
        }
    });
    
    // Handle update button clicks
    document.addEventListener('click', function(event) {
        const updateBtn = event.target.closest('.update-quantity-btn');
        if (updateBtn && !updateBtn.disabled) {
            const index = updateBtn.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            if (input) {
                const newQuantity = parseInt(input.value) || 1;
                updateCartItemQuantity(index, newQuantity);
            }
        }
    });

    // Handle quantity decrease button clicks
    document.addEventListener('click', function(event) {
        const decreaseBtn = event.target.closest('.quantity-decrease');
        if (decreaseBtn) {
            event.preventDefault();
            const index = decreaseBtn.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            let value = parseInt(input.value) || 1;
            if (value > 1) {
                input.value = value - 1;
                // Show update button
                const updateBtn = document.querySelector(`.update-quantity-btn[data-index="${index}"]`);
                if (updateBtn) {
                    updateBtn.classList.remove('d-none');
                }
            }
        }
    });

    // Handle quantity increase button clicks
    document.addEventListener('click', function(event) {
        const increaseBtn = event.target.closest('.quantity-increase');
        if (increaseBtn) {
            event.preventDefault();
            const index = increaseBtn.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            input.value = (parseInt(input.value) || 1) + 1;
            // Show update button
            const updateBtn = document.querySelector(`.update-quantity-btn[data-index="${index}"]`);
            if (updateBtn) {
                updateBtn.classList.remove('d-none');
            }
        }
    });

    // Handle update button clicks
    document.addEventListener('click', function(event) {
        const updateBtn = event.target.closest('.update-quantity-btn');
        if (updateBtn) {
            event.preventDefault();
            event.stopPropagation();
            const index = updateBtn.dataset.index;
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            let value = parseInt(input.value) || 1;
            if (value < 1) value = 1;
            input.value = value; // Ensure minimum value of 1
            updateCartItemQuantity(index, value, () => {
                // Hide the update button after successful update
                updateBtn.classList.add('d-none');
            });
        }
    });
    
    // Also update quantity when pressing Enter in the input field
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const input = event.target;
            if (input.classList.contains('quantity-input')) {
                event.preventDefault();
                const index = input.dataset.index;
                const updateBtn = document.querySelector(`.update-quantity-btn[data-index="${index}"]`);
                if (updateBtn && !updateBtn.classList.contains('d-none')) {
                    updateBtn.click();
                }
            }
        }
    });
}

function setupRemoveHandlers() {
    // Use event delegation for remove item buttons
    document.addEventListener('click', function(event) {
        // Check if the clicked element or any of its parents have the remove-item-form class
        const removeForm = event.target.closest('.remove-item-form');
        if (removeForm) {
            event.preventDefault();
            const index = removeForm.dataset.index;
            if (confirm('Are you sure you want to remove this item from your cart?')) {
                removeCartItem(index);
            }
        }
    });
}

function updateCartItemQuantity(index, newQuantity, onSuccess = null) {
    console.log(`Updating cart item ${index} quantity to ${newQuantity}`);
    
    const itemElement = document.querySelector(`.cart-item[data-index="${index}"]`);
    if (!itemElement) {
        console.error(`Item element not found for index ${index}`);
        return;
    }

    // Show loading state
    const originalContent = itemElement.innerHTML;
    itemElement.style.opacity = '0.7';
    itemElement.style.pointerEvents = 'none';
    
    console.log('Sending request to update cart quantity...');
    
    // Get the current URL and construct the update URL
    // Use the current path to handle potential subdirectories
    const baseUrl = window.location.origin;
    const pathSegments = window.location.pathname.split('/');
    // Remove any empty segments and the current page
    const basePath = pathSegments.slice(0, -1).filter(Boolean).join('/');
    const updateUrl = `${baseUrl}${basePath ? '/' + basePath : ''}/update_cart_quantity`;
    console.log('Using update URL:', updateUrl);

    fetch(updateUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ 
            index: parseInt(index),
            quantity: parseInt(newQuantity)
        }),
        credentials: 'same-origin' // Include cookies for session
    })
    .then(async response => {
        console.log('Received response status:', response.status);
        
        // First try to parse as JSON, but handle non-JSON responses
        let responseData;
        const responseText = await response.text();
        console.log('Raw response text:', responseText);
        
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse response as JSON:', e);
            throw new Error(`Server returned ${response.status}: ${response.statusText}\n${responseText.substring(0, 200)}`);
        }
        
        if (!response.ok) {
            console.error('Error response from server:', responseData);
            throw new Error(responseData.error || 'Failed to update quantity');
        }
        
        return responseData;
    })
    .then(data => {
        if (data.success) {
            if (data.cart_count !== undefined) {
                updateCartCount(data.cart_count);
            }
            if (itemElement.dataset.type === 'mpack') {
                calculateMPackPrices(itemElement);
            } else if (itemElement.dataset.type === 'blanket') {
                calculateBlanketPrices(itemElement);
            }
            updateCartTotals();
            showToast('Success', 'Quantity updated', 'success');
            
            // Update the original quantity to the new value
            const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
            if (input) {
                input.setAttribute('data-original-quantity', newQuantity);
                
                // Update button state
                const updateBtn = document.querySelector(`.update-quantity-btn[data-index="${index}"]`);
                if (updateBtn) {
                    updateBtn.disabled = true;
                    updateBtn.classList.remove('btn-success');
                    updateBtn.classList.add('btn-outline-success');
                }
            }
            
            // Call the success callback if provided
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        } else {
            throw new Error(data.error || 'Failed to update quantity');
        }
    })
    .catch(error => {
        console.error('Error updating quantity:', error);
        
        // Show detailed error message
        let errorMessage = 'Failed to update quantity';
        if (error.message.includes('404')) {
            errorMessage = 'Server endpoint not found. Please refresh the page and try again.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast('Error', errorMessage, 'error');
        
        // Restore the original quantity in the input
        const input = document.querySelector(`.quantity-input[data-index="${index}"]`);
        if (input) {
            input.value = newQuantity > 1 ? newQuantity - 1 : 1;
        }
        
        // Make sure the update button is visible if there was an error
        const updateBtn = document.querySelector(`.update-quantity-btn[data-index="${index}"]`);
        if (updateBtn) {
            updateBtn.classList.remove('d-none');
        }
    })
    .finally(() => {
        itemElement.style.opacity = '';
        itemElement.style.pointerEvents = '';
    });
}

function removeCartItem(index) {
    console.log('Attempting to remove item at index:', index);
    const itemElement = document.querySelector(`.cart-item[data-index="${index}"]`);
    
    if (!itemElement) {
        console.error('Item element not found in DOM');
        showToast('Error', 'Item not found in cart', 'error');
        return;
    }
    
    // Show loading state
    const originalContent = itemElement.innerHTML;
    itemElement.innerHTML = '<td colspan="10" class="text-center py-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div> Removing item...</td>';
    
    fetch('/remove_from_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ index: parseInt(index) })
    })
    .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
            return response.json().then(err => { 
                console.error('Server error:', err);
                throw err; 
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Remove from cart response:', data);
        if (data.success) {
            // Remove the item from the UI
            itemElement.remove();
            
            // Update cart count
            updateCartCount(data.cart_count || 0);
            
            // Update totals
            updateCartTotals();
            
            // Show success message
            showToast('Success', 'Item removed from cart', 'success');
            
            // Check if cart is empty and show empty message if needed
            const cartItems = document.querySelectorAll('.cart-item');
            if (cartItems.length === 0) {
                document.getElementById('emptyCart').style.display = 'block';
                document.getElementById('cartItems').style.display = 'none';
                document.getElementById('cartTotals').style.display = 'none';
                document.getElementById('checkoutSection').style.display = 'none';
            }
            
            // Update any other UI elements that might depend on cart items
            updateAllItemIndices();
        } else {
            throw new Error(data.error || 'Failed to remove item');
        }
    })
    .catch(error => {
        console.error('Error removing item:', error);
        // Restore original content on error
        itemElement.innerHTML = originalContent;
        showToast('Error', error.message || 'An error occurred while removing the item', 'error');
    });
}

function updateAllItemIndices() {
    console.log('Updating cart item indices...');
    
    // Update data-index attributes of all cart items to match their new positions
    const items = document.querySelectorAll('.cart-item');
    items.forEach((item, newIndex) => {
        const oldIndex = item.getAttribute('data-index');
        if (oldIndex !== String(newIndex)) {
            console.log(`Updated item index from ${oldIndex} to ${newIndex}`);
        }
        
        // Update the cart item's data-index
        item.setAttribute('data-index', newIndex);
        
        // Update all elements within this item that reference the index
        const updateElements = [
            '.quantity-input',
            '.quantity-increase',
            '.quantity-decrease',
            '.update-quantity-btn',
            '.remove-item-btn',
            '.remove-item-form',
            '[data-item-index]'
        ];
        
        updateElements.forEach(selector => {
            const elements = item.querySelectorAll(selector);
            elements.forEach(el => {
                el.setAttribute('data-index', newIndex);
            });
        });
        
        // Update any form actions that might include the index
        const forms = item.querySelectorAll('form[action*="index="]');
        forms.forEach(form => {
            form.action = form.action.replace(/index=\d+/, `index=${newIndex}`);
        });
    });
    
    console.log('Finished updating cart item indices');
}


// Calculate product prices based on type (without quantity handling)
function calculateProductPrices(container) {
    if (container.dataset.type === 'mpack') {
        calculateMPackPrices(container);
    } else if (container.dataset.type === 'blanket') {
        calculateBlanketPrices(container);
    }
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
        
        // Create a container for the left-aligned content
        const leftContainer = document.createElement('div');
        leftContainer.className = 'mpack-left-content';
        priceGrid.appendChild(leftContainer);

        // Add heading
        const heading = document.createElement('div');
        heading.className = 'price-heading fw-bold mb-2';
        heading.textContent = 'MPack';
        leftContainer.appendChild(heading);

        // Add a divider
        const divider = document.createElement('div');
        divider.className = 'border-top my-2';
        leftContainer.appendChild(divider);

        // Create price rows container
        const priceContainer = document.createElement('div');
        priceContainer.className = 'price-container';
        leftContainer.appendChild(priceContainer);

        const createPriceRow = (label, value, isBold = false) => {
            const row = document.createElement('div');
            row.className = `price-row d-flex justify-content-between ${isBold ? 'fw-bold' : ''}`;
            row.innerHTML = `
                <span class="price-label">${label}</span>
                <span class="price-value">${value}</span>
            `;
            return row;
        };
        
        // Add quantity row with controls first
        const quantityRow = document.createElement('div');
        quantityRow.className = 'price-row d-flex justify-content-between align-items-center mb-2';
        quantityRow.innerHTML = `
            <span class="price-label fw-medium">Quantity:</span>
            <div class="d-flex align-items-stretch" style="max-width: 150px;">
                <button class="btn btn-outline-secondary quantity-decrease p-0 d-flex align-items-center justify-content-center" 
                        style="width: 36px; height: 36px;"
                        data-index="${container.dataset.index}">
                    <i class="fas fa-minus"></i>
                </button>
                <input type="number" 
                       class="form-control text-center quantity-input border-start-0 border-end-0 rounded-0" 
                       value="${quantity}" 
                       min="1" 
                       style="height: 36px;"
                       data-index="${container.dataset.index}">
                <button class="btn btn-outline-secondary quantity-increase p-0 d-flex align-items-center justify-content-center"
                        style="width: 36px; height: 36px;"
                        data-index="${container.dataset.index}">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;
        priceContainer.appendChild(quantityRow);
        
        // Add unit price row
        priceContainer.appendChild(createPriceRow('Unit Price:', `₹${unitPrice.toFixed(2)}`));
        // Add subtotal row
        priceContainer.appendChild(createPriceRow('Subtotal:', `₹${subtotal.toFixed(2)}`));
        
        // Add discount row if applicable
        if (discountPercent > 0) {
            priceContainer.appendChild(createPriceRow(
                `Discount (${discountPercent}%):`, 
                `-₹${discountAmount.toFixed(2)}`
            ));
        }
        
        // Add GST row
        priceContainer.appendChild(createPriceRow(
            `GST (${gstPercent}%):`, 
            `₹${gstAmount.toFixed(2)}`
        ));
        
        // Add total row with border top
        const totalRow = createPriceRow('Total:', `₹${finalTotal.toFixed(2)}`, true);
        totalRow.classList.add('border-top', 'pt-2', 'mt-2');
        priceContainer.appendChild(totalRow);
        
        // Remove button is now in the template
        
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
    let priceGrid = container.querySelector('.price-grid');
    if (!priceGrid) {
        // Create a new grid if it doesn't exist (keeps layout consistent with MPack products)
        priceGrid = document.createElement('div');
        priceGrid.className = 'price-grid';
        container.appendChild(priceGrid);
    } else {
        // Clear existing content before re-building
        priceGrid.innerHTML = '';
    }
        
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

// Check for identical MPack items in the cart
function checkForDuplicateMpacks() {
    const mpackItems = document.querySelectorAll('.cart-item[data-type="mpack"]');
    const itemsToRemove = [];
    
    // First pass: identify truly identical items (all properties must match)
    for (let i = 0; i < mpackItems.length; i++) {
        const item1 = mpackItems[i];
        if (!item1) continue; // Skip if already marked for removal
        
        const item1Data = {
            machine: item1.dataset.machine || '',
            thickness: item1.dataset.thickness || '',
            size: item1.dataset.size || '',
            // Add any other properties that make items unique
            basePrice: item1.dataset.basePrice || '',
            barPrice: item1.dataset.barPrice || '',
            // Add other relevant attributes that make items unique
        };
        
        for (let j = i + 1; j < mpackItems.length; j++) {
            const item2 = mpackItems[j];
            if (!item2) continue; // Skip if already marked for removal
            
            const item2Data = {
                machine: item2.dataset.machine || '',
                thickness: item2.dataset.thickness || '',
                size: item2.dataset.size || '',
                basePrice: item2.dataset.basePrice || '',
                barPrice: item2.dataset.barPrice || '',
                // Add other relevant attributes that make items unique
            };
            
            // Check if all properties match
            const allPropertiesMatch = Object.keys(item1Data).every(key => 
                String(item1Data[key]).toLowerCase() === String(item2Data[key]).toLowerCase()
            );
            
            if (allPropertiesMatch) {
                console.log(`Found identical MPack items at indices ${i} and ${j}`, item1Data);
                itemsToRemove.push({ index: j, existingIndex: i });
                mpackItems[j] = null; // Mark as processed
            }
        }
    }
    
    // Second pass: combine quantities of identical items
    itemsToRemove.forEach(({ index, existingIndex }) => {
        const existingItem = mpackItems[existingIndex];
        const duplicateItem = mpackItems[index];
        
        if (existingItem && duplicateItem) {
            const existingQty = parseInt(existingItem.querySelector('.quantity-input')?.value || '1');
            const duplicateQty = parseInt(duplicateItem.querySelector('.quantity-input')?.value || '1');
            const newQty = existingQty + duplicateQty;
            
            // Update the existing item's quantity
            const input = existingItem.querySelector('.quantity-input');
            if (input) {
                input.value = newQty;
                input.setAttribute('data-original-quantity', newQty);
                
                // Trigger quantity change event
                const event = new Event('input', { bubbles: true });
                input.dispatchEvent(event);
                
                console.log(`Combined quantities: ${existingQty} + ${duplicateQty} = ${newQty}`);
            }
            
            // Remove the duplicate item
            if (duplicateItem.parentNode) {
                duplicateItem.remove();
                console.log('Removed duplicate item');
            }
        }
    });
    
    // Update indices if any items were removed
    if (itemsToRemove.length > 0) {
        console.log(`Updated ${itemsToRemove.length} duplicate items`);
        updateAllItemIndices();
    } else {
        console.log('No duplicate items found');
    }
}

// Function to remove the second MPack when duplicates are found
function removeSecondMpack(duplicateIndex) {
    if (confirm('You already have an MPack in your cart. Would you like to remove the duplicate?')) {
        removeCartItem(duplicateIndex);
    }
}

// Function to toggle quotation section
function toggleQuotationSection(show = null) {
    const section = document.getElementById('quotationSection');
    if (!section) return;
    
    if (show === null) {
        // Toggle current state
        show = section.style.display === 'none' || !section.style.display;
    }
    
    section.style.display = show ? 'block' : 'none';
    
    // Update button text
    const toggleBtn = document.getElementById('toggleQuotationBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = show ? 
            '<i class="fas fa-eye-slash me-1"></i> Hide Quotation' : 
            '<i class="fas fa-eye me-1"></i> Show Quotation';
    }
}

// Initialize the check when the page loads
document.addEventListener('DOMContentLoaded', function() {
    checkForDuplicateMpacks();
    
    // Handle remove duplicate MPack button click
    document.getElementById('removeDuplicateMpackBtn')?.addEventListener('click', removeSecondMpack);
    
    // Initialize quotation section to be hidden by default
    toggleQuotationSection(false);
    
    // Add click handler for toggle button if it exists
    const toggleBtn = document.getElementById('toggleQuotationBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            toggleQuotationSection();
        });
    }
    
    // Also check after any cart updates
    document.addEventListener('cartUpdated', function() {
        checkForDuplicateMpacks();
    });
    
    // Set up mutation observer for cart changes
    const cartContainer = document.querySelector('.cart-items');
    if (cartContainer) {
        const observer = new MutationObserver(function() {
            checkForDuplicateMpacks();
        });
        observer.observe(cartContainer, { childList: true, subtree: true });
    }
});

// End of file
