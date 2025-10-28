(function() {
  const dataUrl = '/static/data/chemicals/products.json';

  const machineSelect = document.getElementById('machineSelect');
  const categoryOptionsEl = document.getElementById('categoryOptions');
  const productOptionsEl = document.getElementById('productOptions');
  const formatOptionsEl = document.getElementById('formatOptions');
  const quantityInput = document.getElementById('quantityLitres');
  const quantityHelper = document.getElementById('quantityHelper');
  const summaryBody = document.getElementById('chemSummaryBody');
  const pricingSection = document.getElementById('pricingSection');
  const discountInput = document.getElementById('discountPercent');
  const updateDiscountBtn = document.getElementById('updateDiscountBtn');
  const pricingBreakdown = document.getElementById('pricingBreakdown');
  const addToCartBtn = document.getElementById('addToCartBtn');

  if (!categoryOptionsEl || !productOptionsEl || !formatOptionsEl || !summaryBody) {
    return;
  }

  const state = {
    machineName: '',
    machines: [],
    categories: [],
    selectedCategory: null,
    selectedProduct: null,
    selectedFormat: null,
    quantityLitres: null
  };

  document.addEventListener('DOMContentLoaded', initializeConfigurator);

  async function initializeConfigurator() {
    try {
      // Load machines first
      await loadMachines();

      renderCategoryPlaceholder('Loading categories…');
      const response = await fetch(dataUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch chemicals data (${response.status})`);
      }
      const payload = await response.json();
      state.categories = Array.isArray(payload?.categories) ? payload.categories : [];
      renderCategories();
    } catch (error) {
      console.error('chemicals.js: unable to load catalogue', error);
      renderCategoryPlaceholder('Unable to load catalogue right now. Please refresh or try again later.');
    }

    setupEventListeners();
    updateSummary();
  }

  function loadMachines() {
    return fetch("/api/machines")
      .then(res => res.json())
      .then(data => {
        state.machines = Array.isArray(data) ? data : data.machines || [];
        if (machineSelect) {
          machineSelect.innerHTML = '<option value="">-- Select Machine (optional) --</option>';
          state.machines.forEach(machine => {
            const opt = document.createElement("option");
            opt.value = machine.id;
            opt.textContent = machine.name;
            machineSelect.appendChild(opt);
          });
        }
      })
      .catch(error => {
        console.error('Error loading machine data:', error);
        if (machineSelect) {
          machineSelect.innerHTML = '<option value="">-- Error loading machines --</option>';
        }
      });
  }

  function setupEventListeners() {
    if (machineSelect) {
      machineSelect.addEventListener('change', event => {
        const selectedOption = event.target.options[event.target.selectedIndex];
        state.machineName = selectedOption && selectedOption.value ? selectedOption.textContent : '';
        updateSummary();
      });
    }

    if (updateDiscountBtn) {
      updateDiscountBtn.addEventListener('click', () => {
        updateSummary();
      });
    }

    if (discountInput) {
      discountInput.addEventListener('input', () => {
        const rawValue = parseFloat(discountInput.value);
        const finiteValue = Number.isFinite(rawValue) ? rawValue : 0;
        const clampedValue = Math.max(0, Math.min(100, finiteValue));
        discountInput.value = clampedValue;
        updateSummary();
      });

      discountInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          updateDiscountBtn.click();
        }
      });
    }

    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          await addChemicalToCart();
        } catch (error) {
          console.error('Error adding chemical to cart:', error);
          showToast('Error', 'Failed to add chemical to cart. Please try again.', 'error');
        }
      });
    }

    if (quantityInput) {
      quantityInput.addEventListener('input', () => {
        if (!state.selectedFormat) {
          quantityInput.value = '';
          state.quantityLitres = null;
          return;
        }

        const value = parseFloat(quantityInput.value);
        if (Number.isNaN(value) || value < 0) {
          state.quantityLitres = null;
        } else {
          state.quantityLitres = value;
        }

        updateSummary();
      });
    }
  }

  function toggle200LFilter() {
    state.filter200LActive = !state.filter200LActive;

    // Update button styling
    if (filter200LButton) {
      if (state.filter200LActive) {
        filter200LButton.classList.add('active');
        filter200LButton.setAttribute('aria-pressed', 'true');
      } else {
        filter200LButton.classList.remove('active');
        filter200LButton.setAttribute('aria-pressed', 'false');
      }
    }

    // Clear selections and re-render
    state.selectedProduct = null;
    state.selectedFormat = null;
    state.quantityLitres = null;
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = true;
      quantityInput.placeholder = 'Select a packaging format first';
    }
    if (quantityHelper) {
      quantityHelper.textContent = 'Choose a packaging format to enable quantity entry.';
    }

    renderProducts();
    renderFormats();
    updateSummary();
  }

  function renderCategories() {
    if (!state.categories.length) {
      renderCategoryPlaceholder('No categories available just yet.');
      return;
    }

    categoryOptionsEl.innerHTML = state.categories
      .map(category => {
        const isActive = state.selectedCategory?.id === category.id;
        const icon = category.icon || 'fas fa-vial';
        return `
          <button type="button" class="chem-option ${isActive ? 'chem-option--active' : ''}" data-category-id="${category.id}" aria-pressed="${isActive}">
            <span class="chem-option__icon" aria-hidden="true"><i class="${icon}"></i></span>
            <span>
              <span class="chem-option__title">${sanitize(category.name)}</span>
              <span class="chem-option__subtitle">${sanitize(category.description || '')}</span>
            </span>
          </button>
        `;
      })
      .join('');

    categoryOptionsEl.querySelectorAll('.chem-option').forEach(button => {
      button.addEventListener('click', () => {
        const { categoryId } = button.dataset;
        if (!categoryId) return;
        selectCategory(categoryId);
      });
    });
  }

  function renderCategoryPlaceholder(message) {
    categoryOptionsEl.innerHTML = `<p class="chem-placeholder mb-0">${sanitize(message)}</p>`;
  }

  function selectCategory(categoryId) {
    if (state.selectedCategory?.id === categoryId) return;

    const category = state.categories.find(cat => String(cat.id) === String(categoryId));
    if (!category) return;

    state.selectedCategory = category;
    state.selectedProduct = null;
    state.selectedFormat = null;
    state.quantityLitres = null;
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = true;
      quantityInput.placeholder = 'Select a packaging format first';
    }
    if (quantityHelper) {
      quantityHelper.textContent = 'Choose a packaging format to enable quantity entry.';
    }

    renderCategories();
    renderProducts();
    renderFormats();
    updateSummary();
  }

  function renderProducts() {
    if (!state.selectedCategory) {
      productOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">Select a category to view available products.</p>';
      return;
    }

    let products = Array.isArray(state.selectedCategory.products)
      ? state.selectedCategory.products
      : [];

    if (!products.length) {
      productOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">No products listed for this category yet.</p>';
      return;
    }

    productOptionsEl.innerHTML = products
      .map(product => {
        const isActive = state.selectedProduct?.id === product.id;
        const icon = product.icon || state.selectedCategory.icon || 'fas fa-box';
        const formats = Array.isArray(product.formats) ? product.formats : [];
        const has200L = formats.some(format => format.size_litre === 200);
        const drumBadge = has200L ? '<span class="badge bg-warning text-dark ms-2">200L Available</span>' : '';

        return `
          <button type="button" class="chem-option ${isActive ? 'chem-option--active' : ''}" data-product-id="${product.id}" aria-pressed="${isActive}">
            <span class="chem-option__icon" aria-hidden="true"><i class="${icon}"></i></span>
            <span>
              <span class="chem-option__title">${sanitize(product.name)} ${drumBadge}</span>
              <span class="chem-option__subtitle">${sanitize(product.description || 'Description coming soon.')}</span>
            </span>
          </button>
        `;
      })
      .join('');

    productOptionsEl.querySelectorAll('.chem-option').forEach(button => {
      button.addEventListener('click', () => {
        const { productId } = button.dataset;
        selectProduct(productId);
      });
    });
  }

  function selectProduct(productId) {
    if (!state.selectedCategory) return;
    if (state.selectedProduct?.id === productId) return;

    const products = Array.isArray(state.selectedCategory.products)
      ? state.selectedCategory.products
      : [];
    const product = products.find(item => String(item.id) === String(productId));
    if (!product) return;

    state.selectedProduct = product;
    state.selectedFormat = null;
    state.quantityLitres = null;
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = true;
      quantityInput.placeholder = 'Select a packaging format first';
    }
    if (quantityHelper) {
      quantityHelper.textContent = 'Choose a packaging format to enable quantity entry.';
    }

    renderProducts();
    renderFormats();
    updateSummary();
  }

  function renderFormats() {
    if (!state.selectedProduct) {
      formatOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">Select a product to see the packaging formats.</p>';
      return;
    }

    const formats = Array.isArray(state.selectedProduct.formats)
      ? state.selectedProduct.formats
      : [];

    if (!formats.length) {
      formatOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">No packaging formats available for this product yet.</p>';
      return;
    }

    formatOptionsEl.innerHTML = formats
      .map(format => {
        const isActive = state.selectedFormat?.id === format.id;
        const sizeLabel = format.size_litre ? `${format.size_litre}L per pack` : 'Pack size not set';
        return `
          <button type="button" class="chem-option ${isActive ? 'chem-option--active' : ''}" data-format-id="${format.id}" aria-pressed="${isActive}">
            <span class="chem-option__title">${sanitize(format.label || 'Packaging Option')}</span>
            <span class="chem-option__meta">${sanitize(sizeLabel)}</span>
          </button>
        `;
      })
      .join('');

    formatOptionsEl.querySelectorAll('.chem-option').forEach(button => {
      button.addEventListener('click', () => {
        const { formatId } = button.dataset;
        selectFormat(formatId);
      });
    });
  }

  function selectFormat(formatId) {
    if (!state.selectedProduct) return;
    if (state.selectedFormat?.id === formatId) return;

    const formats = Array.isArray(state.selectedProduct.formats)
      ? state.selectedProduct.formats
      : [];
    const format = formats.find(item => String(item.id) === String(formatId));
    if (!format) return;

    state.selectedFormat = format;
    state.quantityLitres = null;
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = false;
      quantityInput.placeholder = 'Enter litres needed (e.g. 25)';
      quantityInput.focus();
    }
    if (quantityHelper) {
      if (format.size_litre) {
        quantityHelper.textContent = `We will convert your litres into ${format.label} packs (${format.size_litre}L each).`;
      } else {
        quantityHelper.textContent = 'Enter litres and we will record them as-is for this packaging.';
      }
    }

    renderFormats();
    updateSummary();
  }

  function updateSummary() {
    const items = [];

    if (state.machineName) {
      items.push(summaryItem('Machine', state.machineName));
    }

    if (state.selectedCategory) {
      items.push(summaryItem('Category', state.selectedCategory.name));
    }

    if (state.selectedProduct) {
      items.push(summaryItem('Product', state.selectedProduct.name, state.selectedProduct.description));
    }

    if (state.selectedFormat) {
      const size = state.selectedFormat.size_litre ? `${state.selectedFormat.size_litre} litre pack` : 'Pack size not specified';
      const detail = state.selectedFormat.label || 'Selected format';
      items.push(summaryItem('Packaging', detail, size));
    }

    const quantityLitresValue = Number(state.quantityLitres);
    const hasValidQuantity = Number.isFinite(quantityLitresValue) && quantityLitresValue > 0;

    if (state.selectedFormat && hasValidQuantity) {
      const size = Number(state.selectedFormat.size_litre) || 0;
      let detail = `${formatNumber(quantityLitresValue)} L requested`;

      if (size > 0) {
        const containers = Math.ceil(quantityLitresValue / size);
        const achievedLitres = containers * size;
        const surplus = achievedLitres - quantityLitresValue;
        detail = `${formatNumber(quantityLitresValue)} L → ${containers} × ${state.selectedFormat.label}`;
        if (surplus > 0) {
          detail += ` (covers ${formatNumber(achievedLitres)} L, ${formatNumber(surplus)} L surplus)`;
        }
      }

      items.push(summaryItem('Quantity', detail));
    }

    const hasCompleteSelection = Boolean(
      state.selectedCategory &&
      state.selectedProduct &&
      state.selectedFormat &&
      hasValidQuantity
    );

    if (hasCompleteSelection) {
      const discountValue = discountInput ? parseFloat(discountInput.value) : 0;
      const discountPercent = Math.max(0, Math.min(100, Number.isFinite(discountValue) ? discountValue : 0));
      const discountLabel = discountPercent > 0 ? ` (${discountPercent}% discount)` : '';

      items.push(summaryItem('Pricing', `Standard Pricing${discountLabel}`));

      const format = state.selectedFormat;
      const packSizeRaw = Number(format.size_litre);
      const packSize = (Number.isFinite(packSizeRaw) && packSizeRaw > 0) ? packSizeRaw : quantityLitresValue || 1;
      const packsNeeded = Math.max(1, Math.ceil(quantityLitresValue / packSize));
      const basePricePerPack = 100;
      const subtotal = basePricePerPack * packsNeeded;

      const discountAmount = (subtotal * discountPercent) / 100;
      const discountedSubtotal = subtotal - discountAmount;
      const gstPercent = 18;
      const gstAmount = (discountedSubtotal * gstPercent) / 100;
      const finalTotal = discountedSubtotal + gstAmount;

      items.push(summaryItem('Total Price', `₹${finalTotal.toFixed(2)} incl. GST`));
    }

    if (pricingSection && pricingBreakdown) {
      pricingSection.style.display = hasCompleteSelection ? 'block' : 'none';

      if (hasCompleteSelection) {
        updatePricingBreakdown();
      } else {
        pricingBreakdown.innerHTML = '';
        const actionsContainer = pricingSection.querySelector('.pricing-actions');
        if (actionsContainer) {
          actionsContainer.remove();
        }
      }
    }

    if (!items.length) {
      summaryBody.innerHTML = '<p class="chem-summary__empty mb-0">Start by choosing a chemical category.</p>';
    } else {
      summaryBody.innerHTML = items.join('');
    }
  }

  function updatePricingBreakdown() {
    if (!pricingSection || !pricingBreakdown || !state.selectedFormat) {
      return;
    }

    const quantityLitresValue = Number(state.quantityLitres);
    if (!Number.isFinite(quantityLitresValue) || quantityLitresValue <= 0) {
      return;
    }

    const format = state.selectedFormat;
    const packSizeRaw = Number(format.size_litre);
    const packSize = (Number.isFinite(packSizeRaw) && packSizeRaw > 0) ? packSizeRaw : quantityLitresValue || 1;

    // Calculate number of packs needed
    const packsNeeded = Math.max(1, Math.ceil(quantityLitresValue / packSize));
    const totalLitres = packsNeeded * packSize;

    // Base pricing
    const basePricePerPack = 100; // This should come from product data or API
    const subtotal = basePricePerPack * packsNeeded;

    // Get current discount from DOM
    const discountValue = discountInput ? parseFloat(discountInput.value) : 0;
    const currentDiscount = Math.max(0, Math.min(100, Number.isFinite(discountValue) ? discountValue : 0));

    // Calculate discount and final pricing
    const discountAmount = (subtotal * currentDiscount) / 100;
    const discountedSubtotal = subtotal - discountAmount;
    const gstPercent = 18;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;

    // Update pricing breakdown display with Add to Cart button
    pricingBreakdown.innerHTML = `
      <div class="pricing-row">
        <span class="pricing-label">Base Price (${packsNeeded} × ${format.label}):</span>
        <span class="pricing-value">₹${subtotal.toFixed(2)}</span>
      </div>
      ${currentDiscount > 0 ? `
      <div class="pricing-row">
        <span class="pricing-label">Discount (${currentDiscount}%):</span>
        <span class="pricing-value pricing-discount">-₹${discountAmount.toFixed(2)}</span>
      </div>` : ''}
      <div class="pricing-row">
        <span class="pricing-label">GST (${gstPercent}%):</span>
        <span class="pricing-value">₹${gstAmount.toFixed(2)}</span>
      </div>
      <div class="pricing-row">
        <span class="pricing-label">Total:</span>
        <span class="pricing-value pricing-total">₹${finalTotal.toFixed(2)}</span>
      </div>
    `;

    // Add pricing actions section after the breakdown
    const pricingPreview = pricingBreakdown.closest('.pricing-preview');
    if (pricingPreview && !pricingPreview.nextElementSibling?.classList.contains('pricing-actions')) {
      pricingPreview.insertAdjacentHTML('afterend', `
        <div class="pricing-actions">
          <button class="btn btn-primary add-to-cart-btn">
            <i class="fas fa-cart-plus me-2"></i>Add to Cart
          </button>
        </div>
      `);

      // Add event listener to the dynamically created button
      const cartBtn = pricingPreview.nextElementSibling.querySelector('.add-to-cart-btn');
      if (cartBtn) {
        cartBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          try {
            await addChemicalToCart();
          } catch (error) {
            console.error('Error adding chemical to cart:', error);
            showToast('Error', 'Failed to add chemical to cart. Please try again.', 'error');
          }
        });
      }
    }
  }

  async function addChemicalToCart() {
    // Validate all required selections
    if (!state.selectedCategory) {
      showToast('Error', 'Please select a chemical category.', 'error');
      return;
    }

    if (!state.selectedProduct) {
      showToast('Error', 'Please select a product.', 'error');
      return;
    }

    if (!state.selectedFormat) {
      showToast('Error', 'Please select a packaging format.', 'error');
      return;
    }

    if (!state.quantityLitres || state.quantityLitres <= 0) {
      showToast('Error', 'Please enter a valid quantity.', 'error');
      return;
    }

    // Calculate pricing using current form values
    const currentDiscount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

    const format = state.selectedFormat;
    const quantityLitres = state.quantityLitres;
    const packSize = format.size_litre;

    // Calculate number of packs needed
    const packsNeeded = packSize ? Math.ceil(quantityLitres / packSize) : 0;
    const totalLitres = packSize ? packsNeeded * packSize : quantityLitres;
    const surplusLitres = totalLitres - quantityLitres;

    // Base pricing (placeholder rate per litre until API provides real data)
    const basePricePerLitre = 50; // TODO: replace with product-specific litre pricing data/API
    const subtotal = basePricePerLitre * quantityLitres;

    // Apply discount
    const discountAmount = (subtotal * currentDiscount) / 100;
    const discountedSubtotal = subtotal - discountAmount;

    // Calculate GST and total
    const gstPercent = 18;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;

    // Create chemical product object with calculated pricing
    const chemicalProduct = {
      id: 'chemical_' + Date.now(),
      type: 'chemical',
      name: state.selectedProduct.name,
      machine: state.machineName || '--',
      category: state.selectedCategory.name,
      product_id: state.selectedProduct.id,
      format_id: format.id,
      format_label: format.label,
      pack_size_litre: packSize,
      quantity_litre: quantityLitres,
      packs_needed: packsNeeded,
      total_litre: totalLitres,
      surplus_litre: surplusLitres,
      unit_price: basePricePerLitre,
      price_per_litre: basePricePerLitre,
      quantity: quantityLitres,
      discount_percent: currentDiscount,
      gst_percent: gstPercent,
      pricing_tier: 'standard',
      image: 'images/chemical-placeholder.jpg',
      added_at: new Date().toISOString(),
      calculations: {
        unit_price: basePricePerLitre,
        quantity: quantityLitres,
        subtotal: subtotal,
        discount_percent: currentDiscount,
        discount_amount: discountAmount,
        discounted_subtotal: discountedSubtotal,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        final_total: finalTotal
      }
    };

    // Show loading state on the Add to Cart button
    const cartBtn = document.querySelector('.add-to-cart-btn') || addToCartBtn;
    if (cartBtn) {
      const originalText = cartBtn.innerHTML;
      cartBtn.disabled = true;
      cartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

      try {
        const response = await fetch('/add_to_cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chemicalProduct)
        });

        const data = await response.json();

        if (data.success) {
          showToast('Success', 'Chemical added to cart!', 'success');
          updateCartCount();

          // Reset form after successful addition
          setTimeout(() => {
            resetForm();
          }, 1500);
        } else {
          throw new Error(data.message || 'Failed to add to cart');
        }
      } catch (error) {
        console.error('Error adding chemical to cart:', error);
        showToast('Error', error.message || 'Failed to add chemical to cart. Please try again.', 'error');
      } finally {
        // Restore button state
        if (cartBtn) {
          cartBtn.disabled = false;
          cartBtn.innerHTML = originalText;
        }
      }
    }
  }

  function resetForm() {
    state.selectedCategory = null;
    state.selectedProduct = null;
    state.selectedFormat = null;
    state.quantityLitres = null;
    state.machineName = '';

    // Reset UI elements
    if (machineSelect) machineSelect.value = '';
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = true;
      quantityInput.placeholder = 'Select a packaging format first';
    }
    if (quantityHelper) {
      quantityHelper.textContent = 'Choose a packaging format to enable quantity entry.';
    }
    if (pricingSection) {
      pricingSection.style.display = 'none';
    }
    if (discountInput) {
      discountInput.value = '0';
    }
    if (pricingBreakdown) {
      pricingBreakdown.innerHTML = '';
    }

    // Remove any existing pricing actions
    const existingActions = document.querySelector('.pricing-actions');
    if (existingActions) {
      existingActions.remove();
    }

    renderCategories();
    renderProducts();
    renderFormats();
    updateSummary();
  }

  // Simple toast function (fallback if cart.js is not loaded)
  function showToast(title, message, type = 'info') {
    // Check if cart.js showToast is available
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, type);
      return;
    }

    // Fallback implementation
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} alert-dismissible fade show`;
    toast.role = 'alert';
    toast.innerHTML = `
      <strong>${title}</strong> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    // Add to top of page
    document.body.insertBefore(toast, document.body.firstChild);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  function summaryItem(label, value, note) {
    return `
      <div class="chem-summary__item">
        <span class="chem-summary__label">${sanitize(label)}</span>
        <span class="chem-summary__value">${sanitize(value)}</span>
        ${note ? `<span class="chem-summary__note">${sanitize(note)}</span>` : ''}
      </div>
    `;
  }

  function sanitize(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('en-IN', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }
})();
