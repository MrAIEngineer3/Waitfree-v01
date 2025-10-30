import { ulid } from 'ulid';

export const generatePatientId = (): string => {
  return ulid();
};
