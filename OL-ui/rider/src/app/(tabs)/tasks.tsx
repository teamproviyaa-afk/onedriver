import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, ConfirmationSheet, EmptyState, ErrorState, LoadingState, Screen, SecondaryButton } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { JobCard } from '@/components/app/JobCard';
import { useJobHistory } from '@/hooks';
import { colors, spacing } from '@/theme';
import { isSameLocalDay } from '@/utils/time';
import type { JobHistoryItem } from '@/types';

type Bucket = 'today' | 'yesterday' | 'earlier';

const ORDER: Bucket[] = ['today', 'yesterday', 'earlier'];
const LABELS: Record<Bucket, string> = { today: 'TODAY', yesterday: 'YESTERDAY', earlier: 'EARLIER' };

const bucketOf = (item: JobHistoryItem, now: Date): Bucket => {
  const when = item.deliveredAt ?? item.createdAt;
  if (isSameLocalDay(when, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(when, yesterday)) return 'yesterday';
  return 'earlier';
};

const byNewest = (a: JobHistoryItem, b: JobHistoryItem) => new Date(b.deliveredAt ?? b.createdAt).getTime() - new Date(a.deliveredAt ?? a.createdAt).getTime();

/** Figma job-history "Task History": TODAY / YESTERDAY (+ EARLIER) sections of delivered / failed tasks. */
export default function TasksScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useJobHistory();
  const [invoices, setInvoices] = useState(false);

  const sections = useMemo(() => {
    const now = new Date();
    const groups: Record<Bucket, JobHistoryItem[]> = { today: [], yesterday: [], earlier: [] };
    for (const item of data?.items ?? []) groups[bucketOf(item, now)].push(item);
    return ORDER.filter((k) => groups[k].length).map((k) => ({ key: k, title: LABELS[k], data: groups[k].sort(byNewest) }));
  }, [data]);

  return (
    <Screen padded={false} footer={<SecondaryButton label="VIEW PAST MONTH INVOICES" onPress={() => setInvoices(true)} />} footerStyle={styles.footer}>
      <View style={styles.header}>
        <AppHeader title="Task History" backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />
      </View>

      {isLoading && !data ? (
        <LoadingState label="Loading task history…" />
      ) : error && !data ? (
        <ErrorState title="Couldn't load task history" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <JobCard item={item} onPress={(j) => router.push(`/tasks/${j.id}` as never)} />}
          renderSectionHeader={({ section }) => (
            <AppText variant="chip" color="textSecondary" style={styles.sectionTitle}>
              {section.title}
            </AppText>
          )}
          renderSectionFooter={() => <SectionGap />}
          ItemSeparatorComponent={RowGap}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, sections.length === 0 && styles.listEmpty]}
          ListEmptyComponent={<EmptyState icon="briefcase" title="No deliveries yet" body="Completed and failed tasks will show up here once you finish a delivery." actionLabel="Refresh" onAction={() => void refetch()} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.ink} colors={[colors.ink]} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ConfirmationSheet
        visible={invoices}
        onClose={() => setInvoices(false)}
        icon="file-text"
        title="Monthly invoices"
        body="Coming soon. Your weekly statement PDF is available under Earnings."
        confirmLabel="VIEW WEEKLY STATEMENT"
        cancelLabel="CLOSE"
        onConfirm={() => {
          setInvoices(false);
          router.push('/earnings/week' as never);
        }}
      />
    </Screen>
  );
}

const RowGap = () => <View style={styles.rowGap} />;
const SectionGap = () => <View style={styles.sectionGap} />;

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.gutter },
  list: { padding: spacing.x3l, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  sectionTitle: { paddingBottom: spacing.base },
  rowGap: { height: spacing.base },
  sectionGap: { height: spacing.xxl },
  footer: { paddingBottom: spacing.md },
});
