// Section explanations (the small notes under each chart and list) start folded behind a one-line
// "How this works" button that opens and closes them in place. Notes that widgets render later are
// folded too (watched with a MutationObserver); consecutive notes share one button.
(function () {
  'use strict';
  const SEL = '.ytt-foot, .ymu-foot, .nw-foot';
  let n = 0;
  function fold(note) {
    if (note.closest('.lp-note')) return;
    const group = [note];
    for (let s = note.nextElementSibling; s && s.matches(SEL); s = s.nextElementSibling) group.push(s);
    const box = document.createElement('div');
    box.className = 'lp-note';
    const body = document.createElement('div');
    body.className = 'lp-note-body';
    body.id = `lp-note-${++n}`;
    body.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lp-note-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', body.id);
    btn.innerHTML = '<span class="lp-note-i" aria-hidden="true">i</span><span>How this works</span>';
    btn.addEventListener('click', () => {
      body.hidden = !body.hidden;
      btn.setAttribute('aria-expanded', String(!body.hidden));
    });
    note.before(box);
    box.append(btn, body);
    body.append(...group);
  }
  const scan = () => document.querySelectorAll(SEL).forEach(fold);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
