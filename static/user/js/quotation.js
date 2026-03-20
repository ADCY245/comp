// Function to navigate to quotation preview
function goToQuotationPreview() {
  window.location.href = '/quotation_preview';
  return false;
}

// Function to handle quotation preview
document.addEventListener('DOMContentLoaded', () => {
  const paymentTermsSelect = document.getElementById('paymentTerms');
  const customerPhoneInput = document.getElementById('customerPhone');
  const preparedByPhoneInput = document.getElementById('preparedByPhone');

  async function persistPhones() {
    const customer_phone = customerPhoneInput?.value || '';
    const prepared_by_phone = preparedByPhoneInput?.value || '';
    try {
      await fetch('/api/quotation_phones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ customer_phone, prepared_by_phone })
      });
    } catch (err) {
      console.error('Error saving quotation phones:', err);
    }
  }

  if (paymentTermsSelect) {
    paymentTermsSelect.addEventListener('change', async () => {
      const payment_terms = paymentTermsSelect.value || '';
      try {
        await fetch('/api/payment_terms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ payment_terms })
        });
      } catch (err) {
        console.error('Error saving payment terms:', err);
      }
    });
  }

  if (customerPhoneInput) {
    customerPhoneInput.addEventListener('change', persistPhones);
    customerPhoneInput.addEventListener('blur', persistPhones);
  }
  if (preparedByPhoneInput) {
    preparedByPhoneInput.addEventListener('change', persistPhones);
    preparedByPhoneInput.addEventListener('blur', persistPhones);
  }

  // Handle send quotation button
  const sendBtn = document.getElementById('sendQuotationBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async (event) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      const notes = document.getElementById('quotationNotes')?.value || '';
      const payment_terms = document.getElementById('paymentTerms')?.value || '';
      const customer_phone = document.getElementById('customerPhone')?.value || '';
      const prepared_by_phone = document.getElementById('preparedByPhone')?.value || '';

      if (!payment_terms) {
        showToast('Error', 'Please select Payment Terms before sending the quotation.', 'danger');
        return;
      }

      if (!customer_phone.trim()) {
        showToast('Error', 'Please enter Customer Phone before sending the quotation.', 'danger');
        return;
      }

      if (!prepared_by_phone.trim()) {
        showToast('Error', 'Please enter your Phone before sending the quotation.', 'danger');
        return;
      }

      await persistPhones();
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';

      try {
        const res = await fetch('/send_quotation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ notes, payment_terms, customer_phone, prepared_by_phone })
        });
        const data = await res.json();
        
        if (data.success) {
          const message = data.email_sent ? 
            'Quotation sent successfully!' : 
            'Quotation processed successfully (email not sent - configuration missing)';
          
          showToast('Success', message, 'success');
          
          // Redirect to quotation preview after a short delay
          setTimeout(() => {
            window.location.href = '/quotation_preview';
          }, 1500);
        } else {
          showToast('Error', data.error || 'Failed to process quotation', 'error');
        }
      } catch (err) {
        console.error('Error sending quotation:', err);
        showToast('Error', 'An error occurred while sending the quotation', 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Send Quotation';
      }
    });
  }

  // Show toast notification
  function showToast(title, message, type = 'info') {
    // Check if toast container exists, if not create it
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.position = 'fixed';
      toastContainer.style.top = '20px';
      toastContainer.style.right = '20px';
      toastContainer.style.zIndex = '9999';
      document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Toast content
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
    
    // Auto-remove after delay
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
});