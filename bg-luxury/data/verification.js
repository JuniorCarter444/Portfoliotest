// Driver questions and documents BG LUX needs before a security deposit is taken.
// Shared by the server (validation) and the browser (to build the forms) via /api/verification-config.

const questions = [
  { id: 'age', label: 'Age', type: 'number', min: 18, max: 99 },
  { id: 'licenceHeld', label: 'How long have you held your driving licence?', type: 'select',
    options: ['Less than 1 year', '1–2 years', '2–3 years', '3–5 years', '5–10 years', 'Over 10 years'] },
  { id: 'points', label: 'Do you currently have any points or endorsements on your licence?', type: 'yesno', callIfYes: true },
  { id: 'disqualified', label: 'Have you ever been disqualified from driving?', type: 'yesno', callIfYes: true },
  { id: 'insuredOther', label: 'Are you currently insured for another vehicle?', type: 'yesno' },
  { id: 'thirdParty', label: 'Does your current insurance policy allow you to drive other vehicles on a third-party basis?', type: 'yesno' },
  { id: 'claims', label: 'Have you had any previous insurance claims, cancellations or refusals?', type: 'yesno', callIfYes: true }
];

const documents = [
  { id: 'licenceFront', short: 'Licence (front)', label: 'Driving licence (front)', accept: 'image' },
  { id: 'licenceBack', short: 'Licence (back)', label: 'Driving licence (back)', accept: 'image' },
  { id: 'bankStatement', short: 'Bank statement', label: 'Bank statement (PDF from online banking, dated within the last 2 months)', accept: 'pdf' },
  { id: 'utilityBill', short: 'Utility bill', label: 'Recent utility bill', accept: 'any' },
  { id: 'proofOfAddress', short: 'Extra proof of address', label: 'Additional proof of address (e.g. a letter from an official body)', accept: 'any' }
];

const MIME = {
  image: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  pdf: ['application/pdf']
};
MIME.any = [...MIME.image, ...MIME.pdf];

// UK National Insurance number, e.g. QQ 12 34 56 C (spaces optional).
const NI_RE = /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/i;

// Returns { answers, flags } or { error }.
function checkAnswers(input = {}) {
  const answers = {};
  const flags = [];
  for (const q of questions) {
    const v = String(input[q.id] ?? '').trim();
    if (q.type === 'number') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < q.min || n > q.max) return { error: `Please enter a valid ${q.label.toLowerCase()}.` };
      answers[q.id] = n;
    } else if (q.type === 'select') {
      if (!q.options.includes(v)) return { error: `Please answer: ${q.label}` };
      answers[q.id] = v;
    } else {
      if (v !== 'yes' && v !== 'no') return { error: `Please answer: ${q.label}` };
      answers[q.id] = v;
      if (q.callIfYes && v === 'yes') flags.push(q.label);
    }
  }
  return { answers, flags };
}

module.exports = { questions, documents, MIME, NI_RE, checkAnswers };
