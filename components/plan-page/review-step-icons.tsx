import type { ReactNode, SVGProps } from 'react';
import type { ReviewAction } from '@/lib/plan-review';

// Duotone step icons for the review trail: a soft filled shape (currentColor at low opacity) under crisp
// strokes, so they read on the solid latest-step circle (white) and on the pale tinted ones (coloured).
const SOFT = 0.3;

function Duo({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

/** Data Entry sends the component to its Director: a form going out. */
function FormSent(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <path d="M7 3h6.5L18 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity={SOFT} stroke="none" />
    <path d="M7 3h6.5L18 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M13.5 3v3a1.5 1.5 0 0 0 1.5 1.5h3" />
    <path d="M8.5 15h6M12.5 12.5 15 15l-2.5 2.5" />
  </Duo>;
}

/** A Director endorses it to the BEAP Chair: an approval stamp. */
function Stamp(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <path d="M9.5 3.5a2.5 2.5 0 0 1 5 0v3.2l1.3 4.8H8.2l1.3-4.8V3.5Z" fill="currentColor" fillOpacity={SOFT} stroke="none" />
    <path d="M9.5 3.5a2.5 2.5 0 0 1 5 0v3.2l1.3 4.8H8.2l1.3-4.8V3.5Z" />
    <rect x="4" y="11.5" width="16" height="5" rx="1.5" fill="currentColor" fillOpacity={SOFT + 0.15} />
    <path d="M5 20.5h14" />
  </Duo>;
}

/** The BEAP Chair forwards the collated plan to the Executive Chairman: a stack handed up. */
function StackUp(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <rect x="8.5" y="2.5" width="11" height="14" rx="2" fill="currentColor" fillOpacity={SOFT} stroke="none" />
    <path d="M10.5 2.5h7a2 2 0 0 1 2 2v10" />
    <rect x="4.5" y="6.5" width="11" height="15" rx="2" fill="currentColor" fillOpacity={SOFT * 0.6} />
    <path d="M7.5 17.5 12.5 12.5M9.5 12.5h3v3" />
  </Duo>;
}

/** Someone asks for changes: a document sent back. */
function ReturnDoc(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <path d="M7 3h6.5L18 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity={SOFT} stroke="none" />
    <path d="M7 3h6.5L18 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M13.5 3v3a1.5 1.5 0 0 0 1.5 1.5h3" />
    <path d="M10.5 10 8.5 12l2 2M8.5 12h4.5a2.25 2.25 0 0 1 0 4.5h-1.5" />
  </Duo>;
}

/** UBEC approves the plan: a seal with a check. */
function Seal(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <path d="m12 2.5 2.1 1.5 2.6-.1.8 2.5 2.1 1.5-.8 2.5.8 2.5-2.1 1.5-.8 2.5-2.6-.1L12 18.7l-2.1-1.4-2.6.1-.8-2.5-2.1-1.5.8-2.5-.8-2.5L6.5 6.4l.8-2.5 2.6.1L12 2.5Z" fill="currentColor" fillOpacity={SOFT} />
    <path d="m8.8 10.8 2.2 2.2 4.2-4.3" />
    <path d="m8 17.5-1.5 4 2.5-1 1.5 2M16 17.5l1.5 4-2.5-1-1.5 2" />
  </Duo>;
}

/** Plan details were edited: a document and a pencil. */
function EditDoc(props: SVGProps<SVGSVGElement>) {
  return <Duo {...props}>
    <path d="M6 3h6.5L17 7.5V11L11 17l-.5 4H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity={SOFT} stroke="none" />
    <path d="M17 9.5v-2L12.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
    <path d="M12.5 3v3A1.5 1.5 0 0 0 14 7.5h3" />
    <path d="m14 20.5-1.5.4.4-1.5 6-6a1.1 1.1 0 0 1 1.6 1.6l-6.5 6.5Z" fill="currentColor" fillOpacity={SOFT + 0.25} />
  </Duo>;
}

export const reviewStepIcons: Record<ReviewAction, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  submit: FormSent, endorse: Stamp, forward: StackUp, request_changes: ReturnDoc, approve: Seal, edit: EditDoc,
};
