export interface Column<T> {
  id: Extract<keyof T, string>;
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: number) => string;
  formatDate?: (value: string) => string;
  formatMonth?: (value: string) => string;
  formatPercentage?: (value: number) => string;
}
