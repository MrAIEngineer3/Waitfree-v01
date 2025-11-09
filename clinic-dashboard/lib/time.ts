import { format } from 'date-fns';

const DATE_KEY_FORMAT = 'yyyy-MM-dd';

export const formatDateKey = (value: Date): string => {
  return format(value, DATE_KEY_FORMAT);
};
