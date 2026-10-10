import { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, StyleSheet,
    KeyboardAvoidingView, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    User, Lock, Eye, EyeOff, Building2,
    ChevronRight, Mail, Search,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { colors, radius, fonts } from '../../src/theme/tokens';
import { SocialButtons } from '../../src/components/auth/SocialButtons';
import { MoneywiseMark } from '../../src/components/icons/MoneywiseMark';
import { WalletCardsIcon } from '../../src/components/icons/WalletCardsIcon';
import { AnimatedSegmented, AnimatedTabContent } from '../../src/components/AnimatedTabs';

type Mode = 'login' | 'signup' | 'forgot';
type AccountType = 'INDIVIDUAL' | 'BUSINESS';
type SignupOrgMode = 'CREATE' | 'JOIN';

export default function LoginScreen() {
    const { signInWithPassword, signUp, joinOrganization } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [mode, setMode] = useState<Mode>('login');
    const [accountType, setAccountType] = useState<AccountType>('INDIVIDUAL');
    const [signupOrgMode, setSignupOrgMode] = useState<SignupOrgMode>('CREATE');
    const [showPassword, setShowPassword] = useState(false);

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [organizationId, setOrganizationId] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent] = useState(false);

    const [message, setMessage] = useState('');
    const [suggestion, setSuggestion] = useState('');
    const [busy, setBusy] = useState(false);

    const isError = message.toLowerCase().includes('error');

    // Debounced org search (when in Business signup mode and joining org)
    useEffect(() => {
        if (mode !== 'signup' || accountType !== 'BUSINESS' || signupOrgMode !== 'JOIN') return;
        if (searchQuery.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const { getCore } = await import('core');
                const apiUrl = getCore().env.apiUrl;
                const res = await fetch(`${apiUrl}/auth/organizations/search?query=${encodeURIComponent(searchQuery)}`);
                if (res.ok) {
                    setSearchResults(await res.json());
                    setShowDropdown(true);
                }
            } catch (err) {
                console.error('Failed to search orgs', err);
            } finally {
                setIsSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery, signupOrgMode, accountType, mode]);

    const switchMode = (next: Mode) => {
        setMode(next);
        setMessage('');
        setSuggestion('');
    };

    const submitLogin = async () => {
        setBusy(true);
        setMessage('');
        try {
            await signInWithPassword(identifier, password, accountType);
            router.replace('/');
        } catch (err: any) {
            setMessage('Error logging in: ' + (err?.message || 'Unknown error'));
        } finally {
            setBusy(false);
        }
    };

    const submitSignup = async () => {
        if (accountType === 'BUSINESS' && signupOrgMode === 'JOIN' && !organizationId) {
            setMessage('Error: Please select an organization to join.');
            return;
        }
        setBusy(true);
        setMessage('');
        try {
            const orgToCreate = accountType === 'BUSINESS' ? organizationName : `${name}'s Workspace`;
            if (accountType === 'INDIVIDUAL' || signupOrgMode === 'CREATE') {
                await signUp(identifier, password, name, orgToCreate, username);
                setSuggestion('');
                setMessage('Account created! Setting up your workspace…');
                await signInWithPassword(identifier, password, accountType);
                router.replace('/');
            } else {
                await joinOrganization(identifier, password, name, organizationId, username);
                setMessage('Join request submitted! An admin must approve your account.');
                setSuggestion('');
                setPassword('');
            }
        } catch (err: any) {
            let errorMsg = err?.message || 'Unknown error';
            try {
                const parsed = JSON.parse(errorMsg);
                if (parsed.suggestion) {
                    setSuggestion(parsed.suggestion);
                    errorMsg = parsed.error || errorMsg;
                }
            } catch {
                // Not JSON — plain error string.
            }
            setMessage('Error signing up: ' + errorMsg);
        } finally {
            setBusy(false);
        }
    };

    const submitForgotPassword = async () => {
        setBusy(true);
        setMessage('');
        try {
            const { getCore } = await import('core');
            const apiUrl = getCore().env.apiUrl;
            const res = await fetch(`${apiUrl}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to send reset link');
            setForgotSent(true);
        } catch (err: any) {
            setMessage('Error: ' + (err?.message || 'Unknown error'));
        } finally {
            setBusy(false);
        }
    };

    const backToLogin = () => {
        setMode('login');
        setForgotSent(false);
        setForgotEmail('');
        setMessage('');
    };

    const isSignup = mode === 'signup';
    const canSubmit = !busy && identifier.trim().length > 0 && password.length > 0
        && (!isSignup || (name.trim().length > 0 && username.trim().length > 0
            && (accountType === 'INDIVIDUAL' || signupOrgMode === 'CREATE' ? organizationName.trim().length > 0 || accountType === 'INDIVIDUAL' : !!organizationId)));

    return (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 28 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* MoneyWise Top Brand Header (Using Web Advercase-Regular Font) */}
                <View style={styles.brandHeader}>
                    <MoneywiseMark height={22} color="#0F172A" />
                    <View style={styles.brandTitleWrap}>
                        <Text style={styles.brandTitleText}>Moneywise</Text>
                        <Text style={styles.trademarkBadge}>TM</Text>
                    </View>
                </View>

                {/* Main Card Container */}
                <View style={styles.card}>
                    {/* Account Type Segmented Tab Toggle with Reanimated Spring Transition */}
                    <AnimatedSegmented
                        value={accountType}
                        onChange={(v) => setAccountType(v as AccountType)}
                        trackStyle={styles.segmentedTrack}
                        indicatorStyle={styles.segmentedIndicator}
                        itemStyle={styles.segmentedItem}
                        items={[
                            {
                                value: 'INDIVIDUAL',
                                content: (
                                    <View style={styles.tabContentRow}>
                                        <WalletCardsIcon
                                            size={15}
                                            color={accountType === 'INDIVIDUAL' ? '#0055CC' : '#6B7280'}
                                            style={styles.tabIcon}
                                        />
                                        <Text
                                            style={[
                                                styles.segmentTabText,
                                                accountType === 'INDIVIDUAL' && styles.segmentTabTextActive,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            For Individuals
                                        </Text>
                                    </View>
                                ),
                            },
                            {
                                value: 'BUSINESS',
                                content: (
                                    <View style={styles.tabContentRow}>
                                        <Building2
                                            size={15}
                                            color={accountType === 'BUSINESS' ? '#0F172A' : '#6B7280'}
                                            style={styles.tabIcon}
                                        />
                                        <Text
                                            style={[
                                                styles.segmentTabText,
                                                accountType === 'BUSINESS' && styles.segmentTabTextActive,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            For Businesses
                                        </Text>
                                    </View>
                                ),
                            },
                        ]}
                    />

                    {/* Animated Tab Content with Swiping Directional Transition */}
                    <AnimatedTabContent
                        tabKey={accountType}
                        index={accountType === 'INDIVIDUAL' ? 0 : 1}
                    >
                        {/* Forgot Password Flow */}
                        {mode === 'forgot' ? (
                            <View style={styles.forgotContainer}>
                                <Text style={styles.headingTitle}>Reset password</Text>
                                <Text style={styles.headingSubtitle}>
                                    Enter your account email and we'll send you a link to reset your password.
                                </Text>

                                {forgotSent ? (
                                    <View style={styles.centeredView}>
                                        <View style={styles.mailBadge}>
                                            <Mail size={24} color="#059669" />
                                        </View>
                                        <Text style={styles.confirmTitle}>Check your inbox</Text>
                                        <Text style={styles.confirmBody}>
                                            If an account exists for <Text style={styles.boldText}>{forgotEmail}</Text>, a password
                                            reset link is on its way.
                                        </Text>
                                        <Pressable style={styles.secondaryButton} onPress={backToLogin}>
                                            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                                        </Pressable>
                                    </View>
                                ) : (
                                    <>
                                        <Text style={styles.fieldLabel}>Email address</Text>
                                        <View style={styles.pillInputWrap}>
                                            <Mail size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                            <TextInput
                                                style={styles.pillTextInput}
                                                value={forgotEmail}
                                                onChangeText={setForgotEmail}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                keyboardType="email-address"
                                                textContentType="username"
                                                placeholder="you@example.com"
                                                placeholderTextColor={colors.textFaint}
                                            />
                                        </View>

                                        {!!message && (
                                            <Text style={[styles.messageText, isError ? styles.errorText : styles.successText]}>
                                                {message}
                                            </Text>
                                        )}

                                        <Pressable
                                            style={({ pressed }) => [
                                                styles.primaryButton,
                                                busy && styles.buttonDisabled,
                                                pressed && styles.buttonPressed,
                                                { marginTop: 20 },
                                            ]}
                                            onPress={submitForgotPassword}
                                            disabled={busy}
                                        >
                                            {busy ? (
                                                <ActivityIndicator color="#FFFFFF" />
                                            ) : (
                                                <>
                                                    <Text style={styles.primaryButtonText}>Send reset link</Text>
                                                    <ChevronRight size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
                                                </>
                                            )}
                                        </Pressable>

                                        <Pressable style={[styles.secondaryButton, { marginTop: 12 }]} onPress={backToLogin}>
                                            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                                        </Pressable>
                                    </>
                                )}
                            </View>
                        ) : (
                            /* Login / Signup Flow */
                            <>
                                {/* Header Titles */}
                                <Text style={styles.headingTitle}>
                                    {isSignup ? 'Create Account' : 'Welcome'}
                                </Text>
                                <Text style={styles.headingSubtitle}>
                                    {isSignup ? 'Sign up to get started' : 'Log in to continue'}
                                </Text>

                                {/* Additional Signup Fields */}
                                {isSignup && (
                                    <View style={styles.signupGroup}>
                                        <Text style={styles.fieldLabel}>Full Name</Text>
                                        <View style={styles.pillInputWrap}>
                                            <User size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                            <TextInput
                                                style={styles.pillTextInput}
                                                value={name}
                                                onChangeText={setName}
                                                autoCapitalize="words"
                                                placeholder="John Doe"
                                                placeholderTextColor={colors.textFaint}
                                            />
                                        </View>

                                        <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Username</Text>
                                        <View style={styles.pillInputWrap}>
                                            <User size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                            <TextInput
                                                style={styles.pillTextInput}
                                                value={username}
                                                onChangeText={setUsername}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                placeholder="unique_username"
                                                placeholderTextColor={colors.textFaint}
                                            />
                                        </View>

                                        {/* Business specific org fields */}
                                        {accountType === 'BUSINESS' && (
                                            <>
                                                <View style={styles.subSegmentTrack}>
                                                    <Pressable
                                                        style={[styles.subSegmentTab, signupOrgMode === 'CREATE' && styles.subSegmentTabActive]}
                                                        onPress={() => setSignupOrgMode('CREATE')}
                                                    >
                                                        <Text style={[styles.subSegmentTabText, signupOrgMode === 'CREATE' && styles.subSegmentTabTextActive]}>
                                                            Create New Org
                                                        </Text>
                                                    </Pressable>
                                                    <Pressable
                                                        style={[styles.subSegmentTab, signupOrgMode === 'JOIN' && styles.subSegmentTabActive]}
                                                        onPress={() => setSignupOrgMode('JOIN')}
                                                    >
                                                        <Text style={[styles.subSegmentTabText, signupOrgMode === 'JOIN' && styles.subSegmentTabTextActive]}>
                                                            Join Existing Org
                                                        </Text>
                                                    </Pressable>
                                                </View>

                                                {signupOrgMode === 'CREATE' ? (
                                                    <>
                                                        <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Organization Name</Text>
                                                        <View style={styles.pillInputWrap}>
                                                            <Building2 size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                                            <TextInput
                                                                style={styles.pillTextInput}
                                                                value={organizationName}
                                                                onChangeText={(v) => { setOrganizationName(v); setSuggestion(''); }}
                                                                placeholder="e.g. Acme Corp"
                                                                placeholderTextColor={colors.textFaint}
                                                            />
                                                        </View>
                                                        {!!suggestion && (
                                                            <View style={styles.suggestionRow}>
                                                                <Text style={styles.suggestionText}>
                                                                    Suggestion: <Text style={styles.boldText}>{suggestion}</Text>
                                                                </Text>
                                                                <Pressable onPress={() => { setOrganizationName(suggestion); setSuggestion(''); }}>
                                                                    <Text style={styles.suggestionUse}>Use this</Text>
                                                                </Pressable>
                                                            </View>
                                                        )}
                                                    </>
                                                ) : (
                                                    <View style={styles.searchFieldWrap}>
                                                        <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Search Organization</Text>
                                                        <View style={styles.pillInputWrap}>
                                                            <Search size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                                            <TextInput
                                                                style={styles.pillTextInput}
                                                                value={searchQuery}
                                                                onChangeText={(v) => { setSearchQuery(v); setOrganizationId(''); }}
                                                                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                                                                placeholder="Type to search…"
                                                                placeholderTextColor={colors.textFaint}
                                                                autoCapitalize="none"
                                                            />
                                                            {isSearching && (
                                                                <ActivityIndicator size="small" color={colors.blue} style={styles.searchSpinner} />
                                                            )}
                                                        </View>
                                                        {showDropdown && (
                                                            <View style={styles.dropdownBox}>
                                                                {searchResults.length === 0 ? (
                                                                    <Text style={styles.dropdownEmptyText}>No organizations found</Text>
                                                                ) : (
                                                                    searchResults.map((org) => (
                                                                        <Pressable
                                                                            key={org.id}
                                                                            style={styles.dropdownRowItem}
                                                                            onPress={() => {
                                                                                setOrganizationId(org.id);
                                                                                setSearchQuery(org.name);
                                                                                setShowDropdown(false);
                                                                            }}
                                                                        >
                                                                            <Text style={styles.dropdownRowItemText}>{org.name}</Text>
                                                                        </Pressable>
                                                                    ))
                                                                )}
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </>
                                        )}
                                    </View>
                                )}

                                {/* Email / Identifier Field */}
                                <Text style={[styles.fieldLabel, isSignup && styles.fieldSpacing]}>
                                    {isSignup ? 'Email address' : 'Email, Phone Number or Username'}
                                </Text>
                                <View style={styles.pillInputWrap}>
                                    <User size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                    <TextInput
                                        style={styles.pillTextInput}
                                        value={identifier}
                                        onChangeText={setIdentifier}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        keyboardType={isSignup ? 'email-address' : 'default'}
                                        textContentType="username"
                                        placeholder="example@email.com"
                                        placeholderTextColor={colors.textFaint}
                                        returnKeyType="next"
                                    />
                                </View>

                                {/* Password Field */}
                                <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Password</Text>
                                <View style={styles.pillInputWrap}>
                                    <Lock size={16} color={colors.textFaint} style={styles.inputLeftIcon} />
                                    <TextInput
                                        style={styles.pillTextInput}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                        textContentType="password"
                                        placeholder="••••••••"
                                        placeholderTextColor={colors.textFaint}
                                        returnKeyType="go"
                                        onSubmitEditing={isSignup ? submitSignup : submitLogin}
                                    />
                                    <Pressable
                                        style={styles.inputRightEyeBtn}
                                        onPress={() => setShowPassword((v) => !v)}
                                        hitSlop={12}
                                    >
                                        {showPassword ? (
                                            <EyeOff size={16} color={colors.textFaint} />
                                        ) : (
                                            <Eye size={16} color={colors.textFaint} />
                                        )}
                                    </Pressable>
                                </View>

                                {/* Forgot Password Link (Only in Login Mode) */}
                                {!isSignup && (
                                    <Pressable
                                        style={styles.forgotPasswordLink}
                                        onPress={() => {
                                            setForgotEmail(identifier.includes('@') ? identifier : '');
                                            setMode('forgot');
                                            setMessage('');
                                        }}
                                    >
                                        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                                    </Pressable>
                                )}

                                {/* Login gets its spacing from the "Forgot Password?" link; signup has none, so give the
                                    password field breathing room before the message / Create Account button. */}
                                {isSignup && <View style={styles.signupSpacer} />}

                                {/* Error / Success Feedback */}
                                {!!message && (
                                    <Text style={[styles.messageText, isError ? styles.errorText : styles.successText]}>
                                        {message}
                                    </Text>
                                )}

                                {/* Primary Action Button (Login / Create Account) */}
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        !canSubmit && styles.buttonDisabled,
                                        pressed && canSubmit && styles.buttonPressed,
                                    ]}
                                    onPress={isSignup ? submitSignup : submitLogin}
                                    disabled={!canSubmit}
                                >
                                    {busy ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <>
                                            <Text style={styles.primaryButtonText}>
                                                {isSignup ? 'Create Account' : 'Login'}
                                            </Text>
                                            <ChevronRight size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
                                        </>
                                    )}
                                </Pressable>

                                <SocialButtons onError={setMessage} />

                                {/* Secondary Action Button (Sign Up Now / Sign in instead) */}
                                <Pressable
                                    style={[styles.secondaryButton, { marginTop: 14 }]}
                                    onPress={() => switchMode(isSignup ? 'login' : 'signup')}
                                >
                                    <Text style={styles.secondaryButtonText}>
                                        {isSignup ? 'Sign in instead' : 'Sign Up Now'}
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </AnimatedTabContent>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    scroll: {
        paddingHorizontal: 20,
        paddingBottom: 56,
    },
    // Top Brand Header with Advercase-Regular font
    brandHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
        marginTop: 10,
    },
    brandTitleWrap: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginLeft: 8,
    },
    brandTitleText: {
        fontFamily: fonts.advercaseRegular,
        fontSize: 22,
        color: '#0F172A',
        letterSpacing: -0.3,
    },
    trademarkBadge: {
        fontSize: 9,
        fontWeight: '700',
        color: '#0F172A',
        marginLeft: 2,
        top: -4,
    },

    // Card Container
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        paddingHorizontal: 22,
        paddingVertical: 32,
        borderWidth: 1,
        borderColor: '#EAECEF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 4,
    },

    // Segmented Track & Indicator (AnimatedSegmented)
    segmentedTrack: {
        backgroundColor: '#F3F4F6',
        borderRadius: 9999,
        padding: 4,
        marginBottom: 26,
    },
    segmentedIndicator: {
        backgroundColor: '#FFFFFF',
        borderRadius: 9999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    segmentedItem: {
        flex: 1,
        paddingVertical: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabContentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    tabIcon: {
        marginRight: 4,
    },
    segmentTabText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 11.5,
        color: '#6B7280',
    },
    segmentTabTextActive: {
        fontFamily: fonts.bodyBold,
        color: '#0F172A',
    },

    // Heading Titles
    headingTitle: {
        fontFamily: fonts.display,
        fontSize: 28,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 6,
        letterSpacing: -0.5,
    },
    headingSubtitle: {
        fontFamily: fonts.body,
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 24,
    },

    // Form Inputs
    signupGroup: {
        marginBottom: 4,
    },
    fieldLabel: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12.5,
        color: '#374151',
        marginBottom: 8,
    },
    fieldSpacing: {
        marginTop: 18,
    },
    pillInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 9999,
        paddingHorizontal: 16,
        height: 50,
    },
    inputLeftIcon: {
        marginRight: 8,
    },
    inputRightEyeBtn: {
        padding: 4,
        marginLeft: 6,
    },
    pillTextInput: {
        flex: 1,
        fontFamily: fonts.body,
        fontSize: 14,
        color: '#111827',
        paddingVertical: 0,
    },

    // Forgot Password Link
    forgotPasswordLink: {
        alignSelf: 'flex-end',
        marginTop: 12,
        marginBottom: 24,
    },
    forgotPasswordText: {
        fontFamily: fonts.bodyBold,
        fontSize: 12,
        color: '#006AFF',
    },

    // Action Buttons
    signupSpacer: {
        height: 24,
    },
    primaryButton: {
        backgroundColor: '#006AFF',
        borderRadius: 9999,
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonPressed: {
        opacity: 0.85,
    },
    primaryButtonText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14.5,
        color: '#FFFFFF',
    },
    orDividerText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 11,
        color: '#9CA3AF',
        textAlign: 'center',
        marginVertical: 14,
    },
    secondaryButton: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 9999,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: '#0F172A',
    },

    // Sub-segment tab track for Business signup
    subSegmentTrack: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: radius.md,
        padding: 3,
        marginTop: 14,
        marginBottom: 6,
    },
    subSegmentTab: {
        flex: 1,
        paddingVertical: 7,
        alignItems: 'center',
        borderRadius: radius.sm,
    },
    subSegmentTabActive: {
        backgroundColor: '#FFFFFF',
    },
    subSegmentTabText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 11.5,
        color: '#6B7280',
    },
    subSegmentTabTextActive: {
        fontFamily: fonts.bodyBold,
        color: '#0F172A',
    },

    // Suggestion box
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EEF4FF',
        borderWidth: 1,
        borderColor: 'rgba(0,106,255,0.15)',
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 6,
    },
    suggestionText: {
        fontFamily: fonts.body,
        fontSize: 11.5,
        color: colors.textMuted,
        flex: 1,
        marginRight: 8,
    },
    suggestionUse: {
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        color: colors.blue,
    },

    // Search Dropdown
    searchFieldWrap: {
        position: 'relative',
        zIndex: 10,
    },
    searchSpinner: {
        marginLeft: 6,
    },
    dropdownBox: {
        marginTop: 6,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        maxHeight: 180,
        overflow: 'hidden',
    },
    dropdownEmptyText: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textFaint,
        textAlign: 'center',
        paddingVertical: 12,
    },
    dropdownRowItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    dropdownRowItemText: {
        fontFamily: fonts.bodyBold,
        fontSize: 13,
        color: colors.text,
    },

    // Feedback Messages
    messageText: {
        fontSize: 12.5,
        marginBottom: 14,
        lineHeight: 17,
        fontFamily: fonts.bodyMedium,
        textAlign: 'center',
    },
    errorText: {
        color: colors.danger,
    },
    successText: {
        color: colors.positiveInk,
    },

    // Forgot password view helpers
    forgotContainer: {
        marginTop: 0,
    },
    centeredView: {
        alignItems: 'center',
        paddingVertical: 14,
    },
    mailBadge: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#D1FAE5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    confirmTitle: {
        fontFamily: fonts.bodyBold,
        fontSize: 16,
        color: '#0F172A',
        marginBottom: 6,
    },
    confirmBody: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 18,
    },
    boldText: {
        fontFamily: fonts.bodyBold,
        color: '#0F172A',
    },
});
