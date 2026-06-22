// Validation Utilities for Growlancer
import { DISPOSABLE_EMAILS } from '../routes';

/**
 * Validate email format
 * @param email - Email to validate
 * @returns Boolean indicating if email format is valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Check if email is from a disposable email provider
 * @param email - Email to check
 * @returns Boolean indicating if email is disposable
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  
  return DISPOSABLE_EMAILS.some(
    (disposable) => domain === disposable || domain.endsWith(`.${disposable}`)
  );
}

/**
 * Validate email with comprehensive checks
 * @param email - Email to validate
 * @returns Validation result object
 */
export function validateEmail(email: string): {
  isValid: boolean;
  error?: string;
} {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }

  if (!isValidEmail(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  if (isDisposableEmail(email)) {
    return { isValid: false, error: 'Please use a permanent email address. Disposable emails are not allowed.' };
  }

  return { isValid: true };
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Validation result object
 */
export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
  strength: 'weak' | 'medium' | 'strong';
} {
  if (!password) {
    return { isValid: false, error: 'Password is required', strength: 'weak' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters', strength: 'weak' };
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  let score = 0;

  if (hasUpperCase) score++;
  if (hasLowerCase) score++;
  if (hasNumbers) score++;
  if (hasSpecialChars) score++;
  if (password.length >= 12) score++;

  if (score >= 4) strength = 'strong';
  else if (score >= 2) strength = 'medium';

  if (score < 2) {
    return {
      isValid: false,
      error: 'Password must include uppercase, lowercase, and numbers',
      strength,
    };
  }

  return { isValid: true, strength };
}

/**
 * Validate required field
 * @param value - Value to check
 * @param fieldName - Name of the field for error message
 * @returns Validation result
 */
export function validateRequired(value: string, fieldName: string): {
  isValid: boolean;
  error?: string;
} {
  if (!value || value.trim().length === 0) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
}

/**
 * Validate minimum length
 * @param value - Value to check
 * @param minLength - Minimum required length
 * @param fieldName - Name of the field
 * @returns Validation result
 */
export function validateMinLength(
  value: string,
  minLength: number,
  fieldName: string
): { isValid: boolean; error?: string } {
  if (!value || value.length < minLength) {
    return { isValid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }
  return { isValid: true };
}

/**
 * Validate URL format
 * @param url - URL to validate
 * @returns Boolean indicating if URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate project budget
 * @param amount - Budget amount
 * @returns Validation result
 */
export function validateBudget(amount: number): {
  isValid: boolean;
  error?: string;
} {
  if (!amount || amount <= 0) {
    return { isValid: false, error: 'Budget must be greater than 0' };
  }

  if (amount < 50) {
    return { isValid: false, error: 'Minimum project budget is $50' };
  }

  if (amount > 100000) {
    return { isValid: false, error: 'Maximum project budget is $100,000' };
  }

  return { isValid: true };
}

/**
 * Calculate password strength score
 * @param password - Password to evaluate
 * @returns Score from 0-5
 */
export function getPasswordStrength(password: string): number {
  let score = 0;

  if (!password) return score;

  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Complexity checks
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  return score;
}
