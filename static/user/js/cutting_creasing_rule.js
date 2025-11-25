(function() {
  const pageRoot = document.getElementById('ruleConfiguratorPage');
  if (!pageRoot) {
    return;
  }

  function buildCuttingCatalog(cuttingData = {}, fallbackPricing = DEFAULT_RULE_PRICING) {
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
      acc[thickness] = buildCatalogEntries(catalog, `cut-${thickness}` , fallbackPricing);
      return acc;
    }, {});
  }

  function normalizeThickness(value = '') {
    return value.trim().toLowerCase();
  }

  function buildCatalogEntries(catalog = {}, context = 'cutting', fallbackPricing = DEFAULT_RULE_PRICING) {
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
          finish: entry.finish || '',
          pricing: normalizeRulePricing(entry.pricing, fallbackPricing)
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
  const machineSection = document.getElementById('ruleStepMachine');
  const selectionSection = document.getElementById('ruleStepSelection');
  const quantityInput = document.getElementById('ruleQuantityInput');
  const quantityHelper = document.getElementById('ruleQuantityHelper');
  const quantityConfirmBtn = document.getElementById('ruleQuantityConfirmBtn');
  const summaryBody = document.getElementById('ruleSummaryBody');
  const summaryActions = document.getElementById('ruleSummaryActions');

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

  const RULE_GST_PERCENT = 18;
  const RULE_DISCOUNT_OPTIONS = Array.from({ length: 21 }, (_, idx) => idx * 0.5);
  const DEFAULT_RULE_PRICING = { lengthPerUnit: 100, ratePerMeter: 21 };

  function normalizeRulePricing(sourcePricing = {}, fallbackPricing = DEFAULT_RULE_PRICING) {
    const fallbackLength = Number(fallbackPricing?.lengthPerUnit) || DEFAULT_RULE_PRICING.lengthPerUnit;
    const fallbackRate = Number(fallbackPricing?.ratePerMeter) || DEFAULT_RULE_PRICING.ratePerMeter;

    const lengthPerUnit = Number(sourcePricing?.length_per_unit_m ?? sourcePricing?.lengthPerUnit) || fallbackLength;
    const ratePerMeter = Number(sourcePricing?.rate_per_meter ?? sourcePricing?.ratePerMeter) || fallbackRate;

    return {
      lengthPerUnit: lengthPerUnit > 0 ? lengthPerUnit : fallbackLength,
      ratePerMeter: ratePerMeter >= 0 ? ratePerMeter : fallbackRate
    };
  }

  function getActiveRulePricing() {
    return state.selectedPricing || state.rulePricing || DEFAULT_RULE_PRICING;
  }

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
    quantityConfirmed: false,
    discountPercent: 0,
    rulePricing: { ...DEFAULT_RULE_PRICING },
    selectedPricing: null
  };

  document.addEventListener('DOMContentLoaded', () => {
    initCollapsibleSteps();
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
        if (state.selectedMachine) {
          collapseStep(machineSection, state.selectedMachine);
        } else {
          expandStep(machineSection);
        }
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
          collapseStep(thicknessSection, state.selectedThickness.toUpperCase());
        } else {
          sizeHelper.textContent = 'Select thickness (for cutting) or choose creasing rule.';
          expandStep(thicknessSection);
          expandStep(sizeSection);
          expandStep(packagingSection);
          expandStep(quantitySection);
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
        state.selectedPricing = null;
        packagingSelect.value = '';
        disableSection(packagingSection, packagingSelect, 'Select a size first');

        if (state.selectedSize) {
          state.availablePackagingOptions = state.selectedSize.packagingOptions || [];
          showSection(packagingSection, packagingSelect);
          populatePackagingOptions();
          packagingHelper.textContent = 'Select the desired packaging format.';
          collapseStep(sizeSection, state.selectedSize.label);
        } else {
          state.availablePackagingOptions = [];
          expandStep(sizeSection);
          expandStep(packagingSection);
          expandStep(quantitySection);
        }
        updateSummary();
      });
    }

    if (packagingSelect) {
      packagingSelect.addEventListener('change', event => {
        const options = state.availablePackagingOptions || [];
        state.selectedPackaging = options.find(option => option.id === event.target.value) || null;
        state.selectedPricing = normalizeRulePricing(state.selectedPackaging?.pricing, state.rulePricing);
        if (state.selectedPackaging) {
          showSection(quantitySection, quantityInput);
          quantityInput.disabled = false;
          quantityInput.placeholder = 'Enter required quantity';
          quantityHelper.textContent = 'Enter the number of lengths required.';
          collapseStep(packagingSection, state.selectedPackaging.label);
        } else {
          disableSection(quantitySection, quantityInput, 'Select packaging first');
          expandStep(packagingSection);
          state.selectedPricing = null;
        }

        state.quantity = null;
        quantityInput.value = '';
        state.quantityConfirmed = false;
        quantityConfirmBtn.disabled = true;
        expandStep(quantitySection);
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
          expandStep(quantitySection);
        } else {
          state.quantity = value;
          state.quantityConfirmed = false;
          quantityConfirmBtn.disabled = false;
          expandStep(quantitySection);
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
        collapseStep(quantitySection, `${formatNumber(state.quantity)} packs`);
        updateSummary();
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
    state.selectedPricing = null;

    thicknessSelect.value = '';
    sizeSelect.value = '';
    packagingSelect.value = '';
    quantityInput.value = '';
    quantityInput.disabled = true;
    quantityConfirmBtn.disabled = true;

    hideSection(sizeSection);
    hideSection(packagingSection);
    hideSection(quantitySection);
    if (state.selectedRuleType) {
      collapseStep(selectionSection, `${capitalize(state.selectedRuleType)} rule`);
    } else {
      expandStep(selectionSection);
    }

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
    state.discountPercent = 0;
    state.selectedPricing = null;

    hideSection(thicknessSection);
    hideSection(sizeSection);
    hideSection(packagingSection);
    hideSection(quantitySection);
    typeHelper.textContent = 'Pick a rule to unlock the rest of the form.';
    sizeHelper.textContent = 'Select thickness (for cutting) or continue for creasing.';
    quantityHelper.textContent = 'Choose a packaging type to enable quantity entry.';
    [machineSection, selectionSection, thicknessSection, sizeSection, packagingSection, quantitySection].forEach(expandStep);
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
    collapseStep(thicknessSection, `${lockedValue.toUpperCase()} (Fixed)`);
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
      state.rulePricing = normalizeRulePricing(payload?.pricing, DEFAULT_RULE_PRICING);
      const fallbackPricing = state.rulePricing;
      state.rawSizes.cutting = buildCuttingCatalog(payload?.cutting || {}, fallbackPricing);

      const creasingCatalog = {
        packets: payload?.creasing?.packets || [],
        coils: payload?.creasing?.coils || []
      };
      state.rawSizes.creasing = buildCatalogEntries(creasingCatalog, 'crease', fallbackPricing);
      state.flattenedSizes = state.rawSizes.creasing;
    } catch (error) {
      console.error('cutting_creasing_rule.js: unable to load size data', error);
      state.rawSizes.cutting = {};
      state.rawSizes.creasing = [];
      state.flattenedSizes = [];
      state.rulePricing = { ...DEFAULT_RULE_PRICING };
    }
  }

  function disableSection(sectionEl, controlEl, placeholderText) {
    if (sectionEl) {
      sectionEl.hidden = true;
      expandStep(sectionEl);
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
      expandStep(sectionEl);
    }
  }

  function updateSummary() {
    if (!summaryBody) return;

    const items = [];

    if (summaryActions) {
      summaryActions.innerHTML = '';
    }

    if (state.selectedRuleType) {
      items.push(summaryItem('Rule type', `${capitalize(state.selectedRuleType)} rule`));
    }

    if (state.selectedMachine) {
      items.push(summaryItem('Machine / press', state.selectedMachine));
    }

    if (state.selectedThickness) {
      items.push(summaryItem('Thickness', state.selectedThickness.toUpperCase()));
    } else if (state.selectedRuleType === 'creasing' && state.selectedSize?.displayThickness) {
      items.push(summaryItem('Thickness', state.selectedSize.displayThickness));
    }

    if (state.selectedSize) {
      const profileNote = state.selectedSize.code ? `Catalog code ${sanitize(state.selectedSize.code)}` : '';
      items.push(summaryItem('Profile', state.selectedSize.label, profileNote));
    }

    if (state.selectedPackaging) {
      const pkgNote = state.selectedPackaging.description || '';
      items.push(summaryItem('Packaging', state.selectedPackaging.label, pkgNote));
    }

    if (state.quantity) {
      const quantityNote = state.quantityConfirmed ? 'Confirmed' : 'Pending confirmation';
      items.push(summaryItem('Quantity', `${formatNumber(state.quantity)} packs`, quantityNote));

      const pricing = getRulePricingSnapshot();
      if (pricing.quantity > 0) {
        items.push(renderRuleDiscountControl(pricing));
        items.push(summaryItem(
          'Rate',
          `${formatCurrency(pricing.ratePerMeter)} per meter`,
          `${pricing.lengthPerUnit} m fixed per pack`
        ));
        items.push(summaryItem(
          'Pack price',
          formatCurrency(pricing.unitPrice),
          `${pricing.lengthPerUnit} m × ${formatCurrency(pricing.ratePerMeter)} per meter`
        ));

        const discountNote = pricing.discountPercent > 0
          ? `Discount applied: ${formatCurrency(pricing.discountAmount)}`
          : 'No discount applied';
        items.push(summaryItem(
          'Subtotal',
          formatCurrency(pricing.discountedSubtotal),
          discountNote
        ));

        items.push(summaryItem(
          'Estimated total',
          formatCurrency(pricing.finalTotal),
          `GST (${pricing.gstPercent}%): ${formatCurrency(pricing.gstAmount)}`
        ));
      }
    }

    if (!items.length) {
      summaryBody.innerHTML = '<p class="chem-summary__empty mb-0">Start by selecting a rule type.</p>';
    } else {
      summaryBody.innerHTML = items.join('');
      rebindRuleDiscountSelect();
    }

    if (!summaryActions) {
      return;
    }

    if (canAddToCart()) {
      summaryActions.innerHTML = `
        <button type="button" class="chem-summary__cta-btn add-to-cart-btn" id="ruleSummaryAddToCartBtn">
          <i class="fas fa-cart-plus"></i>
          <span>Add to cart</span>
        </button>
      `;

      const summaryCartBtn = document.getElementById('ruleSummaryAddToCartBtn');
      if (summaryCartBtn) {
        summaryCartBtn.addEventListener('click', async event => {
          event.preventDefault();
          await addRuleToCart(summaryCartBtn);
        });
      }
    } else {
      summaryActions.innerHTML = '<p class="chem-summary__note chem-summary__note--muted mb-0">Complete every step and confirm quantity to add this rule to your cart.</p>';
    }
  }

  function getDiscountPercent() {
    const selectEl = document.getElementById('ruleDiscountPercent');
    if (selectEl) {
      const value = parseFloat(selectEl.value);
      if (Number.isFinite(value)) {
        state.discountPercent = Math.max(0, Math.min(100, value));
      }
    }
    const numeric = Number(state.discountPercent);
    return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : 0));
  }

  function canAddToCart() {
    if (!state.selectedRuleType) return false;
    if (state.selectedRuleType === 'cutting' && !state.selectedThickness) return false;
    if (!state.selectedSize) return false;
    if (!state.selectedPackaging) return false;
    if (!state.quantity || state.quantity <= 0) return false;
    if (!state.quantityConfirmed) return false;
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

  async function addRuleToCart(cartBtn) {
    if (!canAddToCart()) {
      showToast?.('Incomplete selection', 'Fill in every step before adding to cart.', 'warning');
      return;
    }

    const pricing = getRulePricingSnapshot();
    const unitPrice = pricing.unitPrice;
    const quantity = pricing.quantity;
    const discountPercent = pricing.discountPercent;
    const gstPercent = pricing.gstPercent;
    const subtotal = pricing.subtotal;
    const discountAmount = pricing.discountAmount;
    const discountedSubtotal = pricing.discountedSubtotal;
    const gstAmount = pricing.gstAmount;
    const finalTotal = pricing.finalTotal;
    const lengthPerUnit = pricing.lengthPerUnit;
    const ratePerMeter = pricing.ratePerMeter;
    const totalLength = lengthPerUnit * quantity;

    const thicknessLabel = state.selectedThickness || state.selectedSize?.displayThickness || state.selectedSize?.thickness || '';
    const profileCode = (state.selectedPackaging?.code || state.selectedSize?.code || '').trim();
    const payload = {
      type: 'rule',
      name: `${capitalize(state.selectedRuleType)} Rule - ${state.selectedSize?.label || 'Custom Spec'}`,
      machine: state.selectedMachine || '',
      rule_category: state.selectedRuleType,
      thickness: thicknessLabel,
      profile_id: state.selectedPackaging?.profileId || state.selectedSize?.id,
      profile_label: state.selectedSize?.label,
      profile_code: profileCode,
      packaging: state.selectedPackaging?.label,
      packaging_type: state.selectedPackaging?.packagingId,
      quantity,
      unit_price: round(unitPrice, 2),
      length_per_unit_m: round(lengthPerUnit, 2),
      rate_per_meter: round(ratePerMeter, 2),
      total_length_m: round(totalLength, 2),
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

    if (cartBtn) {
      cartBtn.disabled = true;
      cartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding…';
    }

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
      updateCartCount?.();
      state.quantityConfirmed = true;
    } catch (error) {
      console.error('cutting_creasing_rule.js: add to cart failed', error);
      showToast?.('Error', error.message || 'Unable to add rule to cart.', 'error');
    } finally {
      if (cartBtn) {
        cartBtn.disabled = false;
        cartBtn.innerHTML = '<i class="fas fa-cart-plus"></i><span>Add to cart</span>';
      }
    }
  }

  function summaryItem(label, value, note) {
    return `
      <div class="chem-summary__item">
        <span class="chem-summary__label">${sanitize(label)}</span>
        <span class="chem-summary__value">${sanitize(value)}</span>
        ${note ? `<span class="chem-summary__note chem-summary__note--muted">${note}</span>` : ''}
      </div>
    `;
  }

  function renderRuleDiscountControl(pricing) {
    const discountPercent = pricing.discountPercent;
    const discountOptions = RULE_DISCOUNT_OPTIONS.map(percent => `
      <option value="${percent}" ${percent === discountPercent ? 'selected' : ''}>${percent}%</option>
    `).join('');

    const discountSummaryText = discountPercent > 0
      ? `Saving: ${formatCurrency(pricing.discountAmount)} · Subtotal after discount: ${formatCurrency(pricing.discountedSubtotal)}`
      : 'No discount applied yet.';

    return `
      <div class="chem-summary__item chem-summary__item--discount">
        <div class="chem-summary__discount-control">
          <span class="chem-summary__label">Discount</span>
          <select id="ruleDiscountPercent" class="form-select form-select-sm chem-summary__discount-select">
            ${discountOptions}
          </select>
        </div>
        <div class="chem-summary__note chem-summary__note--muted">${discountSummaryText}</div>
      </div>
    `;
  }

  function rebindRuleDiscountSelect() {
    const selectEl = document.getElementById('ruleDiscountPercent');
    if (!selectEl) return;
    selectEl.addEventListener('change', () => {
      const value = parseFloat(selectEl.value);
      state.discountPercent = Number.isFinite(value) ? value : 0;
      updateSummary();
    }, { once: true });
  }


  function formatNumber(value) {
    const numeric = Number(value) || 0;
    return numeric.toLocaleString('en-IN', {
      minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function formatCurrency(value) {
    return `₹${formatNumber(value ?? 0)}`;
  }

  function getRulePricingSnapshot(overrides = {}) {
    const quantity = overrides.quantity ?? (state.quantity || 0);
    const discountPercent = overrides.discountPercent ?? getDiscountPercent();
    const gstPercent = overrides.gstPercent ?? RULE_GST_PERCENT;
    const pricingSource = overrides.pricing || getActiveRulePricing();
    const lengthPerUnit = Number(pricingSource.lengthPerUnit) || DEFAULT_RULE_PRICING.lengthPerUnit;
    const ratePerMeter = Number(pricingSource.ratePerMeter) || DEFAULT_RULE_PRICING.ratePerMeter;
    const unitPrice = lengthPerUnit * ratePerMeter;
    const subtotal = unitPrice * quantity;
    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const gstAmount = (discountedSubtotal * gstPercent) / 100;
    const finalTotal = discountedSubtotal + gstAmount;

    return {
      lengthPerUnit,
      ratePerMeter,
      unitPrice,
      quantity,
      subtotal,
      discountPercent,
      discountAmount,
      discountedSubtotal,
      gstPercent,
      gstAmount,
      finalTotal
    };
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

  function round(value, decimals = 2) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  }

  function capitalize(value = '') {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
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

      const reopenStep = () => {
        expandStep(stepEl);
        if (stepEl === quantitySection) {
          state.quantityConfirmed = false;
          if (quantityConfirmBtn) {
            const currentValue = parseFloat(quantityInput.value);
            const hasValidQuantity = Number.isFinite(currentValue) && currentValue > 0;
            quantityConfirmBtn.disabled = !hasValidQuantity;
          }
          updateSummary();
        }
      };

      updateBtn.addEventListener('click', e => {
        e.stopPropagation();
        reopenStep();
      });

      header.addEventListener('click', e => {
        if (e.target.closest('.chem-step__update')) return;
        reopenStep();
      });
    });
  }
})();
