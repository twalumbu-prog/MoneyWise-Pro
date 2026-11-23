import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Mail, CheckCircle2, Plus, FileText, Receipt } from 'lucide-react-native';
import type { GmailFindings, MoneyProviderType } from 'core';
import { PersonalStepShell } from './PersonalStepShell';
import { AccountSheet, type AccountTarget } from './AccountSheet';
import { ProviderLogo, fmtK } from './moneyUi';
import type { StepContext } from './stepContext';
import { colors, fonts, radius } from '../../../theme/tokens';

/**
 * Step "gmail": connect a mailbox so bank alerts, receipts and statements are picked up. Uses Composio quick connect
 * when the server has it (no unverified-app warning), else MoneyWise's own Google sign-in. The sign-in opens in an
 * auth session that closes itself when Google sends the browser back to moneywise://integrations-return.
 *
 * After connecting, the mailbox's last 90 days suggest: banks not added yet (one tap to add), regular bills (carried
 * to the bills step) and the newest statement (offered later as proof of residence). Nothing is booked here.
 */
const RETURN_URL = 'moneywise://integrations-return';

export function StepGmail({ ctx }: { ctx: StepContext }) {
    const [status, setStatus] = useState<{ configured: boolean; composio: boolean; mailbox: string | null } | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [target, setTarget] = useState<AccountTarget | null>(null);
    const findings = ctx.drafts.gmail;
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const loadStatus = useCallback(async () => {
        if (ctx.preview) { setStatus((s) => s ?? { configured: true, composio: true, mailbox: null }); return; }
        try {
            const s = await ctx.service.gmailStatus();
            const active = s.connections.find((c) => c.status === 'ACTIVE') ?? s.connections[0];
            setStatus({ configured: s.configured, composio: s.composio, mailbox: active?.email_address ?? null });
        } catch {
            setStatus({ configured: false, composio: false, mailbox: null });
        }
    }, [ctx.preview, ctx.service]);
    useEffect(() => { void loadStatus(); }, [loadStatus]);

    /** Up to ~20 s: the first sync runs in the background on the server, so findings can take a moment. */
    const scan = useCallback(async () => {
        setScanning(true);
        try {
            for (let i = 0; i < 5 && mounted.current; i++) {
                const f: GmailFindings = ctx.preview
                    ? { connected: true, mailbox: 'you@gmail.com', providers: [{ code: 'FNB', name: 'FNB', type: 'BANK' }, { code: 'ZANACO', name: 'Zanaco', type: 'BANK' }], bills: [{ key: 'dstv', label: 'DStv', amount: 540, lastSeen: new Date().toISOString() }, { key: 'netflix', label: 'Netflix', amount: null, lastSeen: new Date().toISOString() }], statement: { emailId: 'x', provider: 'ZANACO', receivedAt: new Date(Date.now() - 18 * 86400_000).toISOString(), filename: 'statement.pdf' } }
                    : await ctx.service.gmailFindings();
                ctx.setDraft('gmail', f);
                if (f.providers.length || f.bills.length || f.statement) break;
                await new Promise((r) => setTimeout(r, 4000));
            }
        } catch { /* findings are a bonus; the step still works */ } finally {
            if (mounted.current) setScanning(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.preview, ctx.service]);

    useEffect(() => { if (status?.mailbox && !findings) void scan(); }, [status?.mailbox, findings, scan]);

    const connect = async () => {
        setBusy(true); setErr(null);
        try {
            if (ctx.preview) {
                await new Promise((r) => setTimeout(r, 600));
                setStatus({ configured: true, composio: true, mailbox: 'you@gmail.com' });
                return;
            }
            const via = status?.composio ? 'composio' : 'direct';
            const url = await ctx.service.gmailConnectUrl(via);
            const res = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
            if (res.type !== 'success') return; // closed or cancelled: stay here, no error
            const q = new URL(res.url).searchParams;
            if (q.get('gmail') === 'error') { setErr(q.get('gmail_message') || 'Gmail didn’t connect. Try again.'); return; }
            if (q.get('gmail') === 'cancelled') return;
            if (via === 'composio') {
                const done = await ctx.service.gmailComposioComplete();
                if (!done.ok) { setErr(done.message || 'Gmail didn’t connect. Try again.'); return; }
            }
            await loadStatus();
        } catch (e: any) {
            setErr(e?.message || 'Gmail didn’t connect. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const available = !!status && (status.configured || status.composio);
    const connected = !!status?.mailbox;
    const accounts = ctx.money?.accounts ?? [];
    const banksAdded = new Set(accounts.map((a) => a.providerCode));
    const bankNames = accounts.filter((a) => a.providerType === 'BANK').map((a) => a.name);
    const newProviders = (findings?.providers ?? []).filter((p) => !banksAdded.has(p.code));
    const statementBank = findings?.statement?.provider ? ctx.money?.providers.find((p) => p.code === findings.statement!.provider)?.name ?? findings.statement.provider : null;

    return (
        <PersonalStepShell
            def={ctx.def} progress={ctx.progress} onBack={ctx.onBack} onSkip={ctx.skip}
            onContinue={() => ctx.done({ mailbox: status?.mailbox ?? null })}
            continueDisabled={!connected} saving={ctx.saving} error={ctx.error ?? err}
            continueLabel={ctx.single ? 'Done' : 'Continue'}
        >
            {!status ? <ActivityIndicator color={colors.blue} /> : connected ? (
                <View style={styles.connected}>
                    <CheckCircle2 size={22} color={colors.positive} />
                    <Text style={styles.connectedText}>Connected as {status.mailbox}</Text>
                </View>
            ) : (
                <View style={{ gap: 14 }}>
                    <Text style={styles.body}>
                        {bankNames.length
                            ? `MoneyWise will pick up alerts from ${bankNames.join(', ')}, plus receipts and statements.`
                            : 'MoneyWise picks up bank alerts, receipts and statements, and suggests anything you haven’t added.'}
                    </Text>
                    <Text style={styles.small}>Read-only. MoneyWise never sends email or reads anything that isn’t about money. Disconnect any time in Settings.</Text>
                    {available ? (
                        <Pressable onPress={() => void connect()} disabled={busy} style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                            {busy ? <ActivityIndicator color={colors.text} /> : (<><Mail size={20} color={colors.text} /><Text style={styles.connectText}>Connect Gmail</Text></>)}
                        </Pressable>
                    ) : (
                        <Text style={styles.small}>Connecting Gmail isn’t available yet. Skip for now; you’ll find it later under Settings → Integrations.</Text>
                    )}
                </View>
            )}

            {connected && (
                <View style={{ marginTop: 24, gap: 18 }}>
                    {scanning && !findings && (
                        <View style={styles.scanRow}><ActivityIndicator color={colors.blue} /><Text style={styles.small}>Looking through the last 90 days…</Text></View>
                    )}
                    {newProviders.length > 0 && (
                        <View>
                            <Text style={styles.section}>We also found</Text>
                            {newProviders.map((p) => (
                                <Pressable key={p.code} onPress={() => setTarget({ providerType: p.type as MoneyProviderType, providerCode: p.code, providerName: p.name })} style={styles.findRow} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`}>
                                    <ProviderLogo type={p.type} code={p.code} name={p.name} size={36} />
                                    <Text style={styles.findText}>{p.name} emails you. Add it?</Text>
                                    <Plus size={20} color={colors.blue} />
                                </Pressable>
                            ))}
                        </View>
                    )}
                    {(findings?.bills.length ?? 0) > 0 && (
                        <View style={styles.note}>
                            <Receipt size={18} color={colors.textMuted} />
                            <Text style={styles.noteText}>Regular bills found: {findings!.bills.map((b) => (b.amount ? `${b.label} (${fmtK(b.amount)})` : b.label)).join(', ')}. You’ll see them in the bills step.</Text>
                        </View>
                    )}
                    {findings?.statement && (
                        <View style={styles.note}>
                            <FileText size={18} color={colors.textMuted} />
                            <Text style={styles.noteText}>Your {statementBank} statement from {new Date(findings.statement.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} can be your proof of residence later.</Text>
                        </View>
                    )}
                    {findings && !scanning && !newProviders.length && !findings.bills.length && !findings.statement && (
                        <Text style={styles.small}>Nothing to add yet. New alerts will be picked up as they arrive.</Text>
                    )}
                </View>
            )}

            <AccountSheet target={target} service={ctx.service} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); void ctx.refreshMoney(); }} />
        </PersonalStepShell>
    );
}

const styles = StyleSheet.create({
    body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
    small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
    connectBtn: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, marginTop: 6 },
    connectText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
    connected: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.md, backgroundColor: '#ECFDF5' },
    connectedText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    section: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textMuted, marginBottom: 6 },
    findRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderColor: colors.border },
    findText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
    note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.md, backgroundColor: colors.canvas },
    noteText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text },
});
