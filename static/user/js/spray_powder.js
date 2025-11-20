(function() {
  const dataUrl = '/static/data/spray_powder/products.json';

  const machineSelect = document.getElementById('sprayPowderMachineSelect');
  const productOptionsEl = document.getElementById('sprayPowderProductOptions');
  const formatOptionsEl = document.getElementById('sprayPowderFormatOptions');
  const quantityInput = document.getElementById('sprayPowderQuantityInput');
  const quantityHelper = document.getElementById('sprayPowderQuantityHelper');
  const confirmQuantityBtn = document.getElementById('sprayPowderConfirmQuantityBtn');
  const summaryBody = document.getElementById('sprayPowderSummaryBody');
  const summaryActions = document.getElementById('sprayPowderSummaryActions');

  if (!productOptionsEl || !formatOptionsEl || !summaryBody) {
    return;
  }

  const state = {
    machineName: '',
    machines: [],
    categories: [],
    catalogProducts: [],
    selectedCategory: null,
    selectedProduct: null,
    selectedFormat: null,
    quantityKg: null,
    quantityConfirmed: false
  };

  function getBasePricePerKg(product = state.selectedProduct, format = state.selectedFormat) {
    const productPrice = product && Number(product.price_per_kg);
    if (Number.isFinite(productPrice) && productPrice > 0) {
      return productPrice;
    }

    const formatPrice = format && Number(format.price_per_kg);
    if (Number.isFinite(formatPrice) && formatPrice > 0) {
      return formatPrice;
    }

    return 450; // fallback placeholder until pricing is supplied
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeConfigurator();
    initCollapsibleSteps();
  });

  async function initializeConfigurator() {
    try {
      await loadMachines();
      renderProductPlaceholder('Loading spray powder catalogue…');

      const response = await fetch(dataUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch spray powder data (${response.status})`);
      }
      const payload = await response.json();
      state.categories = Array.isArray(payload?.categories) ? payload.categories : [];
      state.catalogProducts = state.categories.flatMap(category => {
        const products = Array.isArray(category.products) ? category.products : [];
        return products.map(product => ({ product, category }));
      });
      renderProducts();
    } catch (error) {
      console.error('spray_powder.js: unable to load catalogue', error);
      renderProductPlaceholder('Unable to load PX catalogue. Please refresh.');
    }

    setupEventListeners();
    updateSummary();
  }

  function loadMachines() {
    return fetch('/api/machines')
      .then(res => res.json())
      .then(data => {
        state.machines = Array.isArray(data) ? data : data.machines || [];
        if (machineSelect) {
          machineSelect.innerHTML = '<option value="">-- Select Machine (optional) --</option>';
          state.machines.forEach(machine => {
            const opt = document.createElement('option');
            opt.value = machine.id;
            opt.textContent = machine.name;
            machineSelect.appendChild(opt);
          });
        }
      })
      .catch(error => {
        console.error('spray_powder.js: error loading machines', error);
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

    if (quantityInput) {
      quantityInput.addEventListener('input', () => {
        if (!state.selectedFormat) {
          quantityInput.value = '';
          state.quantityKg = null;
          state.quantityConfirmed = false;
          if (confirmQuantityBtn) {
            confirmQuantityBtn.disabled = true;
          }
          updateSummary();
          return;
        }

        const value = parseFloat(quantityInput.value);
        const hasValidQuantity = Number.isFinite(value) && value > 0;
        state.quantityKg = hasValidQuantity ? value : null;
        state.quantityConfirmed = false;

        if (confirmQuantityBtn) {
          confirmQuantityBtn.disabled = !hasValidQuantity;
        }

        updateSummary();
      });
    }

    if (confirmQuantityBtn) {
      confirmQuantityBtn.addEventListener('click', () => {
        if (!state.selectedFormat) {
          showToast('Error', 'Please select a packaging format.', 'error');
          return;
        }

        const value = parseFloat(quantityInput.value);
        if (!Number.isFinite(value) || value <= 0) {
          showToast('Error', 'Enter a valid quantity before confirming.', 'error');
          return;
        }

        state.quantityKg = value;
        state.quantityConfirmed = true;
        confirmQuantityBtn.blur();
        updateSummary();
      });
    }
  }

  function renderProductPlaceholder(message) {
    productOptionsEl.innerHTML = `<p class="chem-placeholder mb-0">${sanitize(message)}</p>`;
  }

  function renderProducts() {
    const products = Array.isArray(state.catalogProducts) ? state.catalogProducts : [];
    if (!products.length) {
      renderProductPlaceholder('No PX products available yet.');
      return;
    }

    productOptionsEl.innerHTML = products
      .map(entry => {
        const { product, category } = entry;
        const isActive = state.selectedProduct?.id === product.id;
        const icon = sanitize(product.icon || category?.icon || 'fas fa-box');
        const productDescription = typeof product.description === 'string' && product.description.trim().length
          ? sanitize(product.description)
          : '';
        const subtitleParts = [];
        if (productDescription) {
          subtitleParts.push(productDescription);
        }
        if (category?.name) {
          subtitleParts.push(`PX line: ${sanitize(category.name)}`);
        }
        const subtitle = subtitleParts.length
          ? `<span class="chem-option__subtitle">${subtitleParts.join(' &middot; ')}</span>`
          : '';

        return `
          <button type="button" class="chem-option ${isActive ? 'chem-option--active' : ''}" data-product-id="${product.id}" aria-pressed="${isActive}">
            <span class="chem-option__icon" aria-hidden="true"><i class="${icon}"></i></span>
            <span>
              <span class="chem-option__title">${sanitize(product.name)}</span>
              ${subtitle}
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
    const entry = state.catalogProducts.find(({ product }) => String(product.id) === String(productId));
    if (!entry) return;

    const { product, category } = entry;
    if (state.selectedProduct?.id === product.id) return;

    state.selectedCategory = category || null;
    state.selectedProduct = product;
    state.selectedFormat = null;
    state.quantityKg = null;
    state.quantityConfirmed = false;
    resetQuantityInput();

    renderProducts();
    renderFormats();
    updateSummary();
    collapseStep(document.getElementById('sprayPowderStepProduct'), state.selectedProduct.name);
  }

  function renderFormats() {
    if (!state.selectedProduct) {
      formatOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">Select a PX product to see the packaging formats.</p>';
      return;
    }

    const formats = Array.isArray(state.selectedProduct.formats) ? state.selectedProduct.formats : [];
    if (!formats.length) {
      formatOptionsEl.innerHTML = '<p class="chem-placeholder mb-0">No packaging formats available yet.</p>';
      return;
    }

    formatOptionsEl.innerHTML = formats
      .map(format => {
        const isActive = state.selectedFormat?.id === format.id;
        const sizeLabel = format.size_kg ? `${format.size_kg} kg per pack` : 'Pack size not set';
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

    const formats = Array.isArray(state.selectedProduct.formats) ? state.selectedProduct.formats : [];
    const format = formats.find(item => String(item.id) === String(formatId));
    if (!format) return;

    state.selectedFormat = format;
    state.quantityKg = null;
    state.quantityConfirmed = false;
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = false;
      quantityInput.placeholder = 'Enter kilograms needed (e.g. 25)';
      quantityInput.focus();
    }
    if (confirmQuantityBtn) {
      confirmQuantityBtn.disabled = true;
    }
    if (quantityHelper) {
      if (format.size_kg) {
        quantityHelper.textContent = `We will convert your kilograms into ${format.label} packs (${format.size_kg} kg each).`;
      } else {
        quantityHelper.textContent = 'Enter kilograms and we will record them as-is for this packaging.';
      }
    }

    renderFormats();
    updateSummary();
    collapseStep(document.getElementById('sprayPowderStepFormat'), format.label || `${format.size_kg || ''} kg pack`);
  }

  function resetQuantityInput() {
    if (quantityInput) {
      quantityInput.value = '';
      quantityInput.disabled = true;
      quantityInput.placeholder = 'Select a packaging format first';
    }
    if (quantityHelper) {
      quantityHelper.textContent = 'Choose a packaging format to enable quantity entry.';
    }
    if (confirmQuantityBtn) {
      confirmQuantityBtn.disabled = true;
    }
  }

  function updateSummary() {
    if (summaryActions) summaryActions.innerHTML = '';
    const items = [];

    if (state.selectedCategory && state.selectedProduct) {
      items.push(summaryItem('Product', state.selectedProduct.name, state.selectedCategory?.name));
    }

    const quantityValue = Number(state.quantityKg);
    const hasValidQuantity = Number.isFinite(quantityValue) && quantityValue > 0;
    const quantityIsReady = state.quantityConfirmed && hasValidQuantity;

    if (state.selectedFormat && quantityIsReady) {
      const size = Number(state.selectedFormat.size_kg) || 0;
      const formatLabel = state.selectedFormat.label || (size ? `${size} kg pack` : 'Pack');
      const packsNeeded = size > 0 ? Math.ceil(quantityValue / size) : 1;
      const totalKg = size > 0 ? packsNeeded * size : quantityValue;
      const packagingDisplay = `${formatLabel} × ${packsNeeded} = ${formatNumber(totalKg)} kg`;
      items.push(summaryItem('Packaging', packagingDisplay));
    }

    const hasCompleteSelection = Boolean(
      state.selectedCategory &&
      state.selectedProduct &&
      state.selectedFormat &&
      quantityIsReady
    );

    let discountLabel = '';
    if (hasCompleteSelection) {
      const discountPercent = getDiscountPercent();
      discountLabel = discountPercent > 0 ? ` (${discountPercent}% discount)` : '';

      const format = state.selectedFormat;
      const packSizeRaw = Number(format.size_kg);
      const packSize = Number.isFinite(packSizeRaw) && packSizeRaw > 0 ? packSizeRaw : quantityValue || 1;
      const packsNeeded = Math.max(1, Math.ceil(quantityValue / packSize));
      const basePricePerKg = getBasePricePerKg();
      const subtotal = basePricePerKg * quantityValue;
      const discountAmount = (subtotal * discountPercent) / 100;
      const discountedSubtotal = subtotal - discountAmount;
      const gstPercent = 18;
      const gstAmount = (discountedSubtotal * gstPercent) / 100;
      const finalTotal = discountedSubtotal + gstAmount;

      items.push(summaryItem(
        'Base Price',
        `₹${subtotal.toFixed(2)}`,
        `₹${basePricePerKg.toFixed(2)} × ${formatNumber(quantityValue)} kg`
      ));
      items.push(renderDiscountControl(discountPercent, discountAmount, discountedSubtotal));
      items.push(summaryItem('GST', `₹${gstAmount.toFixed(2)} (${gstPercent}%)`));
      items.push(summaryItem('Total', `₹${finalTotal.toFixed(2)}`));
    }

    if (!items.length) {
      summaryBody.innerHTML = '<p class="chem-summary__empty mb-0">Start by picking a product.</p>';
      if (summaryActions) {
        summaryActions.innerHTML = '<p class="chem-summary__note chem-summary__note--muted mb-0">Your cart button appears after you confirm kilograms.</p>';
      }
    } else {
      summaryBody.innerHTML = items.join('');
      rebindDiscountSelect();

      if (summaryActions) {
        if (hasCompleteSelection) {
          summaryActions.innerHTML = `
            <button type="button" class="chem-summary__cta-btn add-to-cart-btn">
              <i class="fas fa-cart-plus"></i>
              <span>Add to cart</span>
            </button>
          `;

          const summaryCartBtn = summaryActions.querySelector('.add-to-cart-btn');
          if (summaryCartBtn) {
            summaryCartBtn.addEventListener('click', async event => {
              event.preventDefault();
              try {
                await addSprayPowderToCart(summaryCartBtn);
              } catch (error) {
                console.error('spray_powder.js: failed to add to cart from summary', error);
                showToast('Error', 'Failed to add spray powder to cart. Please try again.', 'error');
              }
            });
          }
        } else {
          summaryActions.innerHTML = '<p class="chem-summary__note chem-summary__note--muted mb-0">Confirm kilograms to enable the cart button.</p>';
        }
      }

      if (state.selectedProduct) {
        collapseStep(document.getElementById('sprayPowderStepProduct'), state.selectedProduct.name);
      }
      if (state.selectedFormat) {
        const fmtLabel = state.selectedFormat.label || `${state.selectedFormat.size_kg || ''} kg pack`;
        collapseStep(document.getElementById('sprayPowderStepFormat'), fmtLabel);
      }
      if (quantityIsReady) {
        collapseStep(document.getElementById('sprayPowderStepQuantity'), `${formatNumber(state.quantityKg)} kg${discountLabel}`);
      }
    }
  }

  function renderDiscountControl(discountPercent, discountAmount, discountedSubtotal) {
    const discountOptions = Array.from({ length: 21 }, (_, idx) => idx * 0.5)
      .map(percent => `<option value="${percent}" ${percent === discountPercent ? 'selected' : ''}>${percent}%</option>`)
      .join('');

    const discountSummaryText = discountPercent > 0
      ? `Saving: ₹${discountAmount.toFixed(2)}<br>Subtotal after discount: ₹${discountedSubtotal.toFixed(2)}`
      : 'No discount applied yet.';

    return `
      <div class="chem-summary__item chem-summary__item--discount">
        <div class="chem-summary__discount-control">
          <span class="chem-summary__label">Discount</span>
          <select id="sprayPowderDiscountPercent" class="form-select form-select-sm chem-summary__discount-select">${discountOptions}</select>
        </div>
        <div class="chem-summary__note chem-summary__note--muted">${discountSummaryText}</div>
      </div>
    `;
  }

  function rebindDiscountSelect() {
    const discountSelectEl = document.getElementById('sprayPowderDiscountPercent');
    if (discountSelectEl) {
      discountSelectEl.addEventListener('change', () => {
        updateSummary();
      });
    }
  }

  function getDiscountPercent() {
    const discountSelectEl = document.getElementById('sprayPowderDiscountPercent');
    const value = parseFloat(discountSelectEl && discountSelectEl.value);
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  }

  async function addSprayPowderToCart(cartBtn) {
    if (!state.selectedCategory || !state.selectedProduct || !state.selectedFormat || !state.quantityConfirmed || !state.quantityKg || state.quantityKg <= 0) {
      showToast('Error', 'Complete all selections before adding to cart.', 'error');
      return;
    }

    const discountPercent = getDiscountPercent();
    const format = state.selectedFormat;
    const quantityKg = state.quantityKg;
    const packSize = format.size_kg;
    const packsNeeded = packSize ? Math.ceil(quantityKg / packSize) : 0;
    const totalKg = packSize ? packsNeeded * packSize : quantityKg;
    const surplusKg = totalKg - quantityKg;
    const basePricePerKg = getBasePricePerKg();
    const subtotal = basePricePerKg * quantityKg;
    const discountAmount = (subtotal * discountPercent) / 100;
    const discountedSubtotal = subtotal - discountAmount;
    const gstPercent = 18;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;

    const payload = {
      id: 'spray_powder_' + Date.now(),
      type: 'spray_powder',
      name: state.selectedProduct.name,
      machine: state.machineName || '--',
      category: state.selectedCategory.name,
      product_id: state.selectedProduct.id,
      format_id: format.id,
      format_label: format.label,
      pack_size_kg: packSize,
      quantity_kg: quantityKg,
      packs_needed: packsNeeded,
      total_kg: totalKg,
      surplus_kg: surplusKg,
      unit_price: basePricePerKg,
      price_per_kg: basePricePerKg,
      quantity: quantityKg,
      discount_percent: discountPercent,
      gst_percent: gstPercent,
      pricing_tier: 'standard',
      image: 'images/spray-powder-placeholder.jpg',
      added_at: new Date().toISOString(),
      calculations: {
        unit_price: basePricePerKg,
        quantity: quantityKg,
        subtotal,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        discounted_subtotal: discountedSubtotal,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        final_total: finalTotal
      }
    };

    if (cartBtn) {
      const originalText = cartBtn.innerHTML;
      cartBtn.disabled = true;
      cartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

      try {
        const response = await fetch('/add_to_cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.success) {
          showToast('Success', 'Spray powder added to cart!', 'success');
          if (typeof updateCartCount === 'function') {
            updateCartCount();
          }
          setTimeout(() => resetForm(), 1500);
        } else {
          throw new Error(data.message || 'Failed to add to cart');
        }
      } catch (error) {
        console.error('spray_powder.js: error adding to cart', error);
        showToast('Error', error.message || 'Failed to add spray powder to cart. Please try again.', 'error');
      } finally {
        cartBtn.disabled = false;
        cartBtn.innerHTML = originalText;
      }
    }
  }

  function resetForm() {
    state.selectedCategory = null;
    state.selectedProduct = null;
    state.selectedFormat = null;
    state.quantityKg = null;
    state.quantityConfirmed = false;
    state.machineName = '';

    if (machineSelect) machineSelect.value = '';
    resetQuantityInput();

    renderProducts();
    renderFormats();
    updateSummary();
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

  function collapseStep(stepEl, summaryText) {
    if (!stepEl) return;
    stepEl.classList.add('chem-step--collapsed');
    let summary = stepEl.querySelector('.chem-step__summary');
    if (!summary) {
      const header = stepEl.querySelector('.chem-step__header');
      if (header) {
        summary = document.createElement('span');
        summary.className = 'chem-step__summary ms-auto';
        header.appendChild(summary);
      }
    }
    if (summary) summary.textContent = summaryText || '';
    const updateBtn = stepEl.querySelector('.chem-step__update');
    if (updateBtn) updateBtn.classList.remove('d-none');
  }

  function expandStep(stepEl) {
    if (!stepEl) return;
    stepEl.classList.remove('chem-step--collapsed');
    const updateBtn = stepEl.querySelector('.chem-step__update');
    if (updateBtn) updateBtn.classList.add('d-none');
  }

  function initCollapsibleSteps() {
    document.querySelectorAll('.chem-step').forEach(stepEl => {
      const header = stepEl.querySelector('.chem-step__header');
      if (!header) return;

      let summarySpan = header.querySelector('.chem-step__summary');
      if (!summarySpan) {
        summarySpan = document.createElement('span');
        summarySpan.className = 'chem-step__summary ms-2';
        header.appendChild(summarySpan);
      }

      let updateBtn = header.querySelector('.chem-step__update');
      if (!updateBtn) {
        updateBtn = document.createElement('button');
        updateBtn.type = 'button';
        updateBtn.className = 'btn btn-sm btn-outline-secondary chem-step__update ms-2 d-none';
        updateBtn.textContent = 'Update';
        header.appendChild(updateBtn);
      }

      updateBtn.addEventListener('click', e => {
        e.stopPropagation();
        expandStep(stepEl);
        if (stepEl.id === 'sprayPowderStepQuantity') {
          state.quantityConfirmed = false;
          if (confirmQuantityBtn) {
            const currentValue = parseFloat(quantityInput.value);
            const hasValidQuantity = Number.isFinite(currentValue) && currentValue > 0;
            confirmQuantityBtn.disabled = !hasValidQuantity;
          }
          updateSummary();
        }
      });

      header.addEventListener('click', e => {
        if (e.target.closest('.chem-step__update')) return;
        expandStep(stepEl);
        if (stepEl.id === 'sprayPowderStepQuantity') {
          state.quantityConfirmed = false;
          if (confirmQuantityBtn) {
            const currentValue = parseFloat(quantityInput.value);
            const hasValidQuantity = Number.isFinite(currentValue) && currentValue > 0;
            confirmQuantityBtn.disabled = !hasValidQuantity;
          }
          updateSummary();
        }
      });
    });
  }

  // Fallback toast implementation (if cart.js not loaded yet)
  function showToast(title, message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, type);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} alert-dismissible fade show`;
    toast.role = 'alert';
    toast.innerHTML = `
      <strong>${title}</strong> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.body.insertBefore(toast, document.body.firstChild);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }
})();
