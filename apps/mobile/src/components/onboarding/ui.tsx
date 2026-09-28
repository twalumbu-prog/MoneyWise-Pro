import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, TextInput, Switch } from 'react-native';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme/tokens';

export interface PrimaryButtonProps {
    children: React.ReactNode;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'blue' | 'black' | 'danger';
    style?: any;
    textStyle?: any;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
    children,
    onPress,
    loading = false,
    disabled = false,
    variant = 'blue',
    style,
    textStyle,
}) => {
    const bg = variant === 'black' ? '#000000' : variant === 'danger' ? colors.danger : colors.blue;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || loading}
            style={({ pressed }) => [
                styles.btnBase,
                { backgroundColor: bg, opacity: (disabled || loading) ? 0.6 : pressed ? 0.9 : 1 },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
                <View style={styles.btnRow}>
                    <Text style={[styles.btnText, textStyle]}>{children}</Text>
                </View>
            )}
        </Pressable>
    );
};

export interface GhostButtonProps {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    style?: any;
    textStyle?: any;
}

export const GhostButton: React.FC<GhostButtonProps> = ({
    children,
    onPress,
    disabled = false,
    style,
    textStyle,
}) => {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.ghostBtnBase,
                { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
                style,
            ]}
        >
            <View style={styles.btnRow}>
                <Text style={[styles.ghostBtnText, textStyle]}>{children}</Text>
            </View>
        </Pressable>
    );
};

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface StepFooterProps {
    onBack?: () => void;
    onContinue?: () => void;
    continueLabel?: string;
    loading?: boolean;
    disabled?: boolean;
    showBack?: boolean;
    style?: any;
}

export const StepFooter: React.FC<StepFooterProps> = ({
    onBack,
    onContinue,
    continueLabel = 'Continue',
    loading = false,
    disabled = false,
    showBack = true,
    style,
}) => {
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.stickyFooterBar, { paddingBottom: Math.max(insets.bottom, 16) }, style]}>
            {showBack && onBack ? (
                <Pressable
                    onPress={onBack}
                    disabled={loading}
                    style={({ pressed }) => [
                        styles.backBtn,
                        { opacity: pressed ? 0.7 : 1 },
                    ]}
                >
                    <ArrowLeft size={18} color={colors.navy} />
                    <Text style={styles.backBtnText}>Back</Text>
                </Pressable>
            ) : (
                <View style={{ width: 80 }} />
            )}

            {onContinue && (
                <PrimaryButton
                    onPress={onContinue}
                    loading={loading}
                    disabled={disabled}
                    style={styles.footerContinueBtn}
                >
                    <Text style={styles.btnText}>{continueLabel}</Text>
                    <ArrowRight size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </PrimaryButton>
            )}
        </View>
    );
};

export const ErrorBanner: React.FC<{ message: string | null }> = ({ message }) => {
    if (!message) return null;
    return (
        <View style={styles.errorBox}>
            <AlertCircle size={18} color="#B91C1C" />
            <Text style={styles.errorText}>{message}</Text>
        </View>
    );
};

export const SkeletonRow: React.FC<{ height?: number; style?: any }> = ({ height = 48, style }) => {
    return <View style={[styles.skeleton, { height }, style]} />;
};

export interface TextFieldProps {
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder?: string;
    error?: string;
    optional?: boolean;
    keyboardType?: any;
    autoCapitalize?: any;
    secureTextEntry?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
}

export const TextField: React.FC<TextFieldProps> = ({
    label,
    value,
    onChangeText,
    placeholder,
    error,
    optional = false,
    keyboardType = 'default',
    autoCapitalize = 'sentences',
    secureTextEntry = false,
    multiline = false,
    numberOfLines = 1,
}) => {
    return (
        <View style={styles.fieldContainer}>
            <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>{label}</Text>
                {optional && <Text style={styles.optionalText}>Optional</Text>}
            </View>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textFaint}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                secureTextEntry={secureTextEntry}
                multiline={multiline}
                numberOfLines={numberOfLines}
                style={[
                    styles.input,
                    multiline && { height: 80, textAlignVertical: 'top' },
                    error ? styles.inputError : null,
                ]}
            />
            {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
        </View>
    );
};

export interface ToggleProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (val: boolean) => void;
}

export const Toggle: React.FC<ToggleProps> = ({ label, description, checked, onChange }) => {
    return (
        <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleLabel}>{label}</Text>
                {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
            </View>
            <Switch
                value={checked}
                onValueChange={onChange}
                trackColor={{ false: colors.borderStrong, true: colors.blue }}
                thumbColor="#FFFFFF"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    btnBase: {
        minHeight: 48,
        borderRadius: radius.pill,
        paddingHorizontal: 24,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 15,
        color: '#FFFFFF',
    },
    ghostBtnBase: {
        minHeight: 40,
        borderRadius: radius.pill,
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    ghostBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    stickyFooterBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 12,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -3 },
        elevation: 6,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
    },
    backBtnText: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
        marginLeft: 6,
    },
    footerContinueBtn: {
        minWidth: 130,
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        borderRadius: radius.md,
        padding: 12,
        marginBottom: 16,
        gap: 8,
    },
    errorText: {
        flex: 1,
        fontFamily: fonts.bodyMedium,
        fontSize: 13,
        color: '#991B1B',
    },
    skeleton: {
        backgroundColor: '#E5E7EB',
        borderRadius: radius.md,
        opacity: 0.6,
        width: '100%',
    },
    fieldContainer: {
        marginBottom: 16,
        width: '100%',
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    fieldLabel: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    optionalText: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textFaint,
    },
    input: {
        minHeight: 48,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontFamily: fonts.body,
        fontSize: 15,
        color: colors.text,
    },
    inputError: {
        borderColor: colors.danger,
    },
    fieldErrorText: {
        fontFamily: fonts.bodyMedium,
        fontSize: 12,
        color: colors.danger,
        marginTop: 4,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    toggleLabel: {
        fontFamily: fonts.bodyBold,
        fontSize: 14,
        color: colors.navy,
    },
    toggleDesc: {
        fontFamily: fonts.body,
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
});
