import { DateTime } from 'luxon';

import type { DayOfWeek, TimeBlock } from './types';

export const TIME_BLOCK_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ParsedTimeRange {
  startMinutes: number;
  endMinutes: number;
  block: TimeBlock;
}

const normalizeTimePart = (value: number): string => value.toString().padStart(2, '0');

const formatMinutesAsTime = (minutes: number): string => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${normalizeTimePart(hour)}:${normalizeTimePart(minute)}`;
};

export const parseTime = (value: string): { hour: number; minute: number } | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const match = TIME_BLOCK_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
};

export const toMinutes = (time: { hour: number; minute: number }): number => time.hour * 60 + time.minute;

export const parseTimeBlock = (block: TimeBlock): ParsedTimeRange | null => {
  const start = parseTime(block.start);
  const end = parseTime(block.end);
  if (!start || !end) {
    return null;
  }
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) {
    return null;
  }
  return {
    startMinutes,
    endMinutes,
    block: {
      start: formatMinutesAsTime(startMinutes),
      end: formatMinutesAsTime(endMinutes),
      label: block.label ?? null
    }
  };
};

export const sortAndValidateDayBlocks = (blocks: TimeBlock[]): ParsedTimeRange[] | null => {
  const parsed = blocks
    .map((block) => parseTimeBlock(block))
    .filter((value): value is ParsedTimeRange => value !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (parsed.length !== blocks.length) {
    return null;
  }

  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].startMinutes < parsed[i - 1].endMinutes) {
      return null;
    }
  }

  return parsed;
};

export const normalizeWeekDefinition = (
  week: Partial<Record<DayOfWeek, TimeBlock[]>>
): Partial<Record<DayOfWeek, TimeBlock[]>> | null => {
  const normalized: Partial<Record<DayOfWeek, TimeBlock[]>> = {};

  for (const entry of Object.entries(week)) {
    const key = entry[0] as DayOfWeek;
    const blocks = entry[1];
    if (!Array.isArray(blocks)) {
      return null;
    }
    const parsed = sortAndValidateDayBlocks(blocks);
    if (!parsed) {
      return null;
    }
    normalized[key] = parsed.map((range) => range.block);
  }

  return normalized;
};

export const isValidDayKey = (key: string): key is DayOfWeek => {
  return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(key);
};

export const filterValidDays = (
  week: Partial<Record<string, TimeBlock[]>>
): Partial<Record<DayOfWeek, TimeBlock[]>> => {
  const result: Partial<Record<DayOfWeek, TimeBlock[]>> = {};
  for (const [key, value] of Object.entries(week)) {
    if (isValidDayKey(key) && Array.isArray(value)) {
      result[key] = value;
    }
  }
  return result;
};

export const ensureValidTimeZone = (timeZone: string): boolean => {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
    return false;
  }
  const probe = DateTime.now().setZone(timeZone, { keepLocalTime: false });
  return probe.isValid;
};
