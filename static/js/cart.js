function calculateItemPrices(item) {
    // This function is no longer needed as calculations are done server-side
    // We'll keep it for backward compatibility
    if (!item.calculations) {
        if (item.type === 'mpack') {
            const price = parseFloat(item.unit_price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            const discountPercent = parseFloat(item.discount_percent) || 0;
            const gstPercent = parseFloat(item.gst_percent) || 18;
            
            const discountAmount = (price * discountPercent / 100);
            const priceAfterDiscount = price - discountAmount;
            const gstAmount = (priceAfterDiscount * gstPercent / 100);
            const finalUnitPrice = priceAfterDiscount + gstAmount;
            const finalTotal = finalUnitPrice * quantity;
            
            item.calculations = {
                unitPrice: parseFloat(price.toFixed(2)),
                quantity: quantity,
                discountPercent: discountPercent,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                priceAfterDiscount: parseFloat(priceAfterDiscount.toFixed(2)),
                gstPercent: gstPercent,
                gstAmount: parseFloat(gstAmount.toFixed(2)),
                finalUnitPrice: parseFloat(finalUnitPrice.toFixed(2)),
                finalTotal: parseFloat(finalTotal.toFixed(2))
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
    
    return item;
}

function addToCart(item) {
    item = calculateItemPrices(item);
    const addToCartBtn = event.target;
    const originalText = addToCartBtn.innerHTML;
    
    addToCartBtn.disabled = true;
    addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    fetch('/add_to_cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Success', 'Item added to cart!', 'success');
            updateCartCount();
        } else {
            showToast('Error', data.message || 'Failed to add item to cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
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

// Calculate product prices based on type
function calculateProductPrices(container) {
    const type = container.dataset.type;
    
    if (type === 'blanket') {
        calculateBlanketPrices(container);
    } else if (type === 'mpack') {
        calculateMPackPrices(container);
    }
}

// Calculate blanket prices
function calculateBlanketPrices(container) {
    // Get data attributes
    const area = parseFloat(container.dataset.area) || 0;
    const rate = parseFloat(container.dataset.rate) || 0;
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
    
    // Update UI
    container.querySelector('.area').textContent = area.toFixed(4);
    container.querySelector('.rate').textContent = rate.toFixed(2);
    container.querySelector('.base-price').textContent = basePrice.toFixed(2);
    container.querySelector('.quantity').textContent = quantity;
    container.querySelector('.quantity-display').textContent = quantity;
    
    // Handle barring price display
    const barringRow = container.querySelector('.barring-row');
    if (barPrice > 0) {
        barringRow.classList.remove('d-none');
        container.querySelector('.bar-price-display').textContent = barPrice.toFixed(2);
        container.querySelector('.price-per-unit').textContent = pricePerUnit.toFixed(2);
    } else {
        barringRow.classList.add('d-none');
    }
    
    // Handle discount display
    const discountRow = container.querySelector('.discount-row');
    if (discountPercent > 0) {
        discountRow.classList.remove('d-none');
        container.querySelector('.discount-percent').textContent = discountPercent;
        container.querySelector('.discount-amount').textContent = discountAmount.toFixed(2);
        container.querySelector('.after-discount').textContent = discountedSubtotal.toFixed(2);
    } else {
        discountRow.classList.add('d-none');
    }
    
    // Update remaining fields
    container.querySelector('.subtotal').textContent = subtotal.toFixed(2);
    container.querySelector('.gst-percent').textContent = gstPercent;
    container.querySelector('.gst-amount').textContent = gstAmount.toFixed(2);
    container.querySelector('.final-total').textContent = finalTotal.toFixed(2);
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
        
        // Add event listeners for quantity controls
        setupQuantityHandlers();
        
        // Update cart totals
        updateCartTotals();
        
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
    try {
        console.log('Calculating Blanket prices for container:', container);
        
        // Get data attributes
        const area = parseFloat(container.dataset.area) || 0;
        const rate = parseFloat(container.dataset.rate) || 0;
        const basePrice = parseFloat(container.dataset.basePrice) || 0;
        const barPrice = parseFloat(container.dataset.barPrice) || 0;
        const quantity = parseInt(container.dataset.quantity) || 1;
        const discountPercent = parseFloat(container.dataset.discountPercent) || 0;
        const gstPercent = parseFloat(container.dataset.gstPercent) || 18;
        
        console.log('Raw values:', { area, rate, basePrice, barPrice, quantity, discountPercent, gstPercent });
        
        // Calculate prices
        const baseSubtotal = basePrice * quantity;
        const barSubtotal = barPrice * quantity;
        const subtotal = baseSubtotal + barSubtotal;
        
        // Calculate discount on the total unit price (base + bar)
        const discountAmount = subtotal * (discountPercent / 100);
        const priceAfterDiscount = subtotal - discountAmount;
        const gstAmount = (priceAfterDiscount * gstPercent) / 100;
        const finalTotal = priceAfterDiscount + gstAmount;
        
        console.log('Calculated values:', { subtotal, discountAmount, priceAfterDiscount, gstAmount, finalTotal });
        
        // Update UI - Base Price and Bar Price
        const areaEl = container.querySelector('.area');
        const rateEl = container.querySelector('.rate');
        const basePriceEl = container.querySelector('.base-price');
        const barPriceEl = container.querySelector('.bar-price');
        const barPriceRow = container.querySelector('.bar-price-row');
        const unitPriceEl = container.querySelector('.unit-price');
        
        // Update base price display
        if (areaEl && rateEl && basePriceEl) {
            areaEl.textContent = area.toFixed(2);
            rateEl.textContent = rate.toFixed(2);
            basePriceEl.textContent = (basePrice * quantity).toFixed(2);
            console.log('Updated base price row');
        } else {
            console.error('One or more base price elements not found');
        }
        
        // Update bar price display if it exists
        if (barPrice > 0 && barPriceEl && barPriceRow) {
            barPriceRow.classList.remove('d-none');
            barPriceEl.textContent = (barPrice * quantity).toFixed(2);
            console.log('Updated bar price row');
        } else if (barPriceRow) {
            barPriceRow.classList.add('d-none');
        }
        
        // Update unit price display
        if (unitPriceEl) {
            unitPriceEl.textContent = (basePrice + barPrice).toFixed(2);
        }
        
        // Update after discount amount
        const afterDiscountEl = container.querySelector('.after-discount');
        if (afterDiscountEl) {
            afterDiscountEl.textContent = priceAfterDiscount.toFixed(2);
        }
        
        // Update Quantity
        const quantityEl = container.querySelector('.quantity');
        if (quantityEl) {
            quantityEl.textContent = quantity;
            console.log('Updated quantity to:', quantity);
        } else {
            console.error('Quantity element not found');
        }
        
        // Update Subtotal
        const subtotalEl = container.querySelector('.subtotal');
        if (subtotalEl) {
            subtotalEl.textContent = (basePrice * quantity + barPrice * quantity).toFixed(2);
            console.log('Updated subtotal to:', (basePrice * quantity + barPrice * quantity).toFixed(2));
        } else {
            console.error('Subtotal element not found');
        }
        
        // Update GST and total
        const gstPercentEl = container.querySelector('.gst-percent');
        const gstAmountEl = container.querySelector('.gst-amount');
        const finalTotalEl = container.querySelector('.final-total');
        
        if (gstPercentEl && gstAmountEl && finalTotalEl) {
            gstPercentEl.textContent = gstPercent;
            gstAmountEl.textContent = gstAmount.toFixed(2);
            finalTotalEl.textContent = finalTotal.toFixed(2);
            console.log('Updated GST and total');
        } else {
            console.error('One or more total calculation elements not found');
        }
        
        console.log('Finished calculating Blanket prices');
    } catch (error) {
        console.error('Error in calculateBlanketPrices:', error);
    }
}

// Helper function to format currency values
function formatCurrency(amount) {
    return parseFloat(amount).toFixed(2);
}

// Initialize price calculations when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Initialize cart count
    updateCartCount();
    
    // Initialize cart calculations
    initializeCartCalculations();
    
    // Set up event listeners for quantity changes
    setupQuantityHandlers();
    
    // Set up event listeners for remove buttons
    setupRemoveHandlers();
});

function initializeCartCalculations() {
    // Update cart totals from server-calculated values
    updateCartTotals();
    
    // Update individual product displays
    document.querySelectorAll('.cart-item').forEach(item => {
        updateItemDisplay(item);
    });
}

function updateCartTotals() {
    const subtotalEl = document.getElementById('cart-subtotal');
    const discountEl = document.getElementById('cart-discount');
    const gstEl = document.getElementById('cart-gst');
    const totalEl = document.getElementById('cart-total');
    
    // These values are now calculated server-side and embedded in the template
    // This function is kept for backward compatibility
    if (!subtotalEl || !totalEl) return;
    
    // If we need to calculate client-side as fallback
    if (subtotalEl && subtotalEl.dataset.calculated === 'false') {
        let subtotal = 0;
        let discount = 0;
        let gst = 0;
        
        document.querySelectorAll('.cart-item').forEach(item => {
            const price = parseFloat(item.dataset.price || 0);
            const quantity = parseInt(item.dataset.quantity || 1);
            const discountPercent = parseFloat(item.dataset.discountPercent || 0);
            const gstPercent = parseFloat(item.dataset.gstPercent || 18);
            
            const itemSubtotal = price * quantity;
            const itemDiscount = itemSubtotal * (discountPercent / 100);
            const itemAfterDiscount = itemSubtotal - itemDiscount;
            const itemGst = itemAfterDiscount * (gstPercent / 100);
            
            subtotal += itemSubtotal;
            discount += itemDiscount;
            gst += itemGst;
        });
        
        subtotalEl.textContent = formatCurrency(subtotal);
        if (discountEl) discountEl.textContent = `-${formatCurrency(discount)}`;
        if (gstEl) gstEl.textContent = formatCurrency(gst);
        if (totalEl) totalEl.textContent = formatCurrency(subtotal - discount + gst);
    }
}

function updateItemDisplay(item) {
    const type = item.dataset.type;
    const calculations = JSON.parse(item.dataset.calculations || '{}');
    
    if (type === 'mpack') {
        // Update MPack item display
        const unitPriceEl = item.querySelector('.unit-price');
        const discountEl = item.querySelector('.discount-amount');
        const gstEl = item.querySelector('.gst-amount');
        const totalEl = item.querySelector('.item-total');
        
        if (unitPriceEl) unitPriceEl.textContent = formatCurrency(calculations.unitPrice || 0);
        if (discountEl) discountEl.textContent = `-${formatCurrency(calculations.discountAmount || 0)}`;
        if (gstEl) gstEl.textContent = formatCurrency(calculations.gstAmount || 0);
        if (totalEl) totalEl.textContent = formatCurrency(calculations.finalTotal || 0);
        
    } else if (type === 'blanket') {
        // Update Blanket item display
        const pricePerUnitEl = item.querySelector('.price-per-unit');
        const subtotalEl = item.querySelector('.item-subtotal');
        const discountEl = item.querySelector('.discount-amount');
        const gstEl = item.querySelector('.gst-amount');
        const totalEl = item.querySelector('.item-total');
        
        if (pricePerUnitEl) pricePerUnitEl.textContent = formatCurrency(calculations.pricePerUnit || 0);
        if (subtotalEl) subtotalEl.textContent = formatCurrency(calculations.subtotal || 0);
        if (discountEl) discountEl.textContent = `-${formatCurrency(calculations.discountAmount || 0)}`;
        if (gstEl) gstEl.textContent = formatCurrency(calculations.gstAmount || 0);
        if (totalEl) totalEl.textContent = formatCurrency(calculations.finalTotal || 0);
    }
}

function setupQuantityHandlers() {
    // Handle quantity changes
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', function() {
            const itemId = this.dataset.itemId;
            const newQuantity = parseInt(this.value) || 1;
            
            if (newQuantity < 1) {
                this.value = 1;
                return;
            }
            
            updateCartItemQuantity(itemId, newQuantity);
        });
    });
}

function setupRemoveHandlers() {
    // Handle remove item buttons
    document.querySelectorAll('.remove-item').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const itemId = this.dataset.itemId;
            removeCartItem(itemId);
        });
    });
}

function updateCartItemQuantity(itemId, newQuantity) {
    fetch(`/update_cart_item/${itemId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ quantity: newQuantity })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the UI with the new data
            location.reload(); // Reload to get fresh data from server
        } else {
            showToast('Error', data.error || 'Failed to update item quantity', 'error');
        }
    })
    .catch(error => {
        console.error('Error updating cart item:', error);
        showToast('Error', 'An error occurred while updating the cart', 'error');
    });
}

function removeCartItem(itemId) {
    if (!confirm('Are you sure you want to remove this item from your cart?')) {
        return;
    }
    
    fetch(`/remove_from_cart/${itemId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        }
    })
    .then(response => response.json())
    .then(data => {
// Helper function to round numbers to 2 decimal places
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

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
                gstAmount: parseFloat(gstAmount.toFixed(2)),
                finalTotal: parseFloat(finalTotal.toFixed(2))
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
    return item;
}

function addToCart(item) {
    item = calculateItemPrices(item);
    const addToCartBtn = event.target;
    const originalText = addToCartBtn.innerHTML;
    
    addToCartBtn.disabled = true;
    addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    fetch('/add_to_cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Success', 'Item added to cart!', 'success');
            updateCartCount();
        } else {
            showToast('Error', data.message || 'Failed to add item to cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('Error', 'An error occurred while adding to cart', 'error');
    })
    .finally(() => {
        addToCartBtn.disabled = false;
        addToCartBtn.innerHTML = originalText;
    });
}

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
    initializeCartCalculations();
    setupQuantityHandlers();
    setupRemoveHandlers();
    updateCartTotals();
    
    // Update cart count on page load
    updateCartCount();
});

function initializeCartCalculations() {
    const cartItems = document.querySelectorAll('.cart-item');
    cartItems.forEach(item => {
        if (item.dataset.type === 'mpack') {
            calculateMPackPrices(item);
        } else if (item.dataset.type === 'blanket') {
            calculateBlanketPrices(item);
        }
    });
}

function updateCartTotals() {
    let subtotal = 0;
    let totalItems = 0;
    
    document.querySelectorAll('.cart-item').forEach(item => {
        if (item.dataset.type === 'mpack') {
            const price = parseFloat(item.dataset.unitPrice) || 0;
            const quantity = parseInt(item.dataset.quantity) || 1;
            const discountPercent = parseFloat(item.dataset.discountPercent) || 0;
            const discountedPrice = price * (1 - (discountPercent / 100));
            subtotal += discountedPrice * quantity;
            totalItems += quantity;
        } else if (item.dataset.type === 'blanket') {
            const price = parseFloat(item.dataset.basePrice) || 0;
            const barPrice = parseFloat(item.dataset.barPrice) || 0;
            const quantity = parseInt(item.dataset.quantity) || 1;
            const totalPrice = (price + barPrice) * quantity;
            subtotal += totalPrice;
            totalItems += quantity;
        }
    });
    
    // Update the cart summary
    const cartSummary = document.getElementById('cartSummary');
    if (cartSummary) {
        const gst = subtotal * 0.18; // 18% GST
        const total = subtotal + gst;
        
        cartSummary.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Order Summary</h5>
                    <div class="d-flex justify-content-between mb-2">
                        <span>Subtotal (${totalItems} items):</span>
                        <span>₹${subtotal.toFixed(2)}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span>GST (18%):</span>
                        <span>₹${gst.toFixed(2)}</span>
                    </div>
                    <hr>
                    <div class="d-flex justify-content-between fw-bold">
                        <span>Total:</span>
                        <span>₹${total.toFixed(2)}</span>
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
                if (item.dataset.type === 'mpack') {
                    calculateMPackPrices(item);
                } else if (item.dataset.type === 'blanket') {
                    calculateBlanketPrices(item);
                }
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
    fetch('/remove_cart_item', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
        },
        body: JSON.stringify({ index: index })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Remove the item from the DOM
            const item = document.querySelector(`.cart-item[data-index="${index}"]`);
            if (item) {
                item.remove();
                updateCartTotals();
                showToast('Success', 'Item removed from cart', 'success');
                updateCartCount();
            }
        } else {
            showToast('Error', data.message || 'Failed to remove item', 'error');
        }
    })
    .catch(error => {
        console.error('Error removing item:', error);
        showToast('Error', 'An error occurred while removing the item', 'error');
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
        
        // Update the data attributes
        container.dataset.unitPrice = unitPrice;
        container.dataset.quantity = quantity;
        container.dataset.discountPercent = discountPercent;
        container.dataset.gstPercent = gstPercent;
        
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
