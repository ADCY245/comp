let priceMap = {};
let sizeMetaMap = {};
let currentNetPrice = 0;
let currentDiscount = 0; // Track current discount percentage
let currentThickness = ''; // Track current thickness
let editingItem = null; // Track the item being edited
let customSize = { length: null, width: null, area: 0 };
let standardSize = { length: null, width: null, area: 0 };

let sizeInputEl;
let sizeSelectEl;
let customLengthInputEl;
let customWidthInputEl;
let customSizeSummaryEl;
let customSizeFeedbackEl;
let cutQuestionSectionEl;
let cutDetailsSectionEl;
let cutYesRadio;
let cutNoRadio;
let standardAreaDisplayEl;
let customAreaDisplayEl;

function isPositiveNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

function mmToSqm(lengthMm, widthMm) {
  if (!isPositiveNumber(lengthMm) || !isPositiveNumber(widthMm)) {
    return 0;
  }
  return (lengthMm / 1000) * (widthMm / 1000);
}

function parseSizeLabel(label) {
  if (!label) return null;
  const match = label.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return {
    width: parseFloat(match[1]),
    length: parseFloat(match[2])
  };
}

let selectedStandardSizeId = '';

function hasValidCustomSize() {
  return isPositiveNumber(customSize.length) && isPositiveNumber(customSize.width);
}

function hasValidStandardSize() {
  return isPositiveNumber(standardSize.length) && isPositiveNumber(standardSize.width);
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
}

function showCutQuestion(resetRadios = true) {
  if (cutQuestionSectionEl) {
    cutQuestionSectionEl.style.display = 'block';
  }
  if (resetRadios) {
    if (cutYesRadio) cutYesRadio.checked = false;
    if (cutNoRadio) cutNoRadio.checked = false;
    if (cutDetailsSectionEl) cutDetailsSectionEl.style.display = 'none';
  } else if (cutYesRadio && cutYesRadio.checked) {
    updateCutDetails();
  }
}

function updateCutDetails() {
  if (!cutDetailsSectionEl) {
    return;
  }

  if (hasValidCustomSize() && hasValidStandardSize()) {
    const standardArea = standardSize.area || mmToSqm(standardSize.length, standardSize.width);
    const customArea = customSize.area || mmToSqm(customSize.length, customSize.width);

    standardSize.area = standardArea;
    customSize.area = customArea;

    if (standardAreaDisplayEl) {
      standardAreaDisplayEl.textContent = standardArea.toFixed(3);
    }
    if (customAreaDisplayEl) {
      customAreaDisplayEl.textContent = customArea.toFixed(3);
    }

    if (cutYesRadio && cutYesRadio.checked) {
      cutDetailsSectionEl.style.display = 'block';
    } else {
      cutDetailsSectionEl.style.display = 'none';
    }
  } else {
    cutDetailsSectionEl.style.display = 'none';
  }
}

function resetStandardSelection({ preserveSearchValue = false, preserveOptions = true } = {}) {
  selectedStandardSizeId = '';
  standardSize = { length: null, width: null, area: 0 };

  if (sizeSelectEl) {
    sizeSelectEl.value = '';
    if (!preserveOptions) {
      sizeSelectEl.innerHTML = '<option value="">-- Select Size --</option>';
      sizeSelectEl.disabled = true;
    }
  }

  if (sizeInputEl && !preserveSearchValue) {
    sizeInputEl.value = '';
  }

  hideCuttingSections();
}

function updateCustomSizeState({ showFeedback = false } = {}) {
  const rawLength = customLengthInputEl ? customLengthInputEl.value : '';
  const rawWidth = customWidthInputEl ? customWidthInputEl.value : '';
  const lengthVal = parseFloat(rawLength || '');
  const widthVal = parseFloat(rawWidth || '');
  const valid = isPositiveNumber(lengthVal) && isPositiveNumber(widthVal);

  if (valid) {
    customSize.length = lengthVal;
    customSize.width = widthVal;
    customSize.area = mmToSqm(lengthVal, widthVal);

    if (customSizeSummaryEl) {
      customSizeSummaryEl.textContent = `${lengthVal.toFixed(2)} mm × ${widthVal.toFixed(2)} mm (${customSize.area.toFixed(3)} sq.m)`;
    }
    if (customSizeFeedbackEl) {
      customSizeFeedbackEl.classList.add('d-none');
    }
    if (sizeInputEl) {
      sizeInputEl.disabled = false;
      sizeInputEl.classList.remove('is-invalid');
    }
    if (sizeSelectEl) {
      sizeSelectEl.disabled = false;
    }
    return true;
  }

  customSize.length = null;
  customSize.width = null;
  customSize.area = 0;

  if (customSizeSummaryEl) {
    customSizeSummaryEl.textContent = 'Awaiting input…';
  }
  if (sizeInputEl) {
    sizeInputEl.disabled = true;
    sizeInputEl.classList.toggle('is-invalid', showFeedback);
  }
  if (sizeSelectEl) {
    sizeSelectEl.disabled = true;
  }
  if (customSizeFeedbackEl) {
    customSizeFeedbackEl.classList[showFeedback ? 'remove' : 'add']('d-none');
  }
  hideCuttingSections();
  return false;
}

function handleCustomSizeInputChange() {
  const hadStandardSelection = Boolean(selectedStandardSizeId) || hasValidStandardSize();
  const isValid = updateCustomSizeState();

  if (hadStandardSelection || !isValid) {
    resetStandardSelection();
    resetCalculations();
  }

  if (!isValid && sizeInputEl) {
    sizeInputEl.value = '';
  }

  if (isValid && cutYesRadio && cutYesRadio.checked) {
    updateCutDetails();
  }
}

function resetCustomSizeInputs() {
  if (customLengthInputEl) customLengthInputEl.value = '';
  if (customWidthInputEl) customWidthInputEl.value = '';
  updateCustomSizeState();
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
  const sizeSelect = document.getElementById('sizeSelect');
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
  
  // Calculate prices
  let unitPrice = parseFloat(document.getElementById('netPrice').textContent) || 0;
  let totalPriceBeforeDiscount = unitPrice * quantity;
  let discountAmount = (totalPriceBeforeDiscount * discount) / 100;
  let priceAfterDiscount = totalPriceBeforeDiscount - discountAmount;
  
  // Add GST (18% as per the form)
  const gstRate = 0.18;
  const gstAmount = priceAfterDiscount * gstRate;
  const finalPrice = priceAfterDiscount + gstAmount;
  
  // Get size details
  const sizeValue = sizeSelect.value;
  const sizeOption = sizeSelect.options[sizeSelect.selectedIndex];
  const selectedSize = sizeOption ? sizeOption.text : '';
  const metaFromMap = sizeMetaMap[sizeValue];
  const dimensionMeta = metaFromMap || parseSizeLabel(selectedSize) || {};
  const standardWidth = typeof dimensionMeta.width === 'number' ? dimensionMeta.width : (standardSize.width || 0);
  const standardLength = typeof dimensionMeta.length === 'number' ? dimensionMeta.length : (standardSize.length || 0);
  const standardArea = standardSize.area || mmToSqm(standardLength, standardWidth);

  const customLength = customSize.length || null;
  const customWidth = customSize.width || null;
  const customArea = customSize.area || (customLength && customWidth ? mmToSqm(customLength, customWidth) : null);
  const cutToCustom = Boolean(cutYesRadio && cutYesRadio.checked);

  return {
    id: 'mpack_' + Date.now(),
    type: 'mpack',
    name: underpackingTypeDisplay,
    machine: machineSelect && machineSelect.value ? machineSelect.options[machineSelect.selectedIndex].text : '--',
    thickness: thicknessSelect.value + ' micron',
    size: selectedSize,
    width: standardWidth,
    height: standardLength,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: 18,
    custom_length_mm: customLength,
    custom_width_mm: customWidth,
    custom_area_sqm: customArea,
    standard_length_mm: standardLength,
    standard_width_mm: standardWidth,
    standard_area_sqm: standardArea,
    cut_to_custom_size: cutToCustom,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: {
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: quantity,
      discounted_subtotal: parseFloat(priceAfterDiscount.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      gst_percent: 18,
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
  customSizeSummaryEl = document.getElementById('customSizeSummary');
  customSizeFeedbackEl = document.getElementById('customSizeFeedback');
  cutQuestionSectionEl = document.getElementById('cutQuestionSection');
  cutDetailsSectionEl = document.getElementById('cutDetailsSection');
  cutYesRadio = document.getElementById('cutYes');
  cutNoRadio = document.getElementById('cutNo');
  standardAreaDisplayEl = document.getElementById('standardAreaDisplay');
  customAreaDisplayEl = document.getElementById('customAreaDisplay');

  // Disable standard size search until custom size captured
  if (sizeInputEl) {
    sizeInputEl.disabled = true;
  }
  if (sizeSelectEl) {
    sizeSelectEl.disabled = true;
  }

  // Attach listeners for custom size inputs
  if (customLengthInputEl) {
    customLengthInputEl.addEventListener('input', handleCustomSizeInputChange);
  }
  if (customWidthInputEl) {
    customWidthInputEl.addEventListener('input', handleCustomSizeInputChange);
  }

  if (cutYesRadio) {
    cutYesRadio.addEventListener('change', () => {
      if (cutYesRadio.checked) {
        updateCutDetails();
      }
    });
  }
  if (cutNoRadio) {
    cutNoRadio.addEventListener('change', () => {
      if (cutDetailsSectionEl) {
        cutDetailsSectionEl.style.display = 'none';
      }
    });
  }

  try {
    // Load machines first
    console.log("Loading machines...");
    loadMachines();

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
      loadSizes();
      currentDiscount = 0;
      const discountSelect = document.getElementById('discountSelect');
      if (discountSelect) {
        discountSelect.value = '';
      }
      calculateFinalPrice();
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

function loadSizes() {
  const thicknessSelect = document.getElementById("thicknessSelect");
  const sizeSelect = document.getElementById("sizeSelect");
  
  if (!thicknessSelect || !sizeSelect) return;
  
  const thickness = thicknessSelect.value;
  if (!thickness) return;
  
  // Update current thickness
  currentThickness = thickness;
  
  // Show loading state
  sizeSelect.innerHTML = '<option value="">Loading sizes...</option>';
  sizeSelect.disabled = true;
  
  // Clear any previous errors
  const existingError = document.getElementById('sizeError');
  if (existingError) existingError.remove();
  
  // Show size section if not already visible
  const sizeSection = document.getElementById("sizeSection");
  if (sizeSection) sizeSection.style.display = "block";
  
  // Show loading indicator
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loadingIndicator';
  loadingIndicator.className = 'text-muted small';
  loadingIndicator.textContent = 'Loading sizes and prices...';
  sizeSelect.parentNode.insertBefore(loadingIndicator, sizeSelect.nextSibling);
  
  // Load data from mpack.json with cache busting
  fetch(`/static/data/mpack.json?v=${new Date().getTime()}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to load MPack data');
      return res.json();
    })
    .then(data => {
      // Clean up loading indicator
      const loadingIndicator = document.getElementById('loadingIndicator');
      if (loadingIndicator) loadingIndicator.remove();
      
      // Find the selected thickness data
      const thicknessData = data.mpack.find(item => item.id === thickness);
      if (!thicknessData || !thicknessData.sizes) {
        throw new Error(`No data found for ${thickness} micron`);
      }
      
      // Reset size select
      sizeSelect.innerHTML = '<option value="">-- Select Size --</option>';
      sizeSelect.disabled = false;
      
      // Clear and rebuild price map
      priceMap = {};
      sizeMetaMap = {};
      
      // Populate size dropdown with prices
      thicknessData.sizes.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = `${item.width} x ${item.length}`;
        opt.dataset.price = item.price;
        sizeSelect.appendChild(opt);
        priceMap[item.id] = item.price;
        sizeMetaMap[item.id] = { width: item.width, length: item.length, price: item.price };
      });

      resetStandardSelection({ preserveOptions: true });

      if (!hasValidCustomSize()) {
        sizeSelect.disabled = true;
        if (sizeInputEl) sizeInputEl.disabled = true;
      } else {
        sizeSelect.disabled = false;
        if (sizeInputEl) sizeInputEl.disabled = false;
      }
      
      // Show UI sections
      const sizeSection = document.getElementById("sizeSection");
      const priceSection = document.getElementById("priceSection");
      const sheetInputSection = document.getElementById("sheetInputSection");
      
      if (sizeSection) sizeSection.style.display = "block";
      if (priceSection) priceSection.style.display = "block";
      if (sheetInputSection) sheetInputSection.style.display = "block";
      
      // Reset discount state
      const discountSelect = document.getElementById("discountSelect");
      if (discountSelect) {
        discountSelect.value = "";
        currentDiscount = 0;
      }
      
      const finalDiscountedPrice = document.getElementById("finalDiscountedPrice");
      if (finalDiscountedPrice) finalDiscountedPrice.textContent = "0.00";
      
      const discountSection = document.getElementById("discountSection");
      if (discountSection) discountSection.style.display = "block";
      
      const discountPromptSection = document.getElementById("discountPromptSection");
      if (discountPromptSection) {
        discountPromptSection.style.display = "block";
        discountPromptSection.innerHTML = `
          <label class="form-label">Apply Discount?</label>
          <button class="btn btn-outline-primary btn-sm" onclick="showDiscountSection(true)">Yes</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="showDiscountSection(false)">No</button>
        `;
      }
    })
    .catch(err => {
      console.error(`Failed to load data for ${thickness} micron:`, err);
      
      // Clean up loading indicator
      const loadingIndicator = document.getElementById('loadingIndicator');
      if (loadingIndicator) loadingIndicator.remove();
      
      // Reset size select
      const sizeSelect = document.getElementById("sizeSelect");
      if (sizeSelect) {
        sizeSelect.innerHTML = '<option value="">-- Select Size --</option>';
        sizeSelect.disabled = false;
        
        // Create or update error message
        let errorElement = document.getElementById('sizeError');
        if (!errorElement) {
          errorElement = document.createElement('div');
          errorElement.id = 'sizeError';
          errorElement.className = 'text-danger small mt-1';
          sizeSelect.parentNode.insertBefore(errorElement, sizeSelect.nextSibling);
        }
        errorElement.textContent = `Error: ${err.message || 'Failed to load sizes'}. Please try again.`;
        
        // Auto-hide error after 5 seconds
        if (window.errorTimeout) clearTimeout(window.errorTimeout);
        window.errorTimeout = setTimeout(() => {
          if (errorElement && errorElement.parentNode) {
            errorElement.remove();
          }
        }, 5000);
      }
    });
}

function handleSizeSelection() {
  if (!sizeSelectEl) return;
  const selectedId = sizeSelectEl.value;

  if (!selectedId) {
    selectedStandardSizeId = '';
    standardSize = { length: null, width: null, area: 0 };
    hideCuttingSections();
    resetCalculations();
    return;
  }

  selectedStandardSizeId = selectedId;

  const selectedOption = sizeSelectEl.options[sizeSelectEl.selectedIndex];
  const optionText = selectedOption ? selectedOption.text : '';
  const dimensionMeta = sizeMetaMap[selectedId] || parseSizeLabel(optionText) || {};
  if (dimensionMeta) {
    if (typeof dimensionMeta.width === 'number') {
      standardSize.width = dimensionMeta.width;
    }
    if (typeof dimensionMeta.length === 'number') {
      standardSize.length = dimensionMeta.length;
    }
    standardSize.area = mmToSqm(standardSize.length, standardSize.width);
  }

  if (hasValidCustomSize()) {
    showCutQuestion();
    updateCutDetails();
  } else {
    hideCuttingSections();
  }

  currentNetPrice = parseFloat(priceMap[selectedId] || 0);
  const netPriceElement = document.getElementById('netPrice');
  if (netPriceElement) {
    netPriceElement.textContent = currentNetPrice.toFixed(2);
  }

  const sheetInput = document.getElementById('sheetInput');
  if (sheetInput) {
    sheetInput.value = '1';
  }

  currentDiscount = 0;
  const discountSelect = document.getElementById('discountSelect');
  if (discountSelect) {
    discountSelect.value = '';
  }

  const discountDetails = document.getElementById('discountDetails');
  if (discountDetails) {
    discountDetails.innerHTML = '';
  }

  const priceSection = document.getElementById('priceSection');
  if (priceSection) {
    priceSection.style.display = 'block';
  }

  calculateFinalPrice();
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
  
  // Reset input fields
  const sheetInput = document.getElementById("sheetInput");
  if (sheetInput) sheetInput.value = "1";
  
  // Reset discount select
  const discountSelect = document.getElementById("discountSelect");
  if (discountSelect) discountSelect.value = "";
  
  // Reset price summary
  const priceSummary = document.getElementById("priceSummary");
  if (priceSummary) {
    priceSummary.innerHTML = '<p class="text-muted mb-0">Select options to see pricing</p>';
  }
  
  // Reset net price display
  const netPriceElement = document.getElementById("netPrice");
  if (netPriceElement) {
    netPriceElement.textContent = "0.00";
  }
  
  // Clear discount details
  const discountDetails = document.getElementById("discountDetails");
  if (discountDetails) {
    discountDetails.innerHTML = "";
  }
  
  // Hide price section and add to cart button
  const priceSection = document.getElementById("priceSection");
  const addToCartBtn = document.getElementById("addToCartBtn");
  
  if (priceSection) {
    priceSection.style.display = "none";
  }
  
  if (addToCartBtn) {
    addToCartBtn.style.display = "none";
  }
}

function calculateFinalPrice() {
  const sheetInput = document.getElementById("sheetInput");
  const quantity = parseInt(sheetInput.value) || 0;
  const gstRate = parseFloat(document.getElementById("gstSelect").value) || 0;
  
  if (currentNetPrice <= 0) {
    resetCalculations();
    return;
  }
  
  // If quantity is 0 or negative, set to 1 for calculation but show 0 in the display
  const displayQuantity = Math.max(0, quantity);
  const calcQuantity = quantity <= 0 ? 1 : quantity;
  
  // Calculate base price without GST
  const basePrice = currentNetPrice * calcQuantity;
  
  // Apply discount if any
  const discountAmount = (basePrice * currentDiscount) / 100;
  const discountedPrice = basePrice - discountAmount;
  
  // Calculate GST on the discounted price
  const gstAmount = (discountedPrice * gstRate) / 100;
  const finalPrice = discountedPrice + gstAmount;
  
  // Update the price summary
  const priceSummary = document.getElementById("priceSummary");
  const netPriceElement = document.getElementById("netPrice");
  
  // Update net price display
  if (netPriceElement) {
    netPriceElement.textContent = currentNetPrice.toFixed(2);
  }
  
  if (priceSummary) {
    let summaryHTML = '';
    
    if (currentDiscount > 0) {
      summaryHTML = `
        <div class="d-flex justify-content-between">
          <span>Subtotal (${displayQuantity} sheets):</span>
          <span>₹${basePrice.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between text-danger">
          <span>Discount (${currentDiscount}%):</span>
          <span>-₹${discountAmount.toFixed(2)}</span>
        </div>
        <div class="d-flex justify-content-between">
          <span>After Discount:</span>
          <span>₹${discountedPrice.toFixed(2)}</span>
        </div>`;
    } else {
      summaryHTML = `
        <div class="d-flex justify-content-between">
          <span>Subtotal (${displayQuantity} sheets):</span>
          <span>₹${basePrice.toFixed(2)}</span>
        </div>`;
    }
    
    // Add GST and total
    summaryHTML += `
      <div class="d-flex justify-content-between">
        <span>GST (${gstRate}%):</span>
        <span>₹${gstAmount.toFixed(2)}</span>
      </div>
      <hr>
      <div class="d-flex justify-content-between fw-bold">
        <span>Total Price:</span>
        <span>₹${finalPrice.toFixed(2)}</span>
      </div>`;
    
    priceSummary.innerHTML = summaryHTML;
  }
  
  // Show add to cart button and price section
  const addToCartBtn = document.getElementById("addToCartBtn");
  const priceSection = document.getElementById("priceSection");
  
  if (addToCartBtn) {
    addToCartBtn.style.display = "block";
  }
  
  if (priceSection) {
    priceSection.style.display = selectedSizeId ? "block" : "none";
  }
}

function showDiscountSection(apply) {
  const discountSection = document.getElementById("discountSection");
  const finalPrice = document.getElementById("finalPrice").textContent;
  const finalDiscountedPrice = document.getElementById("finalDiscountedPrice");

  if (!apply) {
    discountSection.style.display = "none";
    finalDiscountedPrice.textContent = finalPrice;
    return;
  }

  // Load discount options
  fetch("/static/data/discount.json")
    .then(res => res.json())
    .then(data => {
      const select = document.getElementById("discountSelect");
      select.innerHTML = '<option value="">-- Select Discount --</option>';
      data.discounts.forEach(discountStr => {
        const percent = parseFloat(discountStr);
        const opt = document.createElement("option");
        opt.value = percent;
        opt.textContent = discountStr;
        select.appendChild(opt);
      });
      discountSection.style.display = "block";
      finalDiscountedPrice.textContent = finalPrice;
    });
}

function applyDiscount() {
  const discountSelect = document.getElementById("discountSelect");
  const discountPromptSection = document.getElementById("discountPromptSection");
  
  if (!discountSelect || !discountPromptSection) return;
  
  currentDiscount = parseFloat(discountSelect.value) || 0;
  
  if (currentDiscount > 0) {
    // Update the discount prompt
    discountPromptSection.innerHTML = 
      `<button class="btn btn-sm btn-outline-primary" onclick="showDiscountSection(true)">
        Change Discount (${currentDiscount}% applied)
      </button>`;
    
    // Show the discount section and ensure it's visible
    const discountSection = document.getElementById("discountSection");
    if (discountSection) {
      discountSection.style.display = "block";
    }
    
    // Force update the price display
    calculateFinalPrice();
  } else {
    // No discount selected
    discountPromptSection.innerHTML = `
      <label class="form-label">Apply Discount?</label>
      <button class="btn btn-outline-primary btn-sm" onclick="showDiscountSection(true)">Yes</button>
      <button class="btn btn-outline-secondary btn-sm" onclick="showDiscountSection(false)">No</button>
    `;
    
    // Hide the discount section and clear any discount details
    const discountSection = document.getElementById("discountSection");
    if (discountSection) {
      discountSection.style.display = "none";
    }
    
    // Recalculate without discount
    calculateFinalPrice();
  }
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
  
  // Calculate prices
  let unitPrice = parseFloat(document.getElementById('netPrice').textContent) || 0;
  let totalPriceBeforeDiscount = unitPrice * quantity;
  let discountAmount = (totalPriceBeforeDiscount * discount) / 100;
  let priceAfterDiscount = totalPriceBeforeDiscount - discountAmount;
  
  // Add GST (18% as per the form)
  const gstRate = 0.18;
  const gstAmount = priceAfterDiscount * gstRate;
  const finalPrice = priceAfterDiscount + gstAmount;

  // Get size from dropdown (like thickness)
  const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
  const selectedSize = selectedOption ? selectedOption.text : '';
  const metaFromMap = sizeMetaMap[sizeSelect.value];
  const dimensionMeta = metaFromMap || parseSizeLabel(selectedSize) || {};
  const standardWidth = typeof dimensionMeta.width === 'number' ? dimensionMeta.width : (standardSize.width || 0);
  const standardLength = typeof dimensionMeta.length === 'number' ? dimensionMeta.length : (standardSize.length || 0);
  const standardArea = standardSize.area || mmToSqm(standardLength, standardWidth);

  const customLength = customSize.length || null;
  const customWidth = customSize.width || null;
  const customArea = customSize.area || (customLength && customWidth ? mmToSqm(customLength, customWidth) : null);
  const cutToCustom = Boolean(cutYesRadio && cutYesRadio.checked);

  const product = {
    id: isEditMode ? itemId : 'mpack_' + Date.now(),
    type: 'mpack',
    name: underpackingTypeDisplay,
    machine: machineSelect && machineSelect.value ? machineSelect.options[machineSelect.selectedIndex].text : '--',
    thickness: thicknessSelect.value + ' micron',
    size: selectedSize,
    width: standardWidth,
    height: standardLength,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: 18,
    image: 'images/mpack-placeholder.jpg',
    added_at: isEditMode ? new Date().toISOString() : new Date().toISOString(),
    calculations: {
      unit_price: parseFloat(unitPrice.toFixed(2)),
      quantity: quantity,
      discounted_subtotal: parseFloat(priceAfterDiscount.toFixed(2)),
      discount_percent: discount,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      gst_percent: 18,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
      final_total: parseFloat(finalPrice.toFixed(2))
    },
    custom_length_mm: customLength,
    custom_width_mm: customWidth,
    custom_area_sqm: customArea,
    standard_length_mm: standardLength,
    standard_width_mm: standardWidth,
    standard_area_sqm: standardArea,
    cut_to_custom_size: cutToCustom
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
    size: selectedSize,
    underpacking_type: underpackingType,
    quantity: quantity,
    unit_price: parseFloat(unitPrice.toFixed(2)),
    discount_percent: discount,
    gst_percent: 18,
    image: 'images/mpack-placeholder.jpg',
    added_at: new Date().toISOString(),
    calculations: product.calculations,
    custom_length_mm: customLength,
    custom_width_mm: customWidth,
    custom_area_sqm: customArea,
    standard_length_mm: standardLength,
    standard_width_mm: standardWidth,
    standard_area_sqm: standardArea,
    cut_to_custom_size: cutToCustom
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
