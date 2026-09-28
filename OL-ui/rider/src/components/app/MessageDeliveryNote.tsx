import { StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { spacing } from '@/theme';

export interface MessageDeliveryNoteProps {
  channel: 'whatsapp' | 'sms' | 'email' | 'unknown' | null;
  text: string;
  align?: 'left' | 'center';
}

/** One-line "sent on WhatsApp / by SMS / by email" indicator used on code and statement screens. */
export const MessageDeliveryNote = ({ channel, text, align = 'left' }: MessageDeliveryNoteProps) => (
  <View style={[styles.row, align === 'center' && styles.center]} accessible accessibilityLabel={text} accessibilityLiveRegion="polite">
    <Icon name={channel === 'email' ? 'mail' : channel === 'sms' ? 'message-square' : 'message-circle'} size={16} color="textSecondary" />
    <AppText variant="bodySm" color="textSecondary" style={styles.text}>
      {text}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  center: { justifyContent: 'center' },
  text: { flexShrink: 1 },
});
