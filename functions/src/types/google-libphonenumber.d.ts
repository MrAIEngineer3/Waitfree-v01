declare module 'google-libphonenumber' {
  export enum PhoneNumberFormat {
    E164 = 0,
    INTERNATIONAL = 1,
    NATIONAL = 2,
    RFC3966 = 3
  }

  export type PhoneNumber = unknown;

  export class PhoneNumberUtil {
    static getInstance(): PhoneNumberUtil;
    parseAndKeepRawInput(number: string, region: string): PhoneNumber;
    isValidNumber(number: PhoneNumber): boolean;
    isValidNumberForRegion(number: PhoneNumber, regionCode: string): boolean;
    format(number: PhoneNumber, format: PhoneNumberFormat): string;
  }
}
