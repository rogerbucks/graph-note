// A model's row of the destination matrix (editor spec §19, model_ceiling): a first outline with no behaviour yet, so the
// tests that come before the code fail on what they check, not on a missing file.
export type Mark = 'yes' | 'conditional' | 'no';
export interface MatrixCell {
  class: string;
  mark: Mark;
  condition?: string;
}
export interface MatrixRow {
  name: string;
  cells: MatrixCell[];
}
export type ClassGrant = Record<string, never>;
export const matchClass = (_name: string, _levels: string[], _map: Record<string, string>): string | null => null;
export const matrixGrants = (): never[] => [];
export const unmatchedClasses = (): string[] => [];
export const classMapFrom = (_text: string): Record<string, string> => ({});
export const classMapText = (_map: Record<string, string>): string => '';
