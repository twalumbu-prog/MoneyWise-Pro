/**
 * The Personal/Pro pick made on /(auth)/choose before a Google/Apple sign-in. The sign-in itself only creates the login;
 * /complete-profile reads this to create the matching workspace without asking the question a second time.
 */
export const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type';
