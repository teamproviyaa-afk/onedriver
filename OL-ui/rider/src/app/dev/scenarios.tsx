import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { colors, spacing } from '@/theme';
import { AppText, Card, GhostButton, OutlineButton, PrimaryButton, Screen, Toggle, toast, SectionLabel } from '@/components/ui';
import { AppHeader } from '@/components/app/AppHeader';
import { ConnectivityBadge } from '@/components/app/ConnectivityBanner';
import { getDemoProvider } from '@/providers';
import { DEMO_SCENARIOS, type DemoScenarioId } from '@/providers/localDemoProvider';
import { useConnectivityStore } from '@/stores/useConnectivityStore';
import { useDevStore } from '@/stores/useDevStore';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useOfflineQueueStore } from '@/stores/useOfflineQueueStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { processQueue, simulateSyncError } from '@/offline/queueEngine';
import { getDemoSimulator } from '@/location/useLocationEngine';
import { isDevBuild } from '@/config/env';
import { DEMO_OTP_CODE, DEMO_RETURNING_PHONE, DEMO_STORE_INVITE_CODES } from '@/demo/constants';
import { DEMO_NO_WHATSAPP_PHONES } from '@/domain/messaging';
import type { DemoOutboxMessage } from '@/types';
import { formatClock } from '@/utils/format';

/**
 * Development-only scenario switcher (never bundled behaviour in production builds):
 * applies the 17 test scenarios, toggles simulated network loss / sync errors / device GPS,
 * teleports the demo rider and shows queue + connectivity state.
 */
export default function DevScenariosScreen() {
  const qc = useQueryClient();
  const demo = getDemoProvider();
  const dev = useDevStore();
  const conn = useConnectivityStore();
  const queue = useOfflineQueueStore((s) => s.items);
  const job = useDeliveryStore((s) => s.job);
  const position = useDeliveryStore((s) => s.position);
  const me = useRiderStore((s) => s.me);
  const [busy, setBusy] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | undefined>();
  const [code, setCode] = useState<string | undefined>();
  const [outbox, setOutbox] = useState<DemoOutboxMessage[]>([]);

  // The demo world loads asynchronously; read the outbox once loaded and after every change.
  useEffect(() => {
    if (!demo) return;
    let active = true;
    const refresh = () => void demo.getDemoOutbox().then((list) => active && setOutbox(list));
    refresh();
    const unsubscribe = demo.onEvent(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [demo]);

  useEffect(() => {
    if (!demo || !job) return;
    void demo.getDemoDeliveryOtp(job.id).then(setOtp);
    void demo.getDemoPickupCode(job.id).then(setCode);
  }, [demo, job]);

  if (!isDevBuild) {
    router.replace('/home' as never);
    return null;
  }

  const apply = async (id: DemoScenarioId) => {
    if (!demo) return;
    setBusy(id);
    try {
      await demo.applyScenario(id);
      dev.setScenario(id);
      useDeliveryStore.getState().clearJob();
      useDeliveryStore.getState().setOffer(null);
      useRiderStore.getState().setOnline(false);
      useConnectivityStore.getState().setHeartbeatOn(false);
      await qc.invalidateQueries();
      toast.success(`Scenario "${DEMO_SCENARIOS.find((s) => s.id === id)?.title}" applied`);
      if (id === 'suspended_rider') router.replace('/status' as never);
      else if (id === 'cash_limit') router.replace('/cash' as never);
      else router.replace('/home' as never);
    } finally {
      setBusy(null);
    }
  };

  const teleport = (to: 'pickup' | 'drop' | 'hub') => {
    const sim = getDemoSimulator();
    if (!sim) return toast.error('Simulator is off (device GPS in use)');
    const target = to === 'pickup' ? job?.pickup : to === 'drop' ? job?.drop : me?.hub;
    if (!target) return toast.error('Nothing to teleport to');
    sim.teleport({ lat: target.lat, lng: target.lng });
    toast.success(`Teleported to ${to}`);
  };

  return (
    <Screen scroll>
      <AppHeader title="Developer scenarios" onBack={() => (router.canGoBack() ? router.back() : router.replace('/home' as never))} />
      <View style={styles.section}>
        <SectionLabel>Live state</SectionLabel>
        <Card radius={20} padding={16} gap={8}>
          <ConnectivityBadge state={conn.state} withCaption />
          <AppText variant="bodySm" color="textSecondary">
            Queue: {queue.length} item(s) · pending {queue.filter((i) => i.status === 'pending').length} · failed {queue.filter((i) => i.status === 'failed').length}
          </AppText>
          <AppText variant="bodySm" color="textSecondary">
            Job: {job ? `${job.orderRef} · ${job.state} · v${job.version}` : 'none'}
          </AppText>
          <AppText variant="bodySm" color="textSecondary">
            Position: {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} ±${position.accuracyM}m (${useDeliveryStore.getState().positionSource})` : 'none'}
          </AppText>
          {job ? (
            <AppText variant="bodySm" color="textSecondary">
              Demo pickup code: {code ?? '—'} · delivery OTP: {otp ?? '—'}
            </AppText>
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Demo credentials</SectionLabel>
        <Card radius={20} padding={16} gap={4}>
          <AppText variant="bodySm">Returning rider phone: {DEMO_RETURNING_PHONE} · OTP {DEMO_OTP_CODE}</AppText>
          <AppText variant="bodySm">Any other 10-digit number registers a new rider (OTP {DEMO_OTP_CODE}).</AppText>
          <AppText variant="bodySm">Store invite codes: {DEMO_STORE_INVITE_CODES.join(', ')}</AppText>
          <AppText variant="bodySm">Not on WhatsApp (SMS fallback): {DEMO_NO_WHATSAPP_PHONES.join(', ')}</AppText>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Messages sent (WhatsApp → SMS)</SectionLabel>
        <Card radius={20} padding={16} gap={10}>
          {outbox.length === 0 ? (
            <AppText variant="bodySm" color="textSecondary">
              Nothing yet. Sign in, pick up an order, deliver it or press SOS to see what the server would send.
            </AppText>
          ) : (
            outbox.slice(0, 12).map((m) => (
              <View key={m.id} style={styles.msgRow} accessible accessibilityLabel={`${OUTBOX_CHANNEL[m.channel]} to ${m.audience}: ${m.summary}`}>
                <View style={[styles.msgChip, m.channel === 'whatsapp' ? styles.msgChipWa : m.channel === 'sms' ? styles.msgChipSms : styles.msgChipMail]}>
                  <AppText variant="labelXs">{OUTBOX_CHANNEL[m.channel]}</AppText>
                </View>
                <View style={styles.msgBody}>
                  <AppText variant="bodySemi" numberOfLines={1}>
                    {m.summary}
                  </AppText>
                  <AppText variant="bodySm" color="textSecondary" numberOfLines={2}>
                    {formatClock(m.at)} · {OUTBOX_AUDIENCE[m.audience]} {m.toMasked}
                    {m.fallbackUsed ? ` · fallback: ${OUTBOX_REASON[m.fallbackReason ?? ''] ?? 'SMS'}` : ''}
                  </AppText>
                </View>
              </View>
            ))
          )}
          {outbox.length ? <GhostButton label="Clear messages" onPress={() => void demo?.clearDemoOutbox()} /> : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Switches</SectionLabel>
        <Card radius={20} padding={16} gap={12}>
          <Row label="Simulate network loss (OFFLINE MODE)" value={conn.simulatedOffline} onChange={(v) => { conn.setSimulatedOffline(v); if (!v) void processQueue(); }} />
          <Row label="Use device GPS instead of demo route" value={dev.useDeviceGps} onChange={dev.setUseDeviceGps} />
          <View style={styles.rowBtns}>
            <OutlineButton label="Sync error" onPress={() => simulateSyncError()} />
            <OutlineButton label="Replay queue" onPress={() => void processQueue()} />
            <OutlineButton label="Server advanced job" onPress={() => void demo?.simulateServerAdvance().then(() => toast.show('Next step will return version_conflict'))} />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Demo GPS</SectionLabel>
        <View style={styles.rowBtns}>
          <OutlineButton label="→ Hub" onPress={() => teleport('hub')} />
          <OutlineButton label="→ Pickup" onPress={() => teleport('pickup')} />
          <OutlineButton label="→ Drop" onPress={() => teleport('drop')} />
          <OutlineButton label="Offer now" onPress={() => void demo?.forceDispatchNow()} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>Scenarios</SectionLabel>
        {DEMO_SCENARIOS.map((s) => (
          <Card key={s.id} radius={20} padding={16} gap={4} onPress={() => void apply(s.id)} borderColor={dev.scenario === s.id ? colors.borderStrong : colors.border} background={dev.scenario === s.id ? colors.surfaceLime : colors.surface}>
            <AppText variant="titleLg">{s.title}</AppText>
            <AppText variant="bodySm" color="textSecondary">
              {s.description}
            </AppText>
            {busy === s.id ? (
              <AppText variant="labelXs" color="textSecondary">
                Applying…
              </AppText>
            ) : null}
          </Card>
        ))}
      </View>

      <View style={styles.section}>
        <PrimaryButton label="Reset demo world" icon="rotate-ccw" iconPosition="left" onPress={() => void demo?.resetWorld().then(() => { useDeliveryStore.getState().clearJob(); void qc.invalidateQueries(); toast.success('Demo world reset'); router.replace('/home' as never); })} />
        <GhostButton label="Back to app" onPress={() => router.replace('/home' as never)} />
      </View>
      <View style={{ height: spacing.x6l }} />
    </Screen>
  );
}

const OUTBOX_CHANNEL: Record<DemoOutboxMessage['channel'], string> = { whatsapp: 'WHATSAPP', sms: 'SMS', email: 'EMAIL' };
const OUTBOX_AUDIENCE: Record<DemoOutboxMessage['audience'], string> = { rider: 'to rider', customer: 'to customer', emergency_contact: 'to emergency contact' };
const OUTBOX_REASON: Record<string, string> = {
  no_whatsapp: 'not on WhatsApp',
  known_no_whatsapp: 'known not on WhatsApp',
  whatsapp_failed: 'WhatsApp failed',
  whatsapp_timeout: 'WhatsApp not delivered in time',
  resend_escalated: 'resend by SMS',
  whatsapp_unavailable: 'WhatsApp not configured',
};

const Row = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <View style={styles.row}>
    <AppText variant="bodySemi" style={styles.rowLabel}>
      {label}
    </AppText>
    <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
  </View>
);

const styles = StyleSheet.create({
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  msgChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 100, marginTop: 2 },
  msgChipWa: { backgroundColor: colors.surfaceLime },
  msgChipSms: { backgroundColor: colors.surfaceWarning },
  msgChipMail: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  msgBody: { flex: 1, gap: 2 },
  section: { gap: spacing.md, marginTop: spacing.x3l },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  rowLabel: { flex: 1 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});

