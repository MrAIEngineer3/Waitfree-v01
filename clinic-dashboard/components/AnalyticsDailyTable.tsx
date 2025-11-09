"use client";

import { format } from 'date-fns';
import { useMemo } from 'react';

import type { DailyAnalyticsRecord } from '@/types/analytics';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from './ui/Table';
import { Skeleton } from './ui/skeleton';

const toDisplayDate = (record: DailyAnalyticsRecord): string => {
  if (record.date) {
    return format(record.date, 'EEE, MMM d, yyyy');
  }
  return record.queueId;
};

const formatCount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString();
};

const formatMinutesCell = (value: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)} min`;
};

const formatCounterSource = (value: DailyAnalyticsRecord['counterSource']) => {
  return value === 'queue' ? 'Queue counters' : 'Patient recount';
};

const formatMetricsSource = (value: DailyAnalyticsRecord['metricsSource']) => {
  return value === 'queue' ? 'Queue metrics' : 'Patient samples';
};

interface AnalyticsDailyTableProps {
  records: DailyAnalyticsRecord[] | undefined;
  isLoading: boolean;
}

export function AnalyticsDailyTable({ records, isLoading }: AnalyticsDailyTableProps) {
  const sortedRecords = useMemo(() => {
    if (!records) {
      return [] as DailyAnalyticsRecord[];
    }
    return [...records].sort((a, b) => {
      const aTime = a.date?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bTime = b.date?.getTime() ?? Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });
  }, [records]);

  if (!isLoading && sortedRecords.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No analytics found for the selected range.
      </div>
    );
  }

  const loadingRows = Array.from({ length: 5 }, (_, index) => index);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>Cancelled</TableHead>
            <TableHead>Avg Wait</TableHead>
            <TableHead>Avg Service</TableHead>
            <TableHead>Counters</TableHead>
            <TableHead>Metrics</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? loadingRows.map((row) => (
                <TableRow key={`loading-${row}`}>
                  {Array.from({ length: 8 }).map((_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : sortedRecords.map((record) => (
                <TableRow key={record.queueId}>
                  <TableCell className="font-medium">{toDisplayDate(record)}</TableCell>
                  <TableCell>{formatCount(record.totalPatients)}</TableCell>
                  <TableCell>{formatCount(record.completedPatients)}</TableCell>
                  <TableCell>{formatCount(record.cancelledPatients)}</TableCell>
                  <TableCell>{formatMinutesCell(record.avgWaitMinutes)}</TableCell>
                  <TableCell>{formatMinutesCell(record.avgServiceMinutes)}</TableCell>
                  <TableCell>{formatCounterSource(record.counterSource)}</TableCell>
                  <TableCell>{formatMetricsSource(record.metricsSource)}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
