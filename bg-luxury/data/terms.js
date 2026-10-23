// BG LUX rental terms, shown on the site, in the booking form and on the deposit page.
// Wording is as supplied by BG LUX. When you change it, bump VERSION: every acceptance records
// the version and a fingerprint (hash) of the exact text the customer agreed to.
const crypto = require('crypto');

const VERSION = '2026-10-22';

const terms = {
  version: VERSION,
  houseRules: 'Rental (NO SMOKING 🚬 🚫, Eating or Drinking 🥤 or Doing balloons 🎈)',
  keyPoints: [
    '£1k-10k deposit to be refunded 3weeks after the return of vehicle, ensures the vehicle is clear of any fines/tickets. (£40 collection £40 delivery fee)',
    'Excess for any incident is £2,000 plus £450 for the loss of insurance, you must report any incident immediately to minimise further problems.',
    'Please note: Administration fee for each letter recieved for any vehicle is £50 additional to any other cost/fines mentioned in the letter.'
  ],
  rules: [
    'Send a clear photo of the front and the back of your drivers license along with your National insurance number.',
    'Take photos/video of the vehicle inside interior the outside front, left, right and back.',
    'Report any existing damages or faults immediately to avoid liability resulting in charges.',
    'Return the vehicle with the same fuel level as it was when collected, failure to comply is £50 fine plus the cost to replace the fuel (receipt will be sent to you).',
    'Pay your congestion charge if you enter the congestion zone areas, failure to comply is £50 fine plus the congestion fine amount.',
    'Pay your parking tickets, failure to comply is £50 plus the parking ticket fine amount.',
    'No smoking in the car, failure to comply is £100 fine plus £250 for full car valet.',
    'Any damages to the rims will cost £250 or more per rim. Tyre damage £350 or more per tyre',
    'Return the vehicle in a moderate clean state, failure to comply is £100 plus £250 full valet cost.',
    'All cars come with x1 usb cable x1 usb c cable, x1 dual car charging adapter, failure to return each item is £100 each.',
    'No doing balloons/Nitrous oxide gas in the vehicle, any evidence of such activity will result in a loss of your full deposit.',
    'No travelling outside of the UK without authorisation, failure to comply will result in a fine of £1000.',
    'Only the verified/permitted driver is allowed to drive the car failure to comply or request for permission for others will result in the loss of your full deposit.',
    'You are not allowed to owe more than £300 in fines or tickets, payment must be made immediately or your rental will be terminated.',
    'You may be contacted at anytime during your trip, failure to respond without an applaudable reason will result in the vehicle being immobilised.',
    'All vehicles have a 100miles a day limit (£1 per extra mile), unlimited miles can be requested, feel free to ask your host.'
  ],
  signOff: 'Drive In Style! BG Luxury Cars.'
};

const plainText = [terms.houseRules, ...terms.keyPoints.map((p) => `* ${p}`), ...terms.rules.map((r, i) => `${i + 1}. ${r}`), terms.signOff].join('\n');
terms.hash = crypto.createHash('sha256').update(plainText).digest('hex');

module.exports = terms;
