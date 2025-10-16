(function() {
  const productsContainer = document.getElementById('chemicals-products');

  async function loadProducts() {
    if (!productsContainer) {
      console.warn('chemicals.js: products container missing');
      return;
    }

    productsContainer.innerHTML = renderLoading();

    try {
      const response = await fetch('/static/data/chemicals/products.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch products.json: ${response.status}`);
      }
      const products = await response.json();
      renderProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error('chemicals.js: unable to load products', error);
      productsContainer.innerHTML = renderError();
    }
  }

  function renderLoading() {
    return `
      <div class="loading-state">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-3 text-muted">Loading product catalogue…</p>
      </div>
    `;
  }

  function renderError() {
    return `
      <div class="alert alert-danger" role="alert">
        Unable to load product catalogue right now. Please try again later.
      </div>
    `;
  }

  function renderProducts(products) {
    if (!products.length) {
      productsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-flask text-muted"></i>
          <h5 class="mt-3">No products available</h5>
          <p class="text-muted">Product listings will appear here once added.</p>
        </div>
      `;
      return;
    }

    productsContainer.innerHTML = products.map(renderProductCard).join('');
  }

  function renderProductCard(product) {
    const { id = 'unknown', name = 'Untitled Product', description = '', unit = '', price = 0, icon = 'fas fa-vial' } = product || {};
    return `
      <div class="product-card" data-product-id="${id}">
        <div class="product-card__body">
          <div class="product-card__icon">
            <i class="${icon}"></i>
          </div>
          <div class="product-card__content">
            <h5 class="product-card__title">${name}</h5>
            <p class="product-card__description">${description || 'Description coming soon.'}</p>
          </div>
        </div>
        <div class="product-card__footer">
          <div class="product-card__meta">
            <span class="product-card__unit">Unit: ${unit || 'N/A'}</span>
            <span class="product-card__price">₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <button class="btn btn-sm btn-outline-primary" type="button" disabled>
            Coming Soon
          </button>
        </div>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', loadProducts);
})();
