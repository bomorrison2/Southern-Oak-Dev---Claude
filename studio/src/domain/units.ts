/**
 * Unit handling. Storage is ALWAYS metric (metres, square metres); these
 * helpers convert only at the presentation boundary.
 */
import type { Units } from './types';

export const FEET_PER_METRE = 3.280839895013123;
export const SQFT_PER_SQM = 10.763910416709722;

export function metresToDisplay(m: number, units: Units): number {
  return units === 'ft' ? m * FEET_PER_METRE : m;
}

export function displayToMetres(v: number, units: Units): number {
  return units === 'ft' ? v / FEET_PER_METRE : v;
}

export function sqmToDisplay(sqm: number, units: Units): number {
  return units === 'ft' ? sqm * SQFT_PER_SQM : sqm;
}

export function displayToSqm(v: number, units: Units): number {
  return units === 'ft' ? v / SQFT_PER_SQM : v;
}

export function lengthUnitLabel(units: Units): string {
  return units === 'ft' ? 'ft' : 'm';
}

export function areaUnitLabel(units: Units): string {
  return units === 'ft' ? 'sq ft' : 'm2';
}

/** Format a length for display, converted from metres. */
export function formatLength(m: number, units: Units, dp = 1): string {
  const v = metresToDisplay(m, units);
  return `${v.toFixed(dp)} ${lengthUnitLabel(units)}`;
}

/** Format an area for display, converted from square metres. */
export function formatArea(sqm: number, units: Units): string {
  const v = sqmToDisplay(sqm, units);
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded.toLocaleString('en-GB')} ${areaUnitLabel(units)}`;
}

/** Hectares are useful for plots; always derived from metric storage. */
export function formatHectares(sqm: number): string {
  return `${(sqm / 10000).toFixed(2)} ha`;
}
