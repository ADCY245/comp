(function() {
  const pageRoot = document.getElementById('ruleConfiguratorPage');
  if (!pageRoot) {
    return;
  }

  function buildCuttingCatalog(cuttingData = {}) {
    const packets = Array.isArray(cuttingData.packets) ? cuttingData.packets : [];
    const coils = Array.isArray(cuttingData.coils) ? cuttingData.coils : [];
    const thicknessKeys = Array.from(new Set(
      [...packets, ...coils]
        .map(entry => normalizeThickness(entry.thickness))
        .filter(Boolean)
    ));

    return thicknessKeys.reduce((acc, thickness) => {
      const catalog = {
        packets: packets.filter(entry => normalizeThickness(entry.thickness) === thickness),
        coils: coils.filter(entry => normalizeThickness(entry.thickness) === thickness)
      };
      acc[thickness] = buildCatalogEntries(catalog, `cut-${thickness}`);
      return acc;
    }, {});
  }

  function normalizeThickness(value = '') {
    return value.trim().toLowerCase();
  }

  function buildCatalogEntries(catalog = {}, context = 'cutting') {
    const grouped = new Map();
    Object.entries(catalog || {}).forEach(([packagingId, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }

      entries.forEach((entry, index) => {
        const label = (entry.label || `Option ${index + 1}`).trim();
        const normalizedKey = `${context}|${normalizeCode(entry.code || label)}|${label.toLowerCase()}`;
        const entryThickness = normalizeThickness(entry.thickness);
        const existing = grouped.get(normalizedKey) || {
          id: `${context}-${slugify(label)}-${normalizeCode(entry.code || label) || index}`,
          label,
          code: entry.code || '',
          packagingOptions: [],
          thickness: entryThickness,
          displayThickness: entry.thickness || ''
        };

        existing.packagingOptions.push({
          id: `${entry.profile_id || existing.id}-${packagingId}`,
          packagingId,
          label: PACKAGING_PRESETS[packagingId]?.label || capitalize(packagingId),
          profileId: entry.profile_id,
          code: entry.code || '',
          description: PACKAGING_PRESETS[packagingId]?.description || '',
          finish: entry.finish || ''
        });

        grouped.set(normalizedKey, existing);
      });
    });

    return Array.from(grouped.values()).map(option => ({
      ...option,
      packagingOptions: option.packagingOptions.sort((a, b) => a.label.localeCompare(b.label))
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  function normalizeCode(code = '') {
    return code
      .trim()
      .replace(/\s+/g, '')
      .replace(/-C-CW$/i, '')
      .replace(/-C$/i, '')
      .replace(/-CW$/i, '')
      .toLowerCase();
  }

  function slugify(value = '') {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'option';
  }

  const machineSelect = document.getElementById('ruleMachineSelect');
  const ruleTypeSelect = document.getElementById('ruleTypeSelect');
  const thicknessSelect = document.getElementById('ruleThicknessSelect');
  const thicknessSection = document.getElementById('ruleStepThickness');
  const sizeSelect = document.getElementById('ruleSizeSelect');
  const sizeSection = document.getElementById('ruleStepSize');
  const packagingSelect = document.getElementById('rulePackagingSelect');
  const packagingSection = document.getElementById('ruleStepPackaging');
  const quantitySection = document.getElementById('ruleStepQuantity');
  const quantityInput = document.getElementById('ruleQuantityInput');
  const quantityHelper = document.getElementById('ruleQuantityHelper');
  const quantityConfirmBtn = document.getElementById('ruleQuantityConfirmBtn');
  const addToCartBtn = document.getElementById('ruleAddToCartBtn');
  const summaryBody = document.getElementById('ruleSummaryBody');
  const cartMessage = document.getElementById('ruleCartMessage');

  const thicknessHelper = document.getElementById('ruleThicknessHelper');
  const sizeHelper = document.getElementById('ruleSizeHelper');
  const packagingHelper = document.getElementById('rulePackagingHelper');
  const typeHelper = document.getElementById('ruleTypeHelper');

  const DATA_SOURCE = '/static/data/Creasing_cutting_rule/cutting_creasing_rules.json';

  const PACKAGING_PRESETS = {
    packets: { id: 'packets', label: 'Packets (PKT)', description: 'Supplied in standard bundles.' },
    coils: { id: 'coils', label: 'Coils (CW/B)', description: 'Supplied as continuous coils.' }
  };

  const baseRates = {
    cutting: {
      '2pt': 480,
      '3pt': 525,
      fallback: 460
    },
    creasing: 390
  };

  const state = {
    machines: [],
    rawSizes: { cutting: {}, creasing: [] },
    flattenedSizes: [],
    selectedMachine: '',
    selectedRuleType: '',
    selectedThickness: '',
    selectedSize: null,
    selectedPackaging: null,
    availablePackagingOptions: [],
    quantity: null,
    quantityConfirmed: false
  };

  document.addEventListener('DOMContentLoaded', () => {
    initializeConfigurator().catch(error => {
      console.error('cutting_creasing_rule.js: failed to initialize', error);
      showToast?.('Error', 'Unable to load configurator. Please refresh.', 'error');
    });
  });

  async function initializeConfigurator() {
    await Promise.all([loadMachines(), loadRuleSizes()]);
    setupEventListeners();
    resetWorkflow();
    updateSummary();
  }

  function setupEventListeners() {
    if (machineSelect) {
      machineSelect.addEventListener('change', event => {
        const option = event.target.selectedOptions[0];
        state.selectedMachine = option ? option.textContent : '';
        updateSummary();
      });
    }

    if (ruleTypeSelect) {
      ruleTypeSelect.addEventListener('change', handleRuleTypeChange);
    }

    if (thicknessSelect) {
      thicknessSelect.addEventListener('change', event => {
        state.selectedThickness = event.target.value;
        state.selectedSize = null;
        sizeSelect.value = '';
        disableSection(sizeSection, sizeSelect, 'Select a rule to continue');

        if (state.selectedThickness) {
          populateSizeOptions(state.selectedThickness);
          showSection(sizeSection, sizeSelect);
          sizeHelper.textContent = 'Choose a profile to continue.';
        } else {
          sizeHelper.textContent = 'Select thickness (for cutting) or choose creasing rule.';
        }

        updateSummary();
      });
    }

    if (sizeSelect) {
      sizeSelect.addEventListener('change', event => {
        const selectedId = event.target.value;
        const collection = state.selectedRuleType === 'cutting'
          ? (state.rawSizes.cutting?.[state.selectedThickness] || [])
          : state.rawSizes.creasing;
        state.selectedSize = collection.find(option => option.id === selectedId) || null;
        state.selectedPackaging = null;
        packagingSelect.value = '';
        disableSection(packagingSection, packagingSelect, 'Select a size first');

        if (state.selectedSize) {
          state.availablePackagingOptions = state.selectedSize.packagingOptions || [];
          showSection(packagingSection, packagingSelect);
          populatePackagingOptions();
          packagingHelper.textContent = 'Select the desired packaging format.';
        } else {
          state.availablePackagingOptions = [];
        }
        updateSummary();
      });
    }

    if (packagingSelect) {
      packagingSelect.addEventListener('change', event => {
        const options = state.availablePackagingOptions || [];
        state.selectedPackaging = options.find(option => option.id === event.target.value) || null;
        if (state.selectedPackaging) {
          showSection(quantitySection, quantityInput);
          quantityInput.disabled = false;
          quantityInput.placeholder = 'Enter required quantity';
          quantityHelper.textContent = 'Enter the number of lengths required.';
        } else {
          disableSection(quantitySection, quantityInput, 'Select packaging first');
        }

        state.quantity = null;
        quantityInput.value = '';
        state.quantityConfirmed = false;
        quantityConfirmBtn.disabled = true;
        updateSummary();
      });
    }

    if (quantityInput) {
      quantityInput.addEventListener('input', () => {
        const value = parseInt(quantityInput.value, 10);
        if (!Number.isFinite(value) || value <= 0) {
          state.quantity = null;
          state.quantityConfirmed = false;
          quantityConfirmBtn.disabled = true;
        } else {
          state.quantity = value;
          state.quantityConfirmed = false;
          quantityConfirmBtn.disabled = false;
        }
        updateSummary();
      });
    }

    if (quantityConfirmBtn) {
      quantityConfirmBtn.addEventListener('click', event => {
        event.preventDefault();
        if (!state.quantity || state.quantity <= 0) {
          showToast?.('Missing quantity', 'Please enter a valid quantity.', 'warning');
          return;
        }
        state.quantityConfirmed = true;
        updateSummary();
      });
    }

    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', event => {
        event.preventDefault();
        addRuleToCart();
      });
    }
  }

  function handleRuleTypeChange(event) {
    state.selectedRuleType = event.target.value;
    state.selectedThickness = '';
    state.selectedSize = null;
    state.selectedPackaging = null;
    state.availablePackagingOptions = [];
    state.quantity = null;
    state.quantityConfirmed = false;

    thicknessSelect.value = '';
    sizeSelect.value = '';
    packagingSelect.value = '';
    quantityInput.value = '';
    quantityInput.disabled = true;
    quantityConfirmBtn.disabled = true;

    hideSection(sizeSection);
    hideSection(packagingSection);
    hideSection(quantitySection);

    if (state.selectedRuleType === 'cutting') {
      unlockThicknessSelect();
      showSection(thicknessSection, thicknessSelect);
      populateThicknessOptions();
      thicknessSelect.value = '';
      typeHelper.textContent = 'Select 2pt or 3pt to continue.';
      thicknessHelper.textContent = 'Thickness is required for cutting rule selections.';
    } else if (state.selectedRuleType === 'creasing') {
      lockCreasingThickness();
      typeHelper.textContent = 'Continue to packaging after choosing a profile.';
      populateCreasingSizes();
      showSection(sizeSection, sizeSelect);
      sizeHelper.textContent = 'Choose the specification to continue.';
      packagingHelper.textContent = 'Select a profile first.';
    } else {
      hideSection(thicknessSection);
      typeHelper.textContent = 'Pick a rule to unlock the rest of the form.';
    }

    updateSummary();
  }

  function resetWorkflow() {
    ruleTypeSelect.value = '';
    thicknessSelect.value = '';
    sizeSelect.value = '';
    packagingSelect.value = '';
    quantityInput.value = '';
    quantityInput.disabled = true;
    quantityConfirmBtn.disabled = true;

    hideSection(thicknessSection);
    hideSection(sizeSection);
    hideSection(packagingSection);
    hideSection(quantitySection);
    typeHelper.textContent = 'Pick a rule to unlock the rest of the form.';
    sizeHelper.textContent = 'Select thickness (for cutting) or continue for creasing.';
    quantityHelper.textContent = 'Choose a packaging type to enable quantity entry.';
  }

  function populateThicknessOptions() {
    const keys = Object.keys(state.rawSizes.cutting || {});
    thicknessSelect.innerHTML = '<option value="">Select thickness</option>' +
      keys.map(key => `<option value="${key}">${key.toUpperCase()}</option>`).join('');
    thicknessSelect.disabled = keys.length === 0;
  }

  function lockCreasingThickness() {
    if (!thicknessSelect) return;
    const lockedValue = '2pt';
    thicknessSelect.innerHTML = `<option value="${lockedValue}" selected>${lockedValue.toUpperCase()} (Fixed)</option>`;
    thicknessSelect.value = lockedValue;
    thicknessSelect.disabled = true;
    state.selectedThickness = lockedValue;
    showSection(thicknessSection, thicknessSelect);
    thicknessHelper.textContent = 'Thickness is fixed at 2pt for creasing rule selections.';
  }

  function unlockThicknessSelect() {
    if (!thicknessSelect) return;
    thicknessSelect.disabled = false;
  }

  function populateSizeOptions(thickness) {
    const options = state.rawSizes.cutting?.[thickness] || [];
    if (!options.length) {
      sizeSelect.innerHTML = '<option value="">No sizes configured for this thickness</option>';
      sizeSelect.disabled = true;
      return;
    }

    sizeSelect.innerHTML = '<option value="">Select size/profile</option>' +
      options.map(option => `
        <option value="${option.id}">
          ${option.label}${option.code ? ` - ${option.code}` : ''}
        </option>
      `).join('');
    sizeSelect.disabled = false;
  }

  function populateCreasingSizes() {
    if (!state.rawSizes.creasing.length) {
      sizeSelect.innerHTML = '<option value="">No creasing specifications available</option>';
      sizeSelect.disabled = true;
      return;
    }

    sizeSelect.innerHTML = '<option value="">Select specification</option>' +
      state.rawSizes.creasing.map(option => `
        <option value="${option.id}">${option.label}${option.code ? ` - ${option.code}` : ''}</option>
      `).join('');
    sizeSelect.disabled = false;
  }

  function populatePackagingOptions() {
    const options = state.availablePackagingOptions || [];
    if (!options.length) {
      packagingSelect.innerHTML = '<option value="">Packaging unavailable for this profile</option>';
      packagingSelect.disabled = true;
      return;
    }

    packagingSelect.innerHTML = '<option value="">Select packaging</option>' +
      options.map(option => `
        <option value="${option.id}">${option.label}${option.code ? ` - ${option.code}` : ''}</option>
      `).join('');
    packagingSelect.disabled = false;
  }

  async function loadMachines() {
    try {
      const response = await fetch('/api/machines');
      const payload = await response.json();
      state.machines = Array.isArray(payload) ? payload : (payload?.machines || []);
    } catch (error) {
      console.error('cutting_creasing_rule.js: unable to load machines', error);
      state.machines = [];
    }

    if (machineSelect) {
      machineSelect.innerHTML = '<option value="">-- Select Machine (optional) --</option>' +
        state.machines.map(machine => `<option value="${machine.id}">${machine.name}</option>`).join('');
    }
  }

  async function loadRuleSizes() {
    try {
      const response = await fetch(DATA_SOURCE, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch rule catalog (${response.status})`);
      }
      const payload = await response.json();
      state.rawSizes.cutting = buildCuttingCatalog(payload?.cutting || {});

      const creasingCatalog = {
        packets: payload?.creasing?.packets || [],
        coils: payload?.creasing?.coils || []
      };
      state.rawSizes.creasing = buildCatalogEntries(creasingCatalog, 'crease');
      state.flattenedSizes = state.rawSizes.creasing;
    } catch (error) {
      console.error('cutting_creasing_rule.js: unable to load size data', error);
      state.rawSizes.cutting = {};
      state.rawSizes.creasing = [];
      state.flattenedSizes = [];
    }
  }

  function disableSection(sectionEl, controlEl, placeholderText) {
    if (sectionEl) {
      sectionEl.hidden = true;
    }
    if (controlEl) {
      controlEl.disabled = true;
      if ('placeholder' in controlEl && placeholderText) {
        controlEl.placeholder = placeholderText;
      }
    }
  }

  function showSection(sectionEl, controlEl) {
    if (sectionEl) {
      sectionEl.hidden = false;
    }
    if (controlEl) {
      controlEl.disabled = false;
    }
  }

  function hideSection(sectionEl) {
    if (sectionEl) {
      sectionEl.hidden = true;
    }
  }

  function updateSummary() {
    if (!summaryBody) return;

    const summaryItems = [];
    if (state.selectedRuleType) {
      summaryItems.push(`<li><strong>Rule Type:</strong> ${capitalize(state.selectedRuleType)} Rule</li>`);
    }
    if (state.selectedMachine) {
      summaryItems.push(`<li><strong>Machine:</strong> ${state.selectedMachine}</li>`);
    }
    if (state.selectedThickness) {
      summaryItems.push(`<li><strong>Thickness:</strong> ${state.selectedThickness.toUpperCase()}</li>`);
    } else if (state.selectedRuleType === 'creasing' && state.selectedSize?.displayThickness) {
      summaryItems.push(`<li><strong>Thickness:</strong> ${state.selectedSize.displayThickness}</li>`);
    }
    if (state.selectedSize) {
      summaryItems.push(`<li><strong>Profile:</strong> ${state.selectedSize.label}</li>`);
      if (state.selectedPackaging?.code || state.selectedSize.code) {
        summaryItems.push(`<li><strong>Code:</strong> ${state.selectedPackaging?.code || state.selectedSize.code}</li>`);
      }
    }
    if (state.selectedPackaging) {
      summaryItems.push(`<li><strong>Packaging:</strong> ${state.selectedPackaging.label}</li>`);
    }
    if (state.quantity) {
      summaryItems.push(`<li><strong>Quantity:</strong> ${state.quantity} lengths</li>`);
    }

    if (!summaryItems.length) {
      summaryBody.innerHTML = '<p class="chem-placeholder mb-0">Start by selecting a rule type.</p>';
    } else {
      summaryBody.innerHTML = `
        <ul class="list-unstyled mb-0 small">
          ${summaryItems.join('')}
        </ul>
      `;
    }

    const ready = canAddToCart();
    if (addToCartBtn) {
      addToCartBtn.disabled = !ready;
    }
  }

  function canAddToCart() {
    if (!state.selectedRuleType) return false;
    if (state.selectedRuleType === 'cutting' && !state.selectedThickness) return false;
    if (!state.selectedSize) return false;
    if (!state.selectedPackaging) return false;
    if (!state.quantity || state.quantity <= 0) return false;
    return true;
  }

  function estimateUnitPrice() {
    const ruleKey = state.selectedRuleType || 'cutting';
    const thicknessKey = state.selectedThickness || 'fallback';
    let base = baseRates[ruleKey];
    if (typeof base === 'object') {
      base = base[thicknessKey] || base.fallback;
    }

    let sizeFactor = 1;
    if (state.selectedSize?.label) {
      const numeric = parseFloat(state.selectedSize.label.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(numeric) && numeric > 0) {
        sizeFactor = Math.max(0.85, Math.min(1.2, numeric / 24));
      }
    }

    let packagingFactor = 1;
    if (state.selectedPackaging?.packagingId === 'coils') {
      packagingFactor = 1.08;
    } else if (state.selectedPackaging?.packagingId === 'custom') {
      packagingFactor = 1.15;
    }

    return base * sizeFactor * packagingFactor;
  }

  async function addRuleToCart() {
    if (!canAddToCart()) {
      showToast?.('Incomplete selection', 'Fill in every step before adding to cart.', 'warning');
      return;
    }

    const unitPrice = estimateUnitPrice();
    const quantity = state.quantity;
    const discountPercent = 0;
    const gstPercent = 18;
    const subtotal = unitPrice * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;

    const payload = {
      type: 'rule',
      name: `${capitalize(state.selectedRuleType)} Rule - ${state.selectedSize?.label || 'Custom Spec'}`,
      machine: state.selectedMachine || '',
      rule_category: state.selectedRuleType,
      thickness: state.selectedThickness || '',
      profile_id: state.selectedPackaging?.profileId || state.selectedSize?.id,
      profile_label: state.selectedSize?.label,
      profile_code: state.selectedPackaging?.code || state.selectedSize?.code || '',
      packaging: state.selectedPackaging?.label,
      packaging_type: state.selectedPackaging?.packagingId,
      quantity,
      unit_price: round(unitPrice, 2),
      discount_percent: discountPercent,
      gst_percent: gstPercent,
      total_price: round(finalTotal, 2),
      calculations: {
        unit_price: round(unitPrice, 2),
        subtotal: round(subtotal, 2),
        discount_percent: discountPercent,
        discount_amount: round(discountAmount, 2),
        discounted_subtotal: round(discountedSubtotal, 2),
        gst_percent: gstPercent,
        gst_amount: round(gstAmount, 2),
        final_total: round(finalTotal, 2)
      }
    };

    addToCartBtn.disabled = true;
    addToCartBtn.textContent = 'Adding…';

    try {
      const response = await fetch('/add_to_cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || result?.message || 'Unable to add rule to cart');
      }

      showToast?.('Rule added', 'Rule configuration saved to your cart.', 'success');
      cartMessage.textContent = 'Rule added successfully!';
      updateCartCount?.();
      state.quantityConfirmed = true;
    } catch (error) {
      console.error('cutting_creasing_rule.js: add to cart failed', error);
      showToast?.('Error', error.message || 'Unable to add rule to cart.', 'error');
      cartMessage.textContent = '';
    } finally {
      addToCartBtn.disabled = false;
      addToCartBtn.textContent = 'Add to Cart';
    }
  }

  function round(value, decimals = 2) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  }

  function capitalize(value = '') {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
})();
