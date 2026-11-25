import { esc, kwacha2, para, personalLayout, statRow } from './emailPersonal';

/**
 * Requisition emails, written to one person. The same requisition says different things to the person who asked for the money
 * ("Your request was approved") and to the people who have to act on it ("Mary needs your OK").
 */
export type ReqEventType =
    | 'NEW_REQUISITION' | 'REQUISITION_APPROVED' | 'REQUISITION_REJECTED' | 'CASH_DISBURSED' | 'CHANGE_SUBMITTED' | 'REQUISITION_COMPLETED';

export interface ReqCtx {
    ref: string;
    description: string;
    total: number;
    requestor: string;          // first name of whoever asked for the money
    personal: boolean;
    moneywisePay: boolean;
    link: string;
}

export function requisitionEmail(type: ReqEventType, c: ReqCtx, firstName: string | null): { subject: string; html: string } | null {
    const hi = (rest: string) => (firstName ? `${firstName}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
    const what = esc(c.description || 'a payment');
    const amount = kwacha2(c.total);
    const card = (rows: { label: string; value: string; tone?: 'good' | 'bad' | 'plain' }[]) => statRow(rows);
    const make = (o: { preheader: string; heading: string; body: string; cta: string; reason: string }) =>
        personalLayout({ preheader: o.preheader, heading: o.heading, firstName, bodyHtml: o.body, cta: { label: o.cta, url: c.link }, reason: o.reason });

    switch (type) {
        case 'NEW_REQUISITION':
            return {
                subject: hi(`${c.requestor} needs your OK for ${amount}`),
                html: make({
                    preheader: `${c.requestor} is asking for ${amount} for ${c.description}`,
                    heading: `${esc(c.requestor)} is asking for ${amount}`,
                    body: para(`For <strong>${what}</strong>. Nothing moves until someone approves it.`) + card([{ label: 'Amount', value: amount }, { label: 'Reference', value: c.ref }]),
                    cta: 'Review the request',
                    reason: 'You get this because you can approve requests in this workspace.',
                }),
            };
        case 'REQUISITION_APPROVED':
            return {
                subject: hi(`your request for ${amount} was approved`),
                html: make({
                    preheader: 'You will hear again as soon as the money is ready.',
                    heading: `Good news: ${amount} for ${what} was approved`,
                    body: para('The next step is getting the money to you. We will let you know when it is ready.'),
                    cta: 'Track it',
                    reason: 'You get this because you made this request.',
                }),
            };
        case 'REQUISITION_REJECTED':
            return {
                subject: hi(`your request for ${amount} was not approved`),
                html: make({
                    preheader: 'Open it to see the details or ask again.',
                    heading: `Your request for ${what} was not approved`,
                    body: para('This time it was declined. You can open the request to see why, or send a new one with changes.'),
                    cta: 'See the details',
                    reason: 'You get this because you made this request.',
                }),
            };
        case 'CASH_DISBURSED':
            if (c.personal) {
                return {
                    subject: hi(`${amount} is on its way`),
                    html: make({
                        preheader: c.description,
                        heading: `${amount} has been sent`,
                        body: para(`Your payment for <strong>${what}</strong> has gone out.`) + card([{ label: 'Sent', value: amount, tone: 'good' }]),
                        cta: 'See the payment',
                        reason: 'You get this because you sent this payment.',
                    }),
                };
            }
            if (c.moneywisePay) {
                return {
                    subject: hi(`${amount} has landed in your MoneyWise account`),
                    html: make({
                        preheader: `For ${c.description}`,
                        heading: `${amount} is in your MoneyWise account`,
                        body: para(`It was sent for <strong>${what}</strong>. You can use it straight away.`),
                        cta: 'Open my account',
                        reason: 'You get this because you made this request.',
                    }),
                };
            }
            return {
                subject: hi(`your ${amount} is ready to collect`),
                html: make({
                    preheader: 'Collect it at the cashier’s desk, then confirm in the app.',
                    heading: `Your ${amount} is ready at the cashier’s desk`,
                    body: para(`It is for <strong>${what}</strong>. After you collect it, please confirm in the app so the books stay right.`),
                    cta: 'Confirm collection',
                    reason: 'You get this because you made this request.',
                }),
            };
        case 'CHANGE_SUBMITTED':
            return {
                subject: hi(`${c.requestor} has returned the change`),
                html: make({
                    preheader: `Count it and close off ${c.ref}`,
                    heading: `${esc(c.requestor)} handed back the unused cash`,
                    body: para(`They have submitted what they spent on <strong>${what}</strong>. Please count what came back and finish the entry.`),
                    cta: 'Verify and finish',
                    reason: 'You get this because you handle cash in this workspace.',
                }),
            };
        case 'REQUISITION_COMPLETED':
            return {
                subject: hi(`all done: ${c.description || c.ref}`),
                html: make({
                    preheader: 'Everything has been checked and recorded.',
                    heading: `${what} is closed off`,
                    body: para('The spending was checked and recorded. Nothing more for you to do.'),
                    cta: 'See the final record',
                    reason: 'You get this because you made this request.',
                }),
            };
    }
    return null;
}
