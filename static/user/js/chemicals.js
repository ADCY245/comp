(function() {
  const dataUrl = '/static/data/chemicals/products.json';

  const machineSelect = document.getElementById('machineSelect');
  const filter200LButton = document.getElementById('filter200LDrum');
  const categoryOptionsEl = document.getElementById('categoryOptions');
  const productOptionsEl = document.getElementById('productOptions');
  const formatOptionsEl = document.getElementById('formatOptions');
  const quantityInput = document.getElementById('quantityLitres');
  const quantityHelper = document.getElementById('quantityHelper');
  const summaryBody = document.getElementById('chemSummaryBody');

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
    quantityLitres: null,
    filter200LActive: false
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

    if (filter200LButton) {
      filter200LButton.addEventListener('click', () => {
        toggle200LFilter();
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
    state.filter200LActive = false; // Reset filter when changing category

    // Reset filter button styling
    if (filter200LButton) {
      filter200LButton.classList.remove('active');
      filter200LButton.setAttribute('aria-pressed', 'false');
    }

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

    // Filter products to show only those with 200L drum formats if filter is active
    if (state.filter200LActive) {
      products = products.filter(product => {
        const formats = Array.isArray(product.formats) ? product.formats : [];
        return formats.some(format => format.size_litre === 200);
      });
    }

    if (!products.length) {
      const message = state.filter200LActive
        ? 'No products with 200L drum packaging available in this category.'
        : 'No products listed for this category yet.';
      productOptionsEl.innerHTML = `<p class="chem-placeholder mb-0">${sanitize(message)}</p>`;
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

    if (state.filter200LActive) {
      items.push(summaryItem('Filter', '200L Drums Only'));
    }

    if (state.selectedCategory) {
      items.push(summaryItem('Category', state.selectedCategory.name));
    }

    if (state.selectedProduct) {
      items.push(summaryItem('Product', state.selectedProduct.name, state.selectedProduct.description));
    }

    if (state.selectedFormat) {
      const size = state.selectedFormat.size_litre;
      const meta = size ? `${size} litre pack` : 'Pack size not specified';
      items.push(summaryItem('Packaging', state.selectedFormat.label || 'Selected format', meta));
    }

    if (state.selectedFormat && Number.isFinite(state.quantityLitres) && state.quantityLitres > 0) {
      const size = state.selectedFormat.size_litre || 0;
      let detail = `${formatNumber(state.quantityLitres)} L requested`;

      if (size > 0) {
        const containers = Math.ceil(state.quantityLitres / size);
        const achievedLitres = containers * size;
        const surplus = achievedLitres - state.quantityLitres;
        detail = `${formatNumber(state.quantityLitres)} L → ${containers} × ${state.selectedFormat.label}`;
        if (surplus > 0) {
          detail += ` (covers ${formatNumber(achievedLitres)} L, ${formatNumber(surplus)} L surplus)`;
        }
      }

      items.push(summaryItem('Quantity', detail));
    }

    if (!items.length) {
      summaryBody.innerHTML = '<p class="chem-summary__empty mb-0">Start by choosing a chemical category.</p>';
    } else {
      summaryBody.innerHTML = items.join('');
    }
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
