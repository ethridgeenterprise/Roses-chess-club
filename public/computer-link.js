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
  section.id = 'clubPractice';
  function placePractice(){
    const sidebar = document.getElementById('clubSidebar');
    if(!sidebar) return;
    const challenges = document.getElementById('clubChallenges');
    const leaderboard = document.getElementById('clubLeaderboard');
    const anchor = challenges?.parentElement === sidebar ? challenges :
      leaderboard?.parentElement === sidebar ? leaderboard : null;
    if(anchor){
      if(anchor.nextElementSibling !== section) anchor.after(section);
    }else if(section.parentElement !== sidebar){
      sidebar.append(section);
    }
  }
  document.getElementById('lobby').before(section);
  const observer = new MutationObserver(placePractice);
  observer.observe(document.querySelector('.wrap'),{
    childList:true,subtree:true
  });
  placePractice();
})();
