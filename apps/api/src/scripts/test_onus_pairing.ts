/** Regression: yesterday's credit must not be paired with today's MWPAY- row (24 Nov 2026). Run: npm run test:onus */
import assert from 'assert';
import { pairingWindowOk } from '../services/internalTransferMatch.service';

const row = '2026-11-24T07:35:33.203Z'; // MWPAY-b9cb588f booked
// The real credit, seconds before the row was booked → pairable.
assert(pairingWindowOk('2026-11-24T07:35:30.437Z', row));
// Slow confirmation: row booked an hour after the transfer → still pairable.
assert(pairingWindowOk('2026-11-24T06:35:00Z', row));
// Yesterday's subscription credit (the one that wrongly consumed the row) → NOT pairable.
assert(!pairingWindowOk('2026-11-23T06:51:18.121Z', row));
// A row booked BEFORE the transaction happened can't represent it (beyond clock skew).
assert(!pairingWindowOk('2026-11-24T09:00:00Z', row));
// Missing timestamps → old amount-only behaviour.
assert(pairingWindowOk(undefined, row));
console.log('on-us pairing tests passed');
