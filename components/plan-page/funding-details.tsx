'use client';

import { amountFormat } from '@/components/dashboard/plan-figures';
import { DocumentFiles } from '@/components/document-files';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import { otherFundingTotal, type PlanSetup } from '@/lib/plan-setup';

type Source = { key: string; label: string; amount: number; tone: string; info?: boolean };

/**
 * Funding details for the plan summary card: where the money comes from (state, UBEC match, other funding)
 * as one split bar with its legend, and the assessment documents. The total is the
 * summary's headline figure, so it is not repeated here.
 */
export function FundingDetails({ setup }: { setup: Partial<PlanSetup> }) {
  const state = Number(setup.stateLodgment ?? 0), other = Number(otherFundingTotal(setup));
  const sources: Source[] = [
    { key: 'state', label: 'State contribution', amount: state, tone: 'var(--primary)' },
    { key: 'ubec', label: 'UBEC match', amount: state, tone: '#2c7a5e' },
    { key: 'other', label: 'Other funding', amount: other, tone: '#a9d05a', info: true },
  ];
  const total = sources.reduce((sum, source) => sum + source.amount, 0);
  const share = (amount: number) => total > 0 ? Math.round(amount / total * 100) : 0;
  const documents = (setup.documents ?? []).map(document => ({ ...document, url: `/api/plans/documents?id=${document.id}` }));

  return <div className="funding-details">
    <section aria-labelledby="funding-sources-title">
      <h3 id="funding-sources-title">Where the funding comes from</h3>
      {total > 0 && <div className="funding-split" role="img" aria-label={sources.map(source => `${source.label} ${share(source.amount)}%`).join(', ')}>
        {sources.filter(source => source.amount > 0).map(source => <span key={source.key} style={{ flexGrow: source.amount, background: source.tone }} />)}
      </div>}
      <dl className="funding-legend">
        {sources.map(source => <div key={source.key}>
          <dt><span className="funding-swatch" style={{ background: source.tone }} aria-hidden="true" />{source.label}{source.info && source.amount > 0 && <OtherFundingInfo setup={setup} />}</dt>
          <dd><b>{amountFormat.format(source.amount)}</b><small>{share(source.amount)}%</small></dd>
        </div>)}
      </dl>
    </section>
    <section aria-labelledby="funding-documents-title">
      <h3 id="funding-documents-title">Documents</h3>
      {documents.length ? <DocumentFiles compact documents={documents} /> : <p className="funding-none">No assessment documents attached.</p>}
    </section>
  </div>;
}
