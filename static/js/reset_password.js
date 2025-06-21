// DOM Elements
const requestOtpBtn = document.getElementById('requestOtpBtn');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
const emailInput = document.getElementById('email');
const otpInput = document.getElementById('otp');
const newPasswordInput = document.getElementById('new_password');
const confirmPasswordInput = document.getElementById('confirm_password');
const messageDiv = document.getElementById('message');
const steps = document.querySelectorAll('.step');

let currentStep = 0;

// Initialize the form
let verifiedEmail = '';
document.addEventListener('DOMContentLoaded', () => {
  showStep(0);
  setupEventListeners();
});

function setupEventListeners() {
  if (requestOtpBtn) {
    requestOtpBtn.addEventListener('click', handleRequestOtp);
  }
  if (document.getElementById('verifyOtpBtn')) {
    document.getElementById('verifyOtpBtn').addEventListener('click', handleVerifyOtp);
  }
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', handleResetPassword);
  }
  if (document.getElementById('resendOtp')) {
    document.getElementById('resendOtp').addEventListener('click', handleResendOtp);
  }
}

function showStep(stepIndex) {
  steps.forEach((step, index) => {
    step.classList.remove('active');
    if (index === stepIndex) {
      step.classList.add('active');
    }
  });
  currentStep = stepIndex;
  // Clear messages
  showMessage('', '');
}

// Handle OTP request
async function handleRequestOtp() {
  const email = emailInput.value.trim();
  if (!email) {
    showError('Please enter your email');
    return;
  }
  try {
    setLoading(true, 'requestOtpBtn');
    const response = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      verifiedEmail = email;
      document.getElementById('emailDisplay').textContent = email;
      showStep(1);
      startOtpResendTimer();
      showMessage('Verification code sent to your email', 'success');
    } else {
      showError(data.error || 'Failed to send verification code');
    }
  } catch (error) {
    console.error('OTP request error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'requestOtpBtn');
  }
}

// Handle OTP verification
async function handleVerifyOtp() {
  const otp = otpInput.value.trim();
  if (!verifiedEmail || !otp) {
    showError('Please enter the verification code');
    return;
  }
  try {
    setLoading(true, 'verifyOtpBtn');
    const response = await fetch('/api/auth/verify-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: verifiedEmail, otp })
    });
    const data = await response.json();
    if (response.ok && data.success) {
      showStep(2);
      showMessage('OTP verified. Please set your new password.', 'success');
    } else {
      showError(data.error || 'Failed to verify OTP');
    }
  } catch (error) {
    console.error('OTP verify error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'verifyOtpBtn');
  }
}

// Handle password reset
async function handleResetPassword() {
  const email = emailInput.value.trim();
  const otp = otpInput.value.trim();
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (!otp || !newPassword || !confirmPassword) {
    showError('Please fill in all fields');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showError('Passwords do not match');
    return;
  }
  
  try {
    setLoading(true, 'resetPasswordBtn');
    
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        otp,
        new_password: newPassword
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showStep(2);
      if (data.redirectTo) {
        setTimeout(() => {
          window.location.href = data.redirectTo;
        }, 3000);
      }
    } else {
      showError(data.error || 'Failed to reset password');
    }
  } catch (error) {
    console.error('Password reset error:', error);
    showError('An error occurred. Please try again.');
  } finally {
    setLoading(false, 'resetPasswordBtn');
  }
}

// Show error message
function showError(message) {
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    messageDiv.className = 'message error';
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Show success message
function showMessage(message, type = 'success') {
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    messageDiv.className = `message ${type}`;
  }
}

// Set loading state
function setLoading(isLoading, buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (btnText && btnLoader) {
      btnText.style.display = isLoading ? 'none' : 'inline';
      btnLoader.style.display = isLoading ? 'block' : 'none';
      button.disabled = isLoading;
    }
  }
}
