import { Redirect } from 'expo-router';

/** The moneywise://auth/callback link Google/Apple sign-in returns through. The session is picked up by the
 *  sign-in code itself; this just makes sure that landing on the link never shows an "unmatched route". */
export default function AuthCallback() {
    return <Redirect href="/" />;
}
