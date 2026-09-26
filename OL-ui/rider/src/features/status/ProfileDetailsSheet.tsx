import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Divider, KeyValueRow, LoadingState, SecondaryButton } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { DocumentStatus, RiderMe } from '@/types';
import { DOCUMENT_LABELS, DOCUMENT_STATUS_LABELS, RIDER_TYPE_LABELS, VEHICLE_CLASS_LABELS } from './labels';

const STATUS_COLOR: Record<DocumentStatus, string> = {
  pending: colors.textSecondary,
  verified: colors.success,
  rejected: colors.danger,
  expired: colors.danger,
};

export interface ProfileDetailsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** GET /rider/me — undefined while it loads. */
  me?: RiderMe;
}

/** application-submitted "View Profile Details": the filed application exactly as the server holds it. */
export const ProfileDetailsSheet = ({ visible, onClose, me }: ProfileDetailsSheetProps) => (
  <BottomSheet visible={visible} onClose={onClose} title="Application details">
    {me ? (
      <View style={styles.list}>
        <KeyValueRow label="Name" value={me.rider.fullName} />
        <KeyValueRow label="Phone" value={me.rider.phone} />
        <KeyValueRow label="Rider type" value={RIDER_TYPE_LABELS[me.rider.type]} />
        {me.zone ? <KeyValueRow label="Zone" value={me.zone.name} /> : null}
        {me.hub ? <KeyValueRow label="Hub" value={me.hub.name} /> : null}
        {me.storeLinks[0] ? <KeyValueRow label="Linked store" value={me.storeLinks[0].storeName} /> : null}
        {me.vehicle ? <KeyValueRow label="Vehicle" value={`${VEHICLE_CLASS_LABELS[me.vehicle.class]} · ${me.vehicle.registrationNo}`} /> : null}
        <Divider />
        <AppText variant="label" color="textSecondary" uppercase>
          Documents
        </AppText>
        {me.documents.length ? (
          me.documents.map((d) => (
            <KeyValueRow
              key={d.id}
              label={DOCUMENT_LABELS[d.kind]}
              value={
                <AppText variant="label" color={STATUS_COLOR[d.status]} uppercase>
                  {DOCUMENT_STATUS_LABELS[d.status]}
                </AppText>
              }
            />
          ))
        ) : (
          <AppText variant="bodySm" color="textSecondary">
            No documents on file yet.
          </AppText>
        )}
      </View>
    ) : (
      <LoadingState compact label="Loading your application…" />
    )}
    <SecondaryButton label="Close" onPress={onClose} />
  </BottomSheet>
);

const styles = StyleSheet.create({
  list: { gap: spacing.md, marginBottom: spacing.xxl, alignSelf: 'stretch' },
});
