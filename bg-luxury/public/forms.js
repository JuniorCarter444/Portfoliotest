// Shared form pieces: driver questions, the rental terms box, document uploads and validation.
// Used by the booking form (index.html), verify.html and deposit.html.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function termsHtml(t) {
    return `
      <p class="terms-house">${esc(t.houseRules)}</p>
      <ul class="terms-key">${t.keyPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <ol class="terms-rules">${t.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      <p class="terms-sign">${esc(t.signOff)}</p>
      <p class="terms-meta">Terms version ${esc(t.version)}</p>`;
  }

  function questionsHtml(questions) {
    return questions.map((q) => {
      let input;
      if (q.type === 'yesno') {
        input = `<div class="opts">${['yes', 'no'].map((v) => `<label class="opt"><input type="radio" name="q_${q.id}" value="${v}" required><span>${v === 'yes' ? 'Yes' : 'No'}</span></label>`).join('')}</div>`;
      } else if (q.type === 'select') {
        input = `<select name="q_${q.id}" required aria-label="${esc(q.label)}"><option value="">Select…</option>${q.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
      } else {
        input = `<input type="number" name="q_${q.id}" min="${q.min}" max="${q.max}" inputmode="numeric" required aria-label="${esc(q.label)}">`;
      }
      const note = q.callIfYes ? '<p class="q-note" hidden>Please call us to provide details. You can still continue.</p>' : '';
      return `<fieldset class="q" data-q="${esc(q.id)}"><legend>${esc(q.label)}</legend>${input}${note}</fieldset>`;
    }).join('');
  }

  // Shows the "please call us" note under yes/no questions that need a call.
  function wireQuestionNotes(root) {
    root.addEventListener('change', (e) => {
      const fs = e.target.closest('.q');
      const note = fs && fs.querySelector('.q-note');
      if (note) note.hidden = e.target.value !== 'yes';
    });
  }

  function readAnswers(form, questions) {
    const answers = {};
    let firstBad = null;
    for (const q of questions) {
      const fs = form.querySelector(`.q[data-q="${q.id}"]`);
      const value = q.type === 'yesno' ? form.querySelector(`[name="q_${q.id}"]:checked`)?.value : form.querySelector(`[name="q_${q.id}"]`).value.trim();
      const bad = !value || (q.type === 'number' && (Number(value) < q.min || Number(value) > q.max));
      fs.classList.toggle('invalid', bad);
      if (bad && !firstBad) firstBad = fs;
      answers[q.id] = value;
    }
    return { answers, firstBad };
  }

  const UPLOAD_ICON = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></svg>';
  const ACCEPT = { image: 'image/jpeg,image/png,image/heic,image/heif,image/webp', pdf: 'application/pdf', any: 'image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf' };
  const HINT = { image: 'Photo: JPG, PNG or HEIC', pdf: 'PDF only', any: 'Photo or PDF' };

  function uploadsHtml(documents, uploaded = []) {
    return documents.map((d) => {
      const done = uploaded.includes(d.id);
      return `<label class="upload${done ? ' done' : ''}" data-doc="${esc(d.id)}">
        ${UPLOAD_ICON}
        <span><b>${esc(d.label)}</b><small data-hint>${done ? 'Uploaded. Choose a file to replace it.' : `${HINT[d.accept]}, up to 10 MB`}</small></span>
        <input type="file" name="${esc(d.id)}" accept="${ACCEPT[d.accept]}" ${done ? '' : 'required'}>
      </label>`;
    }).join('');
  }

  function wireUploads(root) {
    root.addEventListener('change', (e) => {
      const box = e.target.closest('.upload');
      if (!box || e.target.type !== 'file') return;
      const f = e.target.files[0];
      box.classList.toggle('done', Boolean(f));
      box.classList.remove('invalid');
      if (f) box.querySelector('[data-hint]').textContent = `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`;
      if (f && f.size > 10 * 1048576) {
        box.classList.add('invalid');
        box.querySelector('[data-hint]').textContent = 'This file is over 10 MB. Please choose a smaller one.';
      }
    });
  }

  // Highlights empty required fields and returns the first one, or null if the form is complete.
  function firstInvalid(form) {
    let first = null;
    form.querySelectorAll('input[required], select[required], textarea[required]').forEach((el) => {
      if (el.type === 'radio') return; // handled by readAnswers
      const bad = el.type === 'checkbox' ? !el.checked : el.type === 'file' ? !el.files.length : !el.checkValidity() || !el.value.trim();
      (el.type === 'file' ? el.closest('.upload') : el).classList.toggle('invalid', bad);
      if (bad && !first) first = el.type === 'file' ? el.closest('.upload') : el;
    });
    return first;
  }

  // Clears a field's error highlight as soon as the customer changes it.
  document.addEventListener('input', clearInvalid);
  document.addEventListener('change', clearInvalid);
  function clearInvalid(e) {
    const el = e.target;
    if (!el.closest || !el.closest('form')) return;
    el.classList.remove('invalid');
    el.closest('.q, .upload')?.classList.remove('invalid');
  }

  window.BGForms = { esc, termsHtml, questionsHtml, wireQuestionNotes, readAnswers, uploadsHtml, wireUploads, firstInvalid };
})();
