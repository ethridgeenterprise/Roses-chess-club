(() => {
  if(document.getElementById('playComputerLink')) return;
  const section = document.createElement('section');
  section.className = 'panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Practice';
  heading.style.marginTop = '0';
  const link = document.createElement('a');
  link.id = 'playComputerLink';
  link.href = '/computer.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Play computer';
  link.style.cssText =
    'display:inline-block;background:#c4b69c;color:#211f1b;' +
    'padding:12px 18px;border-radius:8px;font-weight:700;text-decoration:none';
  const note = document.createElement('p');
  note.className = 'small';
  note.textContent = 'Easy, Medium, or Hard · Unrated · Opens in a new tab';
  section.append(heading,link,note);
  document.getElementById('lobby').before(section);
})();
