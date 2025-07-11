// Get cart container reference at the top
const cartContainer = document.getElementById('cart-container');

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

// Function to update cart empty state
function updateCartEmptyState() {
    const cartItems = document.getElementById('cartItems');
    const emptyCart = document.getElementById('emptyCart');
    const cartFooter = document.querySelector('.cart-footer');
    
    if (!cartItems) return;
    
    const hasItems = document.querySelectorAll('.cart-item').length > 0;
    
    if (hasItems) {
        cartItems.style.display = 'flex';
        if (emptyCart) emptyCart.style.display = 'none';
        if (cartFooter) cartFooter.style.display = 'flex';
    } else {
        cartItems.style.display = 'flex';
        if (emptyCart) emptyCart.style.display = 'block';
        if (cartFooter) cartFooter.style.display = 'none';
    }
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
    // Remove any existing toasts first
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    });

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

    // Create toast with unique ID based on content to prevent duplicates
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
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
        const existingToast = document.getElementById(toastId);
        if (existingToast) {
            existingToast.classList.remove('show');
            setTimeout(() => {
                if (existingToast && existingToast.parentNode) {
                    existingToast.parentNode.removeChild(existingToast);
                }
            }, 300);
        }
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
        if (cartItemsDiv) cartItemsDiv.style.display = 'flex';
    } else {
        console.log('Cart has items, showing cart contents');
        if (emptyCartDiv) emptyCartDiv.style.display = 'none';
        if (cartItemsDiv) cartItemsDiv.style.display = 'block';
    }
}

// Make createProductTypeModal available globally
window.createProductTypeModal = function() {
    const modalHTML = `
        <div class="modal fade" id="productTypeModal" tabindex="-1" aria-labelledby="productTypeModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="productTypeModalLabel">Select Product Type</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body text-center">
                        <div class="row g-3">
                            <div class="col-6">
                                <button type="button" class="btn btn-outline-primary w-100 py-4" id="selectBlankets">
                                    <i class="fas fa-blanket fa-2x mb-2 d-block"></i>
                                    Blankets
                                </button>
                            </div>
                            <div class="col-6">
                                <button type="button" class="btn btn-outline-success w-100 py-4" id="selectMpacks">
                                    <i class="fas fa-box fa-2x mb-2 d-block"></i>
                                    MPacks
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    
    // Add modal to the body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize the modal
    const modal = new bootstrap.Modal(document.getElementById('productTypeModal'));
    
    // Get company ID once
    const companyId = sessionStorage.getItem('companyId') || 
                     new URLSearchParams(window.location.search).get('company_id');
    
    // Add event listeners to the buttons
    document.getElementById('selectBlankets').addEventListener('click', function() {
        if (companyId) {
            window.location.href = `/blankets?company_id=${companyId}`;
        } else {
            window.location.href = '/blankets';
        }
    });
    
    document.getElementById('selectMpacks').addEventListener('click', function() {
        if (companyId) {
            window.location.href = `/mpacks?company_id=${companyId}`;
        } else {
            window.location.href = '/mpacks';
        }
    });
    
    return modal;
}

// Function to handle continue shopping
function handleContinueShopping() {
    try {
        const modalElement = document.getElementById('productTypeModal');
        let modal;
        
        if (modalElement) {
            // If modal already exists, get the Bootstrap instance
            modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        } else {
            // Otherwise create a new one
            modal = createProductTypeModal();
        }
        
        if (modal) {
            modal.show();
        } else {
            throw new Error('Failed to create product type modal');
        }
    } catch (error) {
        console.error('Error showing product type modal:', error);
        // Fallback in case modal fails to initialize
        const companyId = sessionStorage.getItem('companyId') || 
                       new URLSearchParams(window.location.search).get('company_id');
        window.location.href = companyId ? 
            `/product-selection?company_id=${companyId}` : 
            '/product-selection';
    }
}

// Helper to remove or merge duplicate MPack items in the cart
function checkForDuplicateMpacks() {
    try {
        const mpackItems = document.querySelectorAll('.cart-item[data-type="mpack"]');
        const seen = new Map();

        mpackItems.forEach(item => {
            // Determine a unique key for the MPack – fall back to product name text if no attribute present
            const key = item.dataset.name || item.querySelector('.item-name')?.textContent?.trim();
            if (!key) return; // Skip if no identifiable key

            if (seen.has(key)) {
                // Duplicate found – merge quantities instead of keeping duplicate DOM nodes
                const existing = seen.get(key);
                const qtyInputExisting = existing.querySelector('.quantity-input');
                const qtyInputDuplicate = item.querySelector('.quantity-input');

                if (qtyInputExisting && qtyInputDuplicate) {
                    const totalQty = (parseInt(qtyInputExisting.value) || 1) + (parseInt(qtyInputDuplicate.value) || 1);
                    qtyInputExisting.value = totalQty;
                    existing.setAttribute('data-quantity', totalQty);
                }

                // Remove the duplicate row from DOM
                item.remove();
            } else {
                seen.set(key, item);
            }
        });

        // After merging duplicates, recalculate totals
        updateCartTotals();
    } catch (err) {
        console.error('Error checking for duplicate MPacks:', err);
    }
}

// Function to toggle quotation section
function toggleQuotationSection() {
    const cartItems = document.querySelectorAll('.cart-item');
    const quotationSection = document.getElementById('quotationSection');
    if (quotationSection) {
        quotationSection.style.display = cartItems.length > 0 ? 'block' : 'none';
    }
}

// Function to handle clearing the cart
function handleClearCart(event) {
    // Update empty state after clearing cart
    updateCartEmptyState();
    if (event) event.preventDefault();
    
    if (!confirm('Are you sure you want to clear your cart? This action cannot be undone.')) {
        return false;
    }
    
    const csrfToken = getCSRFToken();
    const clearButton = event.target.closest('button');
    const originalHtml = clearButton ? clearButton.innerHTML : '';
    
    // Show loading state
    if (clearButton) {
        clearButton.disabled = true;
        clearButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Clearing...';
    }
    
    fetch('/clear_cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Remove all cart items from the DOM
            const cartItemsContainer = document.getElementById('cartItems');
            if (cartItemsContainer) {
                // Remove all child elements except the first one (which contains the empty cart message)
                while (cartItemsContainer.firstChild) {
                    cartItemsContainer.removeChild(cartItemsContainer.firstChild);
                }
                
                // Show empty cart message
                const emptyCart = document.getElementById('emptyCart');
                if (emptyCart) {
                    emptyCart.style.display = 'block';
                }
                
                // Hide the cart items container
                cartItemsContainer.style.display = 'flex';
            }
            
            // Update cart count
            updateCartCount();
            
            // Reset cart totals
            const cartTotals = document.querySelectorAll('.cart-summary, .cart-total, .checkout-section');
            cartTotals.forEach(el => el.style.display = 'none');
            
            // Show success message
            showToast('Success', 'Your cart has been cleared', 'success');
            
            // Trigger an event that other components might be listening for
            document.dispatchEvent(new Event('cartCleared'));
        } else {
            throw new Error(data.error || 'Failed to clear cart');
        }
    })
    .catch(error => {
        console.error('Error clearing cart:', error);
        showToast('Error', error.message || 'An error occurred while clearing the cart', 'error');
    })
    .finally(() => {
        // Restore button state
        if (clearButton) {
            clearButton.disabled = false;
            clearButton.innerHTML = originalHtml;
        }
    });
    
    return false;
}

// Initialize cart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, initializing cart...');
    
    // Initial empty state check
    updateCartEmptyState();
    
    try {
        // Initialize company info
        initCompanyInfo();
        
        // Set up continue shopping buttons
        const continueShoppingBtns = [
            'continueShoppingBtn',
            'continueShoppingBtnBottom',
            'emptyCartContinueShopping'
        ];
        
        continueShoppingBtns.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                // Remove any existing event listeners to prevent duplicates
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    handleContinueShopping();
                });
            }
        });
        
        // Set up clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', handleClearCart);
        }
        
        // Initialize all cart functionality
        console.log('Initializing cart functionality...');
        initializeCart();
        
        // Set up quantity handlers
        console.log('Setting up quantity handlers...');
        setupQuantityHandlers();
        
        // Set up remove handlers
        console.log('Setting up remove handlers...');
        setupRemoveHandlers();
        
        // Initialize cart calculations
        console.log('Initializing cart calculations...');
        initializeCartCalculations();
        
        // Update cart totals
        console.log('Updating cart totals...');
        updateCartTotals();
        
        // Check for duplicate MPacks
        console.log('Checking for duplicate MPacks...');
        checkForDuplicateMpacks();
        
        // Toggle quotation section based on cart items
        toggleQuotationSection();
        
        // Listen for cart updates from other tabs
        window.addEventListener('storage', function(event) {
            if (event.key === 'cart') {
                try {
                    window.location.reload();
                } catch (e) {
                    console.error('Error handling cart update:', e);
                }
            }
        });
        
        // Add a small delay to ensure all elements are properly initialized
        setTimeout(() => {
            console.log('Cart initialization complete');
            // Force a recalculation of totals after a short delay
            updateCartTotals();
        }, 100);
    } catch (error) {
        console.error('Error initializing cart:', error);
    }
    
    // Set up clear cart button
    const clearCartBtn = document.getElementById('clearCartBtn');
    
    // Initialize all cart handlers
    initializeCart();
    
    // Set up event delegation for quantity buttons
    document.addEventListener('click', function(event) {
        // Handle decrease quantity button click
        if (event.target.closest('.decrease-quantity')) {
            const input = event.target.closest('.quantity-wrapper').querySelector('.quantity-input');
            if (input) {
                let value = parseInt(input.value) || 1;
                if (value > 1) {
                    input.value = value - 1;
                    handleQuantityChange({ target: input });
                }
            }
        }
        
        // Handle increase quantity button click
        if (event.target.closest('.increase-quantity')) {
            const input = event.target.closest('.quantity-wrapper').querySelector('.quantity-input');
            if (input) {
                let value = parseInt(input.value) || 1;
                input.value = value + 1;
                handleQuantityChange({ target: input });
            }
        }
    });
    
    // Set up input change handler for direct input
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('quantity-input')) {
            handleQuantityChange(event);
        }
    });
    
    // Set up remove handlers
    setupRemoveHandlers();
    
    // Initialize cart calculations
    initializeCartCalculations();
    
    // Check for duplicate MPacks
    checkForDuplicateMpacks();
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to clear your cart? This cannot be undone.')) {
                fetch('/clear_cart', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken()
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload();
                    } else {
                        showToast('Error', data.message || 'Failed to clear cart', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error clearing cart:', error);
                    showToast('Error', 'An error occurred while clearing the cart', 'error');
                });
            }
        });
    }
    
    // Initialize cart functionality
    initializeCart();
    setupQuantityHandlers();
    setupRemoveHandlers();
    initializeCartCalculations();
    checkForDuplicateMpacks();
    
    // Set up checkout button
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/checkout';
        });
    }
    
    // Set up header continue shopping button
    const continueShoppingBtn = document.getElementById('continueShoppingBtn');
    if (continueShoppingBtn) {
        continueShoppingBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleContinueShopping();
        });
    }
    
    // Set up footer continue shopping button
    const continueShoppingFooter = document.getElementById('continueShoppingBtnBottom');
    if (continueShoppingFooter) {
        continueShoppingFooter.addEventListener('click', function(e) {
            e.preventDefault();
            handleContinueShopping();
        });
    }
    
    // Set up footer clear cart button
    const clearCartFooter = document.getElementById('clearCartBtnFooter');
    if (clearCartFooter) {
        clearCartFooter.addEventListener('click', handleClearCart);
    }
    
    // Set up change company button
    const changeCompanyBtn = document.getElementById('changeCompanyBtn');
    if (changeCompanyBtn) {
        changeCompanyBtn.addEventListener('click', function() {
            window.location.href = '/select-company';
        });
    }
    
    // Set up mutation observer for cart changes
    if (cartContainer) {
        // Show the cart initially
        cartContainer.style.visibility = 'visible';
        
        const observer = new MutationObserver(function() {
            checkForDuplicateMpacks();
            updateCartTotals(); // Ensure totals are updated on any cart changes
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
    try {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalGst = 0;
        let total = 0;
        let totalItems = 0;
        
        const cartItems = document.querySelectorAll('.cart-item');
        const emptyCart = document.getElementById('emptyCart');
        const cartItemsContainer = document.getElementById('cartItems');
        
        // Show/hide empty cart message
        if (cartItems.length === 0) {
            if (emptyCart) emptyCart.style.display = 'block';
            if (cartItemsContainer) cartItemsContainer.style.display = 'flex';
            
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
        
        // Calculate totals for all items
        cartItems.forEach(item => {
            try {
                const type = item.getAttribute('data-type');
                const quantity = parseInt(item.getAttribute('data-quantity') || '1');
                
                // Ensure quantity is at least 1
                const validQuantity = isNaN(quantity) || quantity < 1 ? 1 : quantity;
                
                if (type === 'mpack') {
                    // Get prices for mpack
                    const unitPrice = parseFloat(item.getAttribute('data-unit-price') || '0');
                    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || '0');
                    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || '12');
                    
                    // Calculate prices
                    const itemSubtotal = unitPrice * validQuantity;
                    const discountAmount = itemSubtotal * (discountPercent / 100);
                    const discountedSubtotal = itemSubtotal - discountAmount;
                    const gstAmount = (discountedSubtotal * gstPercent) / 100;
                    const itemTotal = discountedSubtotal + gstAmount;
                    
                    // Update running totals
                    subtotal += itemSubtotal;
                    totalDiscount += discountAmount;
                    totalGst += gstAmount;
                    total += itemTotal;
                    totalItems += validQuantity;
                    
                    // Update data attributes
                    item.setAttribute('data-quantity', validQuantity.toString());
                    
                    // Update item display
                    updateItemDisplay(item, {
                        finalTotal: itemTotal,
                        discountAmount: discountAmount,
                        gstAmount: gstAmount,
                        quantity: validQuantity,
                        unitPrice: unitPrice,
                        discountPercent: discountPercent,
                        gstPercent: gstPercent
                    });
                    
                } else if (type === 'blanket') {
                    // Get prices for blanket
                    const basePrice = parseFloat(item.getAttribute('data-base-price') || '0');
                    const barPrice = parseFloat(item.getAttribute('data-bar-price') || '0');
                    const discountPercent = parseFloat(item.getAttribute('data-discount-percent') || '0');
                    const gstPercent = parseFloat(item.getAttribute('data-gst-percent') || '18');
                    
                    // Calculate prices
                    const pricePerUnit = basePrice + barPrice;
                    const itemSubtotal = pricePerUnit * validQuantity;
                    const discountAmount = itemSubtotal * (discountPercent / 100);
                    const discountedSubtotal = itemSubtotal - discountAmount;
                    const gstAmount = (discountedSubtotal * gstPercent) / 100;
                    const itemTotal = discountedSubtotal + gstAmount;
                    
                    // Update running totals
                    subtotal += itemSubtotal;
                    totalDiscount += discountAmount;
                    totalGst += gstAmount;
                    total += itemTotal;
                    totalItems += validQuantity;
                    
                    // Update data attributes
                    item.setAttribute('data-quantity', validQuantity.toString());
                    
                    // Update item display
                    updateItemDisplay(item, {
                        finalTotal: itemTotal,
                        discountAmount: discountAmount,
                        gstAmount: gstAmount,
                        quantity: validQuantity,
                        basePrice: basePrice,
                        barPrice: barPrice,
                        discountPercent: discountPercent,
                        gstPercent: gstPercent
                    });
                }
            } catch (error) {
                console.error('Error calculating item totals:', error);
            }
        });
        
        // Update the cart summary
        const cartSummary = document.getElementById('cartSummary');
        if (cartSummary) {
            // Round all values to 2 decimal places
            subtotal = Math.round(subtotal * 100) / 100;
            totalDiscount = Math.round(totalDiscount * 100) / 100;
            totalGst = Math.round(totalGst * 100) / 100;
            total = Math.round(total * 100) / 100;
            
            cartSummary.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title mb-3">Order Summary</h5>
                        <div class="mb-2">
                            <div class="d-flex justify-content-between mb-1">
                                <span>Subtotal (${totalItems} ${totalItems === 1 ? 'item' : 'items'}):</span>
                                <span>₹${subtotal.toFixed(2)}</span>
                            </div>
                            ${totalDiscount > 0 ? `
                            <div class="d-flex justify-content-between mb-1 text-success">
                                <span>Discount:</span>
                                <span>-₹${totalDiscount.toFixed(2)}</span>
                            </div>` : ''}
                            <div class="d-flex justify-content-between mb-1">
                                <span>GST:</span>
                                <span>₹${totalGst.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                            <span class="fw-bold">Total:</span>
                            <span class="fw-bold fs-5">₹${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>`;
        }
    } catch (error) {
        console.error('Error updating cart totals:', error);
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
    
    // Ensure the quantity is at least 1
    let newQuantity = parseInt(input.value);
    if (isNaN(newQuantity) || newQuantity < 1) {
        newQuantity = 1;
        input.value = 1;
    }

    // Update the cart item quantity
    updateCartItemQuantity(index, newQuantity);
}



// Function to update cart item quantity
function updateCartItemQuantity(index, newQuantity) {
    // Update empty state after quantity changes
    updateCartEmptyState();
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
                // Utilize helper to refresh all price-related fields including discount & GST
                const itemData = { ...data.updated_item };

                // Ensure type present for updateItemDisplay (fallback to DOM dataset)
                if (!itemData.type) {
                    itemData.type = cartItem.getAttribute('data-type');
                }

                // Sync the quantity input first
                const quantityInput = cartItem.querySelector('.quantity-input');
                if (quantityInput) {
                    quantityInput.value = itemData.quantity || 1;
                }

                // Delegate DOM refresh to central utility
                updateItemDisplay(cartItem, itemData);
                
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
    // Remove any existing event listeners to prevent duplicates
    document.removeEventListener('click', handleQuantityButtonClick);
    document.removeEventListener('change', handleQuantityInputChange);
    document.removeEventListener('keydown', handleQuantityKeyDown);
    
    // Add event delegation for quantity buttons
    document.addEventListener('click', handleQuantityButtonClick);
    
    // Add event listener for manual input changes
    document.addEventListener('change', handleQuantityInputChange);
    
    // Add event listener for keyboard input
    document.addEventListener('keydown', handleQuantityKeyDown);
}

// Handle quantity button clicks (increase/decrease)
function handleQuantityButtonClick(event) {
    // Check if the click was on a quantity button using the correct class names
    const increaseBtn = event.target.closest('.quantity-increase');
    const decreaseBtn = event.target.closest('.quantity-decrease');
    
    if (!increaseBtn && !decreaseBtn) {
        // Also check for data-action attributes as fallback
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        
        const action = actionBtn.getAttribute('data-action');
        if (action !== 'increase' && action !== 'decrease') return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const itemCard = actionBtn.closest('.cart-item');
        if (!itemCard) return;
        
        const index = itemCard.getAttribute('data-index');
        const type = itemCard.getAttribute('data-type');
        const quantityInput = itemCard.querySelector('.quantity-input');
        
        if (!quantityInput) return;
        
        let quantity = parseInt(quantityInput.value) || 1;
        
        if (action === 'increase') {
            quantity += 1;
        } else if (action === 'decrease' && quantity > 1) {
            quantity -= 1;
        }
        
        // Update the input value
        quantityInput.value = quantity;
        
        // Update the cart
        updateCartItemQuantity(index, quantity, type);
        return;
    }
    
    // Original button handling
    event.preventDefault();
    event.stopPropagation();
    
    const button = increaseBtn || decreaseBtn;
    const itemCard = button.closest('.cart-item');
    if (!itemCard) return;
    
    const index = itemCard.getAttribute('data-index');
    const type = itemCard.getAttribute('data-type');
    const quantityInput = itemCard.querySelector('.quantity-input');
    
    if (!quantityInput) return;
    
    let quantity = parseInt(quantityInput.value) || 1;
    
    if (increaseBtn) {
        quantity += 1;
    } else if (decreaseBtn && quantity > 1) {
        quantity -= 1;
    }
    
    // Update the input value
    quantityInput.value = quantity;
    
    // Update the cart
    updateCartItemQuantity(index, quantity, type);
}

// Handle manual input changes
function handleQuantityInputChange(event) {
    if (event.target.classList.contains('quantity-input')) {
        const input = event.target;
        const container = input.closest('.cart-item');
        const index = container ? container.dataset.index : null;
        
        if (index !== null) {
            let newQuantity = parseInt(input.value);
            if (isNaN(newQuantity) || newQuantity < 1) {
                newQuantity = 1;
                input.value = 1;
            }
            updateCartItemQuantity(index, newQuantity);
        }
    }
}

// Handle keyboard input for quantity fields
function handleQuantityKeyDown(event) {
    if (event.target.classList.contains('quantity-input') && event.key === 'Enter') {
        event.preventDefault();
        event.target.blur(); // Triggers the change event
    }
}

// Function to set up remove handlers using event delegation
function setupRemoveHandlers() {
    // Remove any existing event listeners to prevent duplicates
    document.removeEventListener('click', handleRemoveClick);
    
    // Add event delegation for remove buttons
    document.addEventListener('click', handleRemoveClick);
}

// Handle remove button clicks using event delegation
function handleRemoveClick(e) {
    // Find the closest remove button or form that was clicked
    const removeBtn = e.target.closest('.remove-item-form') || 
                     e.target.closest('.btn-danger');
    
    if (!removeBtn) return;
    
    e.preventDefault();
    
    // Get the index from the button's data attribute or its parent form
    const form = removeBtn.closest('form');
    const index = removeBtn.dataset.index || (form ? form.dataset.index : null);
    
    if (index !== null && index !== undefined) {
        removeFromCart(e, index);
    }
}

// Function to remove item from cart
function removeFromCart(event, index) {
    // Update empty state after removing item
    updateCartEmptyState();
    event.preventDefault();
    
    if (!confirm('Are you sure you want to remove this item from your cart?')) {
        return;
    }

    const button = event.target.closest('button');
    const originalHtml = button ? button.innerHTML : '';
    
    // Show loading state
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Removing...';
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
            const itemElement = document.querySelector(`.cart-item[data-index="${index}"]`);
            if (itemElement) {
                itemElement.remove();
            }
            
            // Update cart totals and count
            updateCartTotals();
            updateCartCount();
            
            // Check if cart is empty
            const cartItems = document.querySelectorAll('.cart-item');
            if (cartItems.length === 0) {
                window.location.reload(); // Reload to show empty cart message
            } else {
                showToast('Success', 'Item removed from cart', 'success');
            }
        } else {
            showToast('Error', data.message || 'Failed to remove item from cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error removing from cart:', error);
        showToast('Error', 'An error occurred while removing the item', 'error');
    })
    .finally(() => {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    });
}

// Function to update item display with all price information
function updateItemDisplay(item, data) {
    if (!item || !data) return;
    
    // Update the data attributes with the latest values
    if (data.type === 'blanket') {
        item.dataset.basePrice = data.base_price || 0;
        item.dataset.barPrice = data.bar_price || 0;
        item.dataset.quantity = data.quantity || 1;
        item.dataset.discountPercent = data.discount_percent || 0;
        item.dataset.gstPercent = data.gst_percent || 18;
    } else if (data.type === 'mpack') {
        item.dataset.unitPrice = data.unit_price || 0;
        item.dataset.quantity = data.quantity || 1;
        item.dataset.discountPercent = data.discount_percent || 0;
        item.dataset.gstPercent = data.gst_percent || 12;
    }
    
    // Update the quantity input
    const quantityInput = item.querySelector('.quantity-input');
    if (quantityInput) {
        quantityInput.value = data.quantity || 1;
    }
    
    // Update the price displays
    if (data.type === 'blanket') {
        // Update unit price display
        const unitPriceElement = item.querySelector('.unit-price');
        if (unitPriceElement) {
            unitPriceElement.textContent = `₹${parseFloat(data.base_price || 0).toFixed(2)}`;
        }
        
        // Update bar price display if it exists
        const barPriceElement = item.querySelector('.bar-price');
        if (barPriceElement) {
            if (data.bar_price && data.bar_price > 0) {
                barPriceElement.textContent = `+₹${parseFloat(data.bar_price).toFixed(2)}`;
                barPriceElement.closest('.price-row').style.display = 'flex';
            } else {
                barPriceElement.closest('.price-row').style.display = 'none';
            }
        }
        
        // Calculate values
        const basePrice = parseFloat(data.base_price || 0);
        const barPrice = parseFloat(data.bar_price || 0);
        const quantity = parseInt(data.quantity || 1);
        const discountPercent = parseFloat(data.discount_percent || 0);
        const gstPercent = parseFloat(data.gst_percent || 18);
        
        // Calculate subtotal (before discount)
        const subtotal = (basePrice + barPrice) * quantity;
        
        // Calculate discount amount
        const discountAmount = subtotal * (discountPercent / 100);
        
        // Calculate taxable amount (after discount)
        const taxableAmount = subtotal - discountAmount;
        
        // Calculate GST amount
        const gstAmount = taxableAmount * (gstPercent / 100);
        
        // Calculate total (after discount + GST)
        const total = taxableAmount + gstAmount;
        
        // Update subtotal display
        const subtotalElement = item.querySelector('.subtotal-value');
        if (subtotalElement) {
            subtotalElement.textContent = `₹${subtotal.toFixed(2)}`;
        }
        
        // Update discount row if it exists
        const discountRow = item.querySelector('.discount-row');
        if (discountRow) {
            if (discountPercent > 0) {
                discountRow.style.display = 'flex';
                const discountAmountElement = discountRow.querySelector('.discount-amount') || 
                                          discountRow.querySelector('span:last-child');
                if (discountAmountElement) {
                    discountAmountElement.textContent = `-₹${discountAmount.toFixed(2)}`;
                }
                const discountPercentElement = discountRow.querySelector('.discount-percent');
                if (discountPercentElement) {
                    discountPercentElement.textContent = `${discountPercent}%`;
                }
            } else {
                discountRow.style.display = 'none';
            }
        }
        
        // Update GST row if it exists
        const gstRow = item.querySelector('.gst-row');
        if (gstRow) {
            const gstAmountElement = gstRow.querySelector('.gst-amount') || 
                                   gstRow.querySelector('span:last-child');
            if (gstAmountElement) {
                gstAmountElement.textContent = `₹${gstAmount.toFixed(2)}`;
            }
            const gstPercentElement = gstRow.querySelector('.gst-percent');
            if (gstPercentElement) {
                gstPercentElement.textContent = `${gstPercent}%`;
            }
        }
        
        // Update total
        const totalElement = item.querySelector('.total-value');
        if (totalElement) {
            totalElement.textContent = `₹${total.toFixed(2)}`;
        }
    } else if (data.type === 'mpack') {
        // Similar updates for MPack items
        const unitPriceElement = item.querySelector('.unit-price');
        if (unitPriceElement) {
            unitPriceElement.textContent = `₹${parseFloat(data.unit_price || 0).toFixed(2)}`;
        }
        
        // Calculate values
        const unitPrice = parseFloat(data.unit_price || 0);
        const quantity = parseInt(data.quantity || 1);
        const discountPercent = parseFloat(data.discount_percent || 0);
        const gstPercent = parseFloat(data.gst_percent || 12);
        
        // Calculate subtotal (before discount)
        const subtotal = unitPrice * quantity;
        
        // Calculate discount amount
        const discountAmount = subtotal * (discountPercent / 100);
        
        // Calculate taxable amount (after discount)
        const taxableAmount = subtotal - discountAmount;
        
        // Calculate GST amount
        const gstAmount = taxableAmount * (gstPercent / 100);
        
        // Calculate total (after discount + GST)
        const total = taxableAmount + gstAmount;
        
        // Update subtotal display
        const subtotalElement = item.querySelector('.subtotal-value');
        if (subtotalElement) {
            subtotalElement.textContent = `₹${subtotal.toFixed(2)}`;
        }
        
        // Update discount row if it exists
        const discountRow = item.querySelector('.discount-row');
        if (discountRow) {
            if (discountPercent > 0) {
                discountRow.style.display = 'flex';
                const discountAmountElement = discountRow.querySelector('.discount-amount') || 
                                          discountRow.querySelector('span:last-child');
                if (discountAmountElement) {
                    discountAmountElement.textContent = `-₹${discountAmount.toFixed(2)}`;
                }
                const discountPercentElement = discountRow.querySelector('.discount-percent');
                if (discountPercentElement) {
                    discountPercentElement.textContent = `${discountPercent}%`;
                }
            } else {
                discountRow.style.display = 'none';
            }
        }
        
        // Update GST row if it exists
        const gstRow = item.querySelector('.gst-row');
        if (gstRow) {
            const gstAmountElement = gstRow.querySelector('.gst-amount') || 
                                   gstRow.querySelector('span:last-child');
            if (gstAmountElement) {
                gstAmountElement.textContent = `₹${gstAmount.toFixed(2)}`;
            }
            const gstPercentElement = gstRow.querySelector('.gst-percent');
            if (gstPercentElement) {
                gstPercentElement.textContent = `${gstPercent}%`;
            }
        }
        
        // Update total
        const totalElement = item.querySelector('.total-value');
        if (totalElement) {
            totalElement.textContent = `₹${total.toFixed(2)}`;
        }
    }
    
    // Removed recursive call to prevent infinite loop
}

// End of file
