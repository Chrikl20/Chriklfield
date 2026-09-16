import 'server-only';
import { isAuthError } from '@supabase/supabase-js';
import { authMessages, type AuthFailureCode } from '@/domain/auth-link';
import { json, log } from './http';

const failures: Record<string, { code: AuthFailureCode; status: number }> = {
  invalid_credentials: { code: 'AUTH_CREDENTIALS', status: 401 },
  email_not_confirmed: { code: 'AUTH_EMAIL_UNCONFIRMED', status: 403 },
  weak_password: { code: 'AUTH_PASSWORD_WEAK', status: 400 },
  same_password: { code: 'AUTH_PASSWORD_SAME', status: 400 },
  signup_disabled: { code: 'AUTH_SIGNUP_DISABLED', status: 403 },
  pkce_code_verifier_not_found: { code: 'AUTH_BROWSER_MISMATCH', status: 401 },
  bad_code_verifier: { code: 'AUTH_BROWSER_MISMATCH', status: 401 },
  flow_state_not_found: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  flow_state_expired: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  otp_expired: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  bad_jwt: { code: 'AUTH_LINK_INVALID', status: 401 },
  session_not_found: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  session_expired: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  refresh_token_not_found: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  refresh_token_already_used: { code: 'AUTH_LINK_EXPIRED', status: 401 },
  over_email_send_rate_limit: { code: 'AUTH_EMAIL_LIMIT', status: 429 },
  over_request_rate_limit: { code: 'AUTH_REQUEST_LIMIT', status: 429 },
  email_address_not_authorized: { code: 'AUTH_EMAIL_UNAVAILABLE', status: 503 },
  email_address_invalid: { code: 'AUTH_EMAIL_INVALID', status: 400 },
  email_provider_disabled: { code: 'AUTH_EMAIL_UNAVAILABLE', status: 503 },
  otp_disabled: { code: 'AUTH_EMAIL_UNAVAILABLE', status: 503 },
};

export function authFailure(error: unknown, stage: 'send' | 'complete') {
  const providerCode =
    isAuthError(error) && error.code && Object.hasOwn(failures, error.code)
      ? error.code
      : 'unknown';
  const providerStatus =
    isAuthError(error) &&
    Number.isInteger(error.status) &&
    error.status! >= 400 &&
    error.status! <= 599
      ? error.status
      : undefined;
  const failure = failures[providerCode] ?? {
    code: providerStatus === 429 ? 'AUTH_REQUEST_LIMIT' : 'AUTH_UNAVAILABLE',
    status: providerStatus === 429 ? 429 : 503,
  };
  // Allowlisted codes and numeric status only: no email, message, URL, token or cookie.
  log('auth_failed', { code: providerCode, authStage: stage, status: providerStatus });
  return json({ error: failure.code, message: authMessages[failure.code] }, failure.status);
}
