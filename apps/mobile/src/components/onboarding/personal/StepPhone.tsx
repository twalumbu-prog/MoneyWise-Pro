import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { zambianNetwork, zambianMobileDigits, PersonalStepError } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { Field } from './steps';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "phone": Zambian number → 6-digit code on WhatsApp → verified. Network (MTN / Airtel / Zamtel) is shown as
 * soon as it can be read from the number and is remembered as the suggestion for the accounts step.
 */
const NETWORK_LABEL: Record<string, string> = { MTN: 'MTN', AIRTEL: 'Airtel', ZAMTEL: 'Zamtel' };

/** +260961234567 → +260 96 123 4567 */
const spaced = (e164: string) => e164.replace(/^\+260(\d{2})(\d{3})(\d{4})$/, '+260 $1 $2 $3');

const pretty = (digits: string) => digits.replace(/^(\d{2})(\d{0,3})(\d{0,4}).*$/, (_m, a, b, c) => [a, b, c].filter(Boolean).join(' '));

export function StepPhone({ ctx }: { ctx: StepContext }) {
    const d = ctx.drafts.phone;
    const set = (patch: Partial<typeof d>) => ctx.setDraft('phone', { ...d, ...patch });
    const [now, setNow] = useState(Date.now());
    const verified = !!ctx.state.profile.phone;

    // Ticks the resend countdown.
    useEffect(() => {
        if (!d.resendAt || d.resendAt <= now) return;
        const t = setTimeout(() => setNow(Date.now()), 1000);
        return () => clearTimeout(t);
    }, [d.resendAt, now]);

    // A wrong code clears the boxes so the next try starts fresh.
    useEffect(() => {
        if (ctx.fieldErrors.code && d.code) ctx.setDraft('phone', { ...d, code: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.fieldErrors.code]);

    const digits = zambianMobileDigits(d.number);
    const network = zambianNetwork(d.number);
    const waitSec = d.resendAt ? Math.max(0, Math.ceil((d.resendAt - now) / 1000)) : 0;

    const send = () => void ctx.run('continue', async () => {
        try {
            const r = await ctx.service.sendPhoneCode(`+260${digits}`);
            set({ codeSentTo: r.phone, code: '', resendAt: Date.now() + r.resendInSeconds * 1000 });
            setNow(Date.now());
        } catch (e) {
            // A 429 still means a code is out: go to the code screen with the wait shown.
            if (e instanceof PersonalStepError && e.status === 429) {
                const secs = Number(/(\d+) seconds/.exec(e.message)?.[1] ?? 30);
                set({ codeSentTo: `+260${digits}`, resendAt: Date.now() + secs * 1000 });
                return null;
            }
            throw e;
        }
        return null;
    });

    const verify = (code = d.code) => void ctx.run('continue', async () => {
        const r = await ctx.service.verifyPhoneCode(code);
        ctx.patchProfile({ phone: r.data.phone, phoneNetwork: r.data.network as any });
        set({ codeSentTo: null, code: '', resendAt: null });
        return r;
    });

    if (verified && !d.codeSentTo) {
        return (
            <PersonalStepShell def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onContinue={() => ctx.done()} saving={ctx.saving} error={ctx.error} continueLabel={ctx.single ? 'Done' : 'Continue'}>
                <View style={styles.verified}>
                    <CheckCircle2 size={22} color={colors.positive} />
                    <Text style={styles.verifiedText}>{spaced(ctx.state.profile.phone!)} is verified</Text>
                </View>
                <Pressable onPress={() => { ctx.patchProfile({ phone: null }); }} style={{ marginTop: 16 }} accessibilityRole="button">
                    <Text style={styles.link}>Use a different number</Text>
                </Pressable>
            </PersonalStepShell>
        );
    }

    if (d.codeSentTo) {
        return (
            <PersonalStepShell
                def={{ ...ctx.def, title: 'Enter the code', subtitle: `We sent a 6-digit code on WhatsApp to ${spaced(d.codeSentTo)}.` }}
                progress={ctx.progress} onBack={() => set({ codeSentTo: null, code: '' })} onSkip={ctx.skip}
                onContinue={() => verify()} continueDisabled={d.code.length !== 6} saving={ctx.saving} error={ctx.error} continueLabel="Verify"
            >
                <TextInput
                    value={d.code}
                    onChangeText={(t) => {
                        const code = t.replace(/\D/g, '').slice(0, 6);
                        set({ code });
                        if (code.length === 6 && !ctx.saving) verify(code);
                    }}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={colors.borderStrong}
                    accessibilityLabel="6-digit code"
                    style={[styles.code, !!ctx.fieldErrors.code && { borderColor: colors.danger }]}
                />
                {!!ctx.fieldErrors.code && <Text style={styles.error}>{ctx.fieldErrors.code}</Text>}
                <View style={styles.row}>
                    {waitSec > 0
                        ? <Text style={styles.muted}>Send a new code in {waitSec}s</Text>
                        : <Pressable onPress={send} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>Send a new code</Text></Pressable>}
                    <Pressable onPress={() => set({ codeSentTo: null, code: '' })} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.link}>Change number</Text>
                    </Pressable>
                </View>
            </PersonalStepShell>
        );
    }

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={send} continueDisabled={!digits} saving={ctx.saving} error={ctx.error} continueLabel="Send code"
        >
            <Field
                label="Mobile number"
                value={pretty(d.number.replace(/\D/g, '').replace(/^260/, '').replace(/^0/, ''))}
                onChangeText={(t) => set({ number: t.replace(/\D/g, '').slice(0, 10) })}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                autoFocus={!d.number}
                placeholder="97 123 4567"
                maxLength={12}
                error={ctx.fieldErrors.phone}
                prefix={<Text style={styles.prefix}>🇿🇲 +260</Text>}
            />
            {!!network && <Text style={styles.network}>{NETWORK_LABEL[network]} number</Text>}
            <Text style={styles.small}>Your phone is a second way to secure your account. By continuing you agree to receive a one-time code on WhatsApp.</Text>
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    prefix: { fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.text },
    network: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.positiveInk, marginTop: 8 },
    small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textFaint, marginTop: 20 },
    code: {
        height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, textAlign: 'center',
        fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: 12, color: colors.text,
    },
    error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
    muted: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
    link: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.blue },
    verified: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.md, backgroundColor: '#ECFDF5' },
    verifiedText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
});
