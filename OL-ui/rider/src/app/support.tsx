import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, ConfirmationSheet, Icon, Screen, SectionLabel, toast, type IconName } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { RIDER_HELPLINE } from '@/features/issues/issueOptions';
import { openDialer } from '@/navigation/openNavigation';
import { colors, spacing } from '@/theme';

/** Human-readable form of the shared RIDER_HELPLINE dial string. */
const RIDER_HELPLINE_DISPLAY = '1800-000-0000';

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I get paid?', a: 'Earnings are settled weekly to your verified bank account or UPI ID. Every completed job appears under Earnings with its base pay, distance, peak and tip breakdown.' },
  { q: 'What if the customer is unavailable?', a: 'Wait at the drop location, call the customer from the job screen, then use Report an issue to escalate. Operations will guide you on returning the package to the store.' },
  { q: 'Can I change my acceptance mode?', a: 'Yes. Open Profile › Preferences to switch between Auto-Accept and Manual-Accept at any time. Manual mode gives you a 30-second window on each offer.' },
  { q: 'How is cash in hand handled?', a: 'Cash collected on COD orders counts towards your cash limit. Deposit at your hub from the Cash screen to keep receiving orders once you are near the limit.' },
];

interface SupportCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

const SupportCard = ({ icon, title, subtitle, onPress, tone = 'default' }: SupportCardProps) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.card, tone === 'danger' && styles.cardDanger, pressed && styles.pressed]}>
    <View style={[styles.iconRing, tone === 'danger' && styles.iconRingDanger]}>
      <Icon name={icon} size={20} color={tone === 'danger' ? 'danger' : 'ink'} strokeWidth={2.25} />
    </View>
    <View style={styles.cardText}>
      <AppText variant="title" color={tone === 'danger' ? 'danger' : 'ink'}>
        {title}
      </AppText>
      <AppText variant="bodySm" color="textSecondary">
        {subtitle}
      </AppText>
    </View>
    <Icon name="chevron-right" size={18} color="textSecondary" />
  </Pressable>
);

/** Help & Support: helpline, ticketing (coming soon), FAQ and the emergency SOS entry point. */
export default function SupportScreen() {
  const [ticketSheet, setTicketSheet] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const callHelpline = async () => {
    const ok = await openDialer(RIDER_HELPLINE);
    if (!ok) toast.error(`Could not open the dialer. Call ${RIDER_HELPLINE_DISPLAY}.`);
  };

  return (
    <Screen scroll>
      <AppHeader title="Help & Support" onBack={() => (router.canGoBack() ? router.back() : router.replace('/home' as never))} right={<View style={styles.headerSpacer} />} />
      <View style={styles.body}>
        <View style={styles.section}>
          <SectionLabel>Get help</SectionLabel>
          <SupportCard icon="phone" title="Call rider helpline" subtitle={`${RIDER_HELPLINE_DISPLAY} · 24×7 logistics team`} onPress={() => void callHelpline()} />
          <SupportCard icon="message-square" title="Raise a ticket" subtitle="Payments, app issues or account questions" onPress={() => setTicketSheet(true)} />
        </View>

        <View style={styles.section}>
          <SectionLabel>Frequently asked</SectionLabel>
          <View style={styles.faqCard}>
            {FAQ.map((item, i) => {
              const expanded = open === i;
              return (
                <View key={item.q} style={[styles.faqItem, i < FAQ.length - 1 && styles.faqDivider]}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={item.q} onPress={() => setOpen(expanded ? null : i)} style={styles.faqRow}>
                    <AppText variant="bodyBold" style={styles.faqQuestion}>
                      {item.q}
                    </AppText>
                    <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="textSecondary" />
                  </Pressable>
                  {expanded ? (
                    <AppText variant="bodySm" color="textSecondary" style={styles.faqAnswer}>
                      {item.a}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Safety</SectionLabel>
          <SupportCard icon="shield-alert" title="Emergency SOS" subtitle="Share your live location with operations" tone="danger" onPress={() => router.push('/sos' as never)} />
        </View>
      </View>

      <ConfirmationSheet
        visible={ticketSheet}
        onClose={() => setTicketSheet(false)}
        title="Coming soon"
        body={`In-app tickets are on the way. Until then, call the rider helpline at ${RIDER_HELPLINE_DISPLAY} and we will log it for you.`}
        icon="message-square"
        confirmLabel="Call helpline"
        cancelLabel="Close"
        onConfirm={async () => {
          setTicketSheet(false);
          await callHelpline();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.gutter, paddingTop: spacing.x3l, paddingBottom: spacing.gutter },
  headerSpacer: { width: 40, height: 40 },
  section: { gap: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xxl, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 34, alignSelf: 'stretch', minHeight: 72 },
  cardDanger: { backgroundColor: colors.surfaceDanger, borderColor: colors.danger },
  pressed: { opacity: 0.9 },
  iconRing: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  iconRingDanger: { backgroundColor: colors.surface },
  cardText: { flex: 1, gap: spacing.xxs },
  faqCard: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, paddingHorizontal: spacing.xxl, alignSelf: 'stretch' },
  faqItem: { paddingVertical: spacing.xs },
  faqDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 52 },
  faqQuestion: { flex: 1 },
  faqAnswer: { paddingBottom: spacing.lg },
});
