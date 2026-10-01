import { z } from 'zod';
import { formatQuarters } from './format-quarters';

const year = z.number().int().min(2004).max(2100);
export const implementationYearError = (fundingYear: number, implementationYear: number) => Number.isInteger(fundingYear) && Number.isInteger(implementationYear) && implementationYear < fundingYear ? `Implementation year can't be earlier than the funding year (${fundingYear}).` : '';
const amount = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, 'Enter an amount below ₦10 trillion, with up to two decimal places.');
export const planSetupSchema = z.object({
  planningYear: year,
  implementationYear: year,
  quarters: z.array(z.number().int().min(1).max(4)).min(1, 'Select at least one quarter.').max(4)
    .refine(q => new Set(q).size === q.length, 'Do not repeat quarters.').transform(q=>[...q].sort()),
  stateLodgment: amount,
  otherFunding: amount,
}).strict().superRefine((p, ctx) => { const message = implementationYearError(p.planningYear, p.implementationYear); if (message) ctx.addIssue({code:'custom',message,path:['implementationYear']}); })
  .refine(p => Number(p.stateLodgment)*2+Number(p.otherFunding)>0, {message:'Enter funding greater than zero.',path:['stateLodgment']});

export function fundingTotal(lodgment: string, other: string) {
  const hundred = BigInt(100);
  const cents = (value: string) => {const [whole, fraction=''] = value.split('.');return BigInt(whole||'0')*hundred+BigInt(fraction.padEnd(2,'0'));};
  const total = cents(lodgment)*BigInt(2)+cents(other);
  return `${total/hundred}.${String(total%hundred).padStart(2,'0')}`;
}
export function beapName(state: string, year: number, quarters: number[]) {
  return `${state.replace(/ State$/, '').replace(/\s+/g,'')}-${year}-${formatQuarters(quarters)}-BEAP`;
}
export type PlanDocument = {id:string;name:string;size:number};
export type PlanSetup = {
  fundingPolicy?: import('./funding-policy').FundingPolicy;
  implementationYear: number | null; fundingQuarters: number[] | null;
  stateLodgment: string | null; otherFunding: string | null; fundingTotal: string | null;
  beapName: string | null; documents: PlanDocument[];
};
export const maxRatFileBytes = 5 * 1024 * 1024;
export const maxRatTotalBytes = 10 * 1024 * 1024;
export const ratFileAccept = '.xlsx';
export const isRatSpreadsheet = (name: string) => name.toLowerCase().endsWith(ratFileAccept);
