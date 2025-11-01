let sizeMetaMap = {};
let currentNetPrice = 0;
let currentDiscount = 0; // Track current discount percentage
let currentThickness = ''; // Track current thickness
let editingItem = null; // Track the item being edited
let customSize = { across: null, along: null, area: 0 };
let currentRatePerSqm = 0;
let thicknessOptionsBySize = new Map();
let lengthsByWidthMap = new Map();

const BASE_RATE_PER_100_MICRON = 80; // ₹ per sq.m at 100 micron

let customLengthInputEl;
let customWidthInputEl;
let thicknessSelectEl;
let customSizeSummaryEl;
let customSizeFeedbackEl;
let cutQuestionSectionEl;
let cutDetailsSectionEl;
let cutYesRadio;
let cutNoRadio;
let standardAreaDisplayEl;
let customAreaDisplayEl;
let cutStandardRowEl;
let cutCustomRowEl;
let cutDetailsNoteEl;

function isPositiveNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

function mmToSqm(acrossMm, alongMm) {
  if (!isPositiveNumber(acrossMm) || !isPositiveNumber(alongMm)) {
    return 0;
  }
  return (acrossMm / 1000) * (alongMm / 1000);
}

function parseSizeLabel(label) {
  if (!label) return null;
  const match = label.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return {
    along: parseFloat(match[1]),
    across: parseFloat(match[2])
  };
}

const CUT_NOTE_STANDARD = 'Underpacking will be supplied in the selected size.';
const CUT_NOTE_CUSTOM = 'Underpacking will be cut to your entered size.';
const CUT_NOTE_WAITING = 'Select whether we should cut to your entered size.';

function formatDimensionValue(value) {
  if (!isPositiveNumber(value)) {
    return null;
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatDimensionLabel(acrossMm, alongMm) {
  const formattedAcross = formatDimensionValue(acrossMm);
  const formattedAlong = formatDimensionValue(alongMm);
  if (!formattedAcross || !formattedAlong) {
    return '';
  }
  return `${formattedAlong} x ${formattedAcross} mm`;
}

function populateSelectOptions(selectEl, values = [], placeholder = '-- Select --') {
  if (!selectEl) return;

  const currentValue = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;

  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });

  if (currentValue && values.map(String).includes(String(currentValue))) {
    selectEl.value = currentValue;
  }
}

function populateCustomDropdowns({ widths = [], lengths = [] } = {}) {
  populateSelectOptions(customWidthInputEl, widths.map(String), '-- Select Across --');
  populateSelectOptions(customLengthInputEl, lengths.map(String), '-- Select Around --');
}

function updateLengthOptionsForWidth(widthValue) {
  if (!customLengthInputEl) return;
  const sanitizedWidth = String(widthValue || '').trim();
  if (!sanitizedWidth) {
    populateSelectOptions(customLengthInputEl, [], '-- Select Around --');
    return;
  }

  const lengths = lengthsByWidthMap.get(sanitizedWidth) || [];
  populateSelectOptions(customLengthInputEl, lengths.map(String), '-- Select Around --');
}

function hasValidCustomSize() {
  return isPositiveNumber(customSize.across) && isPositiveNumber(customSize.along);
}

function hideCuttingSections() {
  if (cutQuestionSectionEl) {
    cutQuestionSectionEl.style.display = 'none';
  }
  if (cutDetailsSectionEl) {
    cutDetailsSectionEl.style.display = 'none';
  }
  if (cutYesRadio) {
    cutYesRadio.checked = false;
  }
  if (cutNoRadio) {
    cutNoRadio.checked = false;
  }
  if (standardAreaDisplayEl) {
    standardAreaDisplayEl.textContent = '0.000';
  }
  if (customAreaDisplayEl) {
    customAreaDisplayEl.textContent = '0.000';
  }
  if (cutStandardRowEl) {
    cutStandardRowEl.style.display = 'none';
  }
  if (cutCustomRowEl) {
    cutCustomRowEl.style.display = 'none';
  }
  if (cutDetailsNoteEl) {
    cutDetailsNoteEl.textContent = CUT_NOTE_WAITING;
  }
}

function showCutQuestion(resetRadios = true) {
  if (cutQuestionSectionEl) {
    cutQuestionSectionEl.style.display = 'block';
  }
  if (resetRadios) {
    if (cutYesRadio) cutYesRadio.checked = false;
    if (cutNoRadio) cutNoRadio.checked = false;
    if (cutDetailsSectionEl) cutDetailsSectionEl.style.display = 'none';
    if (cutDetailsNoteEl) cutDetailsNoteEl.textContent = CUT_NOTE_WAITING;
    if (cutCustomRowEl) cutCustomRowEl.style.display = 'none';
  } else if (cutYesRadio && cutYesRadio.checked) {
    updateCutDetails();
  }
}

function updateCutDetails() {
  if (!cutDetailsSectionEl) {
    return;
  }

  const hasCustom = hasValidCustomSize();

  if (!hasCustom) {
    hideCuttingSections();
    return;
  }

  const customArea = customSize.area || mmToSqm(customSize.across, customSize.along);
  customSize.area = customArea;

  if (standardAreaDisplayEl) {
    standardAreaDisplayEl.textContent = customArea.toFixed(3);
  }

  if (cutStandardRowEl) {
    cutStandardRowEl.style.display = 'flex';
  }

  const shouldShowCustomRow = Boolean(cutYesRadio && cutYesRadio.checked);

  if (customAreaDisplayEl) {
    customAreaDisplayEl.textContent = customArea.toFixed(3);
  }

  if (cutCustomRowEl) {
    cutCustomRowEl.style.display = shouldShowCustomRow ? 'flex' : 'none';
  }

  if (cutDetailsNoteEl) {
    cutDetailsNoteEl.textContent = shouldShowCustomRow ? CUT_NOTE_CUSTOM : CUT_NOTE_STANDARD;
  }

  cutDetailsSectionEl.style.display = 'block';
}

function updateCustomSizeState({ showFeedback = false } = {}) {
  const rawLength = customLengthInputEl ? customLengthInputEl.value : '';
  const rawWidth = customWidthInputEl ? customWidthInputEl.value : '';
  const aroundVal = parseFloat(rawLength || '');
  const acrossVal = parseFloat(rawWidth || '');
  const valid = isPositiveNumber(acrossVal) && isPositiveNumber(aroundVal);

  if (valid) {
    customSize.across = acrossVal;
    customSize.along = aroundVal;
    customSize.area = mmToSqm(customSize.across, customSize.along);

    if (customSizeSummaryEl) {
      const thicknessLabel = thicknessSelectEl && thicknessSelectEl.value ? `${thicknessSelectEl.value} micron · ` : '';
      customSizeSummaryEl.textContent = `${thicknessLabel}${aroundVal.toFixed(0)} mm × ${acrossVal.toFixed(0)} mm (${customSize.area.toFixed(3)} sq.m)`;
    }
    if (customSizeFeedbackEl) {
      customSizeFeedbackEl.classList.add('d-none');
    }
    return true;
  }

  customSize.across = null;
  customSize.along = null;
  customSize.area = 0;

  if (customSizeSummaryEl) {
    customSizeSummaryEl.textContent = thicknessSelectEl && thicknessSelectEl.value ? 'Select across and around to see sq.m.' : 'Select thickness and sizes to see sq.m.';
  }
  if (customSizeFeedbackEl) {
    customSizeFeedbackEl.classList[showFeedback ? 'remove' : 'add']('d-none');
  }
  hideCuttingSections();
  return false;
}

function handleCustomSizeInputChange() {
  const isValid = updateCustomSizeState();

  if (isValid) {
    enableThicknessForSize();
  } else {
    disableThicknessSelection();
  }

  if (isValid && cutYesRadio && cutYesRadio.checked) {
    updateCutDetails();
  }
}

function resetCustomSizeInputs() {
  if (customLengthInputEl) customLengthInputEl.value = '';
  if (customWidthInputEl) customWidthInputEl.value = '';
  updateCustomSizeState();
  disableThicknessSelection();
}

// Debug function to log element status
function logElementStatus(id) {
  const el = document.getElementById(id);
  console.log(`Element ${id}:`, el ? 'Found' : 'Not found');
  return el;
}

// Function to check if we're editing an existing cart item
function checkForEditingItem() {
  // First check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const editMode = urlParams.get('edit') === 'true';
  const itemId = urlParams.get('item_id');
  
  if (editMode && itemId) {
    // Get item details from URL parameters
    editingItem = {};
    urlParams.forEach((value, key) => {
      // Skip internal parameters
      if (key === 'edit' || key === 'item_id' || key === 'type' || key === '_') return;
      
      // Try to parse JSON values
      try {
        editingItem[key] = JSON.parse(value);
      } catch (e) {
        editingItem[key] = value;
      }
    });
    
    // Add ID and type
    editingItem.id = itemId;
    editingItem.type = urlParams.get('type') || 'mpack';
    
    console.log('Editing mpack item from URL:', editingItem);
    return editingItem;
  }
  
  // Fall back to session storage if no URL parameters
  const storedItem = sessionStorage.getItem('editingCartItem');
  if (!storedItem) return null;
  
  try {
    editingItem = JSON.parse(storedItem);
    // Remove the item from session storage so it doesn't persist after refresh
    sessionStorage.removeItem('editingCartItem');
    return editingItem;
  } catch (e) {
    console.error('Error parsing editing item:', e);
    return null;
  }
}

// Function to pre-fill the form with item data
function prefillFormWithItem(item) {
  if (!item) return;
  
  console.log('Prefilling MPack form with item:', item);
  
  try {
    // Update the button text
    const addToCartBtn = document.getElementById('addToCartBtn');
    if (addToCartBtn) {
      addToCartBtn.textContent = 'Update Item';
      addToCartBtn.onclick = async function(e) { 
        e.preventDefault();
        try {
          await updateCartItem(this, item.id);
        } catch (error) {
          console.error('Error updating cart item:', error);
          showToast('Error', 'Failed to update item. Please try again.', 'error');
        }
      };
    }
    
    // Set underpacking type
    if (item.underpacking_type) {
      const underpackingTypeSelect = document.getElementById('underpackingType');
      if (underpackingTypeSelect) {
        underpackingTypeSelect.value = item.underpacking_type;
        underpackingTypeSelect.dispatchEvent(new Event('change'));
      }
    }
    
    // Set machine
    if (item.machine) {
      const machineSelect = document.getElementById('machineSelect');
      if (machineSelect) {
        // Find the option that matches the machine name
        for (let i = 0; i < machineSelect.options.length; i++) {
          if (machineSelect.options[i].text === item.machine) {
            machineSelect.selectedIndex = i;
            machineSelect.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
    }
    
    // Set thickness after a short delay to allow the thickness options to load
    setTimeout(() => {
      if (item.thickness) {
        const thicknessValue = item.thickness.replace(' micron', '');
        const thicknessSelect = document.getElementById('thicknessSelect');
        if (thicknessSelect) {
          thicknessSelect.value = thicknessValue;
          thicknessSelect.dispatchEvent(new Event('change'));
          
          // Set size after thickness is loaded
          setTimeout(() => {
            if (item.size) {
              const sizeSelect = document.getElementById('sizeSelect');
              const sizeInput = document.getElementById('sizeInput');
              if (sizeSelect && sizeInput) {
                // Find the option that matches the size
                for (let i = 0; i < sizeSelect.options.length; i++) {
                  if (sizeSelect.options[i].text === item.size) {
                    sizeSelect.selectedIndex = i;
                    sizeInput.value = item.size;
                    sizeSelect.dispatchEvent(new Event('change'));
                    break;
                  }
                }
              }
              
              // Set quantity
              const sheetInput = document.getElementById('sheetInput');
              if (sheetInput && !isNaN(item.quantity)) {
                sheetInput.value = item.quantity;
              }
              
              // Set discount after a short delay to allow the discount options to load
              setTimeout(() => {
                if (item.discount_percent) {
                  const discountSelect = document.getElementById('discountSelect');
                  if (discountSelect) {
                    // Try to find an exact match first
                    let found = false;
                    for (let i = 0; i < discountSelect.options.length; i++) {
                      if (parseFloat(discountSelect.options[i].value) === item.discount_percent) {
                        discountSelect.selectedIndex = i;
                        discountSelect.dispatchEvent(new Event('change'));
                        found = true;
                        break;
                      }
                    }
                    
                    // If no exact match, set the value directly
                    if (!found && discountSelect.value !== '') {
                      discountSelect.value = item.discount_percent;
                      discountSelect.dispatchEvent(new Event('change'));
                    }
                  }
                }
              }, 500);
            }
          }, 500);
        }
      }
    }, 500);
    
  } catch (error) {
    console.error('Error prefilling form:', error);
  }
}

// Function to update an existing cart item
async function updateCartItem(button, itemId) {
  const addToCartBtn = button || document.getElementById('addToCartBtn');
  if (!addToCartBtn) return;
  
  // Show loading state
  const originalText = addToCartBtn.innerHTML;
  addToCartBtn.disabled = true;
  addToCartBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';
  
  try {
    // Get the current form data
    const formData = getFormData();
    
    // Add the item ID to the form data for server-side processing
    formData.item_id = itemId;
    
    // Send the update request to the server
    const response = await fetch('/update_cart_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Show success message and redirect back to cart
      showToast('Success', 'Item updated in cart!', 'success');
      setTimeout(() => {
        window.location.href = '/cart';
      }, 1000);
    } else {
      throw new Error(data.error || 'Failed to update item');
    }
  } catch (error) {
    console.error('Error updating cart item:', error);
    showToast('Error', 'Failed to update item. Please try again.', 'error');
    addToCartBtn.disabled = false;
    addToCartBtn.innerHTML = originalText;
  }
}

// Helper function to get form data
function getFormData() {
  const machineSelect = document.getElementById('machineSelect');
  const thicknessSelect = document.getElementById('thicknessSelect');
  const sheetInput = document.getElementById('sheetInput');
  const underpackingTypeSelect = document.getElementById('underpackingType');
  const discountSelect = document.getElementById('discountSelect');
  
  const quantity = parseInt(sheetInput.value) || 1;
  const discount = discountSelect ? parseFloat(discountSelect.value) || 0 : 0;
  
  // Get underpacking type display name
  let underpackingType = '';
  let underpackingTypeDisplay = 'Underpacking Material';
  if (underpackingTypeSelect && underpackingTypeSelect.value) {
    underpackingType = underpackingTypeSelect.value;
    underpackingTypeDisplay = underpackingTypeSelect.options[underpackingTypeSelect.selectedIndex].text;
  }
  
  const thicknessValue = Number(currentThickness || (thicknessSelect && thicknessSelect.value) || 0);
  const sqmArea = hasValidCustomSize() ? customSize.area : 0;
  const ratePerSqm = BASE_RATE_PER_100_MICRON * (thicknessValue / 100);
  const sheetCount = Math.max(1, quantity);
  const unitPrice = ratePerSqm * sqmArea;
  const subtotal = unitPrice * sheetCount;
  const discountAmount = (subtotal * discount) / 100;
  const discountedSubtotal = subtotal - discountAmount;
  const gstRate = parseFloat(document.getElementById('gstSelect').value) || 0;
  const gstAmount = (discountedSubtotal * gstRate) / 100;
  const finalPrice = discountedSubtotal + gstAmount;
  
  // Get size details
  const customAcross = isPositiveNumber(customSize.across) ? customSize.across : null;
  const customAlong = isPositiveNumber(customSize.along) ? customSize.along : null;
  const customArea = isPositiveNumber(customSize.area) ? customSize.area : (customAcross && customAlong ? mmToSqm(customAcross, customAlong) : null);
  const cutToCustom = Boolean(cutYesRadio && cutYesRadio.checked);

  const displayAlong = customAlong || 0;
  const displayAcross = customAcross || 0;
  const displaySizeLabel = customAcross && customAlong ? formatDimensionLabel(customAcross, customAlong) : '';

  return {
    id: 'mpack_' + Date.now(),
    type: 'mpack',
    name: underpackingTypeDisplay,
    machine: machineSelect && machineSelect.value ? machineSelect.options[machineSelect.selectedIndex].text : '--',
    thickness: thicknessSelect.value + ' micron',
    size: displaySizeLabel,
    along_mm: displayAlong,
    across_mm: displayAcross,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: gstRate,
    custom_along_mm: customAlong,
    custom_across_mm: customAcross,
    custom_area_sqm: customArea,
    standard_along_mm: null,
    standard_across_mm: null,
    standard_area_sqm: 0,
    cut_to_custom_size: cutToCustom,
    standard_size_label: '',
    custom_size_label: displaySizeLabel,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: {
      rate_per_sqm: parseFloat(ratePerSqm.toFixed(2)),
      sqm_per_sheet: parseFloat((sqmArea || 0).toFixed(3)),
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: sheetCount,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      discounted_subtotal: parseFloat(discountedSubtotal.toFixed(2)),
      gst_percent: gstRate,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
      final_total: parseFloat(finalPrice.toFixed(2))
    }
  };
}

// Function to handle company info from URL parameters
function handleCompanyFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const companyName = urlParams.get('company_name');
    const companyEmail = urlParams.get('company_email');
    const companyId = urlParams.get('company_id');
    
    if (companyName && companyEmail) {
        const companyInfo = {
            name: decodeURIComponent(companyName),
            email: decodeURIComponent(companyEmail),
            id: companyId || ''
        };
        
        // Save to localStorage for persistence
        localStorage.setItem('selectedCompany', JSON.stringify(companyInfo));
        
        // Update the UI if the elements exist
        const companyNameEl = document.getElementById('companyNameDisplay');
        const companyEmailEl = document.getElementById('companyEmailDisplay');
        
        if (companyNameEl) companyNameEl.textContent = companyInfo.name;
        if (companyEmailEl) companyEmailEl.textContent = companyInfo.email;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("MPACK JS loaded - DOM fully loaded");

  // Handle company info from URL if present
  handleCompanyFromUrl();

  // Cache DOM references for new workflow pieces
  sizeInputEl = document.getElementById('sizeInput');
  sizeSelectEl = document.getElementById('sizeSelect');
  customLengthInputEl = document.getElementById('customLengthInput');
  customWidthInputEl = document.getElementById('customWidthInput');
  thicknessSelectEl = document.getElementById('thicknessSelect');
  customSizeSummaryEl = document.getElementById('customSizeSummary');
  customSizeFeedbackEl = document.getElementById('customSizeFeedback');
  cutQuestionSectionEl = document.getElementById('cutQuestionSection');
  cutDetailsSectionEl = document.getElementById('cutDetailsSection');
  cutYesRadio = document.getElementById('cutYes');
  cutNoRadio = document.getElementById('cutNo');
  standardAreaDisplayEl = document.getElementById('standardAreaDisplay');
  customAreaDisplayEl = document.getElementById('customAreaDisplay');
  cutStandardRowEl = document.getElementById('cutStandardRow');
  cutCustomRowEl = document.getElementById('cutCustomRow');
  cutDetailsNoteEl = document.getElementById('cutDetailsNote');

  // Disable standard size search until custom size captured
  if (sizeInputEl) {
    sizeInputEl.disabled = true;
  }
  if (sizeSelectEl) {
    sizeSelectEl.disabled = true;
  }

  // Attach listeners for custom size inputs
  if (customLengthInputEl) {
    customLengthInputEl.addEventListener('change', handleCustomSizeInputChange);
  }
  if (customWidthInputEl) {
    customWidthInputEl.addEventListener('change', event => {
      updateLengthOptionsForWidth(event.target.value);
      handleCustomSizeInputChange();
    });
  }

  if (cutYesRadio) {
    cutYesRadio.addEventListener('change', () => {
      updateCutDetails();
    });
  }
  if (cutNoRadio) {
    cutNoRadio.addEventListener('change', () => {
      updateCutDetails();
    });
  }

  try {
    // Load machines first
    console.log("Loading machines...");
    loadMachines();

    // Load MPack size data for dropdowns
    console.log('Loading MPack size metadata...');
    await loadSizes();

    // Load discounts
    console.log("Loading discounts...");
    await loadDiscounts();

    // Check if we're editing an existing cart item
    console.log("Checking for editing item...");
    const foundEditingItem = checkForEditingItem();

    if (foundEditingItem) {
      editingItem = foundEditingItem;
      console.log("Editing existing item:", editingItem);

      // Small delay to ensure all elements are rendered
      setTimeout(() => {
        try {
          prefillFormWithItem(editingItem);

          // Update the add to cart button to show "Update Item"
          const addToCartBtn = document.getElementById('addToCartBtn');
          if (addToCartBtn) {
            addToCartBtn.textContent = 'Update Item';
            addToCartBtn.onclick = async function (e) {
              e.preventDefault();
              try {
                await updateCartItem(this, editingItem.id);
              } catch (error) {
                console.error('Error updating cart item:', error);
                showToast('Error', 'Failed to update item. Please try again.', 'error');
              }
            };
          }

          // Show the mpack section if it's hidden
          const mpackSection = document.getElementById('mpackSection');
          if (mpackSection) {
            mpackSection.style.display = 'block';
          }
        } catch (error) {
          console.error('Error prefilling form with item:', error);
        }
      }, 100);
    } else {
      editingItem = null;
      console.log('No editing item found');
    }
  } catch (error) {
    console.error('Error initializing MPack page:', error);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.textContent = 'Error loading page. Please refresh and try again.';
    document.querySelector('main').prepend(errorDiv);
  }

  // Debug log element statuses
  console.log('Checking required elements...');
  logElementStatus('machineSelect');
  logElementStatus('mpackSection');
  logElementStatus('thicknessSelect');
  logElementStatus('sizeSelect');
  logElementStatus('sheetInput');
  logElementStatus('discountSelect');

  // Set up the add to cart button
  const addToCartBtn = document.getElementById('addToCartBtn');
  if (addToCartBtn) {
    addToCartBtn.onclick = async function (e) {
      e.preventDefault();
      try {
        if (editingItem) {
          await updateCartItem(this, editingItem.id);
        } else {
          await addMpackToCart();
        }
      } catch (error) {
        console.error('Error processing cart action:', error);
        showToast('Error', 'Failed to process your request. Please try again.', 'error');
      }
    };
  }

  // Safely add event listener to machine select
  const machineSelect = document.getElementById('machineSelect');
  const underpackingTypeSelect = document.getElementById('underpackingType');
  const mpackSection = document.getElementById('mpackSection');

  if (!machineSelect) {
    console.error('machineSelect element not found!');
  }

  if (!mpackSection) {
    console.error('mpackSection element not found!');
  }

  if (underpackingTypeSelect && mpackSection) {
    console.log('Setting up underpacking type change handler...');
    underpackingTypeSelect.addEventListener('change', () => {
      const hasSelection = !!underpackingTypeSelect.value;
      mpackSection.style.display = hasSelection ? 'block' : 'none';
      if (!hasSelection) {
        if (machineSelect) {
          machineSelect.value = '';
        }
        resetCustomSizeInputs();
        resetStandardSelection({ preserveOptions: false });
        resetCalculations();
      }
    });
  }

  // Update thickness change handler to recalculate prices
  const thicknessSelect = document.getElementById('thicknessSelect');
  if (thicknessSelect) {
    thicknessSelect.addEventListener('change', () => {
      currentDiscount = 0;
      const discountSelect = document.getElementById('discountSelect');
      if (discountSelect) {
        discountSelect.value = '';
      }
      calculateFinalPrice();
      updateCustomSizeState();
    });
  }

  // Update size selection handler
  if (sizeSelectEl) {
    sizeSelectEl.addEventListener('change', () => {
      handleSizeSelection();
      calculateFinalPrice();
    });
  }

  // Quantity input handler
  const sheetInput = document.getElementById('sheetInput');
  if (sheetInput) {
    sheetInput.addEventListener('input', () => {
      calculateFinalPrice();
    });
  }

  // Discount select handler
  const discountSelect = document.getElementById('discountSelect');
  if (discountSelect) {
    discountSelect.addEventListener('change', () => {
      applyDiscount();
      calculateFinalPrice();
    });
  }
});

function loadMachines() {
  fetch("/api/machines")
    .then(res => res.json())
    .then(data => {
      const machineSelect = document.getElementById("machineSelect");
      const machinesArr = Array.isArray(data) ? data : data.machines;
      machinesArr.forEach(machine => {
        const opt = document.createElement("option");
        opt.value = machine.id;
        opt.textContent = machine.name;
        machineSelect.appendChild(opt);
      });
    });
}

function disableThicknessSelection() {
  if (!thicknessSelectEl) return;
  thicknessSelectEl.innerHTML = '<option value="">-- Select Thickness --</option>';
  thicknessSelectEl.disabled = true;
  currentThickness = '';
  resetCalculations();
}

function enableThicknessForSize() {
  if (!thicknessSelectEl) return;
  const acrossVal = parseFloat(customWidthInputEl?.value || '');
  const alongVal = parseFloat(customLengthInputEl?.value || '');
  if (!isPositiveNumber(acrossVal) || !isPositiveNumber(alongVal)) {
    disableThicknessSelection();
    return;
  }

  const key = `${acrossVal}x${alongVal}`;
  const matchingThicknesses = thicknessOptionsBySize.get(key) || [];

  console.debug('Thickness lookup', { key, matchingThicknesses });

  thicknessSelectEl.innerHTML = '<option value="">-- Select Thickness --</option>';
  matchingThicknesses.forEach(thickness => {
    const option = document.createElement('option');
    option.value = thickness;
    option.textContent = thickness;
    thicknessSelectEl.appendChild(option);
  });

  if (matchingThicknesses.length === 0) {
    thicknessSelectEl.disabled = true;
    thicknessSelectEl.title = 'No thickness options available for the selected size';
  } else {
    thicknessSelectEl.disabled = false;
    thicknessSelectEl.removeAttribute('disabled');
    thicknessSelectEl.title = '';
  }

  if (matchingThicknesses.length === 1) {
    thicknessSelectEl.value = matchingThicknesses[0];
    thicknessSelectEl.dispatchEvent(new Event('change'));
  }
}

function loadSizes() {
  fetch(`/static/data/mpack.json?v=${Date.now()}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to load MPack data');
      return res.json();
    })
    .then(data => {
      const allSizes = [];
      const widthLengthSets = new Map();
      thicknessOptionsBySize = new Map();

      data.mpack.forEach(entry => {
        entry.sizes.forEach(size => {
          const key = `${size.width}x${size.length}`;
          const options = thicknessOptionsBySize.get(key) || [];
          options.push(entry.id);
          thicknessOptionsBySize.set(key, options);
          allSizes.push(size);

          const widthKey = String(size.width);
          const lengthSet = widthLengthSets.get(widthKey) || new Set();
          lengthSet.add(size.length);
          widthLengthSets.set(widthKey, lengthSet);
        });
      });

      lengthsByWidthMap = new Map();
      widthLengthSets.forEach((lengthSet, widthKey) => {
        lengthsByWidthMap.set(widthKey, [...lengthSet].sort((a, b) => a - b));
      });

      const uniqueWidths = [...new Set(allSizes.map(item => item.width))].sort((a, b) => a - b);
      populateSelectOptions(customWidthInputEl, uniqueWidths.map(String), '-- Select Across --');
      populateSelectOptions(customLengthInputEl, [], '-- Select Around --');

      sizeMetaMap = {};
      thicknessOptionsBySize.forEach((thicknesses, key) => {
        const [width, length] = key.split('x').map(Number);
        sizeMetaMap[key] = { width, length, price: null, thicknesses };
      });

      disableThicknessSelection();
    })
    .catch(err => {
      console.error('Failed to load MPack sizes:', err);
      populateCustomDropdowns({ widths: [], lengths: [] });
      disableThicknessSelection();
    });
}

async function loadDiscounts() {
  console.log('Loading discounts...');
  const select = document.getElementById('discountSelect');
  
  if (!select) {
    console.error('Discount select element not found');
    return;
  }
  
  try {
    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    console.log('Fetching discounts from /static/data/discount.json');
    const response = await fetch('/static/data/discount.json');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Received discount data:', data);
    
    const discounts = data.discounts || [];
    console.log(`Processing ${discounts.length} discount(s)`);
    
    if (discounts.length === 0) {
      console.warn('No discounts found in the JSON file');
    }
    
    // Add new discount options
    discounts.forEach(percent => {
      const percentNum = parseFloat(percent);
      if (!isNaN(percentNum)) {
        const option = document.createElement('option');
        option.value = percentNum;
        option.textContent = `${percentNum}%`;
        select.appendChild(option);
        console.log(`Added discount option: ${percentNum}%`);
      } else {
        console.warn(`Invalid discount percentage: ${percent}`);
      }
    });
    
    // Remove any existing change event listeners to prevent duplicates
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    
    // Add event listener for discount selection
    newSelect.addEventListener('change', function() {
      currentDiscount = parseFloat(this.value) || 0;
      console.log(`Selected discount: ${currentDiscount}%`);
      calculateFinalPrice();
    });
    
    console.log('Discounts loaded successfully');
    
  } catch (error) {
    console.error('Error loading discounts:', error);
    
    // Fallback to default discounts if loading fails
    console.warn('Falling back to default discounts');
    const defaultDiscounts = [5, 10, 15, 20];
    defaultDiscounts.forEach(percent => {
      const option = document.createElement('option');
      option.value = percent;
      option.textContent = `${percent}%`;
      select.appendChild(option);
      console.log(`Added default discount option: ${percent}%`);
    });
  }
}

function resetCalculations() {
  currentNetPrice = 0;
  currentDiscount = 0;

  const sheetInput = document.getElementById('sheetInput');
  if (sheetInput) sheetInput.value = '1';

  const pricingBreakdown = document.getElementById('pricingBreakdown');
  if (pricingBreakdown) {
    pricingBreakdown.innerHTML = '<p class="text-muted mb-0">Select thickness and sizes to see pricing.</p>';
  }

  const priceSection = document.getElementById('priceSection');
  if (priceSection) priceSection.style.display = 'none';

  const addToCartBtn = document.getElementById('addToCartBtn');
  if (addToCartBtn) addToCartBtn.disabled = true;
}

function calculateFinalPrice() {
  const sheetInput = document.getElementById('sheetInput');
  const quantity = parseInt(sheetInput.value, 10) || 0;
  const gstRate = parseFloat(document.getElementById('gstSelect').value) || 0;
  const pricingBreakdown = document.getElementById('pricingBreakdown');
  const addToCartBtn = document.getElementById('addToCartBtn');

  if (!pricingBreakdown) return;

  const hasSelections = currentNetPrice > 0 && isPositiveNumber(standardSize.area) && currentThickness;
  if (!hasSelections) {
    resetCalculations();
    return;
  }

  const sheetCount = Math.max(1, quantity);
  const subtotal = currentNetPrice * sheetCount;
  const discountAmount = (subtotal * currentDiscount) / 100;
  const discountedSubtotal = subtotal - discountAmount;
  const gstAmount = (discountedSubtotal * gstRate) / 100;
  const finalTotal = discountedSubtotal + gstAmount;

  const effectiveSqm = hasValidCustomSize() ? customSize.area : standardSize.area || 0;
  const sqmLabel = effectiveSqm.toFixed(3);

  const baseRateDisplay = BASE_RATE_PER_100_MICRON.toFixed(2);
  const thicknessFactor = Number(currentThickness || 0) / 100;
  const thicknessFactorDisplay = thicknessFactor.toFixed(2);
  const ratePerSqmDisplay = currentRatePerSqm.toFixed(2);

  pricingBreakdown.innerHTML = `
    <div class="pricing-row">
      <span class="pricing-label">Thickness:</span>
      <span class="pricing-value">${currentThickness} micron</span>
    </div>
    <div class="pricing-row">
      <span class="pricing-label">Area per sheet:</span>
      <span class="pricing-value">${sqmLabel} sq.m</span>
    </div>
    <div class="pricing-row">
      <span class="pricing-label">Rate per sq.m:</span>
      <span class="pricing-value">₹${baseRateDisplay} × ${thicknessFactorDisplay} = ₹${ratePerSqmDisplay}</span>
    </div>
    <div class="pricing-row">
      <span class="pricing-label">Sheets:</span>
      <span class="pricing-value">${sheetCount}</span>
    </div>
    <div class="pricing-row">
      <span class="pricing-label">Subtotal:</span>
      <span class="pricing-value">₹${subtotal.toFixed(2)}</span>
    </div>
    ${currentDiscount > 0 ? `
    <div class="pricing-row">
      <span class="pricing-label">Discount (${currentDiscount}%):</span>
      <span class="pricing-value pricing-discount">-₹${discountAmount.toFixed(2)}</span>
    </div>` : ''}
    <div class="pricing-row">
      <span class="pricing-label">GST (${gstRate}%):</span>
      <span class="pricing-value">₹${gstAmount.toFixed(2)}</span>
    </div>
    <div class="pricing-row">
      <span class="pricing-label">Total:</span>
      <span class="pricing-value pricing-total">₹${finalTotal.toFixed(2)}</span>
    </div>
  `;

  const priceSection = document.getElementById('priceSection');
  if (priceSection) priceSection.style.display = 'block';

  if (addToCartBtn) addToCartBtn.disabled = false;
}

function updatePricingFromSelections() {
  const sheetInput = document.getElementById('sheetInput');
  if (sheetInput) sheetInput.value = '1';

  const discountSelect = document.getElementById('discountSelect');
  if (discountSelect) discountSelect.value = '';
  currentDiscount = 0;

  const thicknessValue = parseFloat(thicknessSelectEl && thicknessSelectEl.value ? thicknessSelectEl.value : currentThickness || 0);
  const activeThickness = Number.isFinite(thicknessValue) && thicknessValue > 0 ? thicknessValue : 0;
  const sqmArea = hasValidCustomSize() ? customSize.area : standardSize.area;

  if (!activeThickness || !isPositiveNumber(sqmArea)) {
    resetCalculations();
    return;
  }

  currentThickness = String(activeThickness);
  currentRatePerSqm = BASE_RATE_PER_100_MICRON * (activeThickness / 100);
  currentNetPrice = currentRatePerSqm * sqmArea;

  calculateFinalPrice();
}

function applyDiscount() {
  const discountSelect = document.getElementById('discountSelect');
  if (!discountSelect) return;

  currentDiscount = parseFloat(discountSelect.value) || 0;
  calculateFinalPrice();
}

async function addMpackToCart() {
  // Check if we're in edit mode
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';
  const itemId = urlParams.get('item_id');
  
  const machineSelect = document.getElementById('machineSelect');
  const thicknessSelect = document.getElementById('thicknessSelect');
  const sizeSelect = document.getElementById('sizeSelect');
  const sheetInput = document.getElementById('sheetInput');
  const underpackingTypeSelect = document.getElementById('underpackingType');
  const quantity = parseInt(sheetInput.value) || 1;
  
  // Get underpacking type display name
  let underpackingType = '';
  let underpackingTypeDisplay = 'Underpacking Material';
  if (underpackingTypeSelect && underpackingTypeSelect.value) {
    underpackingType = underpackingTypeSelect.value;
    underpackingTypeDisplay = underpackingTypeSelect.options[underpackingTypeSelect.selectedIndex].text;
  }
  
  // Check that a size is selected in the dropdown (like thickness)
  if (!underpackingType) {
    showToast('Error', 'Please select an underpacking type before continuing.', 'error');
    if (underpackingTypeSelect) {
      underpackingTypeSelect.classList.add('is-invalid');
      setTimeout(() => underpackingTypeSelect.classList.remove('is-invalid'), 1500);
    }
    return;
  }

  if (!thicknessSelect.value || !sizeSelect.value || !sheetInput.value) {
    showToast('Error', 'Please fill in all required fields to calculate pricing.', 'error');
    return;
  }

  // Get discount information
  const discountSelect = document.getElementById('discountSelect');
  const discount = discountSelect ? parseFloat(discountSelect.value) || 0 : 0;
  const sqmArea = hasValidCustomSize() ? customSize.area : standardSize.area || 0;
  const thicknessValue = Number(currentThickness || thicknessSelect.value || 0);
  const ratePerSqm = 80 * (thicknessValue / 100);
  const unitPrice = ratePerSqm * sqmArea;
  const subtotal = unitPrice * quantity;
  const discountAmount = (subtotal * discount) / 100;
  const discountedSubtotal = subtotal - discountAmount;
  const gstRate = parseFloat(document.getElementById('gstSelect').value) || 0;
  const gstAmount = (discountedSubtotal * gstRate) / 100;
  const finalPrice = discountedSubtotal + gstAmount;

  // Get size from dropdown (like thickness)
  const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
  const selectedSize = selectedOption ? selectedOption.text : '';
  const metaFromMap = sizeMetaMap[sizeSelect.value];
  const dimensionMeta = metaFromMap || parseSizeLabel(selectedSize) || {};
  const standardAlong = typeof dimensionMeta.along === 'number' ? dimensionMeta.along : (standardSize.along || 0);
  const standardAcross = typeof dimensionMeta.across === 'number' ? dimensionMeta.across : (standardSize.across || 0);
  const standardArea = standardSize.area || mmToSqm(standardSize.across, standardSize.along);

  const customAcross = customSize.across || null;
  const customAlong = customSize.along || null;
  const customArea = customSize.area || (customAcross && customAlong ? mmToSqm(customAcross, customAlong) : null);
  const cutToCustom = Boolean(cutYesRadio && cutYesRadio.checked);

  const standardSizeLabel = selectedSize;
  const customSizeLabel = customAcross && customAlong ? formatDimensionLabel(customAcross, customAlong) : '';
  const displayAlong = cutToCustom && isPositiveNumber(customAlong) ? customAlong : standardAlong;
  const displayAcross = cutToCustom && isPositiveNumber(customAcross) ? customAcross : standardAcross;
  const displaySizeLabel = (cutToCustom && customSizeLabel) ? customSizeLabel : standardSizeLabel;

  const product = {
    id: isEditMode ? itemId : 'mpack_' + Date.now(),
    type: 'mpack',
    name: underpackingTypeDisplay,
    machine: machineSelect && machineSelect.value ? machineSelect.options[machineSelect.selectedIndex].text : '--',
    thickness: thicknessSelect.value + ' micron',
    size: displaySizeLabel,
    along_mm: displayAlong,
    across_mm: displayAcross,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: gstRate,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: {
      rate_per_sqm: parseFloat(ratePerSqm.toFixed(2)),
      sqm_per_sheet: parseFloat(sqmArea.toFixed(3)),
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: quantity,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      discounted_subtotal: parseFloat(discountedSubtotal.toFixed(2)),
      gst_percent: gstRate,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
      final_total: parseFloat(finalPrice.toFixed(2))
    },
    custom_across_mm: customAcross,
    custom_along_mm: customAlong,
    custom_area_sqm: customArea,
    standard_across_mm: standardAcross,
    standard_along_mm: standardAlong,
    standard_area_sqm: standardArea,
    cut_to_custom_size: cutToCustom,
    standard_size_label: standardSizeLabel,
    custom_size_label: customSizeLabel,
    display_size_label: displaySizeLabel,
    display_across_mm: displayAcross,
    display_along_mm: displayAlong
  };

  // Show loading state
  const addToCartBtn = event.target;
  const originalText = addToCartBtn.innerHTML;
  const buttonText = isEditMode ? 'Updating...' : 'Adding...';
  addToCartBtn.disabled = true;
  addToCartBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${buttonText}`;
  
  // Handle edit mode
  if (isEditMode && itemId) {
    try {
      // Prepare the form data for update
      const formData = getFormData();
      formData.item_id = itemId;
      
      // Call updateCartItem with the button and item ID
      await updateCartItem(addToCartBtn, itemId);
      return; // Exit after update
    } catch (error) {
      console.error('Error updating cart item:', error);
      showToast('Error', 'Failed to update item. Please try again.', 'error');
      addToCartBtn.disabled = false;
      addToCartBtn.innerHTML = originalText;
      return;
    }
  }

  // Prepare the payload with all necessary fields
  const payload = {
    id: isEditMode ? itemId : 'mpack_' + Date.now(),
    type: 'mpack',
    name: underpackingTypeDisplay,
    machine: machineSelect.value ? machineSelect.options[machineSelect.selectedIndex].text : '--',
    thickness: thicknessSelect.value + ' micron',
    size: displaySizeLabel,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: gstRate,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: {
      rate_per_sqm: parseFloat(ratePerSqm.toFixed(2)),
      sqm_per_sheet: parseFloat(sqmArea.toFixed(3)),
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: quantity,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      discounted_subtotal: parseFloat(discountedSubtotal.toFixed(2)),
      gst_percent: gstRate,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
      final_total: parseFloat(finalPrice.toFixed(2))
    },
    custom_length_mm: customAlong,
    custom_width_mm: customAcross,
    custom_area_sqm: customArea,
    standard_length_mm: standardAlong,
    standard_width_mm: standardAcross,
    standard_area_sqm: standardArea,
    cut_to_custom_size: cutToCustom,
    standard_size_label: standardSizeLabel,
    custom_size_label: customSizeLabel,
    display_size_label: displaySizeLabel,
    display_length_mm: displayAlong,
    display_width_mm: displayAcross
  };

  // Add item_id for edit mode
  if (isEditMode && itemId) {
    payload.item_id = itemId;
  }

  fetch('/add_to_cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (isEditMode) {
        showToast('Success', 'Underpacking material updated in cart!', 'success');
        // Redirect back to cart after a short delay
        setTimeout(() => {
          window.location.href = '/cart';
        }, 1000);
      } else {
        showToast('Success', 'Underpacking material added to cart!', 'success');
      }
      updateCartCount();
    } else if (data.is_duplicate) {
      // Show confirmation dialog for duplicate product
      if (confirm('A similar MPack is already in your cart. Would you like to add it anyway?')) {
        // If user confirms, force add the product by removing the duplicate check
        fetch('/add_to_cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({...product, force_add: true})
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            showToast('Success', 'Underpacking material added to cart!', 'success');
            updateCartCount();
          } else {
            showToast('Error', data.error || 'Failed to add to cart', 'error');
          }
        })
        .catch(err => {
          console.error('Error adding to cart:', err);
          showToast('Error', 'Failed to add to cart. Please try again.', 'error');
        });
      }
    } else {
      showToast('Error', data.message || 'Failed to add to cart', 'error');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    showToast('Error', 'Failed to add to cart', 'error');
  })
  .finally(() => {
    addToCartBtn.disabled = false;
    addToCartBtn.innerHTML = originalText;
  });
}
